-- Warehouse Model v2 — Phase C.2.c: transfer lifecycle populates sub_container_id.
--
-- Live-body archaeology per feedback_rewrite_functions_from_live_db:
--   create_transfer_v2 <- 20240101000000_baseline_schema.sql (no newer body exists)
--   dispatch_transfer  <- 20260727070000_deduct_fifo_layers_per_layer_breakdown.sql
--   receive_transfer   <- 20260727070000_deduct_fifo_layers_per_layer_breakdown.sql
--
-- Signature change on create_transfer_v2:
--   ADD p_from_sub_container_id uuid DEFAULT NULL
--   ADD p_to_sub_container_id   uuid DEFAULT NULL
-- Backward-compat: if either is NULL, resolve from the warehouse's default
-- (oldest active) sub-container. If more than one active sub-container
-- exists on the warehouse (multi-division warehouse), abort — the operator
-- UI must pick explicitly (Phase D). Phase C predates that UI.
--
-- Only changes vs live bodies:
--   1. create_transfer_v2 — resolve v_from_sub_container_id / v_to_sub_container_id
--      once per call; stamp them on the header (from_sub_container_id,
--      to_sub_container_id) and on every warehouse_transfer_items INSERT
--      (items follow the source side until receive_transfer flips them).
--   2. dispatch_transfer — read from_sub_container_id off the header and
--      stamp it on every inventory_stock_movements INSERT.
--   3. receive_transfer — read to_sub_container_id off the header and stamp
--      it on every destination fifo_cost_layers + inventory_stock_movements
--      INSERT. Update warehouse_transfer_items.sub_container_id to the
--      destination sub-container at the same time (source→destination
--      handoff on receive).
--
-- The BEFORE trigger _sync_division_from_sub_container back-fills
-- division_id from sub_container_id on fifo_cost_layers /
-- inventory_stock_movements, so we don't need to touch division_id here.

BEGIN;

-- ─── 1. create_transfer_v2 ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text);

CREATE OR REPLACE FUNCTION public.create_transfer_v2(
  p_from_warehouse_id        uuid,
  p_to_warehouse_id          uuid,
  p_date                     date,
  p_items                    jsonb,
  p_notes                    text  DEFAULT NULL,
  p_created_by_profile_id    uuid  DEFAULT NULL,
  p_created_by_name          text  DEFAULT NULL,
  p_from_sub_container_id    uuid  DEFAULT NULL,
  p_to_sub_container_id      uuid  DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer_id           UUID;
  v_transfer_number       TEXT;
  v_item                  JSONB;
  v_bv_id                 UUID;
  v_qty                   INT;
  v_available             INT;
  v_from_sub_container_id UUID;
  v_to_sub_container_id   UUID;
  v_from_count            INT;
  v_to_count              INT;
BEGIN
  -- ─ Resolve source sub-container ─────────────────────────────────────
  IF p_from_sub_container_id IS NOT NULL THEN
    v_from_sub_container_id := p_from_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_from_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active;

    IF v_from_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_from_sub_container_id',
        p_from_warehouse_id;
    END IF;

    SELECT id INTO v_from_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_from_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_from_warehouse_id;
    END IF;
  END IF;

  -- ─ Resolve destination sub-container ────────────────────────────────
  IF p_to_sub_container_id IS NOT NULL THEN
    v_to_sub_container_id := p_to_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_to_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active;

    IF v_to_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_to_sub_container_id',
        p_to_warehouse_id;
    END IF;

    SELECT id INTO v_to_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_to_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_to_warehouse_id;
    END IF;
  END IF;

  -- Generate transfer number
  v_transfer_number := generate_transfer_number();

  -- Insert the transfer header
  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name,
    from_sub_container_id, to_sub_container_id
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name,
    v_from_sub_container_id, v_to_sub_container_id
  )
  RETURNING id INTO v_transfer_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation.
    -- If no row exists yet, lock the FIFO layers instead to serialize access.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id AND brand_variant_id = v_bv_id
    FOR UPDATE;

    -- Check available qty (stock - already allocated)
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id AND wsa.brand_variant_id = v_bv_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    -- Allocate stock (reserve it)
    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    -- Insert normalized item row. Items follow the source side until
    -- receive_transfer flips sub_container_id to the destination.
    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_from_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text, uuid, uuid) TO authenticated;


-- ─── 2. dispatch_transfer ──────────────────────────────────────────────
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
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id, to_sub_container_id
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
        movement_type, qty, unit_cost, reference_type, reference_id,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id,
        v_transfer.from_sub_container_id
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


-- ─── 3. receive_transfer ───────────────────────────────────────────────
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
         dispatched_by_profile_id,
         from_sub_container_id, to_sub_container_id
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

    -- Item-level bookkeeping (once per item, not per layer). Flip
    -- sub_container_id to the destination — the source→destination handoff.
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = v_total_shrinkage::INT,
        shrinkage_reason = CASE WHEN v_total_shrinkage > 0 THEN v_shrinkage_reason ELSE NULL END,
        sub_container_id = v_transfer.to_sub_container_id
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
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          sub_container_id
        ) VALUES (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_dest_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take,
          v_transfer.to_sub_container_id
        );

        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id,
          sub_container_id
        ) VALUES (
          v_transfer.to_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id,
          v_transfer.to_sub_container_id
        );
      END IF;

      IF v_miss > 0 THEN
        -- Shrinkage movement records the loss on the SOURCE side, so it
        -- carries the source sub_container_id.
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes,
          sub_container_id
        ) VALUES (
          v_transfer.from_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_shrinkage', -v_miss, v_move.unit_cost,
          'transfer', p_transfer_id,
          'Shrinkage: ' || v_shrinkage_reason,
          v_transfer.from_sub_container_id
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
