-- rpc_create_custody_transfer — add a destination-division guard.
--
-- Operator decision (2026-08-19): a user may only hand stock to custody locations
-- in a division they are ASSIGNED to (owner / accountant see all). We enforce it
-- server-side with public.is_division_member(division_id), which reads the
-- caller's JWT division_ids claim — so it holds on a direct API call, not just in
-- the UI (the CustodyTransferDialog also filters the destination list to the
-- caller's divisions). Full CREATE OR REPLACE so this migration is self-contained.

create or replace function public.rpc_create_custody_transfer(
  p_source_sub_container_id uuid,
  p_dest_sub_container_id   uuid,
  p_items                   jsonb,
  p_notes                   text  default null,
  p_created_by_profile_id   uuid  default null,
  p_created_by_name         text  default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_sub      record;
  v_dest_sub        record;
  v_uid             uuid := public._current_user_data_id();
  v_creator         uuid := coalesce(p_created_by_profile_id, v_uid);
  v_transfer_id     uuid;
  v_transfer_number text;
  v_item            jsonb;
  v_bv_id           uuid;
  v_qty             int;
  v_label           record;
  v_layer           record;
  v_qty_taken       int;
  v_line_total      numeric;
  v_weighted        numeric;
begin
  if v_creator is null then
    raise exception 'You need to be signed in to transfer custody stock.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before submitting the transfer.';
  end if;

  -- Source: active custody location under a warehouse permitted to hand out.
  select sc.id, sc.warehouse_id, sc.is_active, sc.name,
         sc.responsible_person_profile_id,
         w.warehouse_kind,
         coalesce(w.can_transfer_custody, false) as can_transfer
    into v_source_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_source_sub_container_id;

  if not found or v_source_sub.is_active is not true then
    raise exception 'The source custody location is no longer active.';
  end if;
  if v_source_sub.warehouse_kind <> 'custody' then
    raise exception 'Only custody locations can transfer to other custody locations.';
  end if;
  if v_source_sub.can_transfer is not true then
    raise exception 'This custody warehouse is not permitted to hand out stock to other custody locations.';
  end if;

  -- Destination: a DIFFERENT active custody location that has a responsible person.
  select sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name,
         sc.responsible_person_profile_id, w.warehouse_kind
    into v_dest_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_dest_sub_container_id;

  if not found or v_dest_sub.is_active is not true then
    raise exception 'The destination custody location is no longer active.';
  end if;
  if v_dest_sub.warehouse_kind <> 'custody' then
    raise exception 'Custody transfers can only target another custody location.';
  end if;
  if p_dest_sub_container_id = p_source_sub_container_id then
    raise exception 'Source and destination locations must differ.';
  end if;
  if v_dest_sub.responsible_person_profile_id is null then
    raise exception 'The destination custody location has no responsible person set, so nobody could accept the transfer. Assign one in Master Data first.';
  end if;

  -- The destination must be in a division the caller is assigned to (owner /
  -- accountant see all). is_division_member reads the caller's JWT division_ids,
  -- so this holds even on a direct API call, mirroring the UI's scoping.
  if not public.is_division_member(v_dest_sub.division_id) then
    raise exception 'You can only transfer to a custody location in a division you are assigned to.';
  end if;

  -- Permission: the SOURCE location's responsible person, or a custody admin.
  if v_source_sub.responsible_person_profile_id is distinct from v_creator
     and not public._has_custody_admin_role(v_creator) then
    raise exception 'Only the responsible person of the source custody location (or an admin) can transfer its stock.';
  end if;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    dispatched_by_profile_id, dispatched_by_name, dispatched_at
  ) values (
    v_transfer_number, v_source_sub.warehouse_id, v_dest_sub.warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'in_transit',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  returning id into v_transfer_id;

  -- Deduct the source FIFO per line and book transfer_out movements — identical
  -- to rpc_dispatch_custody_assign, so rpc_accept_custody_assign can restock the
  -- destination and reconcile any shortfall against the source on acceptance.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    if v_bv_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'One of the transfer lines is missing an item or has an invalid qty.';
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           nullif(ii.sku, '')::text        as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_bv_id;

    v_qty_taken  := 0;
    v_line_total := 0;

    for v_layer in
      select qty_taken, unit_cost, total_cost
      from public.deduct_fifo_layers(
        v_bv_id,
        v_source_sub.warehouse_id,
        v_qty,
        true,                              -- p_is_transfer (keeps company stock_level until accept)
        p_source_sub_container_id
      )
    loop
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) values (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        coalesce(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id
      );
    end loop;

    if v_qty_taken < v_qty then
      raise exception 'Not enough stock of "%" at the source to transfer % — only % available.',
        coalesce(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken;
    end if;

    v_weighted := v_line_total / nullif(v_qty_taken, 0);

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost, sub_container_id
    ) values (
      v_transfer_id, v_bv_id, coalesce(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, coalesce(v_weighted, 0), p_source_sub_container_id
    );
  end loop;

  return v_transfer_id;
end;
$function$;

-- CREATE OR REPLACE preserves grants, but keep them explicit and idempotent.
revoke all on function public.rpc_create_custody_transfer(uuid, uuid, jsonb, text, uuid, text) from public;
grant execute on function public.rpc_create_custody_transfer(uuid, uuid, jsonb, text, uuid, text) to authenticated, service_role;
