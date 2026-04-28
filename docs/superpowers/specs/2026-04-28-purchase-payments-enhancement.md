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

**`PoDetailDialog` integration — accept `poId: string` directly (Issue 4 fix):**

Modify `PoDetailDialog` props to accept either a full object or just an ID:
```ts
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po?: PurchaseOrder | null   // existing callers unaffected
  poId?: string               // new: pass only an ID, dialog shows skeleton until loaded
  onEdit?: (po: PurchaseOrder) => void
}
```
Internal logic: `const resolvedId = po?.id ?? poId ?? null` — `usePurchaseOrder(resolvedId)` fetches the full record. While loading, render a `<Skeleton>` for the header area. This removes all stub construction from callers and is future-proof against type changes.

**Purchase Payments page usage:**
- State: `selectedPoId: string | null`, `poDetailOpen: boolean`
- `openPO(poId: string)` — sets state, opens dialog
- `<PoDetailDialog open={poDetailOpen} onOpenChange={setPoDetailOpen} poId={selectedPoId} />`

---

## Area 3 — Attach Bill Feature

### New Supabase RPC: `attach_payment_to_bill`

**File:** `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql`

All linking logic runs server-side in a single transaction — atomic, no partial state possible (Issues 1 & 2 fix):

```sql
CREATE OR REPLACE FUNCTION attach_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bill_total   numeric;
  v_total_paid   numeric;
  v_new_status   text;
BEGIN
  -- Link payment to bill
  UPDATE payments SET invoice_id = p_bill_id WHERE id = p_payment_id;

  -- Sum all outgoing payments now linked to this bill
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM payments
   WHERE invoice_id = p_bill_id
     AND direction = 'outgoing';

  -- Get bill total
  SELECT total_amount INTO v_bill_total
    FROM invoices WHERE id = p_bill_id;

  -- Derive correct status
  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices SET payment_status = v_new_status WHERE id = p_bill_id;
END;
$$;
```

### New hook: `useAttachPaymentToBill`

**File:** `src/hooks/useAttachPaymentToBill.ts`

```ts
useAttachPaymentToBill(): UseMutationResult<void, Error, { paymentId: string; billId: string }>
```

**Mutation logic:**
1. Call RPC `attach_payment_to_bill(paymentId, billId)` — single round-trip, fully atomic
2. `invalidateQueries(['supplier-payments'])` + `invalidateQueries(['supplier-bills'])`

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
  WHERE payment_id ~ '^SPAY-\d+$'   -- regex: only clean numeric suffixes (Issue 3 fix)
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
| `src/hooks/useAttachPaymentToBill.ts` | New mutation hook (calls RPC) |
| `src/components/purchase/AttachBillDialog.tsx` | New dialog component |
| `src/components/purchase/BillDetailSection.tsx` | Add "Payment" section at the bottom — link button or read-only payment row |
| `src/components/purchase/PoDetailDialog.tsx` | Accept `poId?: string` prop — remove stub requirement from callers |
| `src/app/(dashboard)/purchase/payments/page.tsx` | PO # column, eye icon, paperclip action, PoDetailDialog via poId |
| `supabase/migrations/20260428200006_assign_missing_spay_ids.sql` | Assign SPAY- IDs to null payment_id rows |
| `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql` | Atomic RPC for linking payment to bill |
