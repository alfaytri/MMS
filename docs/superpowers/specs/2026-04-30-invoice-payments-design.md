# Invoice Payments & Payment Plans — AR Parity Design

**Date:** 2026-04-30  
**Branch:** feature/sale-module  
**Scope:** Full AR/AP parity for invoice payments — record, attach, detach, and payment plans on AR invoices

---

## 1. Goal

Give AR invoices the same payment capabilities as AP bills:
- Record a new payment directly against an invoice
- Attach an existing unlinked incoming payment to an invoice
- Detach a wrongly-attached payment (reverting invoice status)
- Set up a payment plan (Schedule or Adhoc) on an invoice
- Surface all of the above in the InvoiceDetailSidebar and on the Payments page

---

## 2. Database Layer

### 2.1 Schema addition: `payments.customer_id`

The `payments` table currently has `supplier_id` (for AP) but no `customer_id`. The migration adds a nullable `customer_id UUID REFERENCES customers(id)` column. `useCreateCustomerPayment()` populates it on insert. This gives the RPC a direct column to check for the ownership guard.

### 2.2 RPC: `attach_payment_to_invoice(payment_id UUID, invoice_id UUID)`

Atomic function — full `BEGIN / EXCEPTION / ROLLBACK` block.

**Guards (raise exception before any write):**
1. Payment `direction` must be `'incoming'`
2. Payment `invoice_id` must be `NULL` (not already linked)
3. `payments.customer_id` must equal `invoices.customer_id` (ownership guard — prevents cross-customer attachment)

**Writes:**
1. `UPDATE payments SET invoice_id = $invoice_id WHERE id = $payment_id`
2. Recalculate `invoices.payment_status`:
   - `SUM(amount) >= total_amount` → `'paid'`
   - `SUM(amount) > 0` → `'partially_paid'`
   - else → `'unpaid'`
   - Skip recalculation if `invoices.manually_paid = true`

**Rollback:** If the status recalculation fails for any reason, the entire transaction rolls back — `payment.invoice_id` stays `NULL`, no ghost link created.

### 2.3 RPC: `detach_payment_from_invoice(payment_id UUID, invoice_id UUID)`

Same atomic pattern as attach, same ownership guard, same recalculation logic in reverse.

**Guards:**
1. Payment `direction` must be `'incoming'`
2. Payment `invoice_id` must equal `$invoice_id` (is currently linked)
3. `payments.customer_id` must equal `invoices.customer_id`

**Writes:**
1. `UPDATE payments SET invoice_id = NULL WHERE id = $payment_id`
2. Recalculate `invoices.payment_status` from remaining linked payments (same CASE logic)

### 2.4 No new tables required

`payment_plans` and `payment_installments` already support AR invoices via the existing `invoice_id` FK. `useSettleInstallment` already accepts `direction='incoming'`.

### 2.5 Overpayment

Clamped to `'paid'`. The CASE expression never produces an `'overpaid'` state. A customer paying more than the invoice total results in `payment_status = 'paid'` — the UI shows an info note but no error.

---

## 3. Data / Hooks Layer

### 3.1 New: `useUnlinkedIncomingPayments(customerId: string)` — required, not optional

- Fetches payments where `direction = 'incoming'` AND `invoice_id IS NULL`
- `customerId` is **required** at the TypeScript type level — no optional escape hatch
- Returns: `payment_id`, `amount`, `method`, `date`, `reference`
- Purpose: feed `AttachInvoiceDialog` with only this customer's unlinked payments

### 3.2 New: `useAttachPaymentToInvoice()`

Mutation hook — calls `attach_payment_to_invoice` RPC.

**Cache invalidation on success:**
- `['invoice', invoiceId]` — updates status badge on the open invoice detail
- `['customer-payments']` — updates Payments page list
- `['customer-payments', invoiceId]` — exact-keyed version used by InvoiceDetailSidebar history

### 3.3 New: `useDetachPaymentFromInvoice()`

Mutation hook — calls `detach_payment_from_invoice` RPC.

**Cache invalidation:** same three keys as attach.

### 3.4 Existing hooks — used as-is

| Hook | Usage |
|---|---|
| `useCustomerPayments(invoiceId?)` | Payment history in InvoiceDetailSidebar |
| `useCreateCustomerPayment()` | Record Payment button |
| `usePaymentPlans(invoiceId)` | Fetch plan + installments for sidebar |
| `useCreatePaymentPlan()` | Create plan from PaymentPlanDialog |
| `useSettleInstallment(direction='incoming')` | Settle button per installment |

---

## 4. UI Components

### 4.1 `InvoiceDetail` — three new action buttons

Matching the BillDetail pattern:

| Button | Condition | Opens |
|---|---|---|
| **Record Payment** | Invoice not fully paid | `CustomerPaymentDialog` |
| **Attach Payment** | Always rendered; disabled while loading or list empty (no layout shift) | `AttachInvoiceDialog` |
| **Set Up Payment Plan** | Always rendered | `PaymentPlanDialog` (AR) |

The **Attach Payment** button shows a tooltip "No unlinked payments" when disabled — never hidden.

### 4.2 New: `AttachInvoiceDialog` (`src/components/sales/AttachInvoiceDialog.tsx`)

Mirrors `AttachBillDialog`.

- Lists unlinked incoming payments via `useUnlinkedIncomingPayments(customerId)` — `customerId` always passed, never optional
- Columns: Payment #, Amount, Method, Date
- Single-select → Attach button → `useAttachPaymentToInvoice()`
- Disabled if invoice is already `payment_status = 'paid'`
- On success: toast confirmation, dialog closes, sidebar history refreshes

### 4.3 `PaymentPlanDialog` — moved + direction-aware

**Move:** `src/components/purchase/PaymentPlanDialog.tsx` → `src/components/finance/PaymentPlanDialog.tsx`

All AP imports updated to the new path. No functional change for AP.

**New `labels` prop:**

```ts
interface PaymentPlanLabels {
  payAction: string      // "Settle Installment" vs "Pay Installment"
  partyLabel: string     // "Customer" vs "Vendor"
  amountLabel: string    // "Receivable Amount" vs "Payable Amount"
}
```

- AP callers pass: `{ payAction: 'Pay Installment', partyLabel: 'Vendor', amountLabel: 'Payable Amount' }`
- AR callers pass: `{ payAction: 'Settle Installment', partyLabel: 'Customer', amountLabel: 'Receivable Amount' }`
- No hardcoded AP-specific strings remain in the component

### 4.4 `InvoiceDetailSidebar` — wired sections

**Payment History section:**
- Wire `useCustomerPayments(invoiceId)` — replaces "No payments recorded" placeholder
- Shows: Payment #, Amount, Method, Date per row
- Detach icon per row → `useDetachPaymentFromInvoice()` (with confirmation prompt)

**Payment Plan section (`showPaymentPlan` toggle — already exists):**
- Wire `usePaymentPlans(invoiceId)`
- Shows installments: #, Due Date, Amount, Status badge
- **Settle** button per `pending` / `overdue` installment → `useSettleInstallment(direction='incoming')`
- Completed plans show all installments as read-only

### 4.5 Payments Page — Invoice Payments tab

- Existing "Invoice Payments" tab already shows CPAY entries
- Add **Attach Invoice** button (link icon) for rows where `invoice_id IS NULL`
- Opens `AttachInvoiceDialog` inline — same pattern as "Attach Bill" on purchase tab

---

## 5. Data Flow

### Record Payment
```
CustomerPaymentDialog submit
  → useCreateCustomerPayment()
  → INSERT payments (direction='incoming', invoice_id=X)
  → DB recalculates invoices.payment_status
  → Invalidate ['invoice', invoiceId], ['customer-payments'], ['customer-payments', invoiceId]
  → InvoiceDetail re-renders with updated status + new payment in history
```

### Attach Payment
```
AttachInvoiceDialog confirm
  → useAttachPaymentToInvoice()
  → attach_payment_to_invoice(payment_id, invoice_id) RPC
    → BEGIN
    → Ownership guard (customer_id match)
    → UPDATE payments.invoice_id
    → Recalculate invoices.payment_status
    → COMMIT (or ROLLBACK on any failure)
  → Invalidate ['invoice', invoiceId], ['customer-payments'], ['customer-payments', invoiceId]
```

### Detach Payment
```
Detach icon confirm
  → useDetachPaymentFromInvoice()
  → detach_payment_from_invoice(payment_id, invoice_id) RPC
    → BEGIN
    → Ownership guard
    → UPDATE payments SET invoice_id = NULL
    → Recalculate invoices.payment_status (from remaining linked payments)
    → COMMIT (or ROLLBACK on any failure)
  → Same three cache keys invalidated
  → Status reverts to 'partially_paid' or 'unpaid'
```

### Payment Plan — Create & Settle
```
PaymentPlanDialog submit
  → useCreatePaymentPlan()
  → INSERT payment_plans + payment_installments (status='pending')
  → Invalidate ['payment-plans', invoiceId]
  → Sidebar re-renders installments

Settle button
  → useSettleInstallment(direction='incoming')
  → Creates payment record + marks installment 'paid'
  → If all installments paid → marks plan 'completed'
  → Invalidates ['invoice', invoiceId]
```

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| RPC ownership guard fails | Toast "Payment does not belong to this customer"; no DB change |
| RPC recalc fails | Full rollback; toast "Failed — please try again"; invoice status unchanged |
| Overpayment | Allowed; invoice → `'paid'`; info note shown in dialog |
| Attach already-linked payment | RPC guard rejects; toast error |
| Settle on completed plan | `useSettleInstallment` returns early; Settle buttons disabled in UI |
| Network error on any mutation | React Query surfaces error; no optimistic updates used |

---

## 7. Testing

| Area | Cases |
|---|---|
| `attach_payment_to_invoice` RPC | Normal attach, overpayment → `'paid'`, attach already-linked → reject, ownership mismatch → reject, simulated recalc failure → full rollback |
| `detach_payment_from_invoice` RPC | Normal detach → status reverts, detach unlinked → reject, ownership mismatch → reject |
| `useUnlinkedIncomingPayments` | Type error if `customerId` omitted; results contain only matching customer's payments |
| `AttachInvoiceDialog` | Empty list → button disabled + tooltip; populated list → select + confirm works |
| `PaymentPlanDialog` labels | AR context renders "Settle Installment" / "Customer" / "Receivable Amount"; not AP strings |
| `InvoiceDetailSidebar` | After payment mutation → history list updates; status badge reflects DB value |
| Integration | Record → status flips → detach → status reverts |

---

## 8. File Changes Summary

| Action | Path |
|---|---|
| New migration | `supabase/migrations/YYYYMMDDHHMMSS_invoice_payment_rpcs.sql` (adds `payments.customer_id` column + both RPCs) |
| New hook | `src/hooks/useUnlinkedIncomingPayments.ts` |
| New hook | `src/hooks/useAttachPaymentToInvoice.ts` |
| New hook | `src/hooks/useDetachPaymentFromInvoice.ts` |
| New component | `src/components/sales/AttachInvoiceDialog.tsx` |
| Move + modify | `src/components/purchase/PaymentPlanDialog.tsx` → `src/components/finance/PaymentPlanDialog.tsx` |
| Update import | `src/components/purchase/BillDetail.tsx` (or wherever AP uses PaymentPlanDialog) |
| Modify hook | `src/hooks/useCreateCustomerPayment.ts` — populate `customer_id` on insert |
| Modify | `src/components/sales/InvoiceDetail.tsx` (add 3 action buttons) |
| Modify | `src/components/sales/InvoiceDetailSidebar.tsx` (wire payment history + plan sections) |
| Modify | `src/app/(dashboard)/purchase/payments/page.tsx` (add Attach Invoice to Invoice Payments tab) |
