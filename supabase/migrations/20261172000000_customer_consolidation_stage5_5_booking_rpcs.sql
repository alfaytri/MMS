-- Customer consolidation — Stage 5.5: flip the booking create RPCs to stamp the unified
-- orders/site_visits/order_quotations.customer_id (was service_customer_id) and resolve the
-- order risk-gate phones via customer_phones. The p_service_customer_id param NAME is kept
-- (renaming would require DROP+CREATE and churn the generated types); its VALUE is now a
-- customers.id (draft.customerId is flipped in the booking UI to a customers id).
-- New orders leave service_customer_id NULL — remaining readers COALESCE service->customers.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

-- service_customer_id is being retired (dropped in 5.7). The flipped create RPCs stamp
-- customer_id only, so service_customer_id must become nullable for new rows.
ALTER TABLE public.orders           ALTER COLUMN service_customer_id DROP NOT NULL;
ALTER TABLE public.site_visits      ALTER COLUMN service_customer_id DROP NOT NULL;
ALTER TABLE public.order_quotations ALTER COLUMN service_customer_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_order_with_dates(p_order_id text, p_service_customer_id uuid, p_type text, p_division text, p_status text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb, p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_is_emergency boolean DEFAULT false)
 RETURNS TABLE(order_id uuid, pending_approval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_order_id       uuid;
  v_item           jsonb;
  v_tiers          jsonb;
  v_oldest         timestamptz;
  v_days           int;
  v_needs_approval boolean := false;
  v_pending        boolean := false;
BEGIN
  INSERT INTO public.orders (
    order_id, customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by, is_emergency
  ) VALUES (
    p_order_id, p_service_customer_id, p_type, NULLIF(p_division, ''),
    p_status::order_status, 'not_sent'::confirmation_status, p_scheduled_date,
    p_total_amount, NULLIF(p_address, ''), p_address_id, NULLIF(p_notes, ''),
    false, NULLIF(p_arrival_phone, ''), p_attachments, p_created_by,
    COALESCE(p_is_emergency, false)
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time,
      catalog_image_url
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
      NULLIF(v_item->>'to_time',   '')::time,
      (SELECT coalesce(s.catalog_thumb_url, s.catalog_image_url) FROM public.services s
        WHERE s.id = NULLIF(v_item->>'service_id', '')::uuid)
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
        AND (v_item->>'time_slot')::time < fur.requested_time_to
        AND fur.requested_time_from
              < ((v_item->>'time_slot')::time + ((v_item->>'duration')::int * interval '1 hour'))
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

  -- QC: snapshot each assigned team's composition (baseline for new_member/leader)
  INSERT INTO public.order_team_snapshots (order_id, team_id, leader_id, member_ids)
  SELECT DISTINCT a.order_id, a.team_id, t.leader_id,
         COALESCE(ARRAY(SELECT e.id FROM public.employees e WHERE e.team_id = a.team_id), '{}'::uuid[])
  FROM public.order_team_assignments a
  JOIN public.teams t ON t.id = a.team_id
  WHERE a.order_id = v_order_id;

  -- Risk gate: resolve the customer's phones via the unified customer_phones.
  SELECT (value->'tiers') INTO v_tiers FROM public.app_settings WHERE key = 'customer_risk_tiers';
  IF v_tiers IS NULL OR jsonb_typeof(v_tiers) <> 'array' OR jsonb_array_length(v_tiers) = 0 THEN
    v_tiers := '[{"min_days":0,"requires_approval":false},{"min_days":30,"requires_approval":false},{"min_days":60,"requires_approval":false},{"min_days":90,"requires_approval":true}]'::jsonb;
  END IF;

  SELECT MIN(ti.created_at) INTO v_oldest
  FROM   public.tl_invoices ti
  WHERE  ti.payment_status IN ('unpaid', 'partial')
    AND  (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
    AND  ti.customer_phone IN (
           SELECT cp.phone FROM public.customer_phones cp WHERE cp.customer_id = p_service_customer_id
         );

  IF v_oldest IS NOT NULL THEN
    v_days := floor(extract(epoch FROM (now() - v_oldest)) / 86400)::int;
    SELECT COALESCE((t->>'requires_approval')::boolean, false) INTO v_needs_approval
    FROM   jsonb_array_elements(v_tiers) t
    WHERE  (t->>'min_days')::int <= v_days
    ORDER  BY (t->>'min_days')::int DESC
    LIMIT  1;
    v_needs_approval := COALESCE(v_needs_approval, false);
  END IF;

  IF v_needs_approval THEN
    UPDATE public.orders SET status = 'pending-approval'::order_status WHERE id = v_order_id;
    PERFORM public.build_order_approval_chain(
      v_order_id,
      jsonb_build_object('reason', 'customer_risk', 'requested_by', p_created_by)
    );
    v_pending := true;
  END IF;

  -- QC gate (hard): hold + create inspection when the QC score crosses threshold
  IF public._apply_qc_gate(v_order_id) THEN
    v_pending := true;
  END IF;

  RETURN QUERY SELECT v_order_id, v_pending;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_site_visit(p_visit_id text, p_service_customer_id uuid, p_status text, p_mode text, p_scheduled_date date, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_visit_dates jsonb, p_assignments jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, customer_id, status, mode,
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
$function$;

CREATE OR REPLACE FUNCTION public.save_order_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text DEFAULT 'flat'::text, p_discount_value numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uuid uuid;
  v_item jsonb;
  v_prev_images jsonb;
BEGIN
  INSERT INTO public.order_quotations (
    quotation_id, customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::order_quotation_status,
    p_total_amount,
    NULLIF(p_notes, ''),
    CURRENT_DATE,
    p_expiry_date,
    p_sent_date,
    COALESCE(p_discount_type, 'flat'),
    COALESCE(p_discount_value, 0)
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    customer_id         = EXCLUDED.customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, order_quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  SELECT COALESCE(jsonb_object_agg(service_id::text, catalog_image_url), '{}'::jsonb)
    INTO v_prev_images
    FROM public.order_quotation_line_items
   WHERE quotation_id = v_uuid
     AND service_id IS NOT NULL
     AND catalog_image_url IS NOT NULL;

  DELETE FROM public.order_quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.order_quotation_line_items (
      quotation_id, service_id, name, path, qty, price, duration,
      catalog_image_url
    ) VALUES (
      v_uuid,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      NULLIF(v_item->>'duration', '')::int,
      COALESCE(
        v_prev_images->>(v_item->>'service_id'),
        (SELECT coalesce(s.catalog_thumb_url, s.catalog_image_url) FROM public.services s
          WHERE s.id = NULLIF(v_item->>'service_id', '')::uuid))
    );
  END LOOP;

  RETURN v_uuid;
END;
$function$;

COMMIT;
