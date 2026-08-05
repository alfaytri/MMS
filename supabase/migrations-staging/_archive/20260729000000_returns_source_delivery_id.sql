-- Phase 1: link so_po_returns to the specific sale_delivery it originated from.
-- Backfill uses first delivery of the SO that contains the returned variant, ordered by date.

alter table public.so_po_returns
  add column if not exists source_delivery_id uuid
    references public.sale_deliveries(id) on delete set null;

comment on column public.so_po_returns.source_delivery_id is
  'The specific sale_delivery this return originated from. Nullable for legacy rows where no match could be inferred.';

create index if not exists so_po_returns_source_delivery_id_idx
  on public.so_po_returns(source_delivery_id);

-- Backfill: for each existing customer return, pick the earliest standard
-- delivery of its SO that shipped any of the returned variants.
with candidate as (
  select
    r.id as return_id,
    (
      select sd.id
      from public.sale_deliveries sd
      join public.sale_delivery_lines sdl on sdl.sale_delivery_id = sd.id
      join public.return_lines rl on rl.return_id = r.id
      where sd.sale_order_id = r.source_id
        and sd.type = 'standard'
        and (
          sdl.brand_variant_id is not distinct from rl.brand_variant_id
          or (sdl.brand_variant_id is null and rl.brand_variant_id is null and sdl.sku is not distinct from rl.sku)
        )
      order by sd.date asc, sd.created_at asc
      limit 1
    ) as delivery_id
  from public.so_po_returns r
  where r.source_type = 'sale_order'
    and r.source_delivery_id is null
    and r.deleted_at is null
)
update public.so_po_returns r
set source_delivery_id = c.delivery_id
from candidate c
where r.id = c.return_id
  and c.delivery_id is not null;
