-- Teams + Places + Consumption — Task 8c follow-up: admin bypass + friendly errors
--
-- Two problems surfaced during 8c smoke test:
--
--   1. rpc_accept_custody_assign and rpc_create_custody_return only accept
--      the sub's responsible_person OR a user with the 'inventory_manager'
--      custom role. System admins (custom_roles with is_system_admin=true —
--      Owner / Admin) fell through the crack: their role NAME is 'Owner' /
--      'Admin', not 'inventory_manager', so has_inventory_manager_role()
--      returns false. The UI (usePermissions) treats them as broadly
--      privileged, so the Accept button was visible and the RPC rejected
--      it on click.
--
--   2. The rejection message quoted the raw caller UUID — hostile to read
--      on the toast. Rewrite the messages to say "Only <name> can …".
--
-- Fix: introduce a small helper _has_custody_admin_role(profile_id) that
-- returns true if the profile has has_inventory_manager_role() OR any role
-- with is_system_admin=true. Rewrite both RPCs' permission gates to use it,
-- and change the exception text to name the responsible person (looked up
-- from user_data.full_name) instead of quoting the caller's UUID.
--
-- Prior migration: 20260815000900_rpc_custody_moves.sql

-- 1. Helper — inventory manager OR system admin ─────────────────────
CREATE OR REPLACE FUNCTION public._has_custody_admin_role(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles      cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.deleted_at IS NULL
      AND  (cr.name = 'inventory_manager' OR cr.is_system_admin = true)
  );
$$;

REVOKE EXECUTE ON FUNCTION public._has_custody_admin_role(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public._has_custody_admin_role(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public._has_custody_admin_role(uuid) IS
'True when the profile carries the inventory_manager role OR any custom_role
flagged is_system_admin. Used by the custody RPCs to admit both operational
inventory managers and platform administrators (Owner / Admin).';

-- 2. rpc_accept_custody_assign — friendlier gate + error text ──────
CREATE OR REPLACE FUNCTION public.rpc_accept_custody_assign(
  p_transfer_id             uuid,
  p_accepted_by_profile_id  uuid   DEFAULT NULL,
  p_accepted_by_name        text   DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transfer         RECORD;
  v_dest_responsible uuid;
  v_dest_responsible_name text;
  v_uid              uuid := public._current_user_data_id();
  v_accepter         uuid := COALESCE(p_accepted_by_profile_id, v_uid);
  v_item             RECORD;
  v_touched_variants uuid[] := '{}';
  v_variant          uuid;
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

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
      v_item.requested_qty, v_item.unit_cost, 0, v_item.unit_cost, v_item.requested_qty,
      'custody_assign', p_transfer_id
    );

    INSERT INTO public.inventory_stock_movements (
      warehouse_id, sub_container_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, v_item.brand_variant_id,
      COALESCE(v_item.item_name, ''), v_item.sku,
      'transfer_in', v_item.requested_qty, v_item.unit_cost,
      'transfer', p_transfer_id
    );

    UPDATE public.warehouse_transfer_items
       SET received_qty = v_item.requested_qty
     WHERE id = v_item.id;

    v_touched_variants := v_touched_variants || v_item.brand_variant_id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                    = 'received',
         received_by_profile_id    = v_accepter,
         received_by_name          = p_accepted_by_name,
         received_at               = now()
   WHERE id = p_transfer_id;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rpc_accept_custody_assign(uuid, uuid, text) IS
'Custody accept — destination sub responsible person, inventory_manager, or
system admin confirms receipt. Materializes destination FIFO + transfer_in
movement + flips transfer status to received. Error messages surface friendly
text (no raw UUIDs).';

-- 3. rpc_create_custody_return — same admin bypass + error rewrite ─
CREATE OR REPLACE FUNCTION public.rpc_create_custody_return(
  p_source_sub_container_id  uuid,
  p_dest_warehouse_id        uuid,
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
  v_source_sub               RECORD;
  v_source_responsible_name  text;
  v_dest_sub                 RECORD;
  v_transfer_id              uuid;
  v_transfer_number          text;
  v_uid                      uuid := public._current_user_data_id();
  v_creator                  uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item                     jsonb;
  v_bv_id                    uuid;
  v_qty                      int;
  v_label                    RECORD;
  v_layer                    RECORD;
  v_qty_taken_sum            int;
  v_new_item_id              uuid;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to return custody stock.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item before submitting the return.';
  END IF;

  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.responsible_person_profile_id,
         w.warehouse_kind, sc.name, u.full_name AS responsible_name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    LEFT JOIN public.user_data u ON u.id = sc.responsible_person_profile_id
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'This custody sub-container is no longer active.';
  END IF;
  IF v_source_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'This flow only handles returns from Teams or Places — not %.', v_source_sub.warehouse_kind;
  END IF;

  v_source_responsible_name := v_source_sub.responsible_name;

  IF v_source_sub.responsible_person_profile_id IS DISTINCT FROM v_creator
     AND NOT public._has_custody_admin_role(v_creator) THEN
    IF v_source_sub.responsible_person_profile_id IS NULL THEN
      RAISE EXCEPTION 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to return the stock.';
    ELSE
      RAISE EXCEPTION 'Only % can return stock from this custody sub-container.', v_source_responsible_name;
    END IF;
  END IF;

  SELECT sc.id, sc.warehouse_id, sc.is_active, w.warehouse_kind
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The destination sub-container is no longer active.';
  END IF;
  IF v_dest_sub.warehouse_id <> p_dest_warehouse_id THEN
    RAISE EXCEPTION 'The destination sub-container does not belong to the chosen warehouse.';
  END IF;
  IF v_dest_sub.warehouse_kind IN ('teams','places') THEN
    RAISE EXCEPTION 'Returns must land on a real warehouse, not a Team or Place. Use the assign flow for custody-to-custody moves.';
  END IF;
  IF v_dest_sub.warehouse_id = v_source_sub.warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ.';
  END IF;

  v_transfer_number := public.generate_transfer_number();

  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    dispatched_by_profile_id, dispatched_by_name, dispatched_at
  ) VALUES (
    v_transfer_number, v_source_sub.warehouse_id, p_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_return', 'in_transit',
    current_date, NULLIF(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'One of the return lines is missing an item or has an invalid qty.';
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    INSERT INTO public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id, COALESCE(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, 0,
      p_source_sub_container_id
    )
    RETURNING id INTO v_new_item_id;

    v_qty_taken_sum := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_bv_id,
        v_source_sub.warehouse_id,
        v_qty,
        true,
        p_source_sub_container_id
      )
    LOOP
      v_qty_taken_sum := v_qty_taken_sum + v_layer.qty_taken;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        COALESCE(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" in custody to return % — only % available.',
        COALESCE(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken_sum;
    END IF;

    UPDATE public.warehouse_transfer_items wti
       SET unit_cost = (
         SELECT SUM(qty * unit_cost) / NULLIF(SUM(qty), 0)
         FROM   public.inventory_stock_movements
         WHERE  reference_type = 'transfer'
           AND  reference_id   = v_transfer_id
           AND  brand_variant_id = v_bv_id
       )
     WHERE wti.id = v_new_item_id;
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_custody_return(uuid, uuid, uuid, jsonb, text, uuid, text) IS
'Custody return — Team/Place → real Warehouse. Permission gate admits the
sub''s responsible_person, inventory_manager, or system admin. Error messages
surface friendly text (no raw UUIDs).';

-- 4. rpc_create_custody_assign — friendlier line-level errors only ─
-- No permission change here (any signed-in user may initiate); the tighter
-- gate lives on the accept side. Only rewrite the error strings so the
-- toast surface reads well.
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
  v_source_sub       RECORD;
  v_dest_sub         RECORD;
  v_dest_warehouse_id uuid;
  v_transfer_id      uuid;
  v_transfer_number  text;
  v_uid              uuid := public._current_user_data_id();
  v_creator          uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item             jsonb;
  v_bv_id            uuid;
  v_qty              int;
  v_label            RECORD;
  v_layer            RECORD;
  v_qty_taken_sum    int;
  v_new_item_id      uuid;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item before submitting the assignment.';
  END IF;

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

  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The destination custody sub-container is no longer active.';
  END IF;
  IF v_dest_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'Custody assignments can only target Teams or Places, not %.', v_dest_sub.warehouse_kind;
  END IF;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;

  IF v_dest_warehouse_id = p_source_warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ.';
  END IF;

  v_transfer_number := public.generate_transfer_number();

  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    dispatched_by_profile_id, dispatched_by_name, dispatched_at
  ) VALUES (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'in_transit',
    current_date, NULLIF(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'One of the assignment lines is missing an item or has an invalid qty.';
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    INSERT INTO public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id, COALESCE(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, 0,
      p_source_sub_container_id
    )
    RETURNING id INTO v_new_item_id;

    v_qty_taken_sum := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_bv_id,
        p_source_warehouse_id,
        v_qty,
        true,
        p_source_sub_container_id
      )
    LOOP
      v_qty_taken_sum := v_qty_taken_sum + v_layer.qty_taken;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        p_source_warehouse_id, p_source_sub_container_id, v_bv_id,
        COALESCE(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" at the source to assign % — only % available.',
        COALESCE(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken_sum;
    END IF;

    UPDATE public.warehouse_transfer_items wti
       SET unit_cost = (
         SELECT SUM(qty * unit_cost) / NULLIF(SUM(qty), 0)
         FROM   public.inventory_stock_movements
         WHERE  reference_type = 'transfer'
           AND  reference_id   = v_transfer_id
           AND  brand_variant_id = v_bv_id
       )
     WHERE wti.id = v_new_item_id;
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text) IS
'Custody assign — Warehouse → Team/Place. Any signed-in user may initiate.
Error messages surface friendly text (no raw UUIDs). The tighter permission
gate lives on the accept side.';
