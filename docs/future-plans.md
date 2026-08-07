# Future Plans — Backlog

Non-blocking work items surfaced during release checklists or ad-hoc sessions.
Remove items from this file once shipped (do not just strike through — delete).

---

## Open

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
