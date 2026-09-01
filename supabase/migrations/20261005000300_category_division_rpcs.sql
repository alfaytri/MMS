-- 20261005000300_category_division_rpcs.sql

-- Write (replace-set), gated like item divisions.
create or replace function public.rpc_set_category_divisions(p_category_id uuid, p_division_ids uuid[])
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._user_can_write_catalog(public._current_user_data_id()) then
    raise exception 'not authorized';
  end if;
  delete from public.inventory_category_divisions
   where category_id = p_category_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  insert into public.inventory_category_divisions (category_id, division_id, created_by)
  select p_category_id, d, public._current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (category_id, division_id) do nothing;
end;
$function$;
revoke all on function public.rpc_set_category_divisions(uuid, uuid[]) from public, anon;
grant execute on function public.rpc_set_category_divisions(uuid, uuid[]) to authenticated;

-- Category dialog read: own (editable) + inherited from STRICT ancestors (locked).
create or replace function public.rpc_category_divisions(p_category_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with recursive anc(id) as (
    select parent_id from public.inventory_categories where id = p_category_id and parent_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'own', coalesce((select array_agg(division_id)
                       from public.inventory_category_divisions where category_id = p_category_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
revoke all on function public.rpc_category_divisions(uuid) from public, anon;
grant execute on function public.rpc_category_divisions(uuid) to authenticated;

-- Item dialog read: explicit (editable) + inherited from the item's category chain incl. own category (locked).
create or replace function public.rpc_item_effective_divisions(p_item_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with recursive anc(id) as (
    select category_id from public.inventory_items where id = p_item_id and category_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'explicit', coalesce((select array_agg(division_id)
                            from public.inventory_item_divisions where item_id = p_item_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
revoke all on function public.rpc_item_effective_divisions(uuid) from public, anon;
grant execute on function public.rpc_item_effective_divisions(uuid) to authenticated;
