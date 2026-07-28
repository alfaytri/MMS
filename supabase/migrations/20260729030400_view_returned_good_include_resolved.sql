-- Phase 3 hotfix: sale_order_lines_summary was subtracting returned_good_qty
-- only for returns in 'restocked' status, so once a return moved to a
-- resolved_* status the returned units magically reappeared in net_delivered.
-- A returned unit is still returned regardless of how the return was resolved
-- (credit / replacement / partial) — only cancelled returns should be excluded.

create or replace view public.sale_order_lines_summary as
with shipped as (
  select
    sd.sale_order_id,
    sdl.brand_variant_id,
    sdl.sku,
    sdl.item_name,
    sum(sdl.qty_delivered) as qty
  from public.sale_deliveries sd
  join public.sale_delivery_lines sdl on sdl.sale_delivery_id = sd.id
  where sd.type = 'standard'
    and sd.status = 'delivered'
  group by sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
),
replaced as (
  select
    sd.sale_order_id,
    sdl.brand_variant_id,
    sdl.sku,
    sdl.item_name,
    sum(sdl.qty_delivered) as qty
  from public.sale_deliveries sd
  join public.sale_delivery_lines sdl on sdl.sale_delivery_id = sd.id
  where sd.type = 'replacement'
    and sd.status = 'delivered'
  group by sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
),
returned_good as (
  select
    r.source_id as sale_order_id,
    rl.brand_variant_id,
    rl.sku,
    rl.item_name,
    sum(rl.qty) as qty
  from public.so_po_returns r
  join public.return_lines rl on rl.return_id = r.id
  where r.source_type = 'sale_order'
    and r.status in ('restocked', 'resolved_credit', 'resolved_replacement', 'resolved_partial')
    and rl.condition = 'good'
    and r.deleted_at is null
  group by r.source_id, rl.brand_variant_id, rl.sku, rl.item_name
)
select
  sol.id as sale_order_line_id,
  sol.sale_order_id,
  sol.brand_variant_id,
  sol.sku,
  sol.item_name,
  sol.qty,
  coalesce(s.qty, 0)::numeric as shipped_qty,
  coalesce(rg.qty, 0)::numeric as returned_good_qty,
  coalesce(rp.qty, 0)::numeric as replacement_qty,
  greatest(0, coalesce(s.qty, 0) - coalesce(rg.qty, 0) + coalesce(rp.qty, 0))::numeric as net_delivered_qty
from public.sale_order_lines sol
left join shipped s
  on s.sale_order_id = sol.sale_order_id
 and s.brand_variant_id is not distinct from sol.brand_variant_id
 and (sol.brand_variant_id is not null or s.sku is not distinct from sol.sku)
left join returned_good rg
  on rg.sale_order_id = sol.sale_order_id
 and rg.brand_variant_id is not distinct from sol.brand_variant_id
 and (sol.brand_variant_id is not null or rg.sku is not distinct from sol.sku)
left join replaced rp
  on rp.sale_order_id = sol.sale_order_id
 and rp.brand_variant_id is not distinct from sol.brand_variant_id
 and (sol.brand_variant_id is not null or rp.sku is not distinct from sol.sku);

grant select on public.sale_order_lines_summary to anon, authenticated, service_role;
