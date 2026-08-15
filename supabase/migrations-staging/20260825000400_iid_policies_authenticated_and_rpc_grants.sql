-- The SELECT policy created in 20260825000000 was `using (true)` with no role
-- clause, so anon (public anon key) could read the whole item->division map.
-- inventory_items itself restricts SELECT TO authenticated; match it. Recreate
-- all four policies with an explicit TO authenticated for parity.
drop policy if exists iid_select on public.inventory_item_divisions;
drop policy if exists iid_ins    on public.inventory_item_divisions;
drop policy if exists iid_upd    on public.inventory_item_divisions;
drop policy if exists iid_del    on public.inventory_item_divisions;

create policy iid_select on public.inventory_item_divisions
  for select to authenticated using (true);
create policy iid_ins on public.inventory_item_divisions
  for insert to authenticated with check (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_upd on public.inventory_item_divisions
  for update to authenticated using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_del on public.inventory_item_divisions
  for delete to authenticated using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));

-- Self-contain the read RPC's grants (20260825000100 relied on prior grants).
revoke all on function public.rpc_item_divisions_by_stock(text) from public;
grant execute on function public.rpc_item_divisions_by_stock(text) to authenticated, service_role;
