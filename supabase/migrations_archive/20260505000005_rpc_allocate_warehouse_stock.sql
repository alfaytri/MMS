-- RPC to set stock for a brand variant in a specific warehouse.
-- Calculates delta from current warehouse stock and either inserts a new FIFO
-- layer (increase) or deducts from existing layers (decrease).
-- Used by the Edit Brand Variant dialog for initial stock allocation.

BEGIN;

CREATE OR REPLACE FUNCTION allocate_warehouse_stock(
  p_brand_variant_id UUID,
  p_warehouse_id     UUID,
  p_target_qty       INT,
  p_unit_cost        NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_qty INT;
  v_delta       INT;
BEGIN
  -- Get current stock in this specific warehouse
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

  -- No change needed
  IF v_delta = 0 THEN
    RETURN;
  END IF;

  IF v_delta > 0 THEN
    -- Increase: insert a new FIFO cost layer
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      p_brand_variant_id, p_warehouse_id, CURRENT_DATE,
      v_delta, p_unit_cost, 0, p_unit_cost, v_delta
    );

    -- Update global stock level
    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_delta, updated_at = now()
    WHERE id = p_brand_variant_id;

    -- Log the movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id::TEXT,
      'Initial stock allocation'
    );

  ELSE
    -- Decrease: deduct from existing FIFO layers (v_delta is negative, pass positive)
    PERFORM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false);

    -- Log the movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id::TEXT,
      'Stock allocation adjustment'
    );
  END IF;

  -- Recalculate weighted average cost
  PERFORM recalc_average_cost(p_brand_variant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_warehouse_stock(UUID, UUID, INT, NUMERIC) TO authenticated;

COMMIT;
