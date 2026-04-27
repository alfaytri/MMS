# SO Invoice — Cash/Credit Customer Types + Invoice Tab Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow cash customers (no credit group) to place sale orders, auto-generate correctly typed invoices (Cash or Credit), and surface the linked invoice inside the SO detail dialog as a dedicated tab with send/pay actions.

**Architecture:** Two DB migrations (data model + RPC), one server-side invoice-generation RPC (eliminates client-side race condition), updates to the create-SO page (cash UX), and a new Invoice tab in `SoDetailDialog`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL RPCs), TanStack Query v5, shadcn/ui, TypeScript.

---

## Decisions Locked In

| # | Decision |
|---|---|
| 1 | `customer_type` uses existing DB column; CHECK constraint added AFTER backfill in one transaction |
| 2 | `create_sale_order` RPC already atomic — just needs LEFT JOIN + cash branch |
| 3 | Invoice numbering is server-side via `generate_invoice_from_so` RPC — no client-side race |
| 4 | Strict 1 SO = 1 Invoice for now — invoice tab shows single invoice panel |
| 5 | Cash SO hides Payment Terms + Payment Milestones fields on the create-SO page |

---

## Data Model

### `customers.customer_type`
- Existing nullable `TEXT` column
- Valid values: `'cash'` | `'credit'` (NULL tolerated for legacy rows — treated as `'credit'`)
- Migration backfills: customers with `credit_group_id IS NOT NULL` → `'credit'`; rest → `'cash'`
- CHECK constraint added **after** backfill in the same transaction: `CHECK (customer_type IN ('cash', 'credit'))`

### `invoices.invoice_type`
- New `TEXT` column, default `'credit'`
- CHECK: `CHECK (invoice_type IN ('cash', 'credit'))`
- Set at invoice creation time from the customer's `customer_type`
- **Cash invoice**: `due_date = issued_date` (pay immediately)
- **Credit invoice**: `due_date = issued_date + 30 days`
- Cash invoices: payment plans **disabled** (no `Set Up Payment Plan` button)

---

## Migration Plan

### Migration 1 — `20260428000005_customer_type_invoice_type.sql`
```sql
BEGIN;

-- 1. Backfill customer_type BEFORE adding constraint
UPDATE customers
SET customer_type = 'credit'
WHERE credit_group_id IS NOT NULL AND (customer_type IS NULL OR customer_type NOT IN ('cash','credit'));

UPDATE customers
SET customer_type = 'cash'
WHERE credit_group_id IS NULL AND (customer_type IS NULL OR customer_type NOT IN ('cash','credit'));

-- 2. Add constraint (table is already clean, NULLs allowed for safety)
ALTER TABLE customers
  ADD CONSTRAINT customers_type_check
  CHECK (customer_type IN ('cash', 'credit'));

-- 3. Add invoice_type to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'credit'
  CHECK (invoice_type IN ('cash', 'credit'));

-- 4. Backfill existing invoices from their linked customer
UPDATE invoices i
SET invoice_type = COALESCE(c.customer_type, 'credit')
FROM customers c
WHERE i.customer_id = c.id
  AND i.direction = 'ar';

COMMIT;
```

### Migration 2 — `20260428000006_fix_create_sale_order_cash.sql`
Replaces the `create_sale_order` RPC with a version that:
- Uses `LEFT JOIN credit_groups` instead of `INNER JOIN`
- Checks `c.customer_type`:
  - `'cash'` (or NULL on credit_group_id IS NULL): skip credit check, no `pending_approval`, status = `quotation` or `confirmed` directly
  - `'credit'` with a credit group: existing limit check logic
  - `'credit'` without a credit group: `RAISE EXCEPTION 'no_credit_group'` (existing behaviour)

### Migration 3 — `20260428000007_rpc_generate_invoice_from_so.sql`
New server-side RPC `generate_invoice_from_so(p_so_id UUID) RETURNS JSONB`:
- Acquires `pg_advisory_xact_lock` keyed on the invoices table to serialize numbering
- Checks `invoices` count to compute next `INV-XXXXX` number atomically
- Fetches SO + customer_type
- Sets `invoice_type`, `due_date` (cash: today, credit: today + 30)
- Inserts invoice row + line items in one transaction
- Returns `{ invoice_id, id, invoice_type }` or raises if SO already has an invoice

---

## Hook Changes — `src/hooks/useCustomerInvoices.ts`

### New: `useInvoicesBySO(soId: string | null)`
```ts
// Fetches the single AR invoice linked to a sale order
queryKey: ['invoices-by-so', soId]
// SELECT id, invoice_id, invoice_type, doc_status, payment_status, total_amount,
//        issued_date, due_date, needs_refresh, invoice_line_items(*)
// FROM invoices WHERE sale_order_id = soId AND direction = 'ar' LIMIT 1
```

### New: `useGenerateInvoice()`
```ts
// Calls generate_invoice_from_so RPC
// onSuccess: invalidates ['invoices-by-so', soId] + ['customer-invoices'] + ['sale-orders']
mutationFn: (soId: string) => supabase.rpc('generate_invoice_from_so', { p_so_id: soId })
```

---

## `SoDetailDialog` — Invoice Tab

Added as the 5th tab (after Activity). Uses `useInvoicesBySO(so.id)`.

### State: No invoice exists
```
┌─────────────────────────────────────┐
│ No invoice generated yet.           │
│                                     │
│ [Generate Invoice]  ← visible when  │
│  status: confirmed | partial_        │
│  delivery | delivered               │
└─────────────────────────────────────┘
```
"Generate Invoice" calls `useGenerateInvoice().mutate(so.id)`.

### State: Invoice exists
```
┌─────────────────────────────────────────────────────┐
│  INV-00001   [Draft] [Unpaid] [Cash Invoice]        │
├─────────────────────────────────────────────────────┤
│  Description        Qty    Unit Price    Total      │
│  ─────────────────────────────────────────────────  │
│  Item A              5      QAR 100      QAR 500    │
│  Item B              2      QAR 200      QAR 400    │
├─────────────────────────────────────────────────────┤
│  Total:              QAR 900                        │
│  Paid:               QAR   0                        │
│  Outstanding:        QAR 900                        │
├─────────────────────────────────────────────────────┤
│  [Send to Customer]  [Record Payment]               │
│  [Set Up Payment Plan] ← Credit invoices only       │
│                          when outstanding ≥ 10,000  │
└─────────────────────────────────────────────────────┘
```

**Badges:**
- `doc_status`: Draft (slate) / Ready to Send (blue) / Sent (green)
- `payment_status`: Unpaid (slate) / Partially Paid (amber) / Paid (green) / Overdue (red)
- `invoice_type`: Cash Invoice (orange) / Credit Invoice (purple)

**Actions visible by state:**

| Action | When shown |
|---|---|
| Send to Customer | `doc_status = 'ready_to_send'` |
| Record Payment | outstanding > 0 AND `doc_status ≠ 'draft'` |
| Set Up Payment Plan | `invoice_type = 'credit'` AND outstanding ≥ QAR 10,000 AND no active plan |

Reuses existing `CustomerPaymentDialog` and `PaymentPlanDialog` components, already imported by `InvoiceDetail`.

---

## Create-SO Page Changes

### "Add Customer" Dialog
Before:
- Fields: Name, Phone, Email, Credit Group (required)

After:
- **Customer Type** radio at top: `Cash` | `Credit` (default: Credit)
- Credit Group dropdown: only shown when `Credit` selected
- `if (!newCreditGroupId)` block removed; replaced with: if type = Credit and no group → block

### Customer Selection
- Remove `noCreditGroup` validation in `validate()`
- When a cash customer is selected: show orange `Cash Sale` badge instead of credit info panel
- When a credit customer is selected: existing credit info panel (group name, limit, available)

### Terms Section (cash customers)
- When `customer_type = 'cash'` (detected after customer selection):
  - Hide Payment Terms field
  - Hide Payment Milestones section
  - Hide Payment Terms Notes field
  - Show a note: "Cash sale — payment due on delivery"

---

## Files Modified / Created

| File | Type | Change |
|---|---|---|
| `supabase/migrations/20260428000005_customer_type_invoice_type.sql` | New | Backfill + CHECK + invoice_type column |
| `supabase/migrations/20260428000006_fix_create_sale_order_cash.sql` | New | RPC LEFT JOIN + cash branch |
| `supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql` | New | Atomic invoice generation RPC |
| `src/hooks/useCustomerInvoices.ts` | Modify | Add `useInvoicesBySO`, `useGenerateInvoice` |
| `src/components/sales/SoDetailDialog.tsx` | Modify | Add Invoice tab (5th tab) |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify | Cash UX: type toggle, hide terms, remove block |

---

## Out of Scope (future)

- Partial invoicing (multiple invoices per SO)
- Per-credit-group payment day configuration (currently hardcoded 30 days)
- Invoice PDF for cash invoices
- Overdue detection logic (currently manual)
