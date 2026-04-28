-- supabase/migrations/20260425000009_rpc_approve_stock_adjustment.sql

BEGIN;

CREATE OR REPLACE FUNCTION approve_stock_adjustment_inventory(
  p_adjustment_id  UUID,
  p_approved_by    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_adj     RECORD;
  v_bv      RECORD;
  v_result  RECORD;
  v_qty     INT;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT, reason, status
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval', 'draft') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  -- Mark as approved
  UPDATE stock_adjustments
  SET status = 'approved', approved_by_name = p_approved_by, approved_at = now()
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    -- Use current average_cost as the cost basis for the new layer
    SELECT average_cost, stock_level INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSIF v_adj.adjustment_type = 'decrease' THEN
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      -v_qty, v_result.weighted_unit_cost, 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_stock_adjustment_inventory(UUID, TEXT) TO authenticated;

COMMIT;
