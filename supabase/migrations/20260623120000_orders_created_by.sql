-- ────────────────────────────────────────────────────────────────────────────
-- Track who (which MMS user) created each order / site visit.
-- Backfills are NULL — historic rows have no recorded creator.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders (created_by);

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_visits_created_by
  ON public.site_visits (created_by);

-- ── create_order_with_dates: new optional p_created_by at the end ───────────
-- The old signature must be dropped first — Postgres can't CREATE OR REPLACE a
-- function with a different parameter list.
DROP FUNCTION IF EXISTS public.create_order_with_dates(
  text, uuid, text, text, text, date, numeric, text, text, text,
  jsonb, jsonb, jsonb, jsonb, uuid
);

CREATE FUNCTION public.create_order_with_dates(
  p_order_id text,
  p_service_customer_id uuid,
  p_type text,
  p_division text,
  p_status text,
  p_scheduled_date date,
  p_total_amount numeric,
  p_address text,
  p_notes text,
  p_arrival_phone text,
  p_attachments jsonb,
  p_services jsonb,
  p_visit_dates jsonb,
  p_assignments jsonb,
  p_address_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by
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
    p_attachments,
    p_created_by
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
    IF EXISTS (
      SELECT 1
      FROM public.follow_up_requests fur
      WHERE fur.status = 'pending'
        AND fur.requested_team_id   = (v_item->>'team_id')::uuid
        AND fur.requested_date      = (v_item->>'scheduled_date')::date
        AND fur.requested_time_from IS NOT NULL
        AND fur.requested_time_to   IS NOT NULL
        AND (v_item->>'time_slot')::time
              < fur.requested_time_to
        AND fur.requested_time_from
              < ((v_item->>'time_slot')::time
                 + ((v_item->>'duration')::int * interval '1 hour'))
    ) THEN
      RAISE EXCEPTION 'slot_conflict: A customer follow-up request reserves that slot for the team on %', v_item->>'scheduled_date'
        USING ERRCODE = 'P0001';
    END IF;

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

-- ── create_site_visit: same treatment ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_site_visit(
  text, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb
);

CREATE FUNCTION public.create_site_visit(
  p_visit_id text,
  p_service_customer_id uuid,
  p_status text,
  p_mode text,
  p_scheduled_date date,
  p_address text,
  p_notes text,
  p_arrival_phone text,
  p_attachments jsonb,
  p_visit_dates jsonb,
  p_assignments jsonb,
  p_created_by uuid DEFAULT NULL::uuid
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, service_customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments, created_by
  ) VALUES (
    p_visit_id,
    p_service_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments,
    p_created_by
  )
  RETURNING id INTO v_visit_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_dates (visit_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_visit_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_team_assignments (
      visit_id, team_id, scheduled_date, time_slot, duration
    ) VALUES (
      v_visit_id,
      (v_item->>'team_id')::uuid,
      (v_item->>'scheduled_date')::date,
      v_item->>'time_slot',
      COALESCE(v_item->>'duration', '1')
    );
  END LOOP;

  RETURN v_visit_id;
END;
$$;
