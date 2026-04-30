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

The `payments` table currently has `supplier_id` (for AP) but no `customer_id`. The migration adds:

```sql
ALTER TABLE payments ADD COLUMN customer_id UUID REFERENCES customers(id);
```

`useCreateCustomerPayment()` populates it on every new insert. This gives the RPC and trigger a direct column for the ownership guard.

**Backfill for existing incoming payments:**

The migration includes a backfill script so legacy payments are not orphaned by the ownership guard:

```sql
-- Backfill via linked invoice
UPDATE payments p
SET customer_id = i.customer_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.direction = 'incoming'
  AND p.customer_id IS NULL;

-- Backfill via source sale order (for unlinked payments recorded against SOs)
UPDATE payments p
SET customer_id = so.customer_id
FROM sale_orders so
WHERE p.source_type = 'sale_order'
  AND p.source_id = so.id
  AND p.direction = 'incoming'
  AND p.customer_id IS NULL;
```

Any remaining NULLs after the backfill indicate genuinely ambiguous legacy records. The RPC ownership guard treats `payments.customer_id IS NULL` as a bypass (legacy data is allowed through) rather than a hard rejection — this is safer than locking out pre-existing records.

**Known limitation:** `useUnlinkedArInvoices(customerId)` requires a `customerId`. For orphan payments that remain NULL after backfill, the Payments page "Link Invoice" button will not be able to derive a customer to filter by, so the action will be unavailable. A user must manually assign the `customer_id` on those specific records before the link flow works. Given the rarity of genuinely ambiguous records, this is an acceptable trade-off for the security of the required filter.

### 2.2 Numeric precision

`amount` and `total_amount` columns are already typed as `NUMERIC` in the schema (not `FLOAT`/`REAL`), so floating-point drift is not possible. The recalculation CASE expression uses `ROUND(..., 2)` on both sides to guard against any sub-cent accumulation from multi-payment scenarios:

```sql
CASE
  WHEN ROUND(SUM(p.amount), 2) >= ROUND(i.total_amount, 2) THEN 'paid'
  WHEN ROUND(SUM(p.amount), 2) > 0                         THEN 'partially_paid'
  ELSE 'unpaid'
END
```

### 2.3 Shared recalculation function

The recalculation logic lives in **one place** — a shared Postgres function — called by both the trigger and the RPCs:

```sql
CREATE OR REPLACE FUNCTION recalculate_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total     NUMERIC;
  v_paid      NUMERIC;
  v_manually  BOOLEAN;
  v_status    TEXT;
BEGIN
  SELECT total_amount, manually_paid INTO v_total, v_manually
  FROM invoices WHERE id = p_invoice_id;

  IF v_manually THEN RETURN; END IF;  -- skip if manually controlled

  SELECT COALESCE(ROUND(SUM(amount), 2), 0) INTO v_paid
  FROM payments
  WHERE invoice_id = p_invoice_id
    AND direction = 'incoming'
    AND deleted_at IS NULL;

  v_status := CASE
    WHEN v_paid >= ROUND(v_total, 2) THEN 'paid'
    WHEN v_paid > 0                   THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE invoices SET payment_status = v_status WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;
```

### 2.4 DB trigger — always-accurate status

A trigger fires on the `payments` table so that **any** change to payment data (insert, update of `amount`/`invoice_id`/`deleted_at`, or hard delete) keeps the invoice status current — regardless of whether the change came through the application or directly via the DB:

```sql
CREATE OR REPLACE FUNCTION trg_recalc_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  -- Determine which invoice_id to recalculate
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    -- If invoice_id was changed, recalc the OLD invoice too
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      IF OLD.invoice_id IS NOT NULL THEN
        PERFORM recalculate_invoice_payment_status(OLD.invoice_id);
      END IF;
    END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM recalculate_invoice_payment_status(v_invoice_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_recalc_status
AFTER INSERT OR UPDATE OF amount, invoice_id, deleted_at OR DELETE
ON payments
FOR EACH ROW EXECUTE FUNCTION trg_recalc_invoice_payment_status();
```

**Consequence:** The RPCs no longer need to call the recalculation inline — the trigger handles it. The RPCs focus on guards + the link/unlink write only.

### 2.5 RPC: `attach_payment_to_invoice(payment_id UUID, invoice_id UUID)`

Atomic function with `SERIALIZABLE` isolation to prevent race conditions.

**Concurrency guard:** The function opens with `SELECT ... FOR UPDATE` on the payment row, acquiring a row-level lock before any check. Combined with `SERIALIZABLE` isolation, two concurrent calls for the same `payment_id` cannot both succeed.

**Guards (raise exception before any write):**
1. Payment `direction` must be `'incoming'`
2. Payment `invoice_id` must be `NULL` (not already linked)
3. If `payments.customer_id IS NOT NULL`: it must equal `invoices.customer_id` (ownership guard — NULL means legacy record, allowed through)

**Write:**
```sql
UPDATE payments SET invoice_id = $invoice_id WHERE id = $payment_id;
-- Trigger fires automatically and recalculates invoices.payment_status
```

**Rollback:** Full `BEGIN/EXCEPTION/ROLLBACK` — if anything fails (including the trigger), the entire transaction rolls back. No ghost link is possible.

### 2.6 RPC: `detach_payment_from_invoice(payment_id UUID, invoice_id UUID)`

Same atomic pattern, same `SERIALIZABLE` isolation, same `SELECT ... FOR UPDATE` lock.

**Guards:**
1. Payment `direction` must be `'incoming'`
2. Payment `invoice_id` must equal `$invoice_id` (currently linked)
3. If `payments.customer_id IS NOT NULL`: must equal `invoices.customer_id`

**Write:**
```sql
UPDATE payments SET invoice_id = NULL WHERE id = $payment_id;
-- Trigger fires automatically and recalculates invoices.payment_status
```

Status reverts to `'partially_paid'` or `'unpaid'` based on remaining linked payments.

### 2.7 No new tables required

`payment_plans` and `payment_installments` already support AR invoices via the existing `invoice_id` FK. `useSettleInstallment` already accepts `direction='incoming'`.

### 2.8 Overpayment

Clamped to `'paid'` by the shared recalculation function. No `'overpaid'` state is ever produced. The UI shows an informational note in `CustomerPaymentDialog` if the entered amount exceeds the outstanding balance, but the transaction proceeds.

---

## 3. Data / Hooks Layer

### 3.1 New: `useUnlinkedIncomingPayments(customerId: string)` — required

- Fetches payments where `direction = 'incoming'` AND `invoice_id IS NULL`
- `customerId` is **required** at the TypeScript type level — no optional escape hatch; enforced in the query filter
- Returns: `payment_id`, `amount`, `method`, `date`, `reference`
- Purpose: feed `AttachInvoiceDialog` (invoice detail flow — pick a payment for this invoice)

### 3.2 New: `useUnlinkedArInvoices(customerId: string)` — required

- Fetches AR invoices where `customer_id = customerId` AND `payment_status IN ('unpaid', 'partially_paid')`
- `customerId` is **required** — same rationale as above; prevents cross-customer data leak
- Returns: `invoice_id` (display), `id` (UUID), `total_amount`, `payment_status`, `issued_date`
- Purpose: feed `SelectInvoiceDialog` (Payments page flow — pick an invoice for this payment)

### 3.3 New: `useAttachPaymentToInvoice()`

Mutation hook — calls `attach_payment_to_invoice` RPC.

**Cache invalidation on success:**
- `['invoice', invoiceId]` — updates status badge on the open invoice detail
- `['customer-payments']` — updates Payments page list
- `['customer-payments', invoiceId]` — exact-keyed version used by InvoiceDetailSidebar history
- `['ar-invoices']` — refreshes any open invoice list

### 3.4 New: `useDetachPaymentFromInvoice()`

Mutation hook — calls `detach_payment_from_invoice` RPC.

**Cache invalidation:** same four keys as attach.

### 3.5 Existing hooks — used as-is

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
| **Attach Payment** | Always rendered; `disabled` while loading or list empty — tooltip "No unlinked payments" | `AttachInvoiceDialog` |
| **Set Up Payment Plan** | Always rendered | `PaymentPlanDialog` (AR labels) |

The **Attach Payment** button is **never hidden** — it renders disabled while the unlinked-payments query loads, preventing layout shift.

### 4.2 New: `AttachInvoiceDialog` (`src/components/sales/AttachInvoiceDialog.tsx`)

**Flow: Invoice Detail → pick a payment for this invoice**

- Lists unlinked incoming payments via `useUnlinkedIncomingPayments(customerId)` — `customerId` always passed
- Columns: Payment #, Amount, Method, Date
- Single-select → Attach button → `useAttachPaymentToInvoice()`
- Entire dialog disabled if invoice `payment_status = 'paid'`
- On success: toast confirmation, dialog closes, sidebar history refreshes

### 4.3 New: `SelectInvoiceDialog` (`src/components/sales/SelectInvoiceDialog.tsx`)

**Flow: Payments Page → pick an invoice for this payment**

This is a distinct component from `AttachInvoiceDialog` — the direction of selection is inverted.

- Lists unpaid/partially-paid AR invoices via `useUnlinkedArInvoices(customerId)` — `customerId` derived from the payment row
- Columns: Invoice #, Total Amount, Status, Issued Date
- Single-select → Link button → `useAttachPaymentToInvoice(paymentId, selectedInvoiceId)`
- On success: toast confirmation, Payments page row updates to show linked invoice #

### 4.4 `PaymentPlanDialog` — moved + direction-aware

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

### 4.5 `InvoiceDetailSidebar` — wired sections

**Payment History section:**
- Wire `useCustomerPayments(invoiceId)` — replaces "No payments recorded" placeholder
- Shows: Payment #, Amount, Method, Date per row
- Detach icon per row → `useDetachPaymentFromInvoice()` (with confirmation prompt)

**Payment Plan section (`showPaymentPlan` toggle — already exists):**
- Wire `usePaymentPlans(invoiceId)`
- Shows installments: #, Due Date, Amount, Status badge
- **Settle** button per `pending` / `overdue` installment → `useSettleInstallment(direction='incoming')`
- Completed plans: all installments read-only

### 4.6 Payments Page — Invoice Payments tab

- Existing "Invoice Payments" tab already shows CPAY entries
- Add **Link Invoice** button (link icon) for rows where `invoice_id IS NULL`
- Opens `SelectInvoiceDialog` (not `AttachInvoiceDialog` — the user is starting from the payment, not the invoice)

---

## 5. Data Flow

### Record Payment
```
CustomerPaymentDialog submit
  → useCreateCustomerPayment() — inserts with customer_id populated
  → INSERT payments (direction='incoming', invoice_id=X, customer_id=Y)
  → DB trigger fires → recalculate_invoice_payment_status(X)
  → Invalidate ['invoice', X], ['customer-payments'], ['customer-payments', X], ['ar-invoices']
  → InvoiceDetail re-renders with updated status + new payment in history
```

### Attach Payment (from Invoice Detail)
```
AttachInvoiceDialog confirm
  → useAttachPaymentToInvoice(paymentId, invoiceId)
  → attach_payment_to_invoice RPC
    → BEGIN (SERIALIZABLE)
    → SELECT payment FOR UPDATE  ← row lock prevents concurrent attach
    → Ownership guard (customer_id match or NULL bypass)
    → UPDATE payments.invoice_id = invoiceId
    → COMMIT
    → Trigger fires → recalculate_invoice_payment_status(invoiceId)
  → Invalidate all four cache keys
```

### Link Invoice (from Payments Page)
```
SelectInvoiceDialog confirm
  → useAttachPaymentToInvoice(paymentId, selectedInvoiceId)
  → Same RPC — same atomic flow
  → Payments page row updates to show invoice #
```

### Detach Payment
```
Detach icon confirm
  → useDetachPaymentFromInvoice(paymentId, invoiceId)
  → detach_payment_from_invoice RPC
    → BEGIN (SERIALIZABLE)
    → SELECT payment FOR UPDATE
    → Ownership guard
    → UPDATE payments SET invoice_id = NULL
    → COMMIT
    → Trigger fires → recalculate_invoice_payment_status(invoiceId)
  → All four cache keys invalidated
  → Status reverts to 'partially_paid' or 'unpaid'
```

### Payment Plan — Create & Settle
```
PaymentPlanDialog submit
  → useCreatePaymentPlan()
  → INSERT payment_plans + payment_installments (status='pending')
  → Invalidate ['payment-plans', invoiceId]

Settle button
  → useSettleInstallment(direction='incoming')
  → INSERT payments (triggers status recalc automatically)
  → Marks installment 'paid'; if all paid → plan 'completed'
  → Invalidates ['invoice', invoiceId]
```

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| RPC ownership guard fails (customer mismatch) | Toast "Payment does not belong to this customer"; full rollback |
| RPC attach already-linked payment | Guard rejects; toast "Payment already linked to an invoice" |
| RPC race condition (concurrent attach) | `FOR UPDATE` lock + `SERIALIZABLE` ensures second caller gets rejection error; toast error |
| Trigger recalc fails | Entire transaction rolls back; no ghost link; toast "Failed — please try again" |
| Overpayment | Allowed; invoice → `'paid'`; info note shown in dialog |
| Edit/delete payment outside app | Trigger fires automatically; invoice status self-corrects |
| Settle on completed plan | `useSettleInstallment` returns early; Settle buttons disabled in UI |
| Network error on any mutation | React Query surfaces error; no optimistic updates used |

---

## 7. Testing

| Area | Cases |
|---|---|
| `attach_payment_to_invoice` RPC | Normal attach, overpayment → `'paid'`, attach already-linked → reject, ownership mismatch → reject, concurrent attach → second caller rejected, legacy NULL customer_id → allowed |
| `detach_payment_from_invoice` RPC | Normal detach → status reverts, detach unlinked → reject, ownership mismatch → reject |
| DB trigger | Direct `UPDATE payments SET amount = X` → invoice status recalculates; `DELETE` → status reverts; payment `invoice_id` change → both old and new invoices recalculate |
| Backfill script | Existing payments linked via invoice get `customer_id` populated; SO-linked payments get `customer_id` from SO; ambiguous records stay NULL |
| `useUnlinkedIncomingPayments` | Type error if `customerId` omitted; results contain only matching customer's payments |
| `useUnlinkedArInvoices` | Type error if `customerId` omitted; returns only unpaid/partially_paid invoices for that customer |
| `AttachInvoiceDialog` | Empty list → button disabled + tooltip; populated list → select + confirm triggers attach |
| `SelectInvoiceDialog` | Shows correct invoices for payment's customer; confirm triggers same attach RPC |
| `PaymentPlanDialog` labels | AR context renders "Settle Installment" / "Customer" / "Receivable Amount"; not AP strings |
| `InvoiceDetailSidebar` | After payment mutation → history updates; status badge reflects DB value |
| NUMERIC precision | SUM of payments that total to invoice amount via floating-point path → still resolves to `'paid'` |
| Integration | Record → status flips → detach → status reverts |

---

## 8. File Changes Summary

| Action | Path |
|---|---|
| New migration | `supabase/migrations/YYYYMMDDHHMMSS_invoice_payment_rpcs.sql` — adds `payments.customer_id`, backfill, shared recalc function, trigger, both RPCs |
| New hook | `src/hooks/useUnlinkedIncomingPayments.ts` |
| New hook | `src/hooks/useUnlinkedArInvoices.ts` |
| New hook | `src/hooks/useAttachPaymentToInvoice.ts` |
| New hook | `src/hooks/useDetachPaymentFromInvoice.ts` |
| New component | `src/components/sales/AttachInvoiceDialog.tsx` |
| New component | `src/components/sales/SelectInvoiceDialog.tsx` |
| Move + modify | `src/components/purchase/PaymentPlanDialog.tsx` → `src/components/finance/PaymentPlanDialog.tsx` |
| Update import | `src/components/purchase/` — any file importing PaymentPlanDialog updated to `src/components/finance/` |
| Modify hook | `src/hooks/useCreateCustomerPayment.ts` — populate `customer_id` on insert |
| Modify | `src/components/sales/InvoiceDetail.tsx` — add 3 action buttons |
| Modify | `src/components/sales/InvoiceDetailSidebar.tsx` — wire payment history + plan sections |
| Modify | `src/app/(dashboard)/purchase/payments/page.tsx` — add Link Invoice button to Invoice Payments tab (confirmed: single shared page for both AP and AR payments) |
