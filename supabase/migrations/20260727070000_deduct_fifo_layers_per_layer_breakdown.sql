-- Section 10 (subsumes 2A) — Per-layer FIFO breakdown for downstream ledgers
--
-- Before: deduct_fifo_layers returned a single aggregated pair
-- (total_cost, weighted_unit_cost). Every caller wrote one downstream
-- row (cogs_entries, inventory_stock_movements, destination FIFO layer)
-- at the weighted-average cost. When a draw spanned multiple layers
-- (Scenario 2A: R1 5@10 + R2 5@12), the per-layer cost detail was lost.
--
-- After: deduct_fifo_layers returns one row per layer drained
-- (layer_id, source_type, source_id, qty_taken, unit_cost, total_cost).
-- Each caller loops the result and writes N rows — one per layer.
-- FIFO layer state still updates the same way (oldest-first, locked
-- FOR UPDATE, remaining_qty decremented, stock_level adjusted unless
-- p_is_transfer=TRUE, recalc_average_cost at the end).
--
-- Scope: complete_delivery_inventory, approve_stock_adjustment_inventory,
-- dispatch_transfer, rpc_process_po_return_dispatch,
-- allocate_warehouse_stock, receive_transfer.
--
-- Out of scope (verified pre-flight):
--   * approve_warehouse_transfer_inventory — already dropped
--     (20260715170000).
--   * apply_adjustment / inventory_adjustments — dead RPC on a dead
--     table; queued for a separate cleanup section.
--   * apply_inventory_check_adjustments — no longer calls
--     deduct_fifo_layers (rewritten Section 1.18 to generate SAs).
--
-- receive_transfer decision (option i from the plan): read all
-- transfer_out movements for (transfer, variant) in dispatch order,
-- iterate them consuming v_received_qty. For each dispatched layer:
-- if fully received, create a matching destination layer + transfer_in
-- movement at that layer's unit_cost; if partially received, split
-- (create dest layer for the received portion + a transfer_shrinkage
-- movement for the missing portion, both at that layer's unit_cost).
-- This keeps destination cost topology faithful to the source and
-- attributes shrinkage cost to the specific dispatched layer(s) that
-- didn't arrive.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. deduct_fifo_layers — new per-layer return signature
-- ---------------------------------------------------------------------------
--
-- Signature change: RETURNS TABLE changes shape. Postgres treats that
-- as a breaking change to the function's return type, so DROP + CREATE
-- (rather than CREATE OR REPLACE). No stored callers pin to the old
-- shape because all callers get rewritten in this same migration.

DROP FUNCTION IF EXISTS public.deduct_fifo_layers(uuid, uuid, integer, boolean);

CREATE FUNCTION public.deduct_fifo_layers(
  p_bv_id       uuid,
  p_wh_id       uuid,
  p_qty         integer,
  p_is_transfer boolean DEFAULT false
) RETURNS TABLE (
  layer_id      uuid,
  source_type   text,
  source_id     uuid,
  qty_taken     numeric,
  unit_cost     numeric,
  total_cost    numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  -- Walk oldest layers first, locking each row before touching it.
  -- Order: date ASC, receival_number ASC (same-day receivals drain in
  -- arrival sequence), created_at ASC, id ASC (deterministic tiebreak).
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost, source_type, source_id
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

    -- Emit one row per layer drained.
    layer_id    := r.id;
    source_type := r.source_type;
    source_id   := r.source_id;
    qty_taken   := v_take;
    unit_cost   := r.total_unit_cost;
    total_cost  := v_take * r.total_unit_cost;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  -- Guard: if we couldn't satisfy the full quantity, roll everything back.
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  -- Skip global stock_level update for warehouse-to-warehouse transfers.
  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  -- Recalculate weighted average after deduction.
  PERFORM recalc_average_cost(p_bv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_fifo_layers(uuid, uuid, integer, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. complete_delivery_inventory — per-layer COGS + movements
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery  RECORD;
  v_line      RECORD;
  v_wh_id     UUID;
  v_date      DATE;
  v_layer     RECORD;
  v_all_delivered BOOLEAN;
  v_any_delivered BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    -- One COGS + one movement PER LAYER drained. Preserves per-receival
    -- cost detail on both ledgers (Scenario 2A).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false)
    LOOP
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type
      ) VALUES (
        v_line.brand_variant_id, p_delivery_id, p_so_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, v_date,
        'sale'
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_wh_id, v_line.brand_variant_id,
        COALESCE(v_line.item_name, ''),
        v_line.sku,
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', p_delivery_id
      );
    END LOOP;

    -- Line-level bookkeeping (once per line, not per layer).
    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;
  END LOOP;

  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_delivery_inventory(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. approve_stock_adjustment_inventory — per-layer movements on deduct branch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(
  p_adjustment_id uuid,
  p_approved_by   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_adj     RECORD;
  v_bv      RECORD;
  v_layer   RECORD;
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

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  UPDATE stock_adjustments
  SET status = 'approved', approved_by_name = p_approved_by, approved_at = now()
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    -- Increase branch: unchanged. INSERTs a new layer + one movement +
    -- stock_level up + damaged_qty untouched. deduct_fifo_layers not called.
    SELECT average_cost INTO v_bv
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

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    -- damaged_qty bump happens once per adjustment (not per layer).
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    -- One movement per layer drained.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason
      );
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_stock_adjustment_inventory(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. dispatch_transfer — per-layer transfer_out movements
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_transfer(
  p_transfer_id            uuid,
  p_dispatched_by_profile_id uuid,
  p_dispatched_by_name     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_layer    RECORD;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer % cannot be dispatched — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF NOT is_field_rp_of(p_dispatched_by_profile_id, v_transfer.from_warehouse_id)
     AND NOT has_inventory_manager_role(p_dispatched_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to dispatch from this warehouse';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'in_transit',
      dispatched_by_profile_id = p_dispatched_by_profile_id,
      dispatched_by_name = p_dispatched_by_name,
      dispatched_at = now()
  WHERE id = p_transfer_id;

  -- ORDER BY brand_variant_id preserves the deterministic lock ordering
  -- that prevents deadlocks when concurrent transfers share items.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    -- Deduct FIFO (p_is_transfer=TRUE skips global stock_level).
    -- Loop the per-layer breakdown; one transfer_out movement per layer.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_item.brand_variant_id, v_transfer.from_warehouse_id, v_item.requested_qty, TRUE)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id
      );
    END LOOP;

    -- Release allocation + record dispatched_qty (once per item).
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id;

    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_transfer(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. rpc_process_po_return_dispatch — per-layer purchase_return movements
-- ---------------------------------------------------------------------------
--
-- Also updated the FROM clause from the compat view `returns` to the
-- canonical `so_po_returns` (renamed in 20260724160002). One less
-- consumer of the compat view.

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return  RECORD;
  v_line    RECORD;
  v_bv_id   UUID;
  v_layer   RECORD;
BEGIN
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   so_po_returns
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

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing.
    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    -- One purchase_return movement per layer drained.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_bv_id, v_return.restock_warehouse_id, v_line.qty, false)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_po_return_dispatch(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. allocate_warehouse_stock — per-layer movements on decrease branch
-- ---------------------------------------------------------------------------
--
-- Only the decrease branch changes. Increase branch stays verbatim
-- (writes a single summary movement across three possible sources —
-- reassign + gap + create — and doesn't call deduct_fifo_layers).
-- Note: the pre-fix decrease branch used p_unit_cost (caller-supplied)
-- for the movement's unit_cost, which didn't match the actual drained
-- layer costs. Rewritten path uses the real layer costs.

CREATE OR REPLACE FUNCTION public.allocate_warehouse_stock(
  p_brand_variant_id uuid,
  p_warehouse_id     uuid,
  p_target_qty       integer,
  p_unit_cost        numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
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
  v_layer          RECORD;
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
    IF p_unit_cost > 0 THEN
      UPDATE fifo_cost_layers
      SET unit_cost       = p_unit_cost,
          total_unit_cost = p_unit_cost
      WHERE brand_variant_id = p_brand_variant_id
        AND warehouse_id     = p_warehouse_id
        AND receival_id      IS NULL
        AND remaining_qty    > 0;

      PERFORM recalc_average_cost(p_brand_variant_id);
    END IF;
    RETURN;
  END IF;

  -- ── Quantity increase (unchanged) ────────────────────────────────────────
  IF v_delta > 0 THEN

    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

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

    IF v_from_gap > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, '2000-01-01'::DATE,
        v_from_gap, p_unit_cost, 0, p_unit_cost, v_from_gap
      );
    END IF;

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

  -- ── Quantity decrease (rewritten) ────────────────────────────────────────
  ELSE
    -- One movement per layer drained. unit_cost now reflects the actual
    -- layer cost (was p_unit_cost, which was a caller-supplied number
    -- that didn't match FIFO reality).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, p_brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'initial_allocation', p_brand_variant_id,
        'Stock allocation adjustment'
      );
    END LOOP;
  END IF;

  -- Update cost on all opening-stock layers for this warehouse.
  IF p_unit_cost > 0 THEN
    UPDATE fifo_cost_layers
    SET unit_cost       = p_unit_cost,
        total_unit_cost = p_unit_cost
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id     = p_warehouse_id
      AND receival_id      IS NULL
      AND remaining_qty    > 0;
  END IF;

  PERFORM recalc_average_cost(p_brand_variant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_warehouse_stock(uuid, uuid, integer, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. receive_transfer — mirror source layers at destination (option i)
-- ---------------------------------------------------------------------------
--
-- Algorithm: for each variant received, iterate the transfer_out
-- movements this transfer wrote (in dispatch order = FIFO source order)
-- and consume v_received_qty layer-by-layer:
--   * If received >= movement.qty : fully received → destination layer
--     with full qty + transfer_in movement at that layer's unit_cost.
--   * If 0 < received < movement.qty : partially received → destination
--     layer for the received portion + transfer_shrinkage movement for
--     the missing portion, both at that layer's unit_cost.
--   * If received == 0 for remaining movements : fully missed →
--     transfer_shrinkage movement for the full dispatched qty at that
--     layer's unit_cost. No destination layer.
-- Over-receipt (v_received_qty > SUM dispatched) is clamped — extra
-- units are silently dropped, matching the current behaviour that
-- clamps shrinkage to zero via GREATEST(0, ...).

CREATE OR REPLACE FUNCTION public.receive_transfer(
  p_transfer_id             uuid,
  p_received_by_profile_id  uuid,
  p_received_by_name        text,
  p_received_items          jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer      RECORD;
  v_ri            JSONB;
  v_item          RECORD;
  v_move          RECORD;
  v_dispatched    NUMERIC;
  v_received_qty  INT;
  v_shrinkage_reason text;
  v_remaining_recv NUMERIC;
  v_total_dispatched NUMERIC;
  v_total_shrinkage  NUMERIC;
  v_take          NUMERIC;
  v_miss          NUMERIC;
  v_dest_date     DATE;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         dispatched_by_profile_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'in_transit' THEN
    RAISE EXCEPTION 'Transfer % cannot be received — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to receive at this warehouse';
  END IF;

  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'Same person cannot dispatch and receive a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'received',
      received_by_profile_id = p_received_by_profile_id,
      received_by_name = p_received_by_name,
      received_at = now()
  WHERE id = p_transfer_id;

  v_dest_date := COALESCE(v_transfer.date, CURRENT_DATE);

  FOR v_ri IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    SELECT * INTO v_item
    FROM warehouse_transfer_items
    WHERE id = (v_ri->>'transfer_item_id')::UUID
      AND transfer_id = p_transfer_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_received_qty     := COALESCE((v_ri->>'received_qty')::INT, v_item.dispatched_qty);
    v_shrinkage_reason := COALESCE(v_ri->>'shrinkage_reason', 'missing');
    v_dispatched       := COALESCE(v_item.dispatched_qty, 0);

    -- Sum total dispatched across all transfer_out movements for this
    -- (transfer, variant). Used to compute the per-item shrinkage flag +
    -- clamp over-receipt.
    SELECT COALESCE(SUM(ABS(qty)), 0)
    INTO v_total_dispatched
    FROM inventory_stock_movements
    WHERE reference_id = p_transfer_id
      AND brand_variant_id = v_item.brand_variant_id
      AND movement_type = 'transfer_out';

    -- Clamp over-receipt (matches the current "GREATEST(v_shrinkage, 0)"
    -- behaviour: extra units above dispatched are silently dropped).
    IF v_received_qty > v_total_dispatched THEN
      v_received_qty := v_total_dispatched::INT;
    END IF;

    v_total_shrinkage := GREATEST(v_total_dispatched - v_received_qty, 0);

    -- Item-level bookkeeping (once per item, not per layer).
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = v_total_shrinkage::INT,
        shrinkage_reason = CASE WHEN v_total_shrinkage > 0 THEN v_shrinkage_reason ELSE NULL END
    WHERE id = v_item.id;

    v_remaining_recv := v_received_qty;

    -- Walk the dispatch-side movements in insertion order (= FIFO source
    -- order). Split each into "received portion → dest layer + transfer_in"
    -- and "missing portion → transfer_shrinkage".
    FOR v_move IN
      SELECT id, qty, unit_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      ORDER BY created_at ASC, id ASC
    LOOP
      -- movement.qty is negative on transfer_out; the dispatched qty
      -- for this layer is ABS(qty).
      v_dispatched := ABS(v_move.qty);

      v_take := LEAST(v_remaining_recv, v_dispatched);
      v_miss := v_dispatched - v_take;

      IF v_take > 0 THEN
        -- Destination layer at the source layer's exact unit_cost.
        INSERT INTO fifo_cost_layers (
          brand_variant_id, warehouse_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
        ) VALUES (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_dest_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take
        );

        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id
        ) VALUES (
          v_transfer.to_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id
        );
      END IF;

      IF v_miss > 0 THEN
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) VALUES (
          v_transfer.from_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_shrinkage', -v_miss, v_move.unit_cost,
          'transfer', p_transfer_id,
          'Shrinkage: ' || v_shrinkage_reason
        );
      END IF;

      v_remaining_recv := v_remaining_recv - v_take;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_transfer(uuid, uuid, text, jsonb) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
