-- Fix: the nav-bar division filter on the Tools & Assets tab hides serialized
-- tools when a division is selected.
--
-- rpc_item_divisions_by_stock maps each item to the divisions it "belongs" to,
-- derived from (a) explicit item->division links, (b) brand-variant FIFO stock
-- sitting in a division's sub-containers, and (c) divisions inherited from the
-- item's category ancestry. Serialized tools carry NONE of these: they hold no
-- brand-variant FIFO stock -- their custody is tracked per physical unit in
-- tool_asset_units, each of which has its own division_id. So a serialized tool
-- that plainly has units in "Industrial Area Maint 1" reported an empty
-- division set and vanished the moment any division was picked.
--
-- This adds a fourth source: a serialized tool belongs to every division that
-- holds at least one of its units. Bulk tools are unaffected (they have no
-- tool_asset_units rows and continue to resolve via clauses (a)-(c)).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_item_divisions_by_stock(p_type text)
 RETURNS TABLE(item_id uuid, category_id uuid, division_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with recursive cat_anc(cat_id, anc_id) as (
    select id, id from public.inventory_categories
    union all
    select ca.cat_id, c.parent_id
    from cat_anc ca
    join public.inventory_categories c on c.id = ca.anc_id
    where c.parent_id is not null
  )
  select ii.id, ii.category_id,
    coalesce((
      select array_agg(distinct d) from (
        -- (a) explicit item -> division links
        select idv.division_id as d
          from public.inventory_item_divisions idv
         where idv.item_id = ii.id
        union
        -- (b) brand-variant FIFO stock in a division's sub-containers
        select sc.division_id
          from public.inventory_item_brand_variants bv
          join public.fifo_cost_layers fcl
            on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
          join public.warehouse_sub_containers sc
            on sc.id = fcl.sub_container_id and sc.division_id is not null
         where bv.item_id = ii.id
        union
        -- (c) divisions inherited from the item's category ancestry
        select icd.division_id
          from cat_anc ca
          join public.inventory_category_divisions icd on icd.category_id = ca.anc_id
         where ca.cat_id = ii.category_id
        union
        -- (d) serialized tool units' own division (tools carry no FIFO stock)
        select tau.division_id
          from public.tool_asset_units tau
         where tau.item_id = ii.id and tau.division_id is not null
      ) u where d is not null
    ), '{}'::uuid[]) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic
    on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
