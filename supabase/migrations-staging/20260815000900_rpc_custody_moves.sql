-- Teams + Places + Consumption — Task 8b: custody move RPCs
--
-- Adds three RPCs that power the /warehouse/custody Assign / Accept / Return
-- actions on Teams + Places sub-containers. The move model is intentionally
-- lighter than the standard 3-step warehouse_transfers workflow:
--
--   rpc_create_custody_assign  — WH → Team/Place. Called by admin (or the
--                                source WH's field RP). Deducts source FIFO
--                                *immediately*, creates a warehouse_transfers
--                                row with kind='custody_assign' + status=
--                                'in_transit'. Stock is in-flight until the
--                                custodian accepts.
--
--   rpc_accept_custody_assign  — Called by the destination sub's responsible
--                                person (or an inventory manager). Creates
--                                FIFO layers on the destination custody sub,
--                                flips the transfer to 'received', stamps
--                                received_by_*.
--
--   rpc_create_custody_return  — Team/Place → WH. Called by the source
--                                custody sub's responsible person (or an
--                                inventory manager). Deducts the custody
--                                sub's FIFO, creates a warehouse_transfers
--                                row with kind='custody_return' + status=
--                                'in_transit'. The destination real WH team
--                                then receives via the existing receive_transfer
--                                RPC (dest is a real WH so the standard field-
--                                RP check applies).
--
-- Cancellation of an in-flight custody assign uses the existing cancel_transfer
-- RPC — no new code.
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md (Migration 7).
-- Prior migration: 20260815000800_sub_container_responsible_person.sql.

-- ────────────────────────────────────────────────────────────────────
-- 1. rpc_create_custody_assign
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_custody_assign(
  p_source_warehouse_id      uuid,
  p_source_sub_container_id  uuid,
  p_dest_sub_container_id    uuid,
  p_items                    jsonb,     -- [{brand_variant_id, qty}, ...]
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
  v_dest_wh_kind     text;
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
  -- ── Input validation ────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: at least one line is required';
  END IF;

  -- Source sub must exist + be active + belong to the source warehouse.
  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: source sub-container % not found or inactive', p_source_sub_container_id;
  END IF;
  IF v_source_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: source sub-container % does not belong to warehouse %',
      p_source_sub_container_id, p_source_warehouse_id;
  END IF;

  -- Destination sub must exist + be active + live under a teams/places WH.
  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: destination sub-container % not found or inactive', p_dest_sub_container_id;
  END IF;
  v_dest_wh_kind := v_dest_sub.warehouse_kind;
  IF v_dest_wh_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: destination sub-container % is on a % warehouse (must be teams or places)',
      p_dest_sub_container_id, v_dest_wh_kind;
  END IF;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;

  IF v_dest_warehouse_id = p_source_warehouse_id THEN
    RAISE EXCEPTION 'rpc_create_custody_assign: source and destination warehouses must differ';
  END IF;

  -- ── Header insert (status='in_transit', dispatched_at stamped) ──
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

  -- ── Line loop: deduct source FIFO + emit transfer_out movement ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'rpc_create_custody_assign: invalid line %', v_item;
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    -- Insert the transfer item shell first — unit_cost is set from the
    -- weighted average of the drained layers below.
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
        true,                          -- p_is_transfer (deducts remaining_qty)
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
      RAISE EXCEPTION 'rpc_create_custody_assign: insufficient stock for variant % at sub % (requested %, drained %)',
        v_bv_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
    END IF;

    -- Stamp a representative unit_cost on the transfer item so downstream
    -- readers (custody card value estimate) don't show zero. This is a
    -- weighted-average approximation — the per-layer cost detail is on the
    -- movements ledger.
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

REVOKE EXECUTE ON FUNCTION public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text) IS
'Custody assign — Warehouse → Team/Place. Deducts source FIFO immediately,
creates a warehouse_transfers row with kind=custody_assign + status=in_transit.
Awaits acceptance by the destination sub''s responsible person via
rpc_accept_custody_assign.';

-- ────────────────────────────────────────────────────────────────────
-- 2. rpc_accept_custody_assign
-- ────────────────────────────────────────────────────────────────────
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
  v_uid              uuid := public._current_user_data_id();
  v_accepter         uuid := COALESCE(p_accepted_by_profile_id, v_uid);
  v_item             RECORD;
  v_label            RECORD;
  v_touched_variants uuid[] := '{}';
  v_variant          uuid;
BEGIN
  IF v_accepter IS NULL THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign: caller profile not resolved';
  END IF;

  SELECT id, transfer_kind, status, to_warehouse_id, to_sub_container_id,
         from_warehouse_id, from_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign: transfer % not found', p_transfer_id;
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign: transfer % is kind=% (expected custody_assign)',
      p_transfer_id, v_transfer.transfer_kind;
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign: transfer % is status=% (expected in_transit)',
      p_transfer_id, v_transfer.status;
  END IF;

  -- Permission: accepter must be the destination sub's responsible person
  -- OR carry the inventory_manager custom role.
  SELECT responsible_person_profile_id INTO v_dest_responsible
    FROM public.warehouse_sub_containers
    WHERE id = v_transfer.to_sub_container_id;

  IF v_dest_responsible IS DISTINCT FROM v_accepter
     AND NOT public.has_inventory_manager_role(v_accepter) THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign: caller % is not the responsible person of the destination custody sub and lacks inventory_manager role', v_accepter;
  END IF;

  -- Materialize destination FIFO — one layer per transfer item at the
  -- item's stamped unit_cost (weighted average across drained source layers).
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    -- Guard against a zero-qty ghost item.
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

REVOKE EXECUTE ON FUNCTION public.rpc_accept_custody_assign(uuid, uuid, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_accept_custody_assign(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_accept_custody_assign(uuid, uuid, text) IS
'Custody accept — destination sub''s responsible person confirms receipt of
an in-transit custody_assign transfer. Creates FIFO layers + transfer_in
movements on the destination custody sub, flips the transfer to received.
Only the sub''s responsible_person_profile_id OR an inventory_manager may call.';

-- ────────────────────────────────────────────────────────────────────
-- 3. rpc_create_custody_return
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_custody_return(
  p_source_sub_container_id  uuid,     -- must belong to teams/places WH
  p_dest_warehouse_id        uuid,
  p_dest_sub_container_id    uuid,     -- destination sub in the real WH
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
  v_dest_wh           RECORD;
  v_transfer_id       uuid;
  v_transfer_number   text;
  v_uid               uuid := public._current_user_data_id();
  v_creator           uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item              jsonb;
  v_bv_id             uuid;
  v_qty               int;
  v_label             RECORD;
  v_layer             RECORD;
  v_qty_taken_sum     int;
  v_new_item_id       uuid;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'rpc_create_custody_return: caller profile not resolved';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'rpc_create_custody_return: at least one line is required';
  END IF;

  -- Source custody sub — validate + resolve source warehouse.
  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.responsible_person_profile_id, w.warehouse_kind, sc.name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_create_custody_return: source sub-container % not found or inactive', p_source_sub_container_id;
  END IF;
  IF v_source_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'rpc_create_custody_return: source sub-container % is on a % warehouse (must be teams or places)',
      p_source_sub_container_id, v_source_sub.warehouse_kind;
  END IF;

  -- Permission gate: creator must be responsible person of the custody
  -- sub OR carry the inventory_manager role.
  IF v_source_sub.responsible_person_profile_id IS DISTINCT FROM v_creator
     AND NOT public.has_inventory_manager_role(v_creator) THEN
    RAISE EXCEPTION 'rpc_create_custody_return: caller % is not the responsible person of the source custody sub and lacks inventory_manager role', v_creator;
  END IF;

  -- Destination sub must belong to p_dest_warehouse_id + be active + be on a real WH.
  SELECT sc.id, sc.warehouse_id, sc.is_active, w.warehouse_kind
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_create_custody_return: destination sub-container % not found or inactive', p_dest_sub_container_id;
  END IF;
  IF v_dest_sub.warehouse_id <> p_dest_warehouse_id THEN
    RAISE EXCEPTION 'rpc_create_custody_return: destination sub-container % does not belong to warehouse %',
      p_dest_sub_container_id, p_dest_warehouse_id;
  END IF;
  IF v_dest_sub.warehouse_kind IN ('teams','places') THEN
    RAISE EXCEPTION 'rpc_create_custody_return: destination sub-container % lives on a custody warehouse — use the standard transfer for team-to-team moves',
      p_dest_sub_container_id;
  END IF;

  IF v_dest_sub.warehouse_id = v_source_sub.warehouse_id THEN
    RAISE EXCEPTION 'rpc_create_custody_return: source and destination warehouses must differ';
  END IF;

  -- ── Header insert ──────────────────────────────────────────────
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

  -- ── Line loop ──────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'rpc_create_custody_return: invalid line %', v_item;
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
      RAISE EXCEPTION 'rpc_create_custody_return: insufficient stock for variant % at custody sub % (requested %, drained %)',
        v_bv_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
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

REVOKE EXECUTE ON FUNCTION public.rpc_create_custody_return(uuid, uuid, uuid, jsonb, text, uuid, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_create_custody_return(uuid, uuid, uuid, jsonb, text, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_create_custody_return(uuid, uuid, uuid, jsonb, text, uuid, text) IS
'Custody return — Team/Place → real Warehouse. Deducts custody sub FIFO
immediately, creates a warehouse_transfers row with kind=custody_return +
status=in_transit. The destination WH team then confirms with the standard
receive_transfer RPC. Only the source custody sub''s responsible_person OR
an inventory_manager may call.';

-- ────────────────────────────────────────────────────────────────────
-- 4. Verification
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_create_custody_assign') THEN
    RAISE EXCEPTION 'rpc_create_custody_assign did not land';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_accept_custody_assign') THEN
    RAISE EXCEPTION 'rpc_accept_custody_assign did not land';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_create_custody_return') THEN
    RAISE EXCEPTION 'rpc_create_custody_return did not land';
  END IF;
END $$;
