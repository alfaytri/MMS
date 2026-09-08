-- 20261067000000_create_shipment_rpc.sql
-- Atomic shipment creation: inserts the shipment (number via trigger), one
-- shipment_line_items row per element of p_lines, and (when given) an ETD
-- 'original' schedule revision authored by auth.uid(). SECURITY DEFINER so the
-- multi-insert bypasses RLS as one unit. Plan Task 3.
-- p_lines = [{ "po_line_item_id": uuid, "qty": int }, ...]
BEGIN;

CREATE OR REPLACE FUNCTION public.create_shipment(
  p_mode           text,
  p_tracking_number text DEFAULT NULL,
  p_carrier        text DEFAULT NULL,
  p_lines          jsonb DEFAULT '[]'::jsonb,
  p_etd_original   date  DEFAULT NULL,
  p_etd_reason     text  DEFAULT NULL
) RETURNS public.shipments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ship public.shipments;
  v_line jsonb;
BEGIN
  IF jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'A shipment needs at least one PO line';
  END IF;

  INSERT INTO public.shipments (mode, tracking_number, carrier, status, events, archived)
    VALUES (p_mode::public.shipment_mode, NULLIF(p_tracking_number, ''), p_carrier, 'booked', '[]'::jsonb, false)
    RETURNING * INTO v_ship;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.shipment_line_items (shipment_id, po_line_item_id, qty)
      VALUES (v_ship.id, (v_line->>'po_line_item_id')::uuid, (v_line->>'qty')::int);
  END LOOP;

  IF p_etd_original IS NOT NULL THEN
    INSERT INTO public.shipment_schedule_revisions (shipment_id, leg, revision_type, date_value, reason, created_by)
      VALUES (v_ship.id, 'etd', 'original', p_etd_original, p_etd_reason, auth.uid());
    SELECT * INTO v_ship FROM public.shipments WHERE id = v_ship.id;  -- re-read cached etd
  END IF;

  RETURN v_ship;
END $$;

REVOKE ALL ON FUNCTION public.create_shipment(text,text,text,jsonb,date,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_shipment(text,text,text,jsonb,date,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
