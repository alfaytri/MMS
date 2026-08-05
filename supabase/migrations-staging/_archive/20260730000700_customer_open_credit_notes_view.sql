-- Phase 7 — Sub-task 7.7 sub-commit: per-CN open-store-credit view.
--
-- Companion to customer_credit_balances (which aggregates per customer). This
-- one lists one row per open credit note carrying store credit, with the
-- REMAINING balance on that CN and enough cross-reference to render the
-- popup rows in CreditBalanceDialog. Derives from the Phase 7 customer
-- resolution ledger, same as the aggregate view.

create or replace view public.customer_open_credit_notes
  with (security_invoker = on) as
with issued as (
  select
    cn.id                                             as credit_note_pk,
    cn.credit_note_id                                 as credit_note_number,
    cn.status,
    cn.created_at,
    coalesce(inv_so.customer_id, ret_so.customer_id)  as customer_id,
    coalesce(inv_so.currency, ret_so.currency, 'QAR') as currency,
    coalesce(inv_so.so_number, ret_so.so_number)      as so_number,
    inv.invoice_id                                    as invoice_number,
    r.return_number,
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
  group by
    cn.id, cn.credit_note_id, cn.status, cn.created_at,
    inv_so.customer_id, ret_so.customer_id,
    inv_so.currency, ret_so.currency,
    inv_so.so_number, ret_so.so_number,
    inv.invoice_id, r.return_number
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
  i.credit_note_pk       as id,
  i.credit_note_number   as note_number,
  i.customer_id,
  i.currency,
  i.status,
  i.created_at,
  i.so_number,
  i.invoice_number,
  i.return_number,
  (i.credit_amount - coalesce(r.applied, 0::numeric)) as amount_remaining
from issued i
left join redemptions r on r.credit_note_id = i.credit_note_pk
where (i.credit_amount - coalesce(r.applied, 0::numeric)) > 0::numeric;

comment on view public.customer_open_credit_notes is
  'Per-CN detail for the "You owe customer" popup — one row per credit_note that still carries open store credit, derived from the Phase 7 customer resolution ledger. amount_remaining = (qty × sale_order_lines.unit_price) − applied incoming payments for that CN.';
