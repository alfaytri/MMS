# Security P1 write-guard — per-table write-path audit

**Date:** 2026-08-10 · **Method:** read-only `src/` + `supabase/migrations/` audit
(no live DB access). All `file:line` refs are from the working tree at audit time.
Feeds the draft guards in `draft-migrations/`. Parent plan:
`docs/security/2026-08-09-division-scope-rls-audit-remediation.md` §5 (P1).

## Correction to the plan's threat model

Migration `20260806000000_lock_money_table_rls.sql` already replaced the naive
`USING(true)` write policies on `payments`, `so_invoices`, `credit_notes`,
`debit_notes` with `_user_has_permission(...)`-gated policies. So for those four the
actor is **a user holding the module's `*.manage` permission**, not "any division
member" — narrower, but the guard is still needed (a permitted clerk can still
rewrite amounts). `payment_plans`, `sale_deliveries`, `so_po_returns`,
`po_line_items`, `receivals`, `shipments` remain on the wide-open baseline
`USING(true)` + division_scope `RESTRICTIVE` pattern.

**Template consequence:** the shipped guards gate on
`current_user NOT IN ('authenticated','anon') → RETURN NEW`. Any legit writer that
runs `SECURITY INVOKER` (as the caller) is therefore ALSO caught. One in-scope
INVOKER writer exists: `rpc_replace_po_lines` (writes `po_line_items`) — see §7.

## Ship ranking (confidence a guard is needed AND safe)

| Rank | Table | Verdict | Draft |
|------|-------|---------|-------|
| 1 | `sale_deliveries` | status guard, exact SO mirror | `01` |
| 2 | `payments` | UPDATE money/link/status lock (allow `qb_synced`) | `02` |
| 3 | `so_invoices` | UPDATE totals + status(≠void) lock (⚠ verify table name) | `03` |
| 4 | `credit_notes` | UPDATE amount+status+link lock | `04` |
| 5 | `debit_notes` | UPDATE **money-only** (status is client-legit) | `05` |
| 6 | `payment_plans` | **REVOKE** UPDATE/DELETE (no legit client edit) | `07` |
| 7 | `receivals` | low value — optional narrow allowlist + revoke | — (deferred) |
| 8 | `so_po_returns` | status machine client-driven → only lock `dispatched_at`/`restocked_at` | `06` |
| 9 | `po_line_items` | NO current_user guard viable — needs parent-PO-status guard | — (deferred) |
| 10 | `shipments` | no financial column — **no guard needed** | — |

---

## §1 `payments` — GUARD (BEFORE UPDATE)

- **Direct client writes:** INSERT `useCreateCustomerPayment` (useCustomerPayments.ts:136),
  `useCreatePOPayment` (usePurchaseOrders.ts:697), `useCreateSOPayment` (useSaleOrders.ts:939);
  the ONLY direct client UPDATE is `useBulkQbSyncPayments` (usePayments.ts:160) → `qb_synced`.
- **Block on UPDATE:** `amount, amount_qar, exchange_rate, currency, direction, status,
  invoice_id, bill_id, credit_note_id, source_type, source_id, supplier_id, customer_id`.
  **Allow:** `qb_synced` (+ non-financial metadata). Do NOT guard INSERT.
- **DEFINER writers:** rpc_edit/delete_customer_payment (20260818000000),
  rpc_edit/delete_supplier_payment (20260817000000), rpc_redeem_credit_note,
  rpc_settle_installment, rpc_apply_debit_note_to_bill, allocate_payment_to_bill.
- **Existing:** restrictive `payments_no_direct_cn_insert`, recompute + cap triggers; no column guard.

## §2 `so_invoices` — GUARD (BEFORE UPDATE) ⚠ verify physical table name

- **Direct client writes:** `useVoidInvoice` → status='void'+notes (useInvoices.ts:157),
  `useBulkQbSyncInvoices` → qb_synced (:273), `useDismissRefresh` → needs_refresh
  (useCustomerInvoices.ts:113). No direct client INSERT.
- **Block on UPDATE:** `total_amount, subtotal, paid_amount, payment_status, customer_id,
  sale_order_id` + any `status` change other than `→'void'`.
  **Allow:** `notes, qb_synced, needs_refresh, pdf_url`.
- **DEFINER writers:** generate_invoice_from_so, rpc_sync_invoice_from_so (20260807005000);
  paid_amount via AFTER trigger invoice_recompute_paid_fn.
- ⚠ **Verify (morning):** live table backing the app is `public.so_invoices` (base table)
  not legacy `public.invoices`; confirm exact total column names before adding
  `total`/`tax_amount`/`discount_*`/`issued_date`/`due_date` if present.

## §3 `credit_notes` — GUARD (BEFORE UPDATE)

- **Direct client writes:** INSERT `useIssueCreditNote` (useInvoices.ts:209),
  `useCreateCreditNote` (useCreditNotes.ts:256), `createCreditNoteForReturn`
  (useSaleReturns.ts:366); UPDATE only resolution metadata `resolveCreditNoteViaLedger`
  (useCreditNotes.ts:94 → resolution_type), `useResolveCreditNoteRefund` (:388 → refund_*).
- **Block on UPDATE:** `total_amount, status, original_total, new_total, invoice_id,
  customer_id, source_return_id`. **Allow:** `resolution_type, refund_method,
  refund_reference, refund_method_id, pdf_url, reason`. (status is RPC-only post-creation
  — rpc_redeem_credit_note 20260806220000:143 — so blocking ALL client status changes is safe.)

## §4 `debit_notes` — GUARD (BEFORE UPDATE), money-only

- **Direct client writes:** INSERT `createDebitNoteForReturn` (usePurchaseReturns.ts:369);
  UPDATE `useResolveDebitNoteSupplierCredit`/`Replacement` (useCreditNotes.ts:563/593) +
  `ApplyDebitNoteDialog.tsx:135` all set **status='resolved' + resolution_type**.
- **Block on UPDATE:** `total_amount, original_total, new_total, remaining_amount, bill_id,
  supplier_id, purchase_order_id, source_return_id`.
  **Do NOT block `status`** — client legitimately sets `resolved`. (remaining_amount/bill_id
  owned by rpc_apply_debit_note_to_bill 20260806240000:130.)

## §5 `sale_deliveries` — GUARD (BEFORE INSERT OR UPDATE), SO mirror

- **Direct client writes:** INSERT stub `useConfirmSO` → status='pending'
  (useSaleOrders.ts:852); UPDATE `useUpdateDelivery` → warehouse/date (+`status?` passthrough,
  useSaleDeliveries.ts:73, call site SoDetailDialog.tsx:826).
- **Guard:** INSERT must be `'pending'`; block UPDATE transition into
  `('delivered','in_progress','cancelled')`. Allow warehouse/date edits.
- **DEFINER writers:** complete_delivery_inventory (20260727070000),
  rpc_complete_delivery_with_followup (20260806170000), cancel_delivery_inventory
  (20260803001900), create_and_confirm_delivery (20260715180000/20260802001000).
- ⚠ **Verify (morning):** rpc_create_partial_replacement is DEFINER + what status it inserts.

## §6 `so_po_returns` — NARROW guard only

- **Status machine is entirely client-driven** — client sets status directly then calls the
  side-effect RPC (usePurchaseReturns.ts:448/457/476/480, useSaleReturns.ts:429/639). A
  status guard would break the legit flow.
- **Only RPC-exclusive columns:** `dispatched_at` (rpc_process_po_return_dispatch
  20260806170000:153), `restocked_at` (rpc_process_return_restock 20260728000000:45).
  rpc_complete_return_inspection sets status='received'+restock_warehouse_id (DEFINER).
- **Guard:** block direct client change to `dispatched_at`/`restocked_at` ONLY. Real fix =
  move the status machine into DEFINER RPCs (P0a-style follow-up), not a trigger.

## §7 `po_line_items` — NO current_user guard (deferred)

- Direct client UPDATE `useAwardQuote` (useRfqQuotes.ts:168) writes `unit_price/total_price/qty`
  during RFQ award. `rpc_replace_po_lines` is **SECURITY INVOKER** (20260815003800:29) — it
  runs as the caller, so a `current_user` gate would block it too.
- Viable protection: a guard keyed on the **parent PO status** (block line edits when the PO
  is approved/partially_received/received/completed/cancelled), complementing the shipped PO
  locked-column guard — a separate design, NOT current_user-gated. **Deferred.**

## §8 `payment_plans` — REVOKE, not a guard

- Only direct client write is INSERT `useCreatePaymentPlan` (usePaymentPlans.ts:60, status='active').
  No client UPDATE/DELETE anywhere. status→'completed' is RPC-only (rpc_settle_installment
  20260806260000:110). Baseline `USING(true)` still open.
- **Fix:** `REVOKE UPDATE, DELETE FROM authenticated` (keep INSERT+SELECT). Draft `07`.

## §9 `receivals` — low value (deferred)

- Only benign flag columns are client-written: `is_replacement`, `source_debit_note_id`
  (useReceivals.ts:400). No direct client write to `status`/costs (those live on
  `receival_items` via apply_receival_edit). Optional narrow allowlist + `REVOKE INSERT,DELETE`.
  Marginal value → deferred.

## §10 `shipments` — no guard needed

- No money/financial column. `status`/`events`/`archived` are legitimate logistics edits
  (useShipments.ts:82/99/114/131). Webhook/API writes run service-role. No guard.

## Pre-ship verifications the audit could not do from source (→ MORNING-CHECKLIST)

1. `rpc_create_partial_replacement` is DEFINER + the `sale_deliveries.status` it inserts.
2. Live physical table backing `so_invoices` (base table vs legacy `invoices` name).
3. `payment_plans` / `sale_deliveries` still carry only the baseline `USING(true)` policies.
4. Every writer RPC for each guarded table is `prosecdef=true` (no INVOKER writer caught).
