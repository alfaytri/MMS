-- ─── Inventory catalog: split .manage into .create + .edit ──────────────────
-- Operator ask: "creating item and category should be its own permission and
-- editing also." Today one key (inventory.catalog.manage) gates every catalog
-- write. Add inventory.catalog.create + inventory.catalog.edit and enforce them.
-- inventory.catalog.manage STAYS as an umbrella (satisfies both) so every
-- existing role keeps working with no data migration.
--
-- Core catalog tables (categories / items / brand-variants / brands) enforce a
-- STRICT split: INSERT needs create, UPDATE/DELETE need edit. Shared flow RPCs
-- accept the appropriate grant (archive/reorder = edit; create-tool-item =
-- create; set-divisions/bulk-upsert = any catalog write) so a granular
-- create-only or edit-only role can still complete its flows.

-- ── helper wrappers (create/edit/write, each OR .manage) ──
create or replace function public._user_can_create_catalog(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._user_has_permission(p_uid, 'inventory.catalog.create')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$$;
create or replace function public._user_can_edit_catalog(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._user_has_permission(p_uid, 'inventory.catalog.edit')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$$;
create or replace function public._user_can_write_catalog(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._user_has_permission(p_uid, 'inventory.catalog.create')
      or public._user_has_permission(p_uid, 'inventory.catalog.edit')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$$;
create or replace function public._auth_can_create_catalog()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._auth_user_has_permission('inventory.catalog.create')
      or public._auth_user_has_permission('inventory.catalog.manage')
$$;
create or replace function public._auth_can_write_catalog()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._auth_user_has_permission('inventory.catalog.create')
      or public._auth_user_has_permission('inventory.catalog.edit')
      or public._auth_user_has_permission('inventory.catalog.manage')
$$;

grant execute on function
  public._user_can_create_catalog(uuid),
  public._user_can_edit_catalog(uuid),
  public._user_can_write_catalog(uuid),
  public._auth_can_create_catalog(),
  public._auth_can_write_catalog()
to authenticated, anon, service_role;

-- ── core catalog tables: INSERT → create, UPDATE/DELETE → edit ──
-- inventory_categories
drop policy if exists inv_cat_ins on public.inventory_categories;
create policy inv_cat_ins on public.inventory_categories for insert to authenticated
  with check (public._user_can_create_catalog(public._current_user_data_id()));
drop policy if exists inv_cat_upd on public.inventory_categories;
create policy inv_cat_upd on public.inventory_categories for update to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()))
  with check (public._user_can_edit_catalog(public._current_user_data_id()));
drop policy if exists inv_cat_del on public.inventory_categories;
create policy inv_cat_del on public.inventory_categories for delete to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()));

-- inventory_items
drop policy if exists inv_item_ins on public.inventory_items;
create policy inv_item_ins on public.inventory_items for insert to authenticated
  with check (public._user_can_create_catalog(public._current_user_data_id()));
drop policy if exists inv_item_upd on public.inventory_items;
create policy inv_item_upd on public.inventory_items for update to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()))
  with check (public._user_can_edit_catalog(public._current_user_data_id()));
drop policy if exists inv_item_del on public.inventory_items;
create policy inv_item_del on public.inventory_items for delete to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()));

-- inventory_item_brand_variants
drop policy if exists inv_var_ins on public.inventory_item_brand_variants;
create policy inv_var_ins on public.inventory_item_brand_variants for insert to authenticated
  with check (public._user_can_create_catalog(public._current_user_data_id()));
drop policy if exists inv_var_upd on public.inventory_item_brand_variants;
create policy inv_var_upd on public.inventory_item_brand_variants for update to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()))
  with check (public._user_can_edit_catalog(public._current_user_data_id()));
drop policy if exists inv_var_del on public.inventory_item_brand_variants;
create policy inv_var_del on public.inventory_item_brand_variants for delete to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()));

-- brands
drop policy if exists inv_brand_ins on public.brands;
create policy inv_brand_ins on public.brands for insert to authenticated
  with check (public._user_can_create_catalog(public._current_user_data_id()));
drop policy if exists inv_brand_upd on public.brands;
create policy inv_brand_upd on public.brands for update to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()))
  with check (public._user_can_edit_catalog(public._current_user_data_id()));
drop policy if exists inv_brand_del on public.brands;
create policy inv_brand_del on public.brands for delete to authenticated
  using (public._user_can_edit_catalog(public._current_user_data_id()));

-- ── flow RPCs: swap the .manage check for the right granular helper,
--    byte-faithfully (recreate from live def, replace only the check). ──
do $mig$
declare r record; d text;
begin
  for r in
    select fn, old_s, new_s from (values
      ('rpc_archive_inventory_category',
        $o$public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage')$o$,
        'public._user_can_edit_catalog(public._current_user_data_id())'),
      ('rpc_update_inventory_sort_orders',
        $o$public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage')$o$,
        'public._user_can_edit_catalog(public._current_user_data_id())'),
      ('rpc_set_item_divisions',
        $o$_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')$o$,
        '_user_can_write_catalog(_current_user_data_id())'),
      ('create_tool_item_with_default_variant',
        $o$public._auth_user_has_permission('inventory.catalog.manage')$o$,
        'public._auth_can_create_catalog()'),
      ('service_inventory_bulk_upsert',
        $o$public._auth_user_has_permission('inventory.catalog.manage')$o$,
        'public._auth_can_write_catalog()')
    ) as t(fn, old_s, new_s)
  loop
    d := pg_get_functiondef(r.fn::regproc);
    if position(r.old_s in d) = 0 then
      raise exception 'catalog-split injector: check substring not found in %', r.fn;
    end if;
    d := replace(d, r.old_s, r.new_s);
    execute d;
  end loop;
end
$mig$;
