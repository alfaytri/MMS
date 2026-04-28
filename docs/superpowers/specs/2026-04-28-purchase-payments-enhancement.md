# Purchase Payments Enhancement — Design Spec

**Date:** 2026-04-28
**Branch:** feature/sale-module

---

## Goal

Fix the Purchase Payments tab so supplier names and PO links resolve correctly, mirror the Invoice Payments UX (clickable PO link + eye icon), add a one-time "Attach Bill" action to payments from both the Payments page and the Bills page, and patch orphaned null payment IDs via migration.

---

## Area 1 — `useSupplierPayments` Hook Fix

### Problem

PO-direct payments (`source_type = 'purchase_order'`) have no `invoice_id`, so the existing `invoices → suppliers` join returns null for both `supplier_name` and bill info.

### Changes to `src/hooks/useSupplierPayments.ts`

**Select query** — expand to include:
```
*,
invoices(invoice_id, purchase_order_id, purchase_orders(id, po_number), suppliers(name)),
suppliers(name)
```
The second `suppliers(name)` joins directly on `payments.supplier_id` (set on PO-direct payments).

**Batch-fetch POs** — after the main query, collect all `source_id` values where `source_type = 'purchase_order'` and fetch `purchase_orders(id, po_number, suppliers(name))` in one query. Build a `poMap: Record<string, { po_number, supplier_name }>`.

**Resolution priority in `.map()`:**
- `supplier_name`: `invoices.suppliers.name` → `direct suppliers.name` (via `payments.supplier_id`) → `poMap[source_id].supplier_name` → `null`
- `po_id`: `invoices.purchase_orders.id` → `source_id` (when `source_type = 'purchase_order'`) → `null`
- `po_number`: `invoices.purchase_orders.po_number` → `poMap[source_id].po_number` → `null`

**Updated/new fields on `SupplierPayment` type:**
```ts
invoice_id: string | null    // was string (non-nullable) — fix: PO-direct payments have no invoice
supplier_id?: string | null  // new: needed for AttachBillDialog supplier filtering
po_id?: string | null        // new
po_number?: string | null    // new
```

---

## Area 2 — Purchase Payments Table UI

### File: `src/app/(dashboard)/purchase/payments/page.tsx`

**New columns added to `purchaseColumns`:**

| Column | Position | Behaviour |
|---|---|---|
| **PO #** | After Supplier, before Bill # | Orange clickable button → opens `PoDetailDialog`. Shows `—` when null |
| **Eye icon** (actions) | Rightmost | `h-7 w-7` ghost icon button, renders only when `po_id` is present. Opens `PoDetailDialog` |
| **Paperclip** (attach) | In actions column, beside eye | Renders only when `invoice_id` is `null`. Opens Attach Bill dialog (Area 3) |

**`PoDetailDialog` integration:**
- Import `PoDetailDialog` from `@/components/purchase/PoDetailDialog`
- Import `PurchaseOrder` type from `@/hooks/usePurchaseOrders`
- State: `selectedPO: PurchaseOrder | null`, `poDetailOpen: boolean`
- `openPO(payment)` callback — construct minimal stub:
  ```ts
  {
    id: payment.po_id,
    po_number: payment.po_number ?? '…',
    supplier_id: '',
    supplier_name: payment.supplier_name ?? '',
    status: 'approved',
    currency: 'QAR',
    exchange_rate: 1,
    subtotal: payment.amount,
    total_qar: payment.amount,
    created_date: payment.date,
    expected_delivery: null,
    approval_level: 0,
    payment_terms: null,
    payment_terms_notes: null,
    delivery_terms: null,
    delivery_terms_notes: null,
    vendor_notes: null,
    discount_amount: 0,
    discount_label: null,
    created_at: payment.date,
    updated_at: payment.date,
    created_by: null,
    version_number: 1,
  }
  ```
- `PoDetailDialog` fetches the full PO internally via `usePurchaseOrder(po.id)`, so stub is just a loading placeholder.

---

## Area 3 — Attach Bill Feature

### New hook: `useAttachPaymentToBill`

**File:** `src/hooks/useAttachPaymentToBill.ts`

```ts
useAttachPaymentToBill(): UseMutationResult<void, Error, { paymentId: string; billId: string }>
```

**Mutation logic:**
1. `UPDATE payments SET invoice_id = billId WHERE id = paymentId`
2. `UPDATE invoices SET payment_status = 'paid' WHERE id = billId`
3. `invalidateQueries(['supplier-payments'])` + `invalidateQueries(['supplier-bills'])`

Both updates run sequentially; if step 2 fails, log error and still invalidate caches (data is recoverable).

### New component: `AttachBillDialog`

**File:** `src/components/purchase/AttachBillDialog.tsx`

Props:
```ts
{
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'attach-bill'   | 'link-payment'
  paymentId?: string     // set when mode = 'attach-bill'
  billId?: string        // set when mode = 'link-payment'
  supplierId?: string    // used to pre-filter the dropdown list
}
```

**`attach-bill` mode** (from Payments page):
- Fetches unlinked bills for the supplier: `invoices WHERE type = 'payable' AND payment_status IN ('unpaid', 'partially_paid')` filtered by `supplier_id`. Uses `useSupplierBills` hook with supplier filter.
- Dropdown shows: `Bill # — QAR X,XXX.XX (date)`
- On confirm: calls `useAttachPaymentToBill({ paymentId, billId: selected })`

**`link-payment` mode** (from Bills page):
- Fetches unlinked outgoing payments for the supplier: `payments WHERE direction = 'outgoing' AND invoice_id IS NULL` filtered by supplier
- Dropdown shows: `Payment # — QAR X,XXX.XX (date) · Method`
- On confirm: calls `useAttachPaymentToBill({ paymentId: selected, billId })`

**Shared UI:**
- shadcn `Dialog` + `Select` (searchable via Combobox pattern if > 5 items)
- Loading state while fetching options
- Empty state: "No unlinked bills found for this supplier"
- Confirm button disabled until selection made

### Bills page integration

**File:** `src/components/purchase/BillDetailSidebar.tsx` (or `BillDetailSection.tsx` — check which renders the payment summary)

Add a **"Payment" section** at the bottom of the bill detail:
- If `invoice.payment_status != 'paid'` and no payment linked: show "Link Payment" button → opens `AttachBillDialog` in `link-payment` mode
- If payment linked (query `payments WHERE invoice_id = bill.id AND direction = 'outgoing'` — at most one row): show read-only row: Payment #, Amount, Date, Method
- No edit or unlink — attach is one-time only

---

## Area 4 — Data Migration: Null Payment IDs

**File:** `supabase/migrations/20260428200006_assign_missing_spay_ids.sql`

```sql
WITH max_seq AS (
  SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id FROM 6) AS integer)), 0) AS n
  FROM payments
  WHERE payment_id LIKE 'SPAY-%'
),
numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY date, created_at) AS rn
  FROM payments
  WHERE direction = 'outgoing'
    AND payment_id IS NULL
)
UPDATE payments p
SET payment_id = 'SPAY-' || LPAD((m.n + numbered.rn)::text, 5, '0')
FROM numbered, max_seq m
WHERE p.id = numbered.id;
```

Assigns sequential SPAY-XXXXX IDs starting after the highest existing SPAY- number.

---

## Files Touched

| File | Change |
|---|---|
| `src/hooks/useSupplierPayments.ts` | Fix supplier/PO resolution, add po_id/po_number fields |
| `src/hooks/useAttachPaymentToBill.ts` | New mutation hook |
| `src/components/purchase/AttachBillDialog.tsx` | New dialog component |
| `src/components/purchase/BillDetailSection.tsx` | Add "Payment" section at the bottom — link button or read-only payment row |
| `src/app/(dashboard)/purchase/payments/page.tsx` | PO # column, eye icon, paperclip action, PoDetailDialog |
| `supabase/migrations/20260428200006_assign_missing_spay_ids.sql` | Assign SPAY- IDs to null payment_id rows |
