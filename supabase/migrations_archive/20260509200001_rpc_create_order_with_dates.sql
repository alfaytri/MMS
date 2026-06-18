-- Atomic order creation RPC.
-- Wraps all 5 inserts (orders, order_services, order_visit_dates,
-- order_team_assignments, order_log) in a single transaction so a network
-- blip on any step cannot leave a "ghost" order with missing visit dates or services.
--
-- File uploads happen client-side; URLs are passed in as p_attachments JSONB.
-- Order ID generation (ORD-XXXX) happens client-side and is passed as p_order_id.

CREATE OR REPLACE FUNCTION create_order_with_dates(
  p_order_id       text,
  p_customer_id    uuid,
  p_type           text,
  p_status         text,
  p_scheduled_date date,
  p_total_amount   numeric,
  p_address        text,
  p_notes          text,
  p_arrival_phone  text,
  p_attachments    jsonb,   -- [{url, name, type}] or NULL
  p_services       jsonb,   -- [{service_id, name, qty, price, duration, path[], configuration}]
  p_visit_dates    jsonb,   -- [{visit_date, from_time, to_time, sort_order}]
  p_assignments    jsonb    -- [{team_id, services, scheduled_date, time_slot, duration}]
)
RETURNS uuid   -- internal UUID of the newly created order
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id  uuid;
  v_item      jsonb;
BEGIN
  -- ── 1. Insert the order ────────────────────────────────────────────────────
  INSERT INTO orders (
    order_id,
    customer_id,
    type,
    status,
    confirmation_status,
    scheduled_date,
    total_amount,
    address,
    notes,
    has_invoice,
    arrival_phone,
    attachments
  )
  VALUES (
    p_order_id,
    p_customer_id,
    p_type,
    p_status::order_status,
    'not_sent'::confirmation_status,
    p_scheduled_date,
    p_total_amount,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    false,
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_order_id;

  -- ── 2. Insert order services ───────────────────────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO order_services (order_id, service_id, name, qty, price, duration, path, configuration)
    VALUES (
      v_order_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      (v_item->>'duration')::int,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      CASE WHEN v_item->'configuration' IS NULL OR v_item->>'configuration' = 'null'
           THEN NULL ELSE v_item->'configuration' END
    );
  END LOOP;

  -- ── 3. Insert visit dates with time windows ────────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  -- ── 4. Insert team assignments (optional) ──────────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    BEGIN
      INSERT INTO order_team_assignments (order_id, team_id, services, scheduled_date, time_slot, duration)
      VALUES (
        v_order_id,
        (v_item->>'team_id')::uuid,
        v_item->'services',
        (v_item->>'scheduled_date')::date,
        v_item->>'time_slot',
        v_item->>'duration'   -- stored as TEXT in order_team_assignments
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'slot_conflict: Team is already booked for that time slot on %', v_item->>'scheduled_date'
          USING ERRCODE = 'P0001';
    END;
  END LOOP;

  -- ── 5. Insert order log ────────────────────────────────────────────────────
  INSERT INTO order_log (order_id, action, user_name, details)
  VALUES (v_order_id, 'created', 'agent', 'Order ' || p_order_id || ' created');

  RETURN v_order_id;
END;
$$;
