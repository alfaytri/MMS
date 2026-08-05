-- Phase 7 — Sub-task 7.7 sub-commit: rewrite customer_credit_balances view.
--
-- Under Phase 6 a credit_note was either 100% refund or 100% store_credit,
-- so summing cn.total_amount where cn.resolution_type = 'store_credit' gave
-- the right issued balance per customer. Under Phase 7's dual ledger a single
-- CN can span multiple resolution types (see CN-00013: 2 refund + 1 store
-- credit → total_amount 900, of which only 300 is store credit). The Phase 6
-- view had two blockers for the new model:
--
-- 1. It filtered by cn.resolution_type = 'store_credit', but _maybe_close_return
--    only stamps 'replacement' or 'refund' — 'store_credit' is never set.
--    Result: even pure-store-credit CNs never appeared in the balance view.
-- 2. Even if the stamp existed, using cn.total_amount would over-count for
--    mixed CNs (would credit the customer with the refund portion too).
--
-- Fix: read the issued amount straight from the customer resolution ledger.
-- Sum qty × unit_price per store_credit resolution row, grouped by customer
-- + credit_note. Redemptions logic (payments with credit_note_id, direction
-- 'incoming') stays the same — those are the customer applying their credit
-- to a future invoice. Refund payments (direction 'outgoing') are naturally
-- excluded by the direction filter.

create or replace view public.customer_credit_balances
  with (security_invoker = on) as
with issued as (
  -- return_lines has no unit_price of its own — the sale-order line for the
  -- same brand_variant is the authoritative source. Match on the return's
  -- source SO plus the return_line's brand_variant.
  select
    cn.customer_id,
    coalesce(inv_so.currency, ret_so.currency, 'QAR') as currency,
    cn.id                                             as credit_note_id,
    sum(cr.qty * coalesce(sol.unit_price, 0))         as credit_amount
  from return_line_customer_resolutions cr
  join return_lines rl on rl.id = cr.return_line_id
  join so_po_returns r on r.id = rl.return_id
    and r.source_type = 'sale_order'::return_source_type
  join credit_notes cn on cn.source_return_id = r.id
  left join sale_orders ret_so on ret_so.id = r.source_id
  left join sale_order_lines sol on sol.sale_order_id = r.source_id
    and sol.brand_variant_id = rl.brand_variant_id
  left join so_invoices inv on inv.id = cn.invoice_id
  left join sale_orders inv_so on inv_so.id = inv.sale_order_id
  where cr.resolution_type = 'store_credit'
    and cn.status = any (array['issued'::credit_note_status, 'approved'::credit_note_status])
    and cn.customer_id is not null
  group by cn.customer_id, cn.id, inv_so.currency, ret_so.currency
), redemptions as (
  select
    payments.credit_note_id,
    coalesce(sum(payments.amount), 0::numeric) as applied
  from payments
  where payments.credit_note_id is not null
    and payments.direction = 'incoming'::payment_direction
    and payments.deleted_at is null
  group by payments.credit_note_id
)
select
  i.customer_id,
  i.currency,
  count(*)                                             as open_count,
  sum(i.credit_amount - coalesce(r.applied, 0::numeric)) as open_amount
from issued i
left join redemptions r on r.credit_note_id = i.credit_note_id
where (i.credit_amount - coalesce(r.applied, 0::numeric)) > 0::numeric
group by i.customer_id, i.currency;

comment on view public.customer_credit_balances is
  'Per-customer open store-credit balance derived from the Phase 7 customer resolution ledger (return_line_customer_resolutions where type=store_credit). Issued amount = qty × unit_price per store_credit resolution row on a CN in status issued/approved; redeemed amount = sum of incoming payments linked to that CN. Handles mixed-type CNs correctly (only the store_credit portion counts).';
