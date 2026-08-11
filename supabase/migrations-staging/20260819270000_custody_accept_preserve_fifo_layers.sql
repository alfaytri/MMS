-- Custody accept — preserve per-layer FIFO at the destination custody sub.
--
-- Bug: rpc_accept_custody_assign materialized ONE blended destination
-- fifo_cost_layer per transfer item at warehouse_transfer_items.unit_cost —
-- the weighted average rpc_dispatch_custody_assign stamps across the drained
-- source layers. So stock arriving via a custody assignment lost its
-- per-receival cost topology (e.g. 30@150 + 20@300 collapsed to 50@210), and
-- any later consumption from that custody sub could only ever write a single
-- blended COGS line — defeating the per-layer COGS the Revenue/COGS + P&L
-- reports require.
--
-- Fix: mirror receive_transfer. rpc_dispatch_custody_assign already records
-- the per-layer breakdown as one transfer_out movement per drained source
-- layer (qty + that layer's exact unit_cost). Accept now walks those
-- transfer_out movements in dispatch order (= FIFO order) and creates one
-- destination fifo_cost_layer + one transfer_in movement PER layer at that
-- layer's unit_cost, scoped to the destination custody sub-container.
-- Custody accept is full-receipt (no partial/shrinkage path), so no clamp or
-- shrinkage logic is needed — every dispatched layer lands in full.
--
-- Only the per-item materialization loop changes. Permission gates, status
-- checks, the received-status flip, and recalc_average_cost are byte-identical
-- to the live body (sourced via pg_get_functiondef; baseline schema is stale).
-- Totals are unchanged: sum(layer qty) = requested_qty and sum(qty*unit_cost)
-- equals the old blended layer's value, so recalc_average_cost is unaffected —
-- only the layer granularity differs. CREATE OR REPLACE preserves the existing
-- EXECUTE grants (authenticated, service_role).
--
-- Forward-looking: pre-existing blended custody_assign layers are left as-is.
-- Return path (custody sub -> real WH) already preserves layers: it drains the
-- source per-layer in rpc_create_custody_return and is completed by the
-- standard receive_transfer, which materializes per-layer. No change needed.

CREATE OR REPLACE FUNCTION public.rpc_accept_custody_assign(
  p_transfer_id             uuid,
  p_accepted_by_profile_id  uuid   DEFAULT NULL,
  p_accepted_by_name        text   DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer              RECORD;
  v_dest_responsible      uuid;
  v_dest_responsible_name text;
  v_uid                   uuid := public._current_user_data_id();
  v_accepter              uuid := COALESCE(p_accepted_by_profile_id, v_uid);
  v_item                  RECORD;
  v_move                  RECORD;
  v_touched_variants      uuid[] := '{}';
  v_variant               uuid;
BEGIN
  IF v_accepter IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to accept a custody assignment.';
  END IF;

  SELECT id, transfer_kind, status, to_warehouse_id, to_sub_container_id,
         from_warehouse_id, from_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This custody assignment no longer exists.';
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'This transfer is not a custody assignment and cannot be accepted here.';
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'This custody assignment is already % — it can no longer be accepted.', v_transfer.status;
  END IF;

  -- Permission: destination sub's responsible person, inventory_manager,
  -- or a system admin (Owner / Admin roles).
  SELECT sc.responsible_person_profile_id, u.full_name
    INTO v_dest_responsible, v_dest_responsible_name
    FROM public.warehouse_sub_containers sc
    LEFT JOIN public.user_data u ON u.id = sc.responsible_person_profile_id
    WHERE sc.id = v_transfer.to_sub_container_id;

  IF v_dest_responsible IS DISTINCT FROM v_accepter
     AND NOT public._has_custody_admin_role(v_accepter) THEN
    IF v_dest_responsible IS NULL THEN
      RAISE EXCEPTION 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to accept it, or assign one in Master Data.';
    ELSE
      RAISE EXCEPTION 'Only % can accept this custody assignment.', v_dest_responsible_name;
    END IF;
  END IF;

  -- Materialize destination FIFO PER LAYER. rpc_dispatch_custody_assign wrote
  -- one transfer_out movement per drained source layer (qty + that layer's
  -- unit_cost); recreate one destination fifo_cost_layer + transfer_in per
  -- movement so the per-receival cost topology survives into the custody sub
  -- and later consumption writes per-layer COGS. Mirrors receive_transfer.
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    FOR v_move IN
      SELECT qty, unit_cost
      FROM   public.inventory_stock_movements
      WHERE  reference_type   = 'transfer'
        AND  reference_id     = p_transfer_id
        AND  brand_variant_id = v_item.brand_variant_id
        AND  movement_type    = 'transfer_out'
      ORDER  BY created_at ASC, id ASC
    LOOP
      -- transfer_out.qty is negative; the layer qty is ABS(qty).
      INSERT INTO public.fifo_cost_layers (
        brand_variant_id, warehouse_id, sub_container_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
        ABS(v_move.qty), v_move.unit_cost, 0, v_move.unit_cost, ABS(v_move.qty),
        'custody_assign', p_transfer_id
      );

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, v_item.brand_variant_id,
        COALESCE(v_item.item_name, ''), v_item.sku,
        'transfer_in', ABS(v_move.qty), v_move.unit_cost,
        'transfer', p_transfer_id
      );
    END LOOP;

    UPDATE public.warehouse_transfer_items
       SET received_qty = v_item.requested_qty
     WHERE id = v_item.id;

    v_touched_variants := v_touched_variants || v_item.brand_variant_id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                 = 'received',
         received_by_profile_id = v_accepter,
         received_by_name       = p_accepted_by_name,
         received_at            = now()
   WHERE id = p_transfer_id;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rpc_accept_custody_assign(uuid, uuid, text) IS
'Custody accept — destination sub responsible person, inventory_manager, or
system admin confirms receipt. Materializes destination FIFO PER LAYER (one
fifo_cost_layer + transfer_in per dispatched source layer, at that layer''s
exact unit_cost) so per-receival cost topology survives into the custody sub
and later consumption writes per-layer COGS. Flips the transfer to received.';

NOTIFY pgrst, 'reload schema';
