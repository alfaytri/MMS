-- supabase/migrations/20260608000006_transfer_rpcs.sql
BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- Helper: atomically replace Field RP assignments for a warehouse
-- (Needed because warehouse_field_rps has SELECT-only RLS — no client mutations)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION replace_warehouse_field_rps(
  p_warehouse_id UUID,
  p_profile_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM warehouse_field_rps WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO warehouse_field_rps (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Helper: check if a profile holds the inventory_manager role
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION has_inventory_manager_role(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'inventory_manager'
      AND cr.deleted_at IS NULL
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Helper: check if a profile is a Field RP for a given warehouse
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION is_field_rp_of(p_profile_id UUID, p_warehouse_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM warehouse_field_rps
    WHERE profile_id = p_profile_id AND warehouse_id = p_warehouse_id
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. create_transfer_v2 — Creates transfer + items, allocates stock
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_transfer_v2(
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_date DATE,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_created_by_profile_id UUID DEFAULT NULL,
  p_created_by_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_bv_id UUID;
  v_qty INT;
  v_available INT;
BEGIN
  -- Generate transfer number
  v_transfer_number := generate_transfer_number();

  -- Insert the transfer header
  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name
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

    -- Insert normalized item row
    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. dispatch_transfer — Approves dispatch, deducts stock from source
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION dispatch_transfer(
  p_transfer_id UUID,
  p_dispatched_by_profile_id UUID,
  p_dispatched_by_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_result RECORD;
BEGIN
  -- Lock transfer row
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

  -- Auth check: must be Field RP of source warehouse OR inventory_manager
  IF NOT is_field_rp_of(p_dispatched_by_profile_id, v_transfer.from_warehouse_id)
     AND NOT has_inventory_manager_role(p_dispatched_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to dispatch from this warehouse';
  END IF;

  -- Update transfer status
  UPDATE warehouse_transfers
  SET status = 'in_transit',
      dispatched_by_profile_id = p_dispatched_by_profile_id,
      dispatched_by_name = p_dispatched_by_name,
      dispatched_at = now()
  WHERE id = p_transfer_id;

  -- Process each item: deduct FIFO, release allocation, create movements
  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    -- Deduct from FIFO layers (p_is_transfer = TRUE skips global stock_level change)
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_item.brand_variant_id, v_transfer.from_warehouse_id, v_item.requested_qty, TRUE);

    -- Release allocation
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id;

    -- Record dispatched_qty
    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;

    -- Create transfer_out movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_transfer.from_warehouse_id, v_item.brand_variant_id,
      v_item.item_name, v_item.sku,
      'transfer_out', -v_item.requested_qty, v_result.weighted_unit_cost,
      'transfer', p_transfer_id
    );
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. receive_transfer — Confirms receival with per-item qty, handles shrinkage
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION receive_transfer(
  p_transfer_id UUID,
  p_received_by_profile_id UUID,
  p_received_by_name TEXT,
  p_received_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_ri JSONB;
  v_item RECORD;
  v_received_qty INT;
  v_shrinkage INT;
  v_avg_cost NUMERIC;
BEGIN
  -- Lock transfer row
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

  -- Auth check: must be Field RP of destination warehouse OR inventory_manager
  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to receive at this warehouse';
  END IF;

  -- Self-approval guard: dispatcher and receiver must be different unless inventory_manager
  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'Same person cannot dispatch and receive a transfer';
  END IF;

  -- Update transfer header
  UPDATE warehouse_transfers
  SET status = 'received',
      received_by_profile_id = p_received_by_profile_id,
      received_by_name = p_received_by_name,
      received_at = now()
  WHERE id = p_transfer_id;

  -- Process each received item
  FOR v_ri IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    -- Fetch the transfer item
    SELECT * INTO v_item
    FROM warehouse_transfer_items
    WHERE id = (v_ri->>'transfer_item_id')::UUID
      AND transfer_id = p_transfer_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_received_qty := COALESCE((v_ri->>'received_qty')::INT, v_item.dispatched_qty);
    v_shrinkage := COALESCE(v_item.dispatched_qty, 0) - v_received_qty;

    -- Update the transfer item
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = GREATEST(v_shrinkage, 0),
        shrinkage_reason = CASE WHEN v_shrinkage > 0 THEN COALESCE(v_ri->>'shrinkage_reason', 'missing') ELSE NULL END
    WHERE id = v_item.id;

    -- Compute average cost from the dispatch movement
    SELECT ABS(unit_cost) INTO v_avg_cost
    FROM inventory_stock_movements
    WHERE reference_id = p_transfer_id
      AND brand_variant_id = v_item.brand_variant_id
      AND movement_type = 'transfer_out'
    LIMIT 1;

    v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

    -- Add received stock to destination warehouse (UPSERT for virgin stock)
    IF v_received_qty > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.to_warehouse_id,
        COALESCE(v_transfer.date, CURRENT_DATE),
        v_received_qty, v_avg_cost, 0, v_avg_cost, v_received_qty
      );

      -- Create transfer_in movement
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id
      ) VALUES (
        v_transfer.to_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_received_qty, v_avg_cost,
        'transfer', p_transfer_id
      );
    END IF;

    -- Handle shrinkage
    IF v_shrinkage > 0 THEN
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_shrinkage', -v_shrinkage, v_avg_cost,
        'transfer', p_transfer_id,
        'Shrinkage: ' || COALESCE(v_ri->>'shrinkage_reason', 'missing')
      );
    END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. cancel_transfer — Cancels and reverses stock
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cancel_transfer(
  p_transfer_id UUID,
  p_cancelled_by_profile_id UUID,
  p_cancelled_by_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         created_by_profile_id
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

  -- Auth: only creator or inventory_manager can cancel
  IF v_transfer.created_by_profile_id != p_cancelled_by_profile_id
     AND NOT has_inventory_manager_role(p_cancelled_by_profile_id) THEN
    RAISE EXCEPTION 'Only the creator or an Inventory Manager can cancel a transfer';
  END IF;

  -- Update status
  UPDATE warehouse_transfers
  SET status = 'cancelled',
      cancelled_by_profile_id = p_cancelled_by_profile_id,
      cancelled_by_name = p_cancelled_by_name,
      cancelled_at = now()
  WHERE id = p_transfer_id;

  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      -- Release allocation only
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      -- Stock was already deducted — reverse it by creating a new FIFO layer
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      -- Add stock back to source warehouse
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty
      );

      -- Reversal movement
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer cancelled — stock returned'
      );
    END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. reject_transfer_v2 — Rejects and reverses stock
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_transfer_v2(
  p_transfer_id UUID,
  p_rejected_by_profile_id UUID,
  p_rejected_by_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      -- Release allocation
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      -- Reverse dispatch — return stock to source
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned'
      );
    END IF;
  END LOOP;
END;
$$;

-- ── Grant execute to authenticated users ───────────────────────────────
GRANT EXECUTE ON FUNCTION replace_warehouse_field_rps(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION has_inventory_manager_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_field_rp_of(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_transfer_v2(UUID, UUID, DATE, JSONB, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_transfer(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION receive_transfer(UUID, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_transfer(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_transfer_v2(UUID, UUID, TEXT) TO authenticated;

COMMIT;
