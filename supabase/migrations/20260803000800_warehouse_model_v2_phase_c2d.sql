-- Warehouse Model v2 — Phase C.2.d: adjustment + deduct RPCs populate sub_container_id.
--
-- Scope (from design doc §Phase C step 4):
--   * deduct_fifo_layers                  — extend RETURNS TABLE with sub_container_id
--   * approve_stock_adjustment_inventory  — the live "apply_adjustment" — writes
--     stock_adjustments + inventory_stock_movements (+ fifo_cost_layers on increase)
--
-- Note on naming: the design doc refers to this RPC as `apply_adjustment`. The
-- true live function that (a) emits into `stock_adjustments` and (b) drives
-- inventory movement is `approve_stock_adjustment_inventory`
-- (20260727070000_deduct_fifo_layers_per_layer_breakdown.sql, section 3).
-- A legacy `public.apply_adjustment(uuid)` still exists targeting the dead
-- `inventory_adjustments` table (20260726260000) — untouched here.
--
-- What changes:
--   1. deduct_fifo_layers — return one extra column `sub_container_id uuid`
--      taken from the fifo_cost_layers row being drained. Existing callers
--      (complete_delivery_inventory / dispatch_transfer / receive_transfer /
--      rpc_process_po_return_dispatch / allocate_warehouse_stock) use
--      explicit column lists that omit the new column, so they keep working.
--      Callers that want to stamp sub_container_id will pick it up in
--      subsequent phases (C.2.e for damage, later sweep for the rest).
--   2. approve_stock_adjustment_inventory —
--        - resolve v_sub_container_id via _find_or_create_sub_container using
--          warehouses.division_id (adjustments carry no division param).
--        - stamp sub_container_id on the stock_adjustments row (COALESCE with
--          whatever the client wrote, so an operator-picked value wins).
--        - increase branch: stamp sub_container_id on the new fifo_cost_layers
--          row + on the inventory_stock_movements row.
--        - decrease/damage/write_off branch: read sub_container_id back from
--          each drained layer via deduct_fifo_layers' new column and stamp
--          it on that layer's inventory_stock_movements row. Fall back to
--          v_sub_container_id if the layer row was somehow left null.
--
-- Division stays auto-synced by the BEFORE triggers installed in
-- 20260803000500 on fifo_cost_layers and inventory_stock_movements.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. deduct_fifo_layers — add sub_container_id to per-layer breakdown
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.deduct_fifo_layers(uuid, uuid, integer, boolean);

CREATE FUNCTION public.deduct_fifo_layers(
  p_bv_id       uuid,
  p_wh_id       uuid,
  p_qty         integer,
  p_is_transfer boolean DEFAULT false
) RETURNS TABLE (
  layer_id         uuid,
  source_type      text,
  source_id        uuid,
  qty_taken        numeric,
  unit_cost        numeric,
  total_cost       numeric,
  sub_container_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost, source_type, source_id, sub_container_id
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
    ORDER BY date ASC, receival_number ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id         := r.id;
    source_type      := r.source_type;
    source_id        := r.source_id;
    qty_taken        := v_take;
    unit_cost        := r.total_unit_cost;
    total_cost       := v_take * r.total_unit_cost;
    sub_container_id := r.sub_container_id;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  PERFORM recalc_average_cost(p_bv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_fifo_layers(uuid, uuid, integer, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. approve_stock_adjustment_inventory — sub_container_id on every emitted row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(
  p_adjustment_id uuid,
  p_approved_by   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj                 RECORD;
  v_bv                  RECORD;
  v_layer               RECORD;
  v_qty                 INT;
  v_division_id         UUID;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  -- Resolve sub-container. Prefer whatever the client already stamped on
  -- the adjustment; otherwise derive from the target warehouse's division
  -- (adjustments carry no explicit division param).
  IF v_adj.sub_container_id IS NOT NULL THEN
    v_sub_container_id := v_adj.sub_container_id;
  ELSE
    SELECT division_id INTO v_division_id
    FROM warehouses
    WHERE id = v_adj.warehouse_id;

    v_sub_container_id := public._find_or_create_sub_container(v_adj.warehouse_id, v_division_id);
  END IF;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes,
      sub_container_id
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason,
      v_sub_container_id
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    -- One movement per layer drained. Read sub_container_id back from
    -- each drained fifo_cost_layers row (Phase B backfilled these; legacy
    -- nulls fall back to the adjustment's resolved sub-container).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false)
    LOOP
      v_layer_sub_container := COALESCE(v_layer.sub_container_id, v_sub_container_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason,
        v_layer_sub_container
      );
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_stock_adjustment_inventory(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
