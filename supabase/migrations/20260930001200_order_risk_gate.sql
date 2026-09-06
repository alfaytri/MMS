-- Risk-gate order creation: after the order is built, resolve the booking
-- customer's risk tier (age of their oldest unpaid order invoice vs the
-- configurable app_settings.customer_risk_tiers). If that tier requires
-- approval, set the order to 'pending-approval' and open a Service Order
-- Approval chain instead of letting it book. Return a pending_approval flag so
-- the client can say "sent for approval" vs "booked". The assignments are still
-- created (the slot is held); rejecting the order releases them (Task 2.4).
--
-- Return type changes (uuid → TABLE) so the function is dropped + recreated.
BEGIN;

DROP FUNCTION IF EXISTS public.create_order_with_dates(
  text, uuid, text, text, text, date, numeric, text, text, text,
  jsonb, jsonb, jsonb, jsonb, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.create_order_with_dates(
  p_order_id text, p_service_customer_id uuid, p_type text, p_division text,
  p_status text, p_scheduled_date date, p_total_amount numeric, p_address text,
  p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb,
  p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid, p_is_emergency boolean DEFAULT false)
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

  -- ── Risk gate ──────────────────────────────────────────────────────────
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

  RETURN QUERY SELECT v_order_id, v_pending;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
