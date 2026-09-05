-- D — Emergency pricing for orders (decision: honor emergency_price, at booking).
--
-- Previously "emergency" was only a scheduling/team-routing hint on the booking
-- draft (OrderMode) and was dropped entirely for regular orders. We now:
--   1. persist whether an order is an emergency (orders.is_emergency), and
--   2. bill each service's emergency_price (fallback base price) when the order
--      is emergency — done CLIENT-side at booking so the office/customer see the
--      emergency price on the order, and the existing snapshot flows into the TL
--      invoice unchanged.
-- This migration is the DB half: the column + threading is_emergency through the
-- create_order_with_dates RPC (its signature gains p_is_emergency, so drop+recreate).
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;

-- Signature changes (adds p_is_emergency) → drop the old overload first so we
-- don't leave two versions callable.
DROP FUNCTION IF EXISTS public.create_order_with_dates(
  text, uuid, text, text, text, date, numeric, text, text, text,
  jsonb, jsonb, jsonb, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_order_with_dates(
  p_order_id text, p_service_customer_id uuid, p_type text, p_division text,
  p_status text, p_scheduled_date date, p_total_amount numeric, p_address text,
  p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb,
  p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid, p_is_emergency boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by, is_emergency
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
    p_created_by,
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
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
