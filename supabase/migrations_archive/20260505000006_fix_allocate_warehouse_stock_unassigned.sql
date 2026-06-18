-- Fix allocate_warehouse_stock to pull from unassigned (warehouse_id IS NULL)
-- FIFO layers before creating new ones.
-- This handles the case where stock was imported or received before warehouse
-- tracking was enabled, leaving layers with warehouse_id = NULL.

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
  v_current_qty   INT;
  v_delta         INT;
  v_unassigned    INT;
  v_to_reassign   INT;
  v_to_create     INT;
  r               RECORD;
  v_remaining     INT;
  v_take          INT;
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
    -- First, try to reassign unassigned (warehouse_id IS NULL) layers
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

    v_to_reassign := LEAST(v_delta, v_unassigned);
    v_to_create   := v_delta - v_to_reassign;

    -- Reassign unassigned layers to this warehouse (oldest first)
    IF v_to_reassign > 0 THEN
      v_remaining := v_to_reassign;
      FOR r IN
        SELECT id, remaining_qty
        FROM fifo_cost_layers
        WHERE brand_variant_id = p_brand_variant_id
          AND warehouse_id IS NULL
          AND remaining_qty > 0
        ORDER BY date ASC, created_at ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining = 0;
        v_take := LEAST(v_remaining, r.remaining_qty);

        IF v_take = r.remaining_qty THEN
          -- Reassign the entire layer
          UPDATE fifo_cost_layers SET warehouse_id = p_warehouse_id WHERE id = r.id;
        ELSE
          -- Split: reduce original, create new layer for the warehouse
          UPDATE fifo_cost_layers
          SET remaining_qty = remaining_qty - v_take
          WHERE id = r.id;

          INSERT INTO fifo_cost_layers (
            brand_variant_id, warehouse_id, receival_id, receival_number,
            date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
          )
          SELECT
            brand_variant_id, p_warehouse_id, receival_id, receival_number,
            date, v_take, unit_cost, landed_cost_per_unit, total_unit_cost, v_take
          FROM fifo_cost_layers WHERE id = r.id;
        END IF;

        v_remaining := v_remaining - v_take;
      END LOOP;
    END IF;

    -- If still need more, create brand-new layers
    IF v_to_create > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, CURRENT_DATE,
        v_to_create, p_unit_cost, 0, p_unit_cost, v_to_create
      );

      -- Only increase global stock_level for truly new stock (not reassigned)
      UPDATE inventory_brand_variants
      SET stock_level = stock_level + v_to_create, updated_at = now()
      WHERE id = p_brand_variant_id;
    END IF;

    -- Log the movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id::TEXT,
      CASE WHEN v_to_reassign > 0 AND v_to_create > 0
        THEN format('Reassigned %s from unassigned + created %s new', v_to_reassign, v_to_create)
        WHEN v_to_reassign > 0
        THEN format('Reassigned %s from unassigned stock', v_to_reassign)
        ELSE 'Initial stock allocation'
      END
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

COMMIT;
