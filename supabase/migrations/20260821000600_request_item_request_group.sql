-- Add p_request_group_id to rpc_request_warehouse_item so a buy-new request can
-- share a group id with the in-inventory transfer from the same custody submit
-- (shown as one box on the Requested Items tab). DROP + CREATE (signature
-- change) + re-GRANT. Body = the persist+notify version + the group id column.
drop function if exists public.rpc_request_warehouse_item(uuid, text, numeric, uuid, text);

create function public.rpc_request_warehouse_item(
  p_warehouse_id          uuid,
  p_item_name             text,
  p_qty                   numeric,
  p_dest_sub_container_id uuid default null,
  p_notes                 text default null,
  p_request_group_id      uuid default null
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid        uuid := public._current_user_data_id();
  v_requester  text;
  v_wh_name    text;
  v_dest_name  text;
  v_title      text;
  v_body       text;
  v_request_id uuid;
  v_rp         record;
begin
  if v_uid is null then
    raise exception 'You need to be signed in to request an item.';
  end if;
  if p_item_name is null or btrim(p_item_name) = '' then
    raise exception 'Item name is required.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  if v_wh_name is null then
    raise exception 'Warehouse not found.';
  end if;

  select full_name into v_requester from public.user_data where id = v_uid;
  if p_dest_sub_container_id is not null then
    select name into v_dest_name from public.warehouse_sub_containers where id = p_dest_sub_container_id;
  end if;

  insert into public.warehouse_item_requests
    (warehouse_id, requested_by, requester_name, dest_sub_container_id, dest_name, item_name, qty, notes, request_group_id)
  values
    (p_warehouse_id, v_uid, v_requester, p_dest_sub_container_id, v_dest_name,
     btrim(p_item_name), p_qty, nullif(btrim(coalesce(p_notes, '')), ''), p_request_group_id)
  returning id into v_request_id;

  v_title := 'Item needed: ' || btrim(p_item_name);
  v_body  := format(
    '%s needs %s x %s (not in stock at %s)%s%s',
    coalesce(v_requester, 'A user'),
    p_qty,
    btrim(p_item_name),
    v_wh_name,
    case when v_dest_name is not null then ' - for ' || v_dest_name else '' end,
    case when coalesce(btrim(p_notes), '') <> '' then '. Note: ' || btrim(p_notes) else '' end
  );

  for v_rp in
    select distinct profile_id
    from public.warehouse_responsible_persons
    where warehouse_id = p_warehouse_id and profile_id is not null
  loop
    insert into public.notifications (profile_id, type, title, body, related_id, related_type)
    values (v_rp.profile_id, 'item_request', v_title, v_body, v_request_id, 'item_request');
  end loop;

  return v_request_id;
end;
$function$;

grant execute on function public.rpc_request_warehouse_item(uuid, text, numeric, uuid, text, uuid)
  to authenticated, service_role;
