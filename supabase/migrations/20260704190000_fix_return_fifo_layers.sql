-- Fix purchase returns and sale returns (good condition) to properly
-- interact with FIFO cost layers.
--
-- Problem:
--   Both functions only updated the legacy stock_level counter on
--   inventory_brand_variants, which warehouse_stock_view ignores.
--   The view is built from SUM(fifo_cost_layers.remaining_qty).
--
-- Fix:
--   1. rpc_process_po_return_dispatch: call deduct_fifo_layers() so
--      stock actually decreases in the warehouse view.
--   2. rpc_process_return_restock (good condition): create a new FIFO
--      layer at the weighted-average cost so stock increases in the view.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Purchase Return — deduct FIFO layers when dispatching back to supplier
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_sku     TEXT;
  v_result  RECORD;
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

    -- Deduct FIFO layers so warehouse_stock_view reflects the decrease.
    -- deduct_fifo_layers already updates stock_level and recalculates avg cost.
    SELECT total_cost, weighted_unit_cost
    INTO   v_result
    FROM   deduct_fifo_layers(v_bv_id, v_return.restock_warehouse_id, v_qty, false);

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
      -v_qty,
      v_result.weighted_unit_cost,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_process_po_return_dispatch(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. Sale Return (Good) — create a FIFO layer so stock increases
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return   RECORD;
  v_item     JSONB;
  v_bv_id    UUID;
  v_qty      INT;
  v_cond     TEXT;
  v_avg_cost NUMERIC;
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
      -- Look up current weighted-average cost for this variant.
      SELECT COALESCE(average_cost, 0) INTO v_avg_cost
      FROM   inventory_brand_variants
      WHERE  id = v_bv_id;

      -- Create a new FIFO layer so warehouse_stock_view reflects the increase.
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type
      ) VALUES (
        v_bv_id, v_return.restock_warehouse_id, CURRENT_DATE,
        v_qty, v_avg_cost, 0, v_avg_cost, v_qty,
        'sale_return'
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_qty,
             updated_at  = now()
      WHERE  id = v_bv_id;

      PERFORM recalc_average_cost(v_bv_id);

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
        v_avg_cost,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF v_cond = 'damaged' THEN
      -- Damaged items go to damaged_qty, not sellable stock.
      -- No FIFO layer needed — they are not sellable inventory.
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
$$;

GRANT EXECUTE ON FUNCTION rpc_process_return_restock(uuid) TO authenticated;
