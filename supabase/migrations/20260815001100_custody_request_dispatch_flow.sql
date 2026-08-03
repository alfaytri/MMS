-- Teams + Places + Consumption — Task 8c revision: request → dispatch → accept flow
--
-- Operator feedback on the initial 8b/8c ship: the "assign" flow felt wrong
-- because it deducted warehouse stock the moment the custody request was
-- created, cutting the source warehouse RP out of the loop. In practice the
-- warehouse person is the one physically loading the van and needs to
-- verify + click Dispatch before stock leaves their books.
--
-- Reshape custody_assign to mirror the standard warehouse_transfers 3-step
-- workflow (pending → in_transit → received) with custody-flavoured gates:
--
--   1. request  — rpc_create_custody_assign (rewritten):
--                 custody sub responsible person OR _has_custody_admin_role
--                 Inserts transfer header + line items only. No FIFO move.
--                 status='pending'.
--
--   2. dispatch — rpc_dispatch_custody_assign (NEW):
--                 source WH field RP (is_field_rp_of) OR _has_custody_admin_role
--                 Deducts source FIFO scoped to source sub, emits transfer_out
--                 movements, stamps weighted unit_cost on line items, flips
--                 status → in_transit + dispatched_by_* + dispatched_at.
--
--   3. accept   — rpc_accept_custody_assign (unchanged):
--                 destination custody sub responsible person OR admin
--                 Materializes destination FIFO + transfer_in movements,
--                 flips status → received.
--
-- Cancellation of a pending or in_transit custody request continues to use
-- the existing cancel_transfer RPC.
--
-- Return direction (Team/Place → real WH) stays a 2-step create + standard
-- receive_transfer — see rpc_create_custody_return in 20260815000900.

-- ── 1. Rewrite rpc_create_custody_assign — request-only, no FIFO ──
CREATE OR REPLACE FUNCTION public.rpc_create_custody_assign(
  p_source_warehouse_id      uuid,
  p_source_sub_container_id  uuid,
  p_dest_sub_container_id    uuid,
  p_items                    jsonb,
  p_notes                    text     DEFAULT NULL,
  p_created_by_profile_id    uuid     DEFAULT NULL,
  p_created_by_name          text     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source_sub        RECORD;
  v_dest_sub          RECORD;
  v_dest_warehouse_id uuid;
  v_dest_responsible  uuid;
  v_transfer_id       uuid;
  v_transfer_number   text;
  v_uid               uuid := public._current_user_data_id();
  v_creator           uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item              jsonb;
  v_bv_id             uuid;
  v_qty               int;
  v_label             RECORD;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to request custody stock.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item before submitting the request.';
  END IF;

  -- Source sub sanity checks.
  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The source sub-container is no longer active.';
  END IF;
  IF v_source_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'The source sub-container does not belong to the chosen warehouse.';
  END IF;

  -- Destination sub must be an active custody sub AND have a responsible person set,
  -- OR the caller must be admin (bypass) — otherwise nobody can accept later.
  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind,
         sc.responsible_person_profile_id
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The destination custody sub-container is no longer active.';
  END IF;
  IF v_dest_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'Custody requests can only target Teams or Places, not %.', v_dest_sub.warehouse_kind;
  END IF;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;
  v_dest_responsible  := v_dest_sub.responsible_person_profile_id;

  IF v_dest_warehouse_id = p_source_warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ.';
  END IF;

  -- Permission: request must come from the destination sub's responsible
  -- person OR an admin. (Anyone-can-request would let random users trigger
  -- work for warehouse teams they have no relationship with.)
  IF v_dest_responsible IS DISTINCT FROM v_creator
     AND NOT public._has_custody_admin_role(v_creator) THEN
    RAISE EXCEPTION 'Only the responsible person of this custody sub-container (or an admin) can request stock for it.';
  END IF;

  v_transfer_number := public.generate_transfer_number();

  -- Header — status='pending'. No dispatched/received stamping yet.
  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name
  ) VALUES (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'pending',
    current_date, NULLIF(p_notes, ''),
    v_creator, p_created_by_name
  )
  RETURNING id INTO v_transfer_id;

  -- Line items — requested_qty only. unit_cost stamped at dispatch time.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'One of the request lines is missing an item or has an invalid qty.';
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    INSERT INTO public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, unit_cost, sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id, COALESCE(v_label.item_name, ''), v_label.sku,
      v_qty, 0, p_source_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text) IS
'Custody request (Warehouse → Team/Place). Creates a pending transfer with
line items only — NO stock movement yet. The source warehouse RP dispatches
via rpc_dispatch_custody_assign to actually move stock. Called by the
destination sub responsible person or an admin.';

-- ── 2. New rpc_dispatch_custody_assign — WH RP loads the van ──────
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
        reference_type, reference_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_transfer.from_sub_container_id,
        v_item.brand_variant_id,
        COALESCE(v_item.item_name, ''), v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id
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

COMMENT ON FUNCTION public.rpc_dispatch_custody_assign(uuid, uuid, text) IS
'Custody dispatch — source warehouse field RP (or admin) confirms the
physical load-out. Deducts source FIFO scoped to the from_sub_container,
emits transfer_out movements, stamps weighted unit_cost on line items,
flips transfer status pending → in_transit.';
