# Future Plans — Backlog

Non-blocking work items surfaced during release checklists or ad-hoc sessions.
Remove items from this file once shipped (do not just strike through — delete).

---

## Open

### Customer credit-utilization visualization

**Surfaced:** 2026-08-07
**Priority:** Medium — UX feature

**Problem.** A credit customer's detail view shows their credit limit
and their outstanding balance as flat numbers. There's no visual
breakdown of how the limit is being used across open orders, or how
much of each individual order has been paid.

**Design.** On the customer detail page (Master Data → Customers →
row detail), under a new "Credit Utilization" section:

1. **Overall bar** — full width, split into three coloured segments:
   - Green: paid across all open orders (`SUM(paid_amount)`)
   - Amber: outstanding across all open orders (`SUM(total - paid)`)
   - Gray remainder: unused credit (`credit_limit - SUM(total)`)
   Labels below each segment with the QAR amount and the % of limit.

2. **Per-order stack** — one row per open (non-cancelled, non-fully-paid)
   SO, each showing:
   - SO number + date + total
   - Its own mini progress bar (paid / outstanding within that SO)
   - Age (days since order date)

3. **Data source.** After the credit-restore fix ships (see next item
   in this file), the values come directly from `sale_orders.total`
   and `sale_orders.paid_amount`. No new hook needed — reuse
   `useSaleOrders({ customerId })`. Keep the section collapsed by
   default so it doesn't clutter customers with dozens of orders.

**Non-goals.** Aging buckets (30/60/90) already exist on the sales
aging page — no duplication here. This is a "single-customer credit
health snapshot" view.

### Credit-customer credit restoration on payment

**Surfaced:** 2026-08-07 (six-domains audit follow-up)
**Priority:** HIGH — miscomputes available credit for every credit customer

**Problem.** `create_sale_order` (both 17-arg and 18-arg overloads)
computes available credit as `credit_group.credit_limit - SUM(sale_orders.total)`
for non-cancelled SOs. `sale_orders.total` is the order amount, not
the outstanding balance — so when a credit customer pays an invoice,
their available credit does not restore. Only order cancellation
restores it. Real customers therefore hit "pending_approval" more
often than they should, and their true available limit is
underreported everywhere `v_available` is used.

**Verified live 2026-08-07:** "Test Credit" customer has
credit_limit=30,000, SUM(total)=337,000, computed available=-307,000
regardless of how much they've paid.

**Fix.**

1. Change the two `SELECT SUM(total) INTO v_open_total` lookups in
   `create_sale_order` (17-arg and 18-arg) to
   `SELECT SUM(total - COALESCE(paid_amount, 0))`.
2. Verify `sale_orders.paid_amount` is kept current by
   `invoice_recompute_paid_fn` and `_recompute_ar_invoice_payment_status_fn`
   — grep confirms both write to `so_invoices.paid_amount`, but check
   whether the SO-level cache stays in sync via a trigger.
3. Backfill: recompute available on the Sales Approvals page after the
   fix so old pending_approval SOs may auto-clear.

### Payment terms → payment plan wiring

**Surfaced:** 2026-08-07 (user feedback during six-domains audit)
**Priority:** MEDIUM — feature completion

**Problem.** The New SO form collects payment terms + custom
milestones (`100% Advance`, `Net 30`, `50/50`, or a custom milestone
label + %). These are stored on `sale_orders.payment_terms` /
`payment_terms_notes` / `payment_milestones` (jsonb) but never
materialised into the `payment_plans` + `payment_installments`
tables that the Payments tab / SoPaymentDialog use. The two systems
are independent — the terms field is decorative today.

**Fix.**

1. After an SO's invoice is created with `invoice_type='credit'` AND
   `payment_milestones` is non-empty, auto-create a `payment_plan` row
   with `type = 'custom' | 'net_30' | '50_50' | 'advance'` and
   `payment_installments` rows keyed off the milestone list.
2. Milestone entries with `%` need a hint at due_date — either
   compute from `so.expected_delivery + N` per milestone or prompt
   the user to fill in per-installment dates.
3. Existing PaymentPlanDialog already handles custom plans — the
   auto-created plan should be editable there.

### Supplier bill attachment field

**Surfaced:** 2026-08-06 (release checklist Section 6)
**Priority:** Medium — helpful for AP audit trail but not blocking

**Problem.** The Create Supplier Bill dialog collects a Supplier Invoice #
(reference) but has no way to attach the supplier's PDF invoice /
scanned copy / email. Later reconciliation requires digging through email.

**Required work:**
1. Add `attachments` column (jsonb array) or a separate `bill_attachments`
   table (bill_id, storage_key, file_name, uploaded_by, uploaded_at)
2. File upload field in `CreateBillDialog` — accept PDF/JPG/PNG, cap 5MB,
   upload to `bill-attachments` Supabase Storage bucket
3. Display attachments on `BillDetailDocument` — filename + view/download
   buttons per file
4. Delete permission scoped to `purchase.bills.manage`
5. RLS: attachments inherit the bill's division scope

**Reference:** Same pattern as receival attachments — check
`src/hooks/useReceivals.ts` for the existing upload flow.

### AP-side payment detach UI

**Surfaced:** 2026-08-06 (money-path release checklist, Section 6)
**Priority:** Medium — blocks self-service correction on AP side

**Problem.** The AR side has `useDetachPaymentFromInvoice`, but the AP
(supplier bills / PO) side has no equivalent. Once an operator records a
payment against a PO or bill (via `PoPaymentDialog`), there is no UI to
undo it — wrong amount, wrong bill, typo — nothing. The current
workflow silently assumes payments are always correct or corrected via a
debit note.

**Required work:**
1. New hook `useDetachSupplierPayment` in `src/hooks/useSupplierPayments.ts`
   mirroring the AR-side detach shape (soft delete via `deleted_at`, then
   `bill_recompute_paid_fn` handles the balance).
2. Trash / detach icon in `PoDetailDialog` payment history rows and in
   `BillDetailDocument` payment list (both currently render read-only).
3. Confirmation dialog — "Detach this payment? The bill's outstanding
   balance will be restored." — with the payment reference (`PAY-XXXXX`,
   amount, method, date).
4. Permission gate: same permission as recording — if the user can record
   an AP payment, they can detach one. (Or a stricter `payments.detach`
   permission if the operator wants segregation.)
5. Activity log entry (`Payment Detached`, `module: 'purchase_orders'`).
6. Idempotency check — RPC or client guard: refuse detach on already-
   detached payments (`deleted_at IS NOT NULL`).

**Acceptance:**
- Detach on staging → `bills.payment_status` correctly recomputes
  (`unpaid` / `partially_paid` / `paid`)
- Second detach attempt on the same payment → clear error, no double-
  restore of balance
- USD-priced payment against QAR bill → FX unchanged post-detach

**References:**
- AR-side mirror: `src/hooks/useDetachPaymentFromInvoice.ts`
- AR-side dialog: search for detach handler in
  `src/components/sales/SoDetailDialog.tsx`
- Read-only payment lists that need the button:
  `src/components/purchase/PoDetailDialog.tsx`,
  `src/components/purchase/BillDetailDocument.tsx`
