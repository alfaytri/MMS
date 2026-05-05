-- Fix allocate_warehouse_stock: p_brand_variant_id::TEXT was passed into the
-- UUID column reference_id, causing a type mismatch error in PostgreSQL 14+.
-- The cast is unnecessary — p_brand_variant_id is already a UUID.

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
  v_current_qty    INT;
  v_delta          INT;
  v_unassigned     INT;
  v_total_fifo     INT;
  v_stock_level    INT;
  v_opening_gap    INT;
  v_to_reassign    INT;
  v_from_gap       INT;
  v_to_create      INT;
  r                RECORD;
  v_remaining      INT;
  v_take           INT;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

  IF v_delta = 0 THEN
    RETURN;
  END IF;

  IF v_delta > 0 THEN

    -- Step 1: unassigned (NULL-warehouse) layers
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

    -- Step 2: opening stock gap (stock_level minus total FIFO)
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_total_fifo
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND remaining_qty > 0;

    SELECT stock_level INTO v_stock_level
    FROM inventory_brand_variants
    WHERE id = p_brand_variant_id;

    v_opening_gap := GREATEST(0, v_stock_level - v_total_fifo);

    v_to_reassign := LEAST(v_delta, v_unassigned);
    v_from_gap    := LEAST(v_delta - v_to_reassign, v_opening_gap);
    v_to_create   := v_delta - v_to_reassign - v_from_gap;

    -- Reassign NULL-warehouse layers to this warehouse (oldest first)
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
          UPDATE fifo_cost_layers SET warehouse_id = p_warehouse_id WHERE id = r.id;
        ELSE
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

    -- Materialise opening stock gap as FIFO layers (no stock_level bump)
    -- Date 2000-01-01 ensures these sell before any future PO receipt under FIFO.
    IF v_from_gap > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, '2000-01-01'::DATE,
        v_from_gap, p_unit_cost, 0, p_unit_cost, v_from_gap
      );
    END IF;

    -- Create truly new stock (increments stock_level)
    IF v_to_create > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, CURRENT_DATE,
        v_to_create, p_unit_cost, 0, p_unit_cost, v_to_create
      );

      UPDATE inventory_brand_variants
      SET stock_level = stock_level + v_to_create, updated_at = now()
      WHERE id = p_brand_variant_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id,
      CASE
        WHEN v_to_reassign > 0 AND v_from_gap > 0 AND v_to_create > 0
          THEN format('Reassigned %s unassigned + %s opening stock + %s new', v_to_reassign, v_from_gap, v_to_create)
        WHEN v_to_reassign > 0 AND v_from_gap > 0
          THEN format('Reassigned %s unassigned + %s opening stock', v_to_reassign, v_from_gap)
        WHEN v_from_gap > 0 AND v_to_create > 0
          THEN format('Allocated %s opening stock + %s new', v_from_gap, v_to_create)
        WHEN v_from_gap > 0
          THEN format('Allocated %s units from opening stock (pre-FIFO)', v_from_gap)
        WHEN v_to_reassign > 0
          THEN format('Reassigned %s from unassigned stock', v_to_reassign)
        ELSE 'Initial stock allocation'
      END
    );

  ELSE
    PERFORM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id,
      'Stock allocation adjustment'
    );
  END IF;

  PERFORM recalc_average_cost(p_brand_variant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_warehouse_stock(UUID, UUID, INT, NUMERIC) TO authenticated;

COMMIT;
