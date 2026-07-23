-- Add source_type column to fifo_cost_layers so the UI can show
-- where each layer came from (receival, adjustment, transfer, etc.)

ALTER TABLE fifo_cost_layers
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'receival';

-- Backfill: layers with receival_id are from receivals; the rest are unknowns
-- We can't perfectly determine the source of existing non-receival layers,
-- but we can mark receival ones definitively.
UPDATE fifo_cost_layers
SET source_type = 'receival'
WHERE receival_id IS NOT NULL
  AND source_type IS DISTINCT FROM 'receival';

UPDATE fifo_cost_layers
SET source_type = 'unknown'
WHERE receival_id IS NULL
  AND source_type = 'receival';

-- Rename column header in the UI is done in code
-- Going forward, all RPCs that create layers will set source_type.

-- Update create_and_approve_receival to set source_type
-- (Already sets receival_id so it defaults correctly)

-- Update apply_adjustment to set source_type = 'adjustment'
CREATE OR REPLACE FUNCTION apply_adjustment(p_adjustment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj    RECORD;
  v_qty    INT;
  v_bv     RECORD;
BEGIN
  SELECT * INTO v_adj
  FROM inventory_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_adj.status <> 'pending' THEN
    RAISE EXCEPTION 'Adjustment already processed';
  END IF;

  v_qty := ABS(v_adj.qty);

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      'adjustment'
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_adj.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_in', v_qty, COALESCE(v_bv.average_cost, 0),
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;

  ELSE
    PERFORM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, TRUE);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_out', -v_qty, ibv.average_cost,
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;
  END IF;

  PERFORM recalc_average_cost(v_adj.brand_variant_id);

  UPDATE inventory_adjustments
  SET status = 'applied', updated_at = now()
  WHERE id = p_adjustment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_adjustment(UUID) TO authenticated;

-- Update cancel_delivery_inventory to set source_type = 'delivery_cancel' on restored layers
-- (Already defined in an earlier migration — just adding source_type)
