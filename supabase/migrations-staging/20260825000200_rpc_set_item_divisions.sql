CREATE OR REPLACE FUNCTION public.rpc_set_item_divisions(p_item_id uuid, p_division_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') then
    raise exception 'not authorized';
  end if;
  -- Remove divisions no longer selected.
  delete from public.inventory_item_divisions
   where item_id = p_item_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  -- Add newly selected divisions; keep existing rows (and their category overlay)
  -- untouched via ON CONFLICT DO NOTHING. New rows file under the item's canonical
  -- category (Phase 2 will let the dialog set a per-division category).
  insert into public.inventory_item_divisions (item_id, division_id, category_id, created_by)
  select p_item_id, d, (select category_id from public.inventory_items where id = p_item_id), _current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (item_id, division_id) do nothing;
end;
$function$;
revoke all on function public.rpc_set_item_divisions(uuid, uuid[]) from public;
