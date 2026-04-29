# Bill Discount Inheritance & PO Module Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-inherit PO discount onto bills, rename bills as `PO-00011-B1`, surface supplier reference and discount on the bill detail document, and fix the `ApInvoice` type.

**Architecture:** DB migration first (new columns), then type fix (unlocks all downstream TypeScript), then mutation logic (bill ID + discount), then callers (pass new payload fields), then display (read the new type fields). Each task compiles cleanly before the next begins.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgREST), TanStack Query v5, shadcn/ui, Tailwind CSS

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260429000001_bill_discount_columns.sql` | Create | Add `discount_amount`, `discount_label` to `invoices` |
| `src/types/invoice.ts` | Modify | Add `discount_amount`, `discount_label`, `source_label` to `ApInvoice` |
| `src/hooks/useSupplierBills.ts` | Modify | New bill ID pattern, discount auto-inherit, corrected `total_amount` |
| `src/components/purchase/BillFormDialog.tsx` | Modify | Pass `po_number`, `discount_amount`, `discount_label` to mutation |
| `src/app/(dashboard)/purchase/create-bill/page.tsx` | Modify | Pass `po_number`, `discount_amount`, `discount_label` to mutation |
| `src/components/purchase/BillDetailDocument.tsx` | Modify | Discount line in totals; Supplier Ref in meta row |

---

## Task 1: DB Migration — add discount columns to invoices

**Files:**
- Create: `supabase/migrations/20260429000001_bill_discount_columns.sql`

- [ ] **Step 1: Create the migration file**

Write to `supabase/migrations/20260429000001_bill_discount_columns.sql`:

```sql
-- Add discount support to AP bills (invoices with direction = 'ap').
-- Existing bills get discount_amount = 0 via the column default — no backfill needed.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label  TEXT;
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Run the SQL above. Verify with:
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'invoices'
  AND column_name IN ('discount_amount', 'discount_label');
```
Expected: two rows — `discount_amount` (numeric, default 0, NOT NULL) and `discount_label` (text, nullable).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260429000001_bill_discount_columns.sql
git commit -m "feat(db): add discount_amount and discount_label columns to invoices"
```

---

## Task 2: ApInvoice type fix

**Files:**
- Modify: `src/types/invoice.ts`

- [ ] **Step 1: Add three fields to ApInvoice**

In `src/types/invoice.ts`, find the `ApInvoice` type and replace:

```ts
/** AP bill — supplier-facing, created against a PO */
export type ApInvoice = {
  id: string
  invoice_id: string               // display string e.g. "BILL-00001"
  direction: 'ap'
  supplier_id: string | null
  purchase_order_id: string | null
  receival_id: string | null
  doc_status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  payment_status: BillPaymentStatus
  needs_refresh: false
  total_amount: number | null
  subtotal: number | null
  tax: number | null
  issued_date: string
  due_date: string
  notes: string | null
  created_at: string | null
  // joined
  supplier_name?: string
  po_number?: string
  invoice_line_items?: InvoiceLineItem[]
}
```

With:

```ts
/** AP bill — supplier-facing, created against a PO */
export type ApInvoice = {
  id: string
  invoice_id: string               // display string e.g. "PO-00011-B1"
  direction: 'ap'
  supplier_id: string | null
  purchase_order_id: string | null
  receival_id: string | null
  doc_status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  payment_status: BillPaymentStatus
  needs_refresh: false
  total_amount: number | null
  subtotal: number | null
  discount_amount: number          // NOT NULL DEFAULT 0 in DB
  discount_label: string | null
  tax: number | null
  source_label: string | null      // supplier's own invoice reference
  issued_date: string
  due_date: string
  notes: string | null
  created_at: string | null
  // joined
  supplier_name?: string
  po_number?: string
  invoice_line_items?: InvoiceLineItem[]
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: errors only on callers that now need to supply `discount_amount`, `discount_label`, `source_label` — those are fixed in later tasks. If there are errors on unrelated files, investigate before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/types/invoice.ts
git commit -m "fix(types): add discount_amount, discount_label, source_label to ApInvoice"
```

---

## Task 3: useCreateBill — bill ID, discount, corrected total

**Files:**
- Modify: `src/hooks/useSupplierBills.ts`

- [ ] **Step 1: Add new fields to the mutation payload type**

Find the `useCreateBill` function. Replace the `mutationFn` parameter type block:

```ts
mutationFn: async (payload: {
  supplier_id: string
  purchase_order_id: string
  receival_id: string | null
  due_date: string
  source_label?: string | null
  notes: string
  line_items: {
    description: string
    qty: number
    unit_price: number
    total: number
    match_status: InvoiceLineItem['match_status']
    match_note: string | null
  }[]
}) => {
```

With:

```ts
mutationFn: async (payload: {
  supplier_id: string
  purchase_order_id: string
  po_number: string
  discount_amount: number
  discount_label: string | null
  receival_id: string | null
  due_date: string
  source_label?: string | null
  notes: string
  line_items: {
    description: string
    qty: number
    unit_price: number
    total: number
    match_status: InvoiceLineItem['match_status']
    match_note: string | null
  }[]
}) => {
```

- [ ] **Step 2: Replace bill ID generation and insert payload**

Find the block starting with `const supabase = createClient()` inside the mutation. Replace from the start of that function body up to (and including) the insert:

```ts
const supabase = createClient()

// Count existing AP bills for this PO to generate PO-XXXXX-Bn ID
const { count: billCount } = await (supabase as any)
  .from('invoices')
  .select('*', { count: 'exact', head: true })
  .eq('purchase_order_id', payload.purchase_order_id)
  .eq('direction', 'ap')
const invoiceIdDisplay = `${payload.po_number}-B${(billCount ?? 0) + 1}`

const today = new Date().toISOString().split('T')[0]
const subtotal = payload.line_items.reduce((s, l) => s + l.total, 0)
const discount = payload.discount_amount ?? 0
const totalAmount = subtotal - discount

const { data: bill, error } = await (supabase as any)
  .from('invoices')
  .insert({
    invoice_id:        invoiceIdDisplay,
    direction:         'ap',
    supplier_id:       payload.supplier_id,
    purchase_order_id: payload.purchase_order_id,
    receival_id:       payload.receival_id,
    doc_status:        'draft',
    payment_status:    'unpaid',
    needs_refresh:     false,
    source:            'order',
    source_id:         payload.purchase_order_id,
    source_label:      payload.source_label ?? null,
    subtotal:          subtotal,
    discount_amount:   discount,
    discount_label:    payload.discount_label ?? null,
    total_amount:      totalAmount,
    tax:               0,
    issued_date:       today,
    due_date:          payload.due_date,
    notes:             payload.notes || null,
    status:            'draft',
  })
  .select()
  .single()
if (error) throw error
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: errors on `BillFormDialog.tsx` and `create-bill/page.tsx` (missing new payload fields) — fixed in Task 4. No other errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSupplierBills.ts
git commit -m "feat(hook): bill ID as PO-XXXXX-Bn, auto-inherit discount, correct total_amount"
```

---

## Task 4: Update callers — pass new payload fields

**Files:**
- Modify: `src/components/purchase/BillFormDialog.tsx`
- Modify: `src/app/(dashboard)/purchase/create-bill/page.tsx`

### BillFormDialog.tsx

- [ ] **Step 1: Add po_number, discount_amount, discount_label to the mutateAsync call**

Find the `createBill.mutateAsync({...})` call in `BillFormDialog.tsx` (around line 89). Replace it with:

```ts
await createBill.mutateAsync({
  supplier_id:      (selectedPO as any).supplier_id,
  purchase_order_id: selectedPoId,
  po_number:        selectedPO.po_number,
  discount_amount:  selectedPO.discount_amount ?? 0,
  discount_label:   selectedPO.discount_label ?? null,
  receival_id:      null,
  due_date:         dueDate,
  notes,
  line_items: lines.filter((l) => l.bill_qty > 0).map((l) => ({
    description:  l.item_name,
    qty:          l.bill_qty,
    unit_price:   l.unit_price,
    total:        l.bill_qty * l.unit_price,
    match_status: 'matched' as const,
    match_note:   null,
  })),
})
```

### create-bill/page.tsx

- [ ] **Step 2: Add po_number, discount_amount, discount_label to the mutateAsync call**

Find the `createBill.mutateAsync({...})` call in `create-bill/page.tsx` (around line 85). Replace it with:

```ts
await createBill.mutateAsync({
  supplier_id:       (po as any).supplier_id,
  purchase_order_id: poId,
  po_number:         po.po_number,
  discount_amount:   po.discount_amount ?? 0,
  discount_label:    po.discount_label ?? null,
  receival_id:       null,
  due_date:          dueDate,
  source_label:      reference || null,
  notes,
  line_items: lines.filter((l) => l.bill_qty > 0).map((l) => ({
    description:  l.item_name,
    qty:          l.bill_qty,
    unit_price:   l.unit_price,
    total:        l.bill_qty * l.unit_price,
    match_status: 'matched' as const,
    match_note:   null,
  })),
})
```

- [ ] **Step 3: Verify TypeScript — must be zero errors**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/BillFormDialog.tsx
git add src/app/\(dashboard\)/purchase/create-bill/page.tsx
git commit -m "feat(ui): pass po_number, discount_amount, discount_label from bill creation callers"
```

---

## Task 5: BillDetailDocument — discount line + Supplier Ref

**Files:**
- Modify: `src/components/purchase/BillDetailDocument.tsx`

- [ ] **Step 1: Add discount line to the totals section**

Find the totals section (`{/* 5. Totals */}`) in `BillDetailDocument.tsx`. Replace the inner `div` content:

```tsx
{/* 5. Totals */}
<div className="flex justify-end">
  <div className="w-64 space-y-1.5 text-sm border-t pt-3">
    <div className="flex justify-between">
      <span className="text-muted-foreground">Subtotal:</span>
      <span>{formatCurrency(bill.subtotal, currency)}</span>
    </div>
    {(bill.discount_amount ?? 0) > 0 && (
      <div className="flex justify-between text-destructive">
        <span>{bill.discount_label ? `Discount (${bill.discount_label})` : 'Discount'}:</span>
        <span>−{formatCurrency(bill.discount_amount, currency)}</span>
      </div>
    )}
    <div className="flex justify-between font-bold text-base">
      <span>Grand Total:</span>
      <span>{formatCurrency(bill.total_amount, currency)} {currency}</span>
    </div>
    <div className="flex justify-between text-muted-foreground">
      <span>Total (QAR):</span>
      <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add Supplier Ref to the meta row**

Find the meta row (`{/* 2. Meta row */}`). In the right-side `div` (the one with `text-right`), add a Supplier Ref line after the bill invoice_id:

```tsx
<div className="text-right space-y-1 text-muted-foreground shrink-0">
  <p className="font-medium text-foreground font-mono">{bill.invoice_id}</p>
  {bill.source_label && (
    <p>Supplier Ref: <span className="text-foreground font-mono">{bill.source_label}</span></p>
  )}
  <p>Due: <span className="text-foreground">{formatDate(bill.due_date)}</span></p>
  <p>Print Date: {printTimestamp}</p>
</div>
```

- [ ] **Step 3: Verify TypeScript — must be zero errors**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/BillDetailDocument.tsx
git commit -m "feat(ui): bill detail — discount line in totals, Supplier Ref in meta row"
```

---

## Task 6: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to top of `## ✅ Completed`:
```
- [2026-04-29] **Bill Discount Inheritance & PO Module Fixes (All Tasks)** — `supabase/migrations/20260429000001_bill_discount_columns.sql`, `src/types/invoice.ts`, `src/hooks/useSupplierBills.ts`, `src/components/purchase/BillFormDialog.tsx`, `src/app/(dashboard)/purchase/create-bill/page.tsx`, `src/components/purchase/BillDetailDocument.tsx` — Bills auto-inherit PO discount; bill IDs renamed to PO-XXXXX-Bn pattern; discount line shown in totals; Supplier Ref shown in meta row; ApInvoice type now exposes discount_amount, discount_label, source_label
```

Update `## 🔄 In Progress` to remove this plan.

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — bill discount & PO module fixes complete"
```
