-- Inventory division filter (Master Data → Inventory).
--
-- An item "belongs" to a division when it currently holds stock in a
-- sub-container of that division (warehouse shelves + custody locations, which
-- both carry warehouse_sub_containers.division_id). Returns, per non-archived
-- item of one inventory type: the item id, its category id, and the distinct
-- division ids it has stock in. The nav-bar division multi-select uses this to
-- prune the catalog tree.
--
-- Replaces the old shared_with_division_ids path — that column is effectively
-- unpopulated (1 of 976 items), so filtering on it hid almost the whole catalog.

create or replace function public.rpc_item_divisions_by_stock(p_type text)
returns table(item_id uuid, category_id uuid, division_ids uuid[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ii.id, ii.category_id,
         array_agg(distinct sc.division_id) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic
    on ic.id = ii.category_id and ic.type::text = p_type
  join public.inventory_item_brand_variants bv
    on bv.item_id = ii.id
  join public.fifo_cost_layers fcl
    on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
  join public.warehouse_sub_containers sc
    on sc.id = fcl.sub_container_id and sc.division_id is not null
  where ii.status <> 'archived'
  group by ii.id, ii.category_id;
$function$;

revoke all on function public.rpc_item_divisions_by_stock(text) from public;
grant execute on function public.rpc_item_divisions_by_stock(text) to authenticated, service_role;
