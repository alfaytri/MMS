-- ─────────────────────────────────────────────────────────────────────────────
-- Snapshot the service's catalog photo onto order and quotation lines.
--
-- The photo a customer was shown is part of what was sold, so each line keeps
-- the URL that was current when the service was added. A later edit to the
-- service's photo must never rewrite a past order or invoice.
--
-- The SERVER resolves the URL from service_id; the client never sends one. The
-- stored URL is later fetched server-side and embedded in a PDF, so a
-- client-supplied value there would be SSRF-shaped.
--
-- edit_order_with_dates deletes and re-inserts every line, so it captures the
-- existing snapshots first and prefers them, falling back to a live read only
-- for services newly added by the edit. Without that, any edit to an order
-- would silently refresh the photos on lines sold weeks earlier.
--
-- Bodies fetched from the live Dev DB with pg_get_functiondef; baseline and the
-- migration files are stale.
--
-- TARGET: Dev DB (wkmvjxxmzstsvahuiwsz) only.
-- STAGING MIRROR DELIBERATELY SKIPPED: order_services and services are excluded
-- modules, dropped from staging/prod.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_services
  ADD COLUMN IF NOT EXISTS catalog_image_url text;

ALTER TABLE public.order_quotation_line_items
  ADD COLUMN IF NOT EXISTS catalog_image_url text;

COMMENT ON COLUMN public.order_services.catalog_image_url IS
  'Snapshot of services.catalog_image_url as it read when this service was '
  'added to the order. Frozen deliberately: a later catalogue photo change '
  'must not rewrite what a past invoice shows.';

COMMENT ON COLUMN public.order_quotation_line_items.catalog_image_url IS
  'Snapshot of services.catalog_image_url as it read when this quotation line '
  'was saved. Same freezing rule as order_services.';

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
    order_id, service_customer_id, type, division, status, confirmation_status,
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
      (SELECT s.catalog_image_url FROM public.services s
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

  -- â”€â”€ QC: snapshot each assigned team's composition (baseline for new_member/leader) â”€â”€
  INSERT INTO public.order_team_snapshots (order_id, team_id, leader_id, member_ids)
  SELECT DISTINCT a.order_id, a.team_id, t.leader_id,
         COALESCE(ARRAY(SELECT e.id FROM public.employees e WHERE e.team_id = a.team_id), '{}'::uuid[])
  FROM public.order_team_assignments a
  JOIN public.teams t ON t.id = a.team_id
  WHERE a.order_id = v_order_id;

  -- â”€â”€ Risk gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  SELECT (value->'tiers') INTO v_tiers FROM public.app_settings WHERE key = 'customer_risk_tiers';
  IF v_tiers IS NULL OR jsonb_typeof(v_tiers) <> 'array' OR jsonb_array_length(v_tiers) = 0 THEN
    v_tiers := '[{"min_days":0,"requires_approval":false},{"min_days":30,"requires_approval":false},{"min_days":60,"requires_approval":false},{"min_days":90,"requires_approval":true}]'::jsonb;
  END IF;

  SELECT MIN(ti.created_at) INTO v_oldest
  FROM   public.tl_invoices ti
  WHERE  ti.payment_status IN ('unpaid', 'partial')
    AND  (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
    AND  ti.customer_phone IN (
           SELECT scp.phone FROM public.service_customer_phones scp WHERE scp.customer_id = p_service_customer_id
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

  -- â”€â”€ QC gate (hard): hold + create inspection when the QC score crosses threshold â”€â”€
  IF public._apply_qc_gate(v_order_id) THEN
    v_pending := true;
  END IF;

  RETURN QUERY SELECT v_order_id, v_pending;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_order_with_dates(p_order_id uuid, p_division text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_is_emergency boolean, p_services jsonb, p_assignments jsonb, p_visit_dates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item        jsonb;
  v_user_name   text;
  v_prev_images jsonb;
BEGIN
  -- 1. Update the order row (resets confirmation so an edited order re-confirms)
  UPDATE public.orders SET
    division             = NULLIF(p_division, ''),
    scheduled_date       = p_scheduled_date,
    notes                = NULLIF(p_notes, ''),
    arrival_phone        = NULLIF(p_arrival_phone, ''),
    address              = NULLIF(p_address, ''),
    total_amount         = p_total_amount,
    is_emergency         = COALESCE(p_is_emergency, false),
    confirmation_sent_at = NULL,
    confirmation_status  = 'not_sent'::confirmation_status
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  -- 2. Replace services.
  --    An edit deletes and re-inserts every line, so capture the photo each
  --    service was sold with FIRST. Re-resolving live would silently refresh a
  --    past sale's photo the next time anyone touched the order, which is the
  --    opposite of the snapshot rule.
  SELECT COALESCE(jsonb_object_agg(service_id::text, catalog_image_url), '{}'::jsonb)
    INTO v_prev_images
    FROM public.order_services
   WHERE order_id = p_order_id
     AND service_id IS NOT NULL
     AND catalog_image_url IS NOT NULL;

  DELETE FROM public.order_services WHERE order_id = p_order_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time,
      catalog_image_url
    ) VALUES (
      p_order_id,
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
      COALESCE(
        v_prev_images->>(v_item->>'service_id'),
        (SELECT s.catalog_image_url FROM public.services s
          WHERE s.id = NULLIF(v_item->>'service_id', '')::uuid))
    );
  END LOOP;

  -- 3. Replace team assignments (same guards as create_order_with_dates)
  DELETE FROM public.order_team_assignments WHERE order_id = p_order_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    IF EXISTS (
      SELECT 1 FROM public.follow_up_requests fur
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
        p_order_id,
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

  -- 4. Replace visit dates
  DELETE FROM public.order_visit_dates WHERE order_id = p_order_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      p_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  -- 5. Log with the real editor (resolved server-side, not a hardcoded 'agent')
  SELECT full_name INTO v_user_name FROM public.user_data WHERE auth_user_id = auth.uid();
  INSERT INTO public.order_log (order_id, action, user_name, details)
  VALUES (
    p_order_id, 'edited', COALESCE(NULLIF(v_user_name, ''), 'system'),
    'Order updated — date: ' || p_scheduled_date::text
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_order_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text DEFAULT 'flat'::text, p_discount_value numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.order_quotations (
    quotation_id, service_customer_id, division, status,
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
    service_customer_id = EXCLUDED.service_customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, order_quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

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
      (SELECT s.catalog_image_url FROM public.services s
        WHERE s.id = NULLIF(v_item->>'service_id', '')::uuid)
    );
  END LOOP;

  RETURN v_uuid;
END;
$function$
;
