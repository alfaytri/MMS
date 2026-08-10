-- Enable intra-warehouse (sub-container → sub-container) transfers,
-- e.g. Maintenance → Kitchen within one warehouse.
--
-- The transfer RPCs already operate at (warehouse, sub_container) granularity
-- (create_transfer_v2 allocates, dispatch_transfer deducts, receive_transfer
-- adds — all scoped to sub_container), so only two things blocked it:
--
-- 1) Table constraint check_different_warehouses forbade from = to outright.
--    Relax to allow the same warehouse WHEN the sub-containers differ (still
--    blocks a no-op same-warehouse + same-sub-container transfer).
-- 2) receive_transfer's "same person cannot dispatch and receive" guard — per
--    operator decision, relaxed for SAME-warehouse transfers so a solo operator
--    can complete an internal move. The guard still applies cross-warehouse.
--
-- receive_transfer body sourced live via pg_get_functiondef; only the guard
-- condition changed (added from_warehouse_id <> to_warehouse_id).

ALTER TABLE public.warehouse_transfers DROP CONSTRAINT IF EXISTS check_different_warehouses;
ALTER TABLE public.warehouse_transfers
  ADD CONSTRAINT check_different_location
  CHECK (from_warehouse_id <> to_warehouse_id
         OR from_sub_container_id IS DISTINCT FROM to_sub_container_id);

CREATE OR REPLACE FUNCTION public.receive_transfer(p_transfer_id uuid, p_received_by_profile_id uuid, p_received_by_name text, p_received_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Same-person separation applies only to CROSS-warehouse transfers. An
  -- intra-warehouse (sub-container → sub-container) move may be completed by
  -- the same operator who dispatched it.
  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND v_transfer.from_warehouse_id <> v_transfer.to_warehouse_id
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

    -- H11 fix: shrinkage never reached stock_level.
    -- Dispatch skipped the decrement (in-transit); received
    -- portion doesn't bring it back automatically.
    IF v_total_shrinkage > 0 THEN
      UPDATE public.inventory_item_brand_variants
         SET stock_level = GREATEST(stock_level - v_total_shrinkage, 0),
             updated_at  = now()
       WHERE id = v_item.brand_variant_id;
    END IF;
  END LOOP;
END;
$function$;
