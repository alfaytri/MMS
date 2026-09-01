-- 20261005000400_cascade_category_units_division.sql
create or replace function public.rpc_cascade_category_units_division(p_category_id uuid, p_division_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_moved int := 0; v_skipped text[] := array[]::text[]; r record;
begin
  if not public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') then
    raise exception 'not authorized';
  end if;
  if p_division_id is null then raise exception 'target division required'; end if;

  for r in
    with recursive subtree as (
      select id from public.inventory_categories where id = p_category_id
      union all
      select c.id from public.inventory_categories c join subtree s on c.parent_id = s.id
    )
    select tau.id as unit_id
      from public.tool_asset_units tau
      join public.inventory_items ii on ii.id = tau.item_id
     where ii.category_id in (select id from subtree)
       and tau.division_id is distinct from p_division_id
  loop
    -- mirror rpc_transfer_tool_unit: division moves, open team assignment released, custody cleared
    update public.tool_asset_units set division_id = p_division_id where id = r.unit_id;
    update public.tool_unit_assignments set released_at = now(), release_reason = 'moved'
      where unit_id = r.unit_id and released_at is null;
    update public.tool_asset_units set current_custody_location_id = null where id = r.unit_id;
    v_moved := v_moved + 1;
  end loop;

  return jsonb_build_object('moved', v_moved, 'skipped', to_jsonb(v_skipped));
end;
$function$;
revoke all on function public.rpc_cascade_category_units_division(uuid, uuid) from public, anon;
grant execute on function public.rpc_cascade_category_units_division(uuid, uuid) to authenticated;
