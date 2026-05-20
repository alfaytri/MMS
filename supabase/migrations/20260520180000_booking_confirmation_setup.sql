-- ─────────────────────────────────────────────────────────────────────────────
-- Booking confirmation notification — 2 days before visit
--
-- 1. Add address_id FK to orders so we can look up waze_link at notification time
-- 2. Register Wati template in notification_templates
-- 3. Register scheduled config in notification_config
-- 4. Update create_order_with_dates RPC to accept + persist p_address_id
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Address FK on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS address_id UUID
    REFERENCES public.service_customer_addresses(id) ON DELETE SET NULL;

-- 2. Wati template
INSERT INTO public.notification_templates (
  slug, wati_template_name, description,
  media_type, has_buttons, param_count, param_names, body_text, is_active
) VALUES (
  'normal_booking_conformation_utility',
  'normal_booking_conformation_utility',
  'Order confirmation with service PDF — sent 2 days before visit date',
  'document',
  false,
  5,
  '["booking_number","date","time","address_label","address_link"]'::jsonb,
  E'تم تأكيد موعد الخدمة رقم {{1}}\n\nبتاريخ {{2}}\nفي الساعة {{3}}\n\nالعنوان: {{4}}\n{{5}}\n\nيرجى مراجعة تفاصيل الخدمات في المستند المرفق.',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  wati_template_name = EXCLUDED.wati_template_name,
  description        = EXCLUDED.description,
  media_type         = EXCLUDED.media_type,
  param_count        = EXCLUDED.param_count,
  param_names        = EXCLUDED.param_names,
  body_text          = EXCLUDED.body_text,
  is_active          = EXCLUDED.is_active;

-- 3. Notification config
INSERT INTO public.notification_config (
  slug, label, label_ar, category, trigger_type,
  timing_description, template_slug, is_active, sort_order
) VALUES (
  'booking_confirmation_2d',
  'Booking Confirmation (2 days before)',
  'تأكيد الحجز (قبل يومين)',
  'booking',
  'scheduled',
  'Sent 2 days before the scheduled visit date',
  'normal_booking_conformation_utility',
  true,
  5
)
ON CONFLICT (slug) DO UPDATE SET
  template_slug = EXCLUDED.template_slug,
  is_active     = EXCLUDED.is_active;

-- 4. Update create_order_with_dates to accept + store address_id
--    Drop all known overloads (param sets from previous migrations)
DROP FUNCTION IF EXISTS public.create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid);

CREATE FUNCTION public.create_order_with_dates(
  p_order_id            text,
  p_service_customer_id uuid,
  p_type                text,
  p_division            text,
  p_status              text,
  p_scheduled_date      date,
  p_total_amount        numeric,
  p_address             text,
  p_notes               text,
  p_arrival_phone       text,
  p_attachments         jsonb,
  p_services            jsonb,
  p_visit_dates         jsonb,
  p_assignments         jsonb,
  p_address_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments
  ) VALUES (
    p_order_id,
    p_service_customer_id,
    p_type,
    NULLIF(p_division, ''),
    p_status::order_status,
    'not_sent'::confirmation_status,
    p_scheduled_date,
    p_total_amount,
    NULLIF(p_address, ''),
    p_address_id,
    NULLIF(p_notes, ''),
    false,
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      (v_item->>'duration')::int,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      CASE WHEN v_item->'configuration' IS NULL OR v_item->>'configuration' = 'null'
           THEN NULL ELSE v_item->'configuration' END,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    BEGIN
      INSERT INTO public.order_team_assignments (
        order_id, team_id, services, scheduled_date, time_slot, duration
      ) VALUES (
        v_order_id,
        (v_item->>'team_id')::uuid,
        COALESCE(v_item->'services', '[]'::jsonb),
        (v_item->>'scheduled_date')::date,
        v_item->>'time_slot',
        v_item->>'duration'
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'slot_conflict: Team is already booked for that time slot on %', v_item->>'scheduled_date'
          USING ERRCODE = 'P0001';
    END;
  END LOOP;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_dates(
  text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) TO authenticated;
