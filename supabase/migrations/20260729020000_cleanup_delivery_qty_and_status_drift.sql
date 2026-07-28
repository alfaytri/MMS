-- Phase 2.5: one-off cleanup for drift accumulated before the net-delivered view.
--
-- Two drift classes are fixed here:
--
--   1. sale_order_lines.delivered_qty was incremented unconditionally by
--      complete_delivery_inventory for both standard AND replacement deliveries,
--      so replacements inflated the raw counter. Realign each line's
--      delivered_qty to the standard-delivery shipped_qty from the view.
--      delivered_qty stays as the raw shipment counter going forward; the
--      view is authoritative for progress display.
--
--   2. sale_orders.status was stamped 'delivered' based on the inflated
--      delivered_qty, so SOs where a return dropped net below ordered still
--      show 'delivered' when they should show 'partial_delivery'. Recompute
--      status against the net-delivered view for every non-final SO.
--
-- Pre-migration state captured 2026-07-28 on staging:
--   SO-00010: net=20, ordered=25, stored_status='delivered' (should be partial_delivery)
--   SO-00014: net=9, ordered=10, stored_status='delivered', raw delivered_qty sum=17 (should be shipped=10, status partial_delivery)
--   All other SOs: clean.

-- 1. Realign delivered_qty to shipped_qty wherever they drift.
update public.sale_order_lines sol
set delivered_qty = s.shipped_qty
from public.sale_order_lines_summary s
where sol.id = s.sale_order_line_id
  and sol.delivered_qty <> s.shipped_qty;

-- 2. Recompute status for every non-final SO based on net-delivered totals.
--    Final states (invoiced, closed, cancelled) are preserved so we don't
--    reopen a closed sale by mistake.
with totals as (
  select
    s.sale_order_id,
    sum(s.qty) as ordered,
    sum(s.net_delivered_qty) as net
  from public.sale_order_lines_summary s
  group by s.sale_order_id
)
update public.sale_orders so
set status = case
    when totals.net >= totals.ordered and totals.ordered > 0 then 'delivered'
    when totals.net > 0 then 'partial_delivery'
    else so.status
  end
from totals
where so.id = totals.sale_order_id
  and so.status not in ('invoiced', 'closed', 'cancelled', 'quotation', 'pending_approval')
  and (
    (totals.net >= totals.ordered and totals.ordered > 0 and so.status <> 'delivered') or
    (totals.net > 0 and totals.net < totals.ordered and so.status <> 'partial_delivery')
  );
