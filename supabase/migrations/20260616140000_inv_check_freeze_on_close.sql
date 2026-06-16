-- ============================================================
-- Freeze "System" column of inventory checks at close (approval
-- or rejection). Once closed, the recon view should reflect the
-- system state the manager saw at the moment of close — not the
-- live warehouse stock, which keeps drifting.
-- ============================================================

-- 1. New column: per-item system stock snapshot at the moment of close
ALTER TABLE inventory_check_items
  ADD COLUMN IF NOT EXISTS system_qty_at_close NUMERIC;

-- 2. Snapshot RPC: reads current per-warehouse stock for every counted
--    item on the check and stores it. Idempotent — only sets rows that
--    have not been snapshotted yet, so calling it twice is safe.
CREATE OR REPLACE FUNCTION snapshot_inventory_check_system_qty(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id
  FROM inventory_checks
  WHERE id = p_check_id;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  -- Snapshot from the warehouse stock view (live qty per brand_variant)
  UPDATE inventory_check_items ici
  SET system_qty_at_close = COALESCE(wsv.qty, 0)
  FROM warehouse_stock_view wsv
  WHERE ici.check_id = p_check_id
    AND ici.is_counted = true
    AND ici.system_qty_at_close IS NULL
    AND wsv.warehouse_id = v_warehouse_id
    AND wsv.brand_variant_id = ici.brand_variant_id;

  -- Items absent from the stock view (zero stock with no movements
  -- yet) — pin them at 0 so the recon row still has a frozen value
  UPDATE inventory_check_items
  SET system_qty_at_close = 0
  WHERE check_id = p_check_id
    AND is_counted = true
    AND system_qty_at_close IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION snapshot_inventory_check_system_qty(UUID) TO authenticated;

-- 3. Patch apply_inventory_check_adjustments to snapshot BEFORE applying
--    diffs, so the frozen value is the state the manager saw at approval.
CREATE OR REPLACE FUNCTION apply_inventory_check_adjustments(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check     RECORD;
  v_item      RECORD;
  v_bv        RECORD;
  v_result    RECORD;
  v_variance  INT;
BEGIN
  SELECT id, warehouse_id, status
  INTO v_check
  FROM inventory_checks
  WHERE id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  -- Freeze the system stock snapshot before any FIFO/cost mutations
  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty, variance, variance_type
    FROM inventory_check_items
    WHERE check_id = p_check_id
      AND is_counted = true
      AND variance IS NOT NULL
      AND variance <> 0
  LOOP
    v_variance := v_item.variance::INT;

    IF v_variance > 0 THEN
      SELECT average_cost INTO v_bv
      FROM inventory_brand_variants WHERE id = v_item.brand_variant_id;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_check.warehouse_id, CURRENT_DATE,
        v_variance, COALESCE(v_bv.average_cost, 0), 0,
        COALESCE(v_bv.average_cost, 0), v_variance
      );

      UPDATE inventory_brand_variants
      SET stock_level = stock_level + v_variance, updated_at = now()
      WHERE id = v_item.brand_variant_id;

      PERFORM recalc_average_cost(v_item.brand_variant_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_check.warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'inventory_check', v_variance, COALESCE(v_bv.average_cost, 0),
        'inventory_check', p_check_id,
        'Inventory check adjustment (increase): counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
      );

    ELSIF v_variance < 0 THEN
      SELECT total_cost, weighted_unit_cost
      INTO v_result
      FROM deduct_fifo_layers(v_item.brand_variant_id, v_check.warehouse_id, ABS(v_variance), false);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_check.warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'inventory_check', v_variance, v_result.weighted_unit_cost,
        'inventory_check', p_check_id,
        'Inventory check adjustment (decrease): counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_inventory_check_adjustments(UUID) TO authenticated;
