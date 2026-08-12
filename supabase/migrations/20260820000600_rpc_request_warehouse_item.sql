-- Custody follow-up ③: request an item that isn't in stock → notify the warehouse RP(s)
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- When a custody requester needs something the warehouse doesn't stock (to be
-- bought new), they send a free-text request. This RPC drops an in-app
-- notification on every responsible person of that warehouse. SECURITY DEFINER
-- so it can write notifications rows for other users (the RPs) past RLS.
-- notifications.type is free-form (no CHECK) — 'item_request' is a new value.

create or replace function public.rpc_request_warehouse_item(
  p_warehouse_id          uuid,
  p_item_name             text,
  p_qty                   numeric,
  p_dest_sub_container_id uuid  default null,
  p_notes                 text  default null
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid       uuid := public._current_user_data_id();
  v_requester text;
  v_wh_name   text;
  v_dest_name text;
  v_title     text;
  v_body      text;
  v_count     int := 0;
  v_rp        record;
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

  -- One notification per responsible person of the warehouse.
  for v_rp in
    select distinct profile_id
    from public.warehouse_responsible_persons
    where warehouse_id = p_warehouse_id and profile_id is not null
  loop
    insert into public.notifications (profile_id, type, title, body, related_id, related_type)
    values (v_rp.profile_id, 'item_request', v_title, v_body, p_warehouse_id, 'warehouse');
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'This warehouse has no responsible person set to receive the request. Ask an admin to assign one.';
  end if;

  return v_count;
end;
$function$;

grant execute on function public.rpc_request_warehouse_item(uuid, text, numeric, uuid, text)
  to authenticated, service_role;
