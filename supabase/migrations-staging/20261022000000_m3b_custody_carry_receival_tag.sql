-- 20261022000000_m3b_custody_carry_receival_tag.sql  (M3, part b — custody path)
--
-- Make the receival_id tag travel through a CUSTODY move so landed cost (M3a)
-- can find moved stock. No schema change: the transfer_out movement's unused
-- source_id column carries the drained source layer's id from dispatch to accept.
--
--   * rpc_dispatch_custody_assign: stamp source_id = the drained source fifo
--     layer's id (v_layer.layer_id, already returned by deduct_fifo_layers) onto
--     each transfer_out movement.
--   * rpc_accept_custody_assign: when materialising each destination layer, set
--     its receival_id from the source layer (looked up via the movement's
--     source_id). NULL for non-receival stock (imports/returns) — correct.
--     Multi-hop works: an already-tagged source layer passes its tag along.
--
-- Bodies reproduced verbatim from the live definitions (dispatch:
-- 20260815001100, accept: 20260819270000 — both verified latest, no later
-- redefinition, reference current schema). ONLY the transfer_out insert's
-- source_id (dispatch) and the destination layer's receival_id (accept) change;
-- everything else — permission gates, status flips, recalc — is identical.

-- ── dispatch: record which source layer each transfer_out drained ─────────────
CREATE OR REPLACE FUNCTION public.rpc_dispatch_custody_assign(
  p_transfer_id                uuid,
  p_dispatched_by_profile_id   uuid   DEFAULT NULL,
  p_dispatched_by_name         text   DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transfer     RECORD;
  v_uid          uuid := public._current_user_data_id();
  v_dispatcher   uuid := COALESCE(p_dispatched_by_profile_id, v_uid);
  v_item         RECORD;
  v_layer        RECORD;
  v_qty_taken    int;
  v_weighted     numeric;
  v_line_total   numeric;
BEGIN
  IF v_dispatcher IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to dispatch a custody request.';
  END IF;

  SELECT id, transfer_kind, status,
         from_warehouse_id, from_sub_container_id,
         to_warehouse_id, to_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This custody request no longer exists.';
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'This transfer is not a custody request and cannot be dispatched here.';
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'This custody request is already % — it can no longer be dispatched.', v_transfer.status;
  END IF;

  -- Permission: source WH field RP OR admin/inventory_manager.
  IF NOT public.is_field_rp_of(v_dispatcher, v_transfer.from_warehouse_id)
     AND NOT public._has_custody_admin_role(v_dispatcher) THEN
    RAISE EXCEPTION 'Only a responsible person of the source warehouse (or an admin) can dispatch this request.';
  END IF;

  -- Deduct source FIFO per line, emit transfer_out movements.
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_qty_taken := 0;
    v_line_total := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        true,                                  -- p_is_transfer
        v_transfer.from_sub_container_id
      )
    LOOP
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, source_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_transfer.from_sub_container_id,
        v_item.brand_variant_id,
        COALESCE(v_item.item_name, ''), v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id, v_layer.layer_id
      );
    END LOOP;

    IF v_qty_taken < v_item.requested_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" at the source to dispatch % — only % available.',
        COALESCE(v_item.item_name, v_item.brand_variant_id::text),
        v_item.requested_qty, v_qty_taken;
    END IF;

    v_weighted := v_line_total / NULLIF(v_qty_taken, 0);

    UPDATE public.warehouse_transfer_items
       SET dispatched_qty = v_item.requested_qty,
           unit_cost      = COALESCE(v_weighted, 0)
     WHERE id = v_item.id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                     = 'in_transit',
         dispatched_by_profile_id   = v_dispatcher,
         dispatched_by_name         = p_dispatched_by_name,
         dispatched_at              = now()
   WHERE id = p_transfer_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_dispatch_custody_assign(uuid, uuid, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_dispatch_custody_assign(uuid, uuid, text) TO authenticated, service_role;

-- ── accept: inherit the source layer's receival_id onto the destination layer ─
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
      SELECT qty, unit_cost, source_id
      FROM   public.inventory_stock_movements
      WHERE  reference_type   = 'transfer'
        AND  reference_id     = p_transfer_id
        AND  brand_variant_id = v_item.brand_variant_id
        AND  movement_type    = 'transfer_out'
      ORDER  BY created_at ASC, id ASC
    LOOP
      -- transfer_out.qty is negative; the layer qty is ABS(qty). The destination
      -- layer inherits the source layer's receival_id (via the movement's
      -- source_id) so landed cost still finds these units after the move.
      INSERT INTO public.fifo_cost_layers (
        brand_variant_id, warehouse_id, sub_container_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id, receival_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
        ABS(v_move.qty), v_move.unit_cost, 0, v_move.unit_cost, ABS(v_move.qty),
        'custody_assign', p_transfer_id,
        (SELECT fcl.receival_id FROM public.fifo_cost_layers fcl WHERE fcl.id = v_move.source_id)
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

NOTIFY pgrst, 'reload schema';
