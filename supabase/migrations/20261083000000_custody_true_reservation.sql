-- Custody requests: TRUE stock reservation (hold qty at request time).
--
-- Problem in prod (/warehouse/custody, "Insufficient stock: requested X,
-- missing Y units"): a custody request only *checked* stock at create time
-- (20261071) but never *reserved* it. warehouse_stock_view.available_qty never
-- dropped, so several team leads each saw the full shelf and each filed a
-- request for it; the check had no row lock so near-simultaneous requests raced
-- past it; and the first request out the door consumed the stock, leaving the
-- rest to fail at DISPATCH inside deduct_fifo_layers.
--
-- Fix: make custody_assign reserve stock exactly like WH->WH transfers already
-- do, using warehouse_stock_allocations:
--   * rpc_create_custody_assign  — lock + check (FIFO - allocated) + INSERT the
--                                  allocation. available_qty now drops on
--                                  request, so the same units can't be promised
--                                  twice, and the FOR UPDATE closes the race.
--   * rpc_dispatch_custody_assign — release the allocation per line once the
--                                  stock physically leaves (mirrors
--                                  dispatch_transfer). CRITICAL: without this a
--                                  later in_transit cancel would leave a phantom
--                                  reservation (cancel's in_transit branch never
--                                  touches allocations).
--   * cancel / reject            — NO change. custody requests are cancelled/
--                                  rejected through the WH->WH cancel_transfer /
--                                  reject_transfer_v2 (Transfers tab), whose
--                                  pending-branch already releases the same key
--                                  (from_warehouse_id, brand_variant_id,
--                                  from_sub_container_id). Custody now writes
--                                  that key, so release is automatic.
--
-- Reconciliation: once custody writes allocations, the separate "pending
-- custody requested_qty" term added to BOTH guards (20261080 custody create,
-- 20261081 create_transfer_v2) would double-count pending custody. This
-- migration drops that term from both — allocations now cover pending WH->WH
-- and pending custody uniformly.
--
-- Also restores TWO gates the whole-app baseline had on create_transfer_v2 but
-- that 20261081's static rebuild dropped: the custody-destination division
-- guard (fail-closed: IS NOT TRUE) and the RBAC permission gate
-- _auth_user_has_permission('warehouse.transfer.create'). cancel_transfer /
-- reject_transfer_v2 kept their permission gates; create had lost its.
--
-- Full-build port of deploy/warehouse-shipping 20261073. Verified against the
-- LIVE whole-app dev DB (wkmvjxxmzstsvahuiwsz) before replace: dispatch's
-- source_id=layer_id hot-patch and cancel/reject permission gates preserved.
--
-- Backfill: rebuild warehouse_stock_allocations from the reservation invariant
--   allocated_qty(wh, variant, sub) = SUM(requested_qty) over ALL PENDING
--   transfers from that key. Idempotent + self-healing.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. rpc_create_custody_assign — reserve on create
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.rpc_create_custody_assign(
  p_source_warehouse_id     uuid,
  p_source_sub_container_id  uuid,
  p_dest_sub_container_id    uuid,
  p_items                    jsonb,
  p_notes                    text default null,
  p_created_by_profile_id    uuid default null,
  p_created_by_name          text default null,
  p_request_group_id         uuid default null
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_source_sub        record;
  v_dest_sub          record;
  v_dest_warehouse_id uuid;
  v_dest_responsible  uuid;
  v_transfer_id       uuid;
  v_transfer_number   text;
  v_uid               uuid := public._current_user_data_id();
  v_creator           uuid := coalesce(p_created_by_profile_id, v_uid);
  v_item              jsonb;
  v_bv_id             uuid;
  v_qty               int;
  v_label             record;
  v_available         int;
begin
  if v_creator is null then
    raise exception 'You need to be signed in to request custody stock.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before submitting the request.';
  end if;

  -- Source sub sanity checks.
  select sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name
    into v_source_sub
    from public.warehouse_sub_containers sc
    where sc.id = p_source_sub_container_id;

  if not found or v_source_sub.is_active is not true then
    raise exception 'The source sub-container is no longer active.';
  end if;
  if v_source_sub.warehouse_id <> p_source_warehouse_id then
    raise exception 'The source sub-container does not belong to the chosen warehouse.';
  end if;

  -- Destination sub must be an active custody sub AND have a responsible person set,
  -- OR the caller must be admin (bypass) — otherwise nobody can accept later.
  select sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind,
         sc.responsible_person_profile_id
    into v_dest_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_dest_sub_container_id;

  if not found or v_dest_sub.is_active is not true then
    raise exception 'The destination custody sub-container is no longer active.';
  end if;
  if v_dest_sub.warehouse_kind <> 'custody' then
    raise exception 'Custody requests can only target a Custody warehouse, not %.', v_dest_sub.warehouse_kind;
  end if;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;
  v_dest_responsible  := v_dest_sub.responsible_person_profile_id;

  if v_dest_warehouse_id = p_source_warehouse_id then
    raise exception 'Source and destination warehouses must differ.';
  end if;

  -- Permission: request must come from the destination sub's responsible person OR an admin.
  if v_dest_responsible is distinct from v_creator
     and not public._has_custody_admin_role(v_creator) then
    raise exception 'Only the responsible person of this custody sub-container (or an admin) can request stock for it.';
  end if;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    request_group_id
  ) values (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'pending',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name,
    p_request_group_id
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    if v_bv_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'One of the request lines is missing an item or has an invalid qty.';
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           nullif(ii.sku, '')::text        as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_bv_id;

    -- ── Reserve stock at CREATE time (mirror create_transfer_v2) ──
    -- Lock the allocation row first so two simultaneous requests can't both
    -- pass the check and over-promise the same shelf.
    perform 1 from public.warehouse_stock_allocations
     where warehouse_id     = p_source_warehouse_id
       and brand_variant_id = v_bv_id
       and sub_container_id  = p_source_sub_container_id
     for update;

    -- available-to-promise = physical FIFO in the source sub − existing soft
    -- allocations. Allocations now include EVERY pending transfer (WH→WH and
    -- custody alike), so there is no separate pending-custody term to add. When
    -- a request has several lines of the same variant, each line's INSERT below
    -- raises allocated_qty, so the next line sees the reduced availability.
    v_available := greatest(
        coalesce((select sum(f.remaining_qty)::int
                    from public.fifo_cost_layers f
                   where f.brand_variant_id = v_bv_id
                     and f.warehouse_id     = p_source_warehouse_id
                     and f.sub_container_id = p_source_sub_container_id
                     and f.remaining_qty    > 0), 0)
      - coalesce((select wsa.allocated_qty
                    from public.warehouse_stock_allocations wsa
                   where wsa.warehouse_id     = p_source_warehouse_id
                     and wsa.brand_variant_id = v_bv_id
                     and wsa.sub_container_id = p_source_sub_container_id), 0)
    , 0);

    if v_available < v_qty then
      raise exception 'Not enough stock to request %: only % available to send from % (requested %). The rest is already reserved for other pending transfers or custody requests.',
        coalesce(nullif(v_label.item_name, ''), v_bv_id::text), v_available, v_source_sub.name, v_qty
        using errcode = 'P0001';
    end if;

    -- Hold the reservation. available_qty in warehouse_stock_view drops
    -- immediately (via trg_alloc_stock_summary) so the same units cannot be
    -- promised to another team. Released at dispatch, cancel or reject.
    insert into public.warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
    values (p_source_warehouse_id, v_bv_id, p_source_sub_container_id, v_qty)
    on conflict (warehouse_id, brand_variant_id, sub_container_id)
    do update set allocated_qty = public.warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, unit_cost, sub_container_id
    ) values (
      v_transfer_id, v_bv_id, coalesce(v_label.item_name, ''), v_label.sku,
      v_qty, 0, p_source_sub_container_id
    );
  end loop;

  return v_transfer_id;
end;
$function$;

grant execute on function public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text, uuid)
  to authenticated, service_role;

comment on function public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text, uuid) is
'Custody request (Warehouse -> Team/Place). Creates a pending transfer with line
items AND reserves the qty in warehouse_stock_allocations (FOR UPDATE lock +
check FIFO−allocated + INSERT ON CONFLICT increment), exactly like
create_transfer_v2. The reservation drops warehouse_stock_view.available_qty so
the same stock cannot be promised twice; it is released at dispatch
(rpc_dispatch_custody_assign) or at cancel/reject (cancel_transfer /
reject_transfer_v2).';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. rpc_dispatch_custody_assign — release the reservation on dispatch
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.rpc_dispatch_custody_assign(
  p_transfer_id                uuid,
  p_dispatched_by_profile_id   uuid   default null,
  p_dispatched_by_name         text   default null
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_transfer     record;
  v_uid          uuid := public._current_user_data_id();
  v_dispatcher   uuid := coalesce(p_dispatched_by_profile_id, v_uid);
  v_item         record;
  v_layer        record;
  v_qty_taken    int;
  v_weighted     numeric;
  v_line_total   numeric;
begin
  if v_dispatcher is null then
    raise exception 'You need to be signed in to dispatch a custody request.';
  end if;

  select id, transfer_kind, status,
         from_warehouse_id, from_sub_container_id,
         to_warehouse_id, to_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;

  if not found then
    raise exception 'This custody request no longer exists.';
  end if;
  if v_transfer.transfer_kind <> 'custody_assign' then
    raise exception 'This transfer is not a custody request and cannot be dispatched here.';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'This custody request is already % — it can no longer be dispatched.', v_transfer.status;
  end if;

  -- Permission: source WH field RP OR admin/inventory_manager.
  if not public.is_field_rp_of(v_dispatcher, v_transfer.from_warehouse_id)
     and not public._has_custody_admin_role(v_dispatcher) then
    raise exception 'Only a responsible person of the source warehouse (or an admin) can dispatch this request.';
  end if;

  -- Deduct source FIFO per line, emit transfer_out movements, release the hold.
  for v_item in
    select id, brand_variant_id, item_name, sku, requested_qty
    from   public.warehouse_transfer_items
    where  transfer_id = p_transfer_id
    order  by brand_variant_id
  loop
    if coalesce(v_item.requested_qty, 0) <= 0 then
      continue;
    end if;

    v_qty_taken := 0;
    v_line_total := 0;

    for v_layer in
      select layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      from   public.deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        true,                                  -- p_is_transfer
        v_transfer.from_sub_container_id
      )
    loop
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      -- NOTE: source_id = v_layer.layer_id preserves a hot-patch that lives on
      -- prod/staging but in no migration file — it links each transfer_out
      -- movement to the FIFO layer it drew from. Kept here so this CREATE OR
      -- REPLACE does not silently drop it.
      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, source_id
      ) values (
        v_transfer.from_warehouse_id, v_transfer.from_sub_container_id,
        v_item.brand_variant_id,
        coalesce(v_item.item_name, ''), v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id, v_layer.layer_id
      );
    end loop;

    if v_qty_taken < v_item.requested_qty then
      raise exception 'Not enough stock of "%" at the source to dispatch % — only % available.',
        coalesce(v_item.item_name, v_item.brand_variant_id::text),
        v_item.requested_qty, v_qty_taken;
    end if;

    v_weighted := v_line_total / nullif(v_qty_taken, 0);

    update public.warehouse_transfer_items
       set dispatched_qty = v_item.requested_qty,
           unit_cost      = coalesce(v_weighted, 0)
     where id = v_item.id;

    -- Release the reservation now that the stock has physically left the
    -- source (mirror dispatch_transfer). Scoped to the source sub-container.
    update public.warehouse_stock_allocations
       set allocated_qty = greatest(allocated_qty - v_item.requested_qty, 0),
           updated_at = now()
     where warehouse_id     = v_transfer.from_warehouse_id
       and brand_variant_id = v_item.brand_variant_id
       and sub_container_id  = v_transfer.from_sub_container_id;
  end loop;

  update public.warehouse_transfers
     set status                     = 'in_transit',
         dispatched_by_profile_id   = v_dispatcher,
         dispatched_by_name         = p_dispatched_by_name,
         dispatched_at              = now()
   where id = p_transfer_id;
end;
$function$;

revoke execute on function public.rpc_dispatch_custody_assign(uuid, uuid, text) from public;
grant  execute on function public.rpc_dispatch_custody_assign(uuid, uuid, text) to authenticated, service_role;

comment on function public.rpc_dispatch_custody_assign(uuid, uuid, text) is
'Custody dispatch — source warehouse field RP (or admin) confirms the physical
load-out. Deducts source FIFO scoped to the from_sub_container, emits
transfer_out movements, stamps weighted unit_cost on line items, RELEASES the
warehouse_stock_allocations reservation held at request time, and flips status
pending → in_transit.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. create_transfer_v2 — drop the now-double-counting custody term AND
--    restore the custody-destination division guard (dropped by 20261072).
-- ═══════════════════════════════════════════════════════════════════════
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
SET search_path = public, pg_temp
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
  -- Custody-destination division guard (restored from 20261041; fail-closed —
  -- IS NOT TRUE blocks on both false and a null membership claim). Classic
  -- WH→WH transfers (non-custody destination) are unaffected.
  IF p_to_sub_container_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_to_sub_container_id
      AND w.warehouse_kind = 'custody'
      AND sc.division_id IS NOT NULL
      AND public.is_division_member(sc.division_id) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'destination is outside your division' USING ERRCODE = '42501';
  END IF;

  -- Whole-app RBAC gate (restored from the whole-app baseline; 20261081's static
  -- rebuild dropped it while cancel_transfer/reject_transfer_v2 kept theirs).
  IF NOT public._auth_user_has_permission('warehouse.transfer.create') THEN
    RAISE EXCEPTION 'Not authorized to create transfers' USING ERRCODE = '42501';
  END IF;

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

    -- Availability-to-promise in the source sub-container:
    --   FIFO remaining − soft allocations. Allocations now include every
    -- pending transfer (WH→WH and custody_assign), so a custody request and a
    -- WH→WH transfer can no longer both promise the same stock. No separate
    -- pending-custody term is needed (it would double-count what is already in
    -- warehouse_stock_allocations). Scoped to v_from_sub_container_id so a
    -- transfer can never spill into a peer sub.
    v_available := GREATEST(
        COALESCE((SELECT SUM(f.remaining_qty)::INT
                    FROM fifo_cost_layers f
                   WHERE f.brand_variant_id = v_bv_id
                     AND f.warehouse_id     = p_from_warehouse_id
                     AND f.sub_container_id = v_from_sub_container_id
                     AND f.remaining_qty    > 0), 0)
      - COALESCE((SELECT wsa.allocated_qty
                    FROM warehouse_stock_allocations wsa
                   WHERE wsa.warehouse_id     = p_from_warehouse_id
                     AND wsa.brand_variant_id = v_bv_id
                     AND wsa.sub_container_id = v_from_sub_container_id), 0)
    , 0);

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %). Some may be reserved for pending transfers or custody requests.',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty
        USING ERRCODE = 'P0001';
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

GRANT EXECUTE ON FUNCTION public.create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text, uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Backfill — rebuild warehouse_stock_allocations from the reservation
--    invariant: allocated_qty(wh, variant, sub) = SUM(requested_qty) over ALL
--    PENDING transfers from that key (WH→WH + custody_assign). in_transit /
--    received / cancelled / rejected transfers hold no reservation.
--    custody_transfer and custody_return never have a pending state, so they
--    never appear here. Idempotent + self-healing (re-running reproduces the
--    same table and repairs any drift).
-- ═══════════════════════════════════════════════════════════════════════
DELETE FROM public.warehouse_stock_allocations;

INSERT INTO public.warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
SELECT wt.from_warehouse_id, wti.brand_variant_id, wt.from_sub_container_id,
       SUM(COALESCE(wti.requested_qty, 0))::int
  FROM public.warehouse_transfer_items wti
  JOIN public.warehouse_transfers wt ON wt.id = wti.transfer_id
 WHERE wt.status = 'pending'
   AND wt.from_sub_container_id IS NOT NULL
   AND wti.brand_variant_id IS NOT NULL
 GROUP BY wt.from_warehouse_id, wti.brand_variant_id, wt.from_sub_container_id
HAVING SUM(COALESCE(wti.requested_qty, 0)) > 0;

-- Rebuild the derived stock summary so available_qty reflects the new
-- allocations everywhere (TRUNCATE + repopulate from FIFO + allocations).
SELECT public.refresh_all_stock_summaries();

NOTIFY pgrst, 'reload schema';
