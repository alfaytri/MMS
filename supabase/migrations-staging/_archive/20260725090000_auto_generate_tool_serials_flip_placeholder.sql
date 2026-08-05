-- auto_generate_tool_serials: also flip is_placeholder = false when a serial is filled
-- so the UI stops treating auto-generated rows as pending.
BEGIN;

CREATE OR REPLACE FUNCTION public.auto_generate_tool_serials(
  p_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sku       text;
  v_next_ord  int;
  v_unit      RECORD;
  v_serial    text;
  v_updated   int := 0;
BEGIN
  SELECT sku INTO v_sku FROM inventory_items WHERE id = p_item_id;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no SKU', p_item_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || p_item_id::text));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = p_item_id
    AND serial_number ~ ('^' || v_sku || '-\d+$');

  FOR v_unit IN
    SELECT id FROM tool_asset_units
    WHERE item_id = p_item_id
      AND is_placeholder = true
      AND serial_number IS NULL
    ORDER BY created_at
  LOOP
    v_next_ord := v_next_ord + 1;
    v_serial   := v_sku || '-' || LPAD(v_next_ord::text, 3, '0');

    UPDATE tool_asset_units
       SET serial_number  = v_serial,
           is_placeholder = false
     WHERE id = v_unit.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'sku_prefix',    v_sku
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_generate_tool_serials(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
