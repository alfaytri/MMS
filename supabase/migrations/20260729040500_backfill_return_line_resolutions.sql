-- Phase 6.3: backfill return_line_resolutions from historical data.
--
-- Three passes. Each pass writes ledger rows only where remaining_qty > 0 in
-- the (post-previous-pass) return_line_progress view. Inserts go directly to
-- the table (bypassing rpc_record_return_line_resolution's per-call validation)
-- because we're computing qtys from the view, not from user input.
--
-- Modeling note: the ledger is a CUSTOMER-RESOLUTION ledger. Inventory
-- dispositions (like the existing sale_return_damaged movements) live in
-- inventory_stock_movements. When a customer resolution was recorded for a
-- damaged line (e.g. store_credit), the write-off ledger row is NOT written
-- — the inventory movement is still valid, just not linked by the ledger.
--
-- Pass 1: replacement deliveries → replacement rows (matched to good lines by variant/SKU).
-- Pass 2: CNs with resolution_type IN ('refund','store_credit') → those rows against remaining qty.
-- Pass 3: damaged return_lines with remaining_qty > 0 → link to existing sale_return_damaged movements.
-- Close: call _maybe_close_return for every so_po_returns row.

-- ─── Pass 1 ─────────────────────────────────────────────────────────────────
insert into public.return_line_resolutions (
  return_line_id, resolution_type, qty, sale_delivery_id, notes
)
select
  rl.id as return_line_id,
  'replacement' as resolution_type,
  -- Cap at remaining to be defensive against historical over-shipments.
  least(sdl.qty_delivered, p.remaining_qty)::numeric as qty,
  sd.id as sale_delivery_id,
  'Backfilled from historical replacement delivery ' || sd.delivery_number as notes
from public.sale_deliveries sd
join public.sale_delivery_lines sdl on sdl.sale_delivery_id = sd.id
join public.return_lines rl on rl.return_id = sd.return_id
  and rl.condition = 'good'
  and (
    rl.brand_variant_id is not distinct from sdl.brand_variant_id
    or (rl.brand_variant_id is null and sdl.brand_variant_id is null and rl.sku is not distinct from sdl.sku)
  )
join public.return_line_progress p on p.return_line_id = rl.id
where sd.type = 'replacement'
  and sd.return_id is not null
  and p.remaining_qty > 0
  and sdl.qty_delivered > 0;

-- ─── Pass 2 ─────────────────────────────────────────────────────────────────
-- For returns whose CN was resolved as refund or store_credit, apply that
-- resolution to every remaining line (regardless of good/damaged — historical
-- CN resolutions covered the entire return, not just good units).
insert into public.return_line_resolutions (
  return_line_id, resolution_type, qty, credit_note_id, notes
)
select
  rl.id as return_line_id,
  cn.resolution_type::text as resolution_type,
  p.remaining_qty::numeric as qty,
  cn.id as credit_note_id,
  'Backfilled from historical CN resolution (' || cn.resolution_type::text || ')' as notes
from public.return_lines rl
join public.so_po_returns r on r.id = rl.return_id
join public.credit_notes cn on cn.id = r.credit_note_id
join public.return_line_progress p on p.return_line_id = rl.id
where r.source_type = 'sale_order'
  and cn.resolution_type in ('refund', 'store_credit')
  and p.remaining_qty > 0;

-- ─── Pass 3 ─────────────────────────────────────────────────────────────────
-- Damaged lines still remaining (no customer resolution recorded) → link to
-- their existing sale_return_damaged inventory movement as a write-off.
-- Assumes at most one sale_return_damaged movement per (return, variant); if
-- multiple exist for the same variant, this picks the earliest by created_at.
with damaged_remaining as (
  select
    rl.id as return_line_id,
    rl.return_id,
    rl.brand_variant_id,
    rl.sku,
    p.remaining_qty
  from public.return_lines rl
  join public.return_line_progress p on p.return_line_id = rl.id
  where rl.condition = 'damaged' and p.remaining_qty > 0
),
matched_movements as (
  select distinct on (dr.return_line_id)
    dr.return_line_id,
    dr.remaining_qty,
    ism.id as movement_id
  from damaged_remaining dr
  join public.inventory_stock_movements ism
    on ism.reference_type = 'return'
   and ism.reference_id = dr.return_id
   and ism.movement_type = 'sale_return_damaged'
   and (
     ism.brand_variant_id is not distinct from dr.brand_variant_id
     or (ism.brand_variant_id is null and dr.brand_variant_id is null and ism.sku is not distinct from dr.sku)
   )
  order by dr.return_line_id, ism.created_at asc
)
insert into public.return_line_resolutions (
  return_line_id, resolution_type, qty, inventory_stock_movement_id, notes
)
select
  return_line_id,
  'write_off' as resolution_type,
  remaining_qty::numeric as qty,
  movement_id as inventory_stock_movement_id,
  'Backfilled from historical sale_return_damaged inventory movement' as notes
from matched_movements;

-- ─── Close pass ─────────────────────────────────────────────────────────────
-- Now that the ledger is populated, run _maybe_close_return on every SR/PR
-- so statuses re-derive from the new source of truth.
do $$
declare
  v_return_id uuid;
begin
  for v_return_id in
    select id from public.so_po_returns
    where deleted_at is null
      and status not in ('cancelled', 'pending', 'pending_inspection', 'received')
  loop
    perform public._maybe_close_return(v_return_id);
  end loop;
end;
$$;
