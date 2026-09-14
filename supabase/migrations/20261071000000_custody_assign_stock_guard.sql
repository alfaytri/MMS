-- Guard rpc_create_custody_assign at CREATE time so a custody request can't be
-- filed for more than the source can actually send.
--
-- Before: this RPC did NO stock check (unlike create_transfer_v2), so an
-- over-request was only caught later at DISPATCH by deduct_fifo_layers
-- ("Insufficient stock: requested X, missing Y units for variant …"). Multiple
-- teams could each request the same shelf, and all but the first failed on
-- dispatch.
--
-- After: each line is checked against available-to-promise from the source sub =
--   physical FIFO remaining in the source sub
--   − WH→WH soft allocations (warehouse_stock_allocations)
--   − other PENDING (undispatched) custody requests from the same source sub.
-- The last term is what stops two teams promising the same stock: the second
-- request sees the first's pending qty subtracted and is rejected up front with
-- a clear message, instead of failing at dispatch.
--
-- Signature is unchanged (still the 8-arg form from 20260821000500) → plain
-- CREATE OR REPLACE. Body is that live definition verbatim + a v_available
-- declaration + the per-line availability check before each item insert.

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

    -- ── Availability guard (create-time) ──
    -- available-to-promise = physical FIFO in the source sub
    --   − WH→WH allocations − other pending custody requests from this sub.
    -- (This transfer's header is already 'pending'; its own earlier lines are
    -- counted once inserted, so a multi-line request can't over-draw one variant.)
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
      - coalesce((select sum(wti.requested_qty)::int
                    from public.warehouse_transfer_items wti
                    join public.warehouse_transfers wt on wt.id = wti.transfer_id
                   where wt.transfer_kind         = 'custody_assign'
                     and wt.status                = 'pending'
                     and wt.from_sub_container_id = p_source_sub_container_id
                     and wti.brand_variant_id     = v_bv_id), 0)
    , 0);

    if v_available < v_qty then
      raise exception 'Not enough stock to request %: only % available to send from % (requested %). Some may already be requested and awaiting dispatch.',
        coalesce(nullif(v_label.item_name, ''), v_bv_id::text), v_available, v_source_sub.name, v_qty
        using errcode = 'P0001';
    end if;

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
items only (no stock movement). Now validates available-to-promise per line
(physical FIFO in the source sub - WH allocations - other pending custody
requests) and rejects an over-request at CREATE time instead of at dispatch.';
