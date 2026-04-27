# SO Invoice — Cash/Credit Customer Types + Invoice Tab Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow cash customers (no credit group) to place sale orders, auto-generate correctly typed invoices (Cash or Credit), and surface the linked invoice inside the SO detail dialog as a dedicated tab with send/pay actions.

**Architecture:** Three DB migrations (data model + RPC x2), one server-side invoice-generation RPC (eliminates client-side race condition), updates to the create-SO page (cash UX), and a new Invoice tab in `SoDetailDialog`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL RPCs), TanStack Query v5, shadcn/ui, TypeScript.

---

## Decisions Locked In

| # | Decision |
|---|---|
| 1 | `customer_type` CHECK constraint written as `IN ('cash','credit') OR IS NULL` to tolerate legacy NULL rows without crashing inserts from older code paths |
| 2 | `create_sale_order` RPC already atomic — just needs LEFT JOIN + cash branch |
| 3 | Invoice numbering is server-side via `generate_invoice_from_so` RPC — no client-side race |
| 4 | Strict 1 SO = 1 Invoice for now — invoice tab shows single invoice panel |
| 5 | Cash SO hides Payment Terms + Payment Milestones fields on the create-SO page; `buildPayload()` forces them to `null` regardless of hidden state |
| 6 | "Generate Invoice" button only shown when SO status is `partial_delivery` or `delivered` — never at `confirmed` — to prevent billing for unshipped quantities |
| 7 | `generate_invoice_from_so` RPC copies `discount_amount`, `discount_label`, `discount_type`, and `tax` from the sale_orders row to the invoice |

---

## Data Model

### `customers.customer_type`
- Existing nullable `TEXT` column
- Valid values: `'cash'` | `'credit'`
- **NULL explicitly allowed** in the CHECK constraint so legacy inserts from any code path that omits the field do not crash: `CHECK (customer_type IN ('cash','credit') OR customer_type IS NULL)`
- Application treats NULL as `'credit'` (same as before the feature)
- Migration backfills all rows before adding the constraint

### `invoices.invoice_type`
- New `TEXT` column, `NOT NULL DEFAULT 'credit'`
- CHECK: `CHECK (invoice_type IN ('cash','credit'))`
- Set at invoice creation time from the customer's `customer_type` (NULL → `'credit'`)
- **Cash invoice**: `due_date = issued_date` (pay immediately)
- **Credit invoice**: `due_date = issued_date + 30 days`
- Cash invoices: payment plans **disabled** (no `Set Up Payment Plan` button)

---

## Migration Plan

### Migration 1 — `20260428000005_customer_type_invoice_type.sql`

```sql
BEGIN;

-- Step 1: Backfill customer_type BEFORE adding the constraint.
-- Credit customers first (have a credit group).
UPDATE customers
SET customer_type = 'credit'
WHERE credit_group_id IS NOT NULL
  AND (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- Cash customers (no credit group).
UPDATE customers
SET customer_type = 'cash'
WHERE credit_group_id IS NULL
  AND (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- Step 2: Add CHECK constraint. NULL explicitly allowed so legacy code
-- paths that omit customer_type do not throw a constraint violation.
ALTER TABLE customers
  ADD CONSTRAINT customers_type_check
  CHECK (customer_type IN ('cash', 'credit') OR customer_type IS NULL);

-- Step 3: Add invoice_type column (NOT NULL, default 'credit').
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'credit'
  CHECK (invoice_type IN ('cash', 'credit'));

-- Step 4: Backfill existing AR invoices from their linked customer.
-- COALESCE handles customers whose type is still NULL → treat as credit.
UPDATE invoices i
SET invoice_type = COALESCE(c.customer_type, 'credit')
FROM customers c
WHERE i.customer_id = c.id
  AND i.direction = 'ar';

COMMIT;
```

### Migration 2 — `20260428000006_fix_create_sale_order_cash.sql`

Replaces the `create_sale_order` RPC:
- `LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id` (was INNER JOIN)
- Branch on `c.customer_type`:
  - `'cash'` OR (`customer_type IS NULL` AND `credit_group_id IS NULL`): skip credit check entirely; `v_so_status = p_intent = 'confirm' ? 'confirmed' : 'quotation'`
  - `'credit'` with a credit group found: existing limit / `pending_approval` logic unchanged
  - `'credit'` with **no** credit group: `RAISE EXCEPTION 'no_credit_group'` (preserved)
- All other logic (line item insert, SO insert, advisory lock) unchanged

### Migration 3 — `20260428000007_rpc_generate_invoice_from_so.sql`

New RPC: `generate_invoice_from_so(p_so_id UUID) RETURNS JSONB`

Steps (all inside one transaction):
1. `pg_advisory_xact_lock` keyed on a hash of `'invoices'` to serialize invoice numbering globally
2. Check that no AR invoice already exists for `p_so_id` — raise `'invoice_exists'` if found
3. Check that SO status is `partial_delivery` or `delivered` — raise `'so_not_deliverable'` otherwise
4. Fetch from `sale_orders` joined to `customers`:
   - `so.total`, `so.subtotal`, `so.tax`, `so.discount_amount`, `so.discount_label`, `so.discount_type`
   - `so.customer_id`, `so.sale_order_lines`
   - `c.customer_type` (NULL → `'credit'`)
5. Compute next invoice number: `SELECT COUNT(*)+1 FROM invoices` → `INV-XXXXX`
6. Set dates:
   - `issued_date = CURRENT_DATE`
   - `due_date = CURRENT_DATE` (cash) or `CURRENT_DATE + 30` (credit)
7. `INSERT INTO invoices` with:
   - `invoice_id`, `customer_id`, `direction='ar'`, `sale_order_id`
   - `invoice_type`, `doc_status='draft'`, `payment_status='unpaid'`
   - `total_amount = so.total` (after discount), `subtotal = so.subtotal`
   - `tax = so.tax`, `discount_amount = so.discount_amount`
   - `discount_label = so.discount_label`, `discount_type = so.discount_type`
   - `issued_date`, `due_date`, `needs_refresh = false`
8. `INSERT INTO invoice_line_items` — one row per `sale_order_line` (description=item_name, qty, unit_price, total)
9. Return `{ id, invoice_id, invoice_type }`

---

## Hook Changes — `src/hooks/useCustomerInvoices.ts`

### New: `useInvoicesBySO(soId: string | null)`

```ts
// Returns the single AR invoice linked to a sale order (or null if none).
queryKey: ['invoices-by-so', soId]
queryFn: SELECT id, invoice_id, invoice_type, doc_status, payment_status,
                total_amount, subtotal, tax, discount_amount, discount_label,
                issued_date, due_date, needs_refresh, invoice_line_items(*)
         FROM invoices
         WHERE sale_order_id = soId AND direction = 'ar'
         LIMIT 1
// Returns: ArInvoice | null
enabled: !!soId
staleTime: 30_000
```

`ArInvoice` type in `src/types/invoice.ts` gets `invoice_type: 'cash' | 'credit'` added.

### New: `useGenerateInvoice()`

```ts
mutationFn: (soId: string) =>
  supabase.rpc('generate_invoice_from_so', { p_so_id: soId })
onSuccess: (_data, soId) => {
  queryClient.invalidateQueries({ queryKey: ['invoices-by-so', soId] })
  queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
  queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
  queryClient.invalidateQueries({ queryKey: ['sale-order', soId] })
}
```

---

## `SoDetailDialog` — Invoice Tab

Added as the **5th tab** (after Activity). Driven by `useInvoicesBySO(open ? so?.id : null)`.

### State: No invoice + SO not yet deliverable (`confirmed`)
```
Invoice will be available once items are delivered.
```
No button. Invoice can only be generated after delivery begins.

### State: No invoice + SO is `partial_delivery` or `delivered`
```
┌─────────────────────────────────────────┐
│ No invoice generated yet.               │
│                                         │
│          [Generate Invoice]             │
└─────────────────────────────────────────┘
```
"Generate Invoice" calls `useGenerateInvoice().mutate(so.id)` with loading state.

### State: Invoice exists
```
┌──────────────────────────────────────────────────────┐
│  INV-00001   [Draft]  [Unpaid]  [Cash Invoice]       │
│  Issued: 27 Apr 2026   Due: 27 Apr 2026              │
├──────────────────────────────────────────────────────┤
│  Description         Qty    Unit Price    Total      │
│  ──────────────────────────────────────────────────  │
│  Item A               5      QAR 100      QAR 500    │
│  Item B               2      QAR 200      QAR 400    │
├──────────────────────────────────────────────────────┤
│  Subtotal:                              QAR 900      │
│  Discount (10%):                       −QAR  90      │
│  Tax:                                   QAR   0      │
│  Total:                                 QAR 810      │
│  Paid:                                  QAR   0      │
│  Outstanding:                           QAR 810      │
├──────────────────────────────────────────────────────┤
│  [Send to Customer]  [Record Payment]                │
│  [Set Up Payment Plan]  ← credit only, ≥ QAR 10k    │
└──────────────────────────────────────────────────────┘
```

**Badges:**
| Badge | Values |
|---|---|
| `doc_status` | Draft (slate) / Ready to Send (blue) / Sent (green) |
| `payment_status` | Unpaid (slate) / Partially Paid (amber) / Paid (green) / Overdue (red) |
| `invoice_type` | Cash Invoice (orange) / Credit Invoice (purple) |

**Actions:**
| Button | Visible when |
|---|---|
| Send to Customer | `doc_status = 'ready_to_send'` |
| Record Payment | outstanding > 0 AND `doc_status ≠ 'draft'` |
| Set Up Payment Plan | `invoice_type = 'credit'` AND outstanding ≥ QAR 10,000 AND no active plan |

Reuses existing `CustomerPaymentDialog` and `PaymentPlanDialog`. Needs `usePaymentPlans(invoice.id)` to check for active plan.

---

## Create-SO Page Changes — `src/app/(dashboard)/sales/create-so/page.tsx`

### State variable added
```ts
const [customerType, setCustomerType] = useState<'cash' | 'credit' | null>(null)
// Set when a customer is selected from the list:
// setCustomerType(c.customer_type ?? 'credit')
```

### `validate()` function
- Remove: `if (noCreditGroup) { toast.error(...); return false }`
- `noCreditGroup` variable removed entirely

### `buildPayload()` function — React hidden-state bug fix
```ts
// For cash customers, force payment fields to null regardless of local state:
payment_terms:       customerType === 'cash' ? null : terms.payment_terms || null,
payment_terms_notes: customerType === 'cash' ? null : terms.payment_terms_notes || null,
payment_milestones:  customerType === 'cash' ? null : null,  // already null today
```

### Customer info panel (below customer selector)
```
// Credit customer — unchanged:
Credit Group: Standard | Limit: QAR 50,000 | Available: QAR 35,000

// Cash customer — replace panel with:
[Cash Sale] Payment due on delivery. No credit check applied.
```

### Terms Section — cash customers
When `customerType === 'cash'`:
- **Hide** the Payment Terms `<Select>` and its label
- **Hide** the Payment Terms Notes `<Textarea>`
- **Hide** the Payment Milestones section
- State values for those fields are **not cleared** in local state (no need — `buildPayload` forces null)

### "Add Customer" Dialog
Before: Name + Phone + Email + Credit Group (required)

After:
1. **Customer Type** radio: `Cash` | `Credit` (default: `Credit`)
2. Credit Group `<Select>`: **only rendered** when type = `Credit`
3. Validation: if type = `Credit` and no credit group selected → toast error (preserved)
4. If type = `Cash` → `credit_group_id: null`, no validation on credit group
5. Customer inserted with `customer_type: newCustomerType` field

---

## Files Modified / Created

| File | Type | Change |
|---|---|---|
| `supabase/migrations/20260428000005_customer_type_invoice_type.sql` | New | Backfill + CHECK (NULL allowed) + invoice_type column |
| `supabase/migrations/20260428000006_fix_create_sale_order_cash.sql` | New | RPC LEFT JOIN + cash/credit branch |
| `supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql` | New | Atomic invoice-generation RPC with discount + tax copy |
| `src/types/invoice.ts` | Modify | Add `invoice_type: 'cash' \| 'credit'` to `ArInvoice` |
| `src/hooks/useCustomerInvoices.ts` | Modify | Add `useInvoicesBySO`, `useGenerateInvoice` |
| `src/components/sales/SoDetailDialog.tsx` | Modify | Add Invoice tab (5th tab) |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify | Cash UX: type toggle, null payload override, remove block |

---

## Out of Scope (future)

- Partial invoicing (multiple invoices per SO)
- Per-credit-group payment day configuration (currently hardcoded 30 days)
- Invoice PDF for cash invoices
- Overdue detection logic (currently manual)
- Editing a generated invoice's line items without re-generating
