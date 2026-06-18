-- Fix allocate_warehouse_stock to update cost on existing opening-stock FIFO
-- layers when the user changes avg_cost without changing warehouse quantities.
--
-- Previously, when v_delta = 0 the function returned immediately, so editing
-- avg_cost in the Brand Variant dialog had no effect on warehouse_stock_view
-- (which derives avg_cost from fifo_cost_layers, not from average_cost).
--
-- Fix: when v_delta = 0 and a positive unit cost is provided, update
-- unit_cost + total_unit_cost on every initial-allocation layer
-- (receival_id IS NULL) for this warehouse + variant, then recalculate
-- the variant's weighted average cost.
--
-- PO-received layers (receival_id IS NOT NULL) are intentionally untouched.
-- The frontend already prevents avg_cost editing once a PO is received
-- (avgCostLocked), so this path is only reachable for pre-PO opening stock.

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
  -- Current qty already in this warehouse
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

  IF v_delta = 0 THEN
    -- No quantity change. If a positive cost was supplied, update the cost on
    -- any opening-stock (non-PO) layers that exist for this warehouse slot so
    -- that warehouse_stock_view reflects the new avg_cost immediately.
    IF p_unit_cost > 0 THEN
      UPDATE fifo_cost_layers
      SET unit_cost        = p_unit_cost,
          total_unit_cost  = p_unit_cost
      WHERE brand_variant_id = p_brand_variant_id
        AND warehouse_id     = p_warehouse_id
        AND receival_id      IS NULL
        AND remaining_qty    > 0;

      PERFORM recalc_average_cost(p_brand_variant_id);
    END IF;
    RETURN;
  END IF;

  IF v_delta > 0 THEN

    -- ── Step 1: unassigned (NULL-warehouse) layers ──────────────────────────
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

    -- ── Step 2: opening stock gap ────────────────────────────────────────────
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_total_fifo
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND remaining_qty > 0;

    SELECT stock_level INTO v_stock_level
    FROM inventory_brand_variants
    WHERE id = p_brand_variant_id;

    v_opening_gap := GREATEST(0, v_stock_level - v_total_fifo);

    -- Allocate delta: unassigned layers first, then opening gap, then new stock
    v_to_reassign := LEAST(v_delta, v_unassigned);
    v_from_gap    := LEAST(v_delta - v_to_reassign, v_opening_gap);
    v_to_create   := v_delta - v_to_reassign - v_from_gap;

    -- ── Reassign NULL-warehouse layers to this warehouse (oldest first) ──────
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

    -- ── Materialise opening stock gap as FIFO layers (no stock_level bump) ───
    IF v_from_gap > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, '2000-01-01'::DATE,
        v_from_gap, p_unit_cost, 0, p_unit_cost, v_from_gap
      );
    END IF;

    -- ── Create truly new stock (increments stock_level) ──────────────────────
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

    -- Movement log
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id::TEXT,
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
    -- Decrease: deduct from existing FIFO layers for this warehouse
    PERFORM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id::TEXT,
      'Stock allocation adjustment'
    );
  END IF;

  PERFORM recalc_average_cost(p_brand_variant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_warehouse_stock(UUID, UUID, INT, NUMERIC) TO authenticated;

COMMIT;
