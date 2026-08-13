-- Add p_request_group_id to rpc_create_custody_assign so a custody submit that
-- also files buy-new item requests can share one group id (shown as one box on
-- the Requested Items tab). Adding a param changes the signature, so DROP +
-- CREATE + re-GRANT. Body is the live definition verbatim + the two additions
-- (the param and the request_group_id column in the transfer insert).
drop function if exists public.rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text);

create function public.rpc_create_custody_assign(
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
