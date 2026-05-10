-- Add per-service arrival window columns to order_services
ALTER TABLE order_services
  ADD COLUMN IF NOT EXISTS from_time TIME,
  ADD COLUMN IF NOT EXISTS to_time   TIME;

-- Recreate the RPC to include from_time / to_time in the service insert
CREATE OR REPLACE FUNCTION create_order_with_dates(
  p_order_id       text,
  p_customer_id    uuid,
  p_phone_id       uuid,
  p_division       text,
  p_type           text,
  p_scheduled_date date,
  p_address        text,
  p_notes          text,
  p_arrival_phone  text,
  p_attachments    jsonb,
  p_services       jsonb,
  p_visit_dates    jsonb,
  p_assignments    jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO orders (
    order_id, customer_id, phone_id, division, type,
    scheduled_date, address, notes, arrival_phone, attachments,
    status, confirmation_status
  )
  VALUES (
    p_order_id,
    p_customer_id,
    p_phone_id,
    NULLIF(p_division, ''),
    p_type,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments,
    'scheduled',
    'not_sent'
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO order_services (
      order_id, service_id, name, qty, price, duration, path, configuration,
      from_time, to_time
    )
    VALUES (
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
    INSERT INTO order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      (v_item->>'sort_order')::int
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO order_team_assignments (
      order_id, team_id, services, scheduled_date, time_slot, duration
    )
    VALUES (
      v_order_id,
      (v_item->>'team_id')::uuid,
      COALESCE(v_item->'services', '[]'::jsonb),
      (v_item->>'scheduled_date')::date,
      v_item->>'time_slot',
      v_item->>'duration'
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;
