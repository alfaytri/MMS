-- Atomic order edit. Previously the client did sequential delete+insert across
-- order_services / order_team_assignments / order_visit_dates with no
-- transaction, so a mid-way failure left the order gutted, and it logged a
-- hardcoded user_name='agent'. This mirrors create_order_with_dates: one
-- SECURITY DEFINER function that updates the order and replaces its children in
-- a single transaction, reuses the same slot-conflict guards, and records the
-- real editor (resolved from auth.uid()) in order_log.
--
-- Pricing (emergency vs base) is applied client-side via effectiveUnitPrice and
-- arrives already-resolved in p_services[].price / p_total_amount, exactly like
-- create.
BEGIN;

CREATE OR REPLACE FUNCTION public.edit_order_with_dates(
  p_order_id uuid, p_division text, p_scheduled_date date, p_total_amount numeric,
  p_address text, p_notes text, p_arrival_phone text, p_is_emergency boolean,
  p_services jsonb, p_assignments jsonb, p_visit_dates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item      jsonb;
  v_user_name text;
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

  -- 2. Replace services
  DELETE FROM public.order_services WHERE order_id = p_order_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
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
      NULLIF(v_item->>'to_time',   '')::time
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
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
