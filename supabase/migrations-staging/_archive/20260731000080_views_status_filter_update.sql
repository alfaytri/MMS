-- Phase 8 Sub-task 8.1b: update the three credit-balance views to filter
-- against the new credit_note_status vocabulary.
--
-- Old filter (Phase 6): `status IN ('issued', 'approved')` — meaning finalised
-- but not yet redeemed.
-- New filter (Phase 8): `status <> 'void'` — meaning not cancelled. Under the
-- new model, `redeemed` no longer exists as a separate flag (store-credit
-- consumption is derived directly from the payments ledger), so the "not
-- consumed" implication of the old filter is captured by the payment-ledger
-- subtraction inside each view — not by the status filter.
--
-- Every view definition below is copied from its most recent Phase 6/7
-- migration and rebuilt with the new filter. The comments on each view are
-- updated to describe the new semantics.

-- ─── supplier_credit_balances (rebuild from 20260725160000) ────────────────
create or replace view public.supplier_credit_balances
  with (security_invoker = on)
as
select
  po.supplier_id                     as supplier_id,
  coalesce(po.currency, 'QAR')       as currency,
  count(*)                           as open_count,
  sum(dn.total_amount)               as open_amount
from   public.debit_notes  dn
join   public.purchase_orders po on po.id = dn.purchase_order_id
where  dn.resolution_type = 'supplier_credit'
  and  dn.status <> 'void'::public.credit_note_status
  and  po.supplier_id is not null
group  by po.supplier_id, coalesce(po.currency, 'QAR');

grant select on public.supplier_credit_balances to authenticated;

comment on view public.supplier_credit_balances is
  'Per-supplier open supplier-credit balance derived from debit_notes with resolution_type=supplier_credit. Filters out voided DNs. Under Phase 8.1b vocabulary: open / in_progress / resolved all count; only void is excluded.';

-- ─── customer_credit_balances (rebuild from 20260730000600) ────────────────
create or replace view public.customer_credit_balances
  with (security_invoker = on)
as
with issued as (
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
    and cn.status <> 'void'::public.credit_note_status
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
  'Per-customer open store-credit balance derived from the Phase 7 customer resolution ledger. Issued amount = qty × unit_price per store_credit resolution row on a non-voided CN; redeemed amount = sum of incoming payments linked to that CN. Under Phase 8.1b, `resolved` CNs are still included — balance depletion is derived from the payments ledger, not the status flag.';

-- ─── customer_open_credit_notes (rebuild from 20260730000700) ──────────────
create or replace view public.customer_open_credit_notes
  with (security_invoker = on)
as
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
    and cn.status <> 'void'::public.credit_note_status
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
  'Per-CN detail for the "You owe customer" popup — one row per non-voided credit_note that still carries open store credit. Under Phase 8.1b vocabulary, resolved CNs remain visible as long as amount_remaining > 0 (balance depletion is derived from the payments ledger, not the CN status flag).';

notify pgrst, 'reload schema';
