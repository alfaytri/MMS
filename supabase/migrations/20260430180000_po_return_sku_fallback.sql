-- Fix rpc_process_po_return_dispatch: when brand_variant_id is null in the
-- return items JSONB, fall back to looking up the brand variant by SKU code.
-- This covers POs whose line items were added manually (no inventory picker).

CREATE OR REPLACE FUNCTION rpc_process_po_return_dispatch(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_sku     TEXT;
BEGIN
  SELECT id, items, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing
    IF v_bv_id IS NULL THEN
      v_sku := NULLIF(trim(v_item->>'sku'), '');
      IF v_sku IS NOT NULL THEN
        SELECT id INTO v_bv_id
        FROM   inventory_brand_variants
        WHERE  code = v_sku
        LIMIT  1;
      END IF;
    END IF;

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level - v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
