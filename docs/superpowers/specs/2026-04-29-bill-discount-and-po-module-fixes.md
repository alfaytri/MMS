# Bill Discount Inheritance & PO Module Fixes — Design Spec

**Date:** 2026-04-29
**Scope:** Purchase/PO module only. Sales excluded.

---

## Problem Summary

When a bill is created from a Purchase Order, three things go wrong:

1. The PO's discount is silently dropped — `total_amount = subtotal` always, even when the PO had a discount.
2. The bill ID (`BILL-00004`) has no connection to the PO it came from, making it hard to match on the Payments page.
3. The supplier's own invoice number (`source_label`) is captured on creation but never displayed on the bill detail document.

Additionally, `ApInvoice` is missing three fields that already exist in the database.

---

## Goals

- Bills auto-inherit discount from their PO (no user action required).
- Bill IDs follow the pattern `PO-00011-B1`, `PO-00011-B2` — directly traceable to the PO.
- Supplier reference number appears on the bill detail document.
- `ApInvoice` type reflects what is actually stored in the database.

---

## Out of Scope

- Editable discount on bills (user cannot override the auto-inherited value).
- Tax calculation (remains hardcoded to 0).
- PO approval workflow for bills.
- Print implementation for PoDetailDialog.
- Receival auto-linking on bill create.
- Sales module.

---

## Design

### 1. Database Migration

**File:** `supabase/migrations/20260429000001_bill_discount_columns.sql`

Add two columns to the `invoices` table:

```sql
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label  TEXT;
```

- Existing bills get `discount_amount = 0` via the column default — no explicit backfill needed.
- `total_amount` on new bills will be `subtotal − discount_amount`. Old bills are unaffected (their `total_amount` was already correct at `= subtotal`).

---

### 2. Bill ID Naming

**File:** `src/hooks/useSupplierBills.ts` (createBill mutation)

Replace the current count-based `BILL-XXXXX` ID generation with:

```
{po_number}-B{n}
```

where `n` = count of existing bills for this PO + 1.

**Logic:**
1. Query `invoices` for rows where `purchase_order_id = payload.purchase_order_id` and `direction = 'ap'`.
2. `n = count + 1`.
3. Generate `invoice_id = ${po_number}-B${n}`.

**Rules:**
- Existing `BILL-XXXXX` IDs are not backfilled — they keep their current names.
- New bills created after this change always use the new pattern.
- Concurrent creation for the same PO is safe in practice (bills for a given PO are created one at a time).

---

### 3. Create Bill Mutation Changes

**File:** `src/hooks/useSupplierBills.ts` (createBill mutation)

Two changes to the mutation payload — no UI changes needed:

**Discount auto-inherit:**
- Read `discount_amount` and `discount_label` from the linked PO record (already fetched during bill creation).
- Pass both into the `invoices` insert payload.
- Calculate `total_amount = subtotal − discount_amount` (instead of `= subtotal`).

**Payload additions:**
```ts
discount_amount: selectedPO.discount_amount ?? 0,
discount_label:  selectedPO.discount_label  ?? null,
total_amount:    subtotal - (selectedPO.discount_amount ?? 0),
```

No changes to `BillFormDialog` or `create-bill/page.tsx` — discount is applied silently.

---

### 4. Bill Detail Display

**File:** `src/components/purchase/BillDetailDocument.tsx`

#### 4a. Totals section

Add a conditional discount line between Subtotal and Grand Total:

```
Subtotal:                      QAR 353,000
Discount (Early Payment):     −QAR 10,000    ← shown only when discount_amount > 0
Grand Total:          QAR 343,000 QAR
Total (QAR):                   QAR 343,000
```

- Label uses `discount_label` when set, falls back to plain "Discount".
- Discount amount shown in red/destructive color to signal a deduction.
- Printed on paper (no `print:hidden`).

#### 4b. Meta row — Supplier Ref

Add a `Supplier Ref` line in the meta row (section 2 of the document), shown only when `bill.source_label` is set:

```
BILL-00004
Supplier Ref: INV-2026-001     ← conditional
Due: 07 May 2026
Print Date: ...
```

- Printed on paper (no `print:hidden`).

---

### 5. ApInvoice Type Fix

**File:** `src/types/invoice.ts`

Add three missing fields to `ApInvoice`:

```ts
discount_amount: number           // NOT NULL DEFAULT 0 in DB
discount_label:  string | null
source_label:    string | null
```

These columns already exist in the database. Adding them to the type makes them accessible and type-safe across all consumers (`BillDetailDocument`, `BillFormDialog`, `useSupplierBills`, etc.).

---

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260429000001_bill_discount_columns.sql` | Create | Add discount_amount, discount_label to invoices |
| `src/types/invoice.ts` | Modify | Add discount_amount, discount_label, source_label to ApInvoice |
| `src/hooks/useSupplierBills.ts` | Modify | New bill ID pattern, auto-inherit discount, correct total_amount |
| `src/components/purchase/BillDetailDocument.tsx` | Modify | Discount line in totals, Supplier Ref in meta row |

---

## Acceptance Criteria

1. Creating a bill from PO-00011 (which has a discount) produces a bill named `PO-00011-B1` with the correct discounted total.
2. The bill detail document shows the discount line only when `discount_amount > 0`.
3. The bill detail document shows "Supplier Ref: X" only when `source_label` is set.
4. TypeScript compiles with zero errors after all changes.
5. Existing bills are unaffected (their IDs and totals do not change).
