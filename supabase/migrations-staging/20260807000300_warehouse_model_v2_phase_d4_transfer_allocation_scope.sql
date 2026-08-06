-- Warehouse Model v2 — Phase D.4 hotfix
-- `warehouse_stock_allocations` was flipped NOT NULL on `sub_container_id`
-- in Phase C.1 but the C.2.c rewrite of `create_transfer_v2` still INSERTs
-- without stamping the column — every transfer INSERT now fails with the
-- NOT NULL violation observed on staging when the operator tried to
-- create a Birkat → Industrial Area transfer.
--
-- Fixing the INSERT alone is not enough: the current primary key
-- `(warehouse_id, brand_variant_id)` collapses allocations across the
-- multiple sub-containers of a shared warehouse. Two concurrent transfers
-- from different sub-containers of the same warehouse would clash on
-- ON CONFLICT and one would silently steal the other's allocation.
--
-- This migration:
--   1. Expands the PK to include `sub_container_id` so allocations track
--      per (warehouse, brand_variant, sub_container).
--   2. Rewrites `create_transfer_v2` to (a) scope the availability check
--      to the resolved source sub-container, (b) INSERT + ON CONFLICT with
--      sub_container_id in the key.
--   3. Rewrites `dispatch_transfer`, `cancel_transfer`, `reject_transfer_v2`
--      to WHERE-filter their allocation decrements by the transfer's
--      `from_sub_container_id`. Also stamps `sub_container_id` on the
--      cancel/reject in_transit-reversal `fifo_cost_layers` +
--      `inventory_stock_movements` INSERTs (both were missing the column
--      and would fail on the Phase C.1 NOT NULL constraint on the next
--      in-transit cancellation).
--
-- Bodies sourced live via pg_get_functiondef 2026-08-01; only the deltas
-- called out above are applied. Everything else is preserved verbatim.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Expand warehouse_stock_allocations PK
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.warehouse_stock_allocations
  DROP CONSTRAINT warehouse_stock_allocations_pkey;

ALTER TABLE public.warehouse_stock_allocations
  ADD CONSTRAINT warehouse_stock_allocations_pkey
  PRIMARY KEY (warehouse_id, brand_variant_id, sub_container_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. create_transfer_v2
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer_v2(
  p_from_warehouse_id      uuid,
  p_to_warehouse_id        uuid,
  p_date                   date,
  p_items                  jsonb,
  p_notes                  text  DEFAULT NULL,
  p_created_by_profile_id  uuid  DEFAULT NULL,
  p_created_by_name        text  DEFAULT NULL,
  p_from_sub_container_id  uuid  DEFAULT NULL,
  p_to_sub_container_id    uuid  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  v_transfer_number := generate_transfer_number();

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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation
    -- within the same source sub-container.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id
      AND brand_variant_id = v_bv_id
      AND sub_container_id = v_from_sub_container_id
    FOR UPDATE;

    -- Availability = (FIFO stock in the source sub-container) - (already
    -- allocated in the same sub-container). Both sides scoped to
    -- v_from_sub_container_id so a transfer can never spill into a peer
    -- sub-container's stock.
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id
     AND wsa.brand_variant_id = v_bv_id
     AND wsa.sub_container_id = v_from_sub_container_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.sub_container_id = v_from_sub_container_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_from_sub_container_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id, sub_container_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

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
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. dispatch_transfer — scope the allocation decrement
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_transfer(
  p_transfer_id                uuid,
  p_dispatched_by_profile_id   uuid,
  p_dispatched_by_name         text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        TRUE,
        v_transfer.from_sub_container_id
      )
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

    -- Scope allocation decrement to the transfer's source sub-container.
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id
      AND sub_container_id = v_transfer.from_sub_container_id;

    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;
  END LOOP;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. cancel_transfer — scope allocation + stamp sub_container_id on
--    the in_transit reversal INSERTs
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_transfer(
  p_transfer_id              uuid,
  p_cancelled_by_profile_id  uuid,
  p_cancelled_by_name        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         created_by_profile_id, from_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be cancelled — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF v_transfer.created_by_profile_id != p_cancelled_by_profile_id
     AND NOT has_inventory_manager_role(p_cancelled_by_profile_id) THEN
    RAISE EXCEPTION 'Only the creator or an Inventory Manager can cancel a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'cancelled',
      cancelled_by_profile_id = p_cancelled_by_profile_id,
      cancelled_by_name = p_cancelled_by_name,
      cancelled_at = now()
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer cancelled — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. reject_transfer_v2 — same pattern as cancel_transfer
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_transfer_v2(
  p_transfer_id             uuid,
  p_rejected_by_profile_id  uuid,
  p_rejected_by_name        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %',
      p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_profile_id = p_rejected_by_profile_id,
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items
    WHERE transfer_id = p_transfer_id
    ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$function$;
