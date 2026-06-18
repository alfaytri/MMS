-- Fix: add SECURITY DEFINER so the RPC can insert into inventory_stock_movements
-- (which has RLS enabled with no INSERT policy for non-owner callers).
-- Then re-run the backfill for any returns that failed the first time.

CREATE OR REPLACE FUNCTION rpc_process_return_restock(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_cond    TEXT;
BEGIN
  SELECT id, items, restock_warehouse_id, status, restocked_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);
    v_cond  := LOWER(COALESCE(v_item->>'condition', ''));

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_cond = 'good' THEN
      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_qty
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
        'sale_return',
        v_qty,
        0,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF v_cond = 'damaged' THEN
      UPDATE inventory_brand_variants
      SET    damaged_qty = damaged_qty + v_qty
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
        'sale_return_damaged',
        v_qty,
        0,
        'return',
        p_return_id,
        'Damaged item from sale return — awaiting assessment'
      );
    END IF;
  END LOOP;

  UPDATE returns SET restocked_at = now() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-run backfill for returns that failed the first time (restocked_at still NULL)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM   returns
    WHERE  status       = 'restocked'
      AND  restocked_at IS NULL
  LOOP
    PERFORM rpc_process_return_restock(r.id);
  END LOOP;
END;
$$;
