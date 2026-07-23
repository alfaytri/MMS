-- ============================================================
-- Fix create_and_confirm_delivery RPC
-- Was inserting p_items into the dropped sale_deliveries.items
-- JSONB column. Now inserts into sale_delivery_lines table.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_and_confirm_delivery(uuid, uuid, text, date, jsonb);

CREATE FUNCTION public.create_and_confirm_delivery(
  p_so_id          uuid,
  p_warehouse_id   uuid,
  p_warehouse_name text,
  p_date           date,
  p_items          jsonb
) RETURNS TABLE(id uuid, delivery_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
  v_line            JSONB;
BEGIN
  v_delivery_number := 'DEL-' || LPAD(nextval('sale_delivery_number_seq')::TEXT, 5, '0');

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_id,
      CASE WHEN v_line->>'brand_variant_id' IS NOT NULL
           AND v_line->>'brand_variant_id' != 'null'
           THEN (v_line->>'brand_variant_id')::uuid END,
      COALESCE(v_line->>'item_name', 'Item'),
      NULLIF(v_line->>'sku', ''),
      COALESCE((v_line->>'qty_delivered')::integer, 0)
    );
  END LOOP;

  PERFORM complete_delivery_inventory(v_new_id, p_so_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_confirm_delivery(uuid, uuid, text, date, jsonb) TO authenticated;
