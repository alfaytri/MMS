-- Warehouse Model v2 — Phase D.4 Task 1
-- dispatch_transfer: pass from_sub_container_id to deduct_fifo_layers
-- so the FIFO drain is scoped to the source sub-container, not the whole warehouse.
-- Body preserved from live pg_proc; only the deduct_fifo_layers call gains a 5th arg.

CREATE OR REPLACE FUNCTION public.dispatch_transfer(
  p_transfer_id uuid,
  p_dispatched_by_profile_id uuid,
  p_dispatched_by_name text
)
RETURNS void
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

  -- ORDER BY brand_variant_id preserves the deterministic lock ordering
  -- that prevents deadlocks when concurrent transfers share items.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    -- Deduct FIFO scoped to the source sub-container (p_is_transfer=TRUE skips global stock_level).
    -- Loop the per-layer breakdown; one transfer_out movement per layer.
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
$function$;
