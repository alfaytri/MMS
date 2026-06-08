-- 1. Add 'inventory_check' to allowed movement types
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment',
    'receival_edit',
    'free_receival',
    'sale_return',
    'sale_return_damaged',
    'purchase_return',
    'purchase_return_cancelled',
    'inventory_check'
  ));

-- 2. RPC to apply stock adjustments when an inventory check is approved
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
      -- Increase: counted more than system — add a FIFO layer
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
      -- Decrease: counted less than system — deduct FIFO layers
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
