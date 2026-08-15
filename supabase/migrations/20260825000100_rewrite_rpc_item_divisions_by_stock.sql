CREATE OR REPLACE FUNCTION public.rpc_item_divisions_by_stock(p_type text)
 RETURNS TABLE(item_id uuid, category_id uuid, division_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select ii.id, ii.category_id,
         coalesce(
           ( select array_agg(distinct d)
             from (
               -- (a) explicit division assignment (was shared_with_division_ids)
               select idv.division_id as d
               from public.inventory_item_divisions idv
               where idv.item_id = ii.id
               union
               -- (b) divisions where the item currently holds stock (unchanged)
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
