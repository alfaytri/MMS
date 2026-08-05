-- Warehouse Model v2 — Phase C.2.e: Phase 9 damaged-side RPCs stamp sub_container_id.
--
-- Scope: two RPCs that create warehouse_transfers + warehouse_transfer_items
-- + fifo_cost_layers + inventory_stock_movements rows for the damaged-repair
-- flow. Both must populate the sub_container_id columns that Phase A/C.1
-- added.
--
--   rpc_send_damaged_for_repair    — baseline: 20260802000700 (division_id fix)
--   rpc_return_damaged_from_repair — baseline: 20260802000700 (division_id fix)
--
-- Not touched: _record_inventory_disposition. Its INSERTs land in
-- inventory_damaged_stock_layers / inventory_damaged_stock /
-- inventory_damaged_movements only — none of those tables have a
-- sub_container_id column (Phase A limited additions to the six good-stock
-- tables). Leaving that RPC on its 000660 body.
--
-- Sub-container resolution:
--   Real warehouses → public._find_or_create_sub_container(warehouse_id, division_id).
--   Virtual repair warehouses → single-row lookup on warehouse_sub_containers
--     (Phase C.1 backfilled exactly one sub-container per virtual warehouse).
--
-- Item side follows the Phase C.2.c convention: on create the item row carries
-- the source sub-container, on receive it flips to destination. The two return
-- transfers are inserted with status='received' directly, so their items land
-- with the destination sub-container from the outset.
--
-- Everything else in each body is reproduced verbatim from 20260802000700.

BEGIN;

-- ─── 1. rpc_send_damaged_for_repair ─────────────────────────────────────
create or replace function public.rpc_send_damaged_for_repair(
  p_return_line_disposition_id uuid,
  p_repair_vendor_id           uuid,
  p_warehouse_id               uuid,
  p_expected_return_date       date,
  p_notes                      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp                  record;
  v_return_line           record;
  v_vendor                record;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
  select id, return_line_id, disposition_type, qty, warehouse_transfer_id
    into v_disp
    from public.return_line_inventory_dispositions
    where id = p_return_line_disposition_id
    for update;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: disposition % not found', p_return_line_disposition_id;
  end if;
  if v_disp.disposition_type <> 'send_for_repair' then
    raise exception 'rpc_send_damaged_for_repair: disposition % is % (expected send_for_repair)',
      p_return_line_disposition_id, v_disp.disposition_type;
  end if;
  if v_disp.warehouse_transfer_id is not null then
    raise exception 'rpc_send_damaged_for_repair: disposition % already linked to transfer %',
      p_return_line_disposition_id, v_disp.warehouse_transfer_id;
  end if;

  select id, virtual_warehouse_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no virtual warehouse (trigger misfire?)', p_repair_vendor_id;
  end if;

  select division_id
    into v_source_division
    from public.warehouses
    where id = p_warehouse_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: warehouse % not found', p_warehouse_id;
  end if;
  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, v_uid);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), v_uid
    );
  end if;

  -- Resolve sub-containers: source real warehouse via find-or-create, vendor
  -- virtual warehouse via single-row lookup (Phase C.1 guarantees exactly one).
  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_source_division);

  select id
    into v_to_sub_container_id
    from public.warehouse_sub_containers
    where warehouse_id = v_vendor.virtual_warehouse_id
    limit 1;
  if v_to_sub_container_id is null then
    raise exception 'rpc_send_damaged_for_repair: vendor virtual warehouse % has no sub-container', v_vendor.virtual_warehouse_id;
  end if;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    division_id,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_return_line_disposition_id, p_expected_return_date,
    v_source_division,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, v_return_line.brand_variant_id,
    coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
    v_disp.qty::integer, v_unit_cost, v_disp.qty::integer,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
    v_disp.id, v_transfer_id, p_notes, v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$$;

grant execute on function public.rpc_send_damaged_for_repair(uuid, uuid, uuid, date, text)
  to authenticated, service_role;

-- ─── 2. rpc_return_damaged_from_repair ──────────────────────────────────
create or replace function public.rpc_return_damaged_from_repair(
  p_transfer_id   uuid,
  p_outcome       text,
  p_qty_good      numeric,
  p_qty_writeoff  numeric,
  p_repair_cost   numeric default 0,
  p_notes         text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer              record;
  v_disp_id               uuid;
  v_variant               uuid;
  v_qty_out               numeric;
  v_unit_cost_base        numeric;
  v_unit_cost_good        numeric;
  v_wh_source             uuid;
  v_wh_vendor             uuid;
  v_dest_division         uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_item_name             text;
  v_item_sku              text;
  v_new_transfer          uuid;
  v_transfer_num          text;
  v_uid                   uuid := public._current_user_data_id();
begin
  if p_outcome not in ('good','writeoff','mixed') then
    raise exception 'rpc_return_damaged_from_repair: invalid outcome % (expected good | writeoff | mixed)', p_outcome;
  end if;
  if coalesce(p_qty_good, 0) < 0 or coalesce(p_qty_writeoff, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: qty values must be >= 0';
  end if;
  if coalesce(p_repair_cost, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: repair_cost must be >= 0';
  end if;
  if p_outcome = 'good'     and coalesce(p_qty_writeoff, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=good but qty_writeoff=%', p_qty_writeoff;
  end if;
  if p_outcome = 'writeoff' and coalesce(p_qty_good, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=writeoff but qty_good=%', p_qty_good;
  end if;
  if p_outcome = 'mixed'    and (coalesce(p_qty_good, 0) = 0 or coalesce(p_qty_writeoff, 0) = 0) then
    raise exception 'rpc_return_damaged_from_repair: outcome=mixed requires both qty_good and qty_writeoff > 0';
  end if;

  select id, transfer_kind, status, from_warehouse_id, to_warehouse_id,
         repair_vendor_id, source_return_line_disposition_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'rpc_return_damaged_from_repair: transfer % not found', p_transfer_id;
  end if;
  if v_transfer.transfer_kind <> 'damaged_repair_out' then
    raise exception 'rpc_return_damaged_from_repair: transfer % kind is % (expected damaged_repair_out)',
      p_transfer_id, v_transfer.transfer_kind;
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'rpc_return_damaged_from_repair: transfer % status is % (expected in_transit)',
      p_transfer_id, v_transfer.status;
  end if;

  v_disp_id   := v_transfer.source_return_line_disposition_id;
  v_wh_source := v_transfer.from_warehouse_id;
  v_wh_vendor := v_transfer.to_warehouse_id;

  select division_id
    into v_dest_division
    from public.warehouses
    where id = v_wh_source;

  -- Resolve sub-containers for the inbound direction: from = vendor virtual
  -- warehouse (single sub-container from C.1), to = destination real
  -- warehouse (find-or-create against the real warehouse's division).
  select id
    into v_from_sub_container_id
    from public.warehouse_sub_containers
    where warehouse_id = v_wh_vendor
    limit 1;
  if v_from_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: vendor virtual warehouse % has no sub-container', v_wh_vendor;
  end if;

  v_to_sub_container_id := public._find_or_create_sub_container(v_wh_source, v_dest_division);

  select brand_variant_id, item_name, sku, requested_qty::numeric, unit_cost
    into v_variant, v_item_name, v_item_sku, v_qty_out, v_unit_cost_base
    from public.warehouse_transfer_items
    where transfer_id = p_transfer_id
    order by created_at
    limit 1;

  if v_variant is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no warehouse_transfer_items row', p_transfer_id;
  end if;

  if coalesce(p_qty_good, 0) + coalesce(p_qty_writeoff, 0) <> v_qty_out then
    raise exception 'rpc_return_damaged_from_repair: qty_good (%) + qty_writeoff (%) must equal transfer qty (%)',
      p_qty_good, p_qty_writeoff, v_qty_out;
  end if;

  v_unit_cost_good := coalesce(v_unit_cost_base, 0)
                    + case when coalesce(p_qty_good, 0) > 0
                           then coalesce(p_repair_cost, 0) / p_qty_good
                           else 0 end;

  if p_qty_good > 0 then
    insert into public.fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id,
      sub_container_id
    ) values (
      v_variant, v_wh_source, current_date,
      p_qty_good::integer, v_unit_cost_good, 0, v_unit_cost_good, p_qty_good::integer,
      'damaged_repair_return', p_transfer_id,
      v_to_sub_container_id
    );

    update public.inventory_item_brand_variants
       set stock_level = stock_level + p_qty_good::integer,
           updated_at  = now()
     where id = v_variant;

    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    ) values (
      v_wh_source, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      'damaged_return_from_repair_as_good'::public.stock_movement_type,
      p_qty_good::integer, v_unit_cost_good,
      'warehouse_transfer', p_transfer_id,
      coalesce(p_notes, format('Return from repair (transfer %s) — %s units good, repair cost %s',
                               v_transfer.repair_vendor_id, p_qty_good, coalesce(p_repair_cost, 0))),
      v_to_sub_container_id
    );

    perform public.recalc_average_cost(v_variant);

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id, repair_cost,
      division_id,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_good', v_transfer.repair_vendor_id, v_disp_id, p_repair_cost,
      v_dest_division,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_good::integer, v_unit_cost_good, p_qty_good::integer,
      v_to_sub_container_id
    );
  end if;

  if p_qty_writeoff > 0 then
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, source_transfer_id, notes, created_by)
    values (
      'return_from_repair_as_writeoff', p_qty_writeoff, v_wh_source, v_variant, coalesce(v_unit_cost_base, 0),
      v_disp_id, p_transfer_id,
      coalesce(p_notes, format('Return from repair — %s units written off (unrecoverable)', p_qty_writeoff)),
      v_uid
    );

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id,
      division_id,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_writeoff', v_transfer.repair_vendor_id, v_disp_id,
      v_dest_division,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_writeoff::integer, coalesce(v_unit_cost_base, 0), 0,
      v_to_sub_container_id
    );
  end if;

  update public.warehouse_transfers
     set status                 = 'received',
         received_at            = now(),
         received_by_profile_id = v_uid,
         repair_cost            = coalesce(p_repair_cost, 0)
   where id = p_transfer_id;
end;
$$;

grant execute on function public.rpc_return_damaged_from_repair(uuid, text, numeric, numeric, numeric, text)
  to authenticated, service_role;

COMMIT;
