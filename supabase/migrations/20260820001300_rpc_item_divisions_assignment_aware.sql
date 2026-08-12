-- Inventory division filter — make it assignment-aware.
--
-- rpc_item_divisions_by_stock previously returned ONLY items that held
-- divisioned stock, so a freshly-imported catalog (zero stock) vanished from
-- every per-division view even when the item was explicitly assigned to a
-- division via inventory_items.shared_with_division_ids.
--
-- New behavior: return EVERY non-archived item of the type, and let its
-- division set be the UNION of
--   (a) its explicit assignment  — unnest(shared_with_division_ids), and
--   (b) where it currently holds stock — sub_container.division_id via FIFO layers.
-- An item with neither gets an empty array (shown only under "All divisions").
--
-- Consumers (verified): src/hooks/useItemDivisionsByStock.ts →
-- src/components/services/inventory/ItemsListView.tsx. The list view only uses
-- this to PRUNE when a specific division is picked ("All" bypasses it), so
-- returning the full item set with unioned divisions is safe and is exactly the
-- assignment-aware filter we want. Signature unchanged.

create or replace function public.rpc_item_divisions_by_stock(p_type text)
returns table(item_id uuid, category_id uuid, division_ids uuid[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ii.id, ii.category_id,
         coalesce(
           ( select array_agg(distinct d)
             from (
               -- (a) explicit division assignment on the item
               select unnest(ii.shared_with_division_ids) as d
               union
               -- (b) divisions where the item currently holds stock
               select sc.division_id
               from public.inventory_item_brand_variants bv
               join public.fifo_cost_layers fcl
                 on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
               join public.warehouse_sub_containers sc
                 on sc.id = fcl.sub_container_id and sc.division_id is not null
               where bv.item_id = ii.id
             ) u
             where d is not null
           ),
           '{}'::uuid[]
         ) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic
    on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$function$;

revoke all on function public.rpc_item_divisions_by_stock(text) from public;
grant execute on function public.rpc_item_divisions_by_stock(text) to authenticated, service_role;
