# Purchase & Sales Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing transactional nodes to the Purchase & Sales module: RFQ list, standalone Receivals page, Supplier Bills with 3-way match, Purchase Payments with payment plans, Sale Deliveries, Customer Invoices (auto-generated from SO), Customer Payments, and Credit Notes.

**Architecture:** Extend the existing `invoices` and `payments` tables with `direction`, `doc_status`, `payment_status`, and `needs_refresh` columns; create `credit_note_lines`, `payment_plans`, and `payment_installments` tables; expose two DB views (`customer_invoices`, `supplier_bills`). All new UI modules follow the existing DataTable + hook + form-dialog pattern.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (browser client via `createClient()`), TanStack Query v5, shadcn/ui, Tailwind CSS, Zod, react-hook-form, Lucide icons, Sonner toasts.

**Design reference:** `docs/superpowers/specs/2026-04-18-purchase-sales-expansion-design.md`

**Existing patterns to follow:**
- Hooks: `src/hooks/useSaleOrders.ts` (TanStack Query, `createClient()`, `as any` cast)
- Pages: `src/app/(dashboard)/purchase/orders/page.tsx` (status chip filters, DataTable, dialogs)
- Components: `src/components/purchase/PoDetailDialog.tsx` (tabbed dialog pattern)
- Formatters: `src/lib/utils/formatters.ts` (`formatCurrency`, `formatDate`)

---

## ⚠️ Critical DB Facts (read before writing any query)

| Table | Actual FK / column name | Notes |
|---|---|---|
| `receivals` | `po_id` (not `purchase_order_id`) | Also requires `warehouse_id` + `date` |
| `receival_items` | `po_line_item_id` FK → `po_line_items.id` | Has `unit_cost`, `is_free` |
| `rfqs` | `title`, `suppliers[]` (array), `due_date` | No `supplier_id` FK; status enum: `draft/sent/received/cancelled` |
| `rfq_line_items` | `item_name`, `qty`, `unit`, `sku`, `target_price` | No `notes` column |
| `rfq_quotes` | `supplier_id`, `supplier_name`, `items` (JSON), `received_date`, `total_amount` | |
| `invoices` | `invoice_id` (display string, required), `source` (enum, required), `source_id` (required), `issued_date` + `due_date` (required) | PK is `id` (UUID) |
| `invoice_line_items` | `description`, `qty`, `unit_price`, `total`, `team_name` | No `item_name`/`sku` |
| `payments` | `invoice_id` FK (required), `payment_id` (display string, required), `method` enum | No `supplier_id` column |
| `sale_deliveries` | `warehouse_id` (will be made nullable in migration), `delivery_number`, `items` (JSON) | Status enum: `pending/in_progress/delivered/cancelled` |
| `credit_notes` | `credit_note_id` (display), `customer_name`, `line_items` (JSON), status: `draft/approved/issued/redeemed` | Already has `line_items` JSON; `credit_note_lines` table is NEW |

---

## File Structure

**New files — created by this plan:**

```
supabase/migrations/
  20260419000000_purchase_sales_expansion.sql   ← Task 1

src/types/
  invoice.ts                                    ← Task 2

src/lib/
  invoiceSync.ts                                ← Task 2

src/hooks/
  useRfqs.ts                                    ← Task 4
  useReceivals.ts                               ← Task 4
  useSupplierBills.ts                           ← Task 5
  useSupplierPayments.ts                        ← Task 5
  usePaymentPlans.ts                            ← Task 5
  useSaleDeliveries.ts                          ← Task 6
  useCustomerInvoices.ts                        ← Task 6
  useCustomerPayments.ts                        ← Task 6
  useCreditNotes.ts                             ← Task 6

src/components/purchase/
  RfqFormDialog.tsx                             ← Task 7
  ReceivalFormDialog.tsx                        ← Task 8
  ThreeWayMatchTable.tsx                        ← Task 9
  BillFormDialog.tsx                            ← Task 9
  SupplierPaymentDialog.tsx                     ← Task 10
  PaymentPlanDialog.tsx                         ← Task 10

src/components/sales/
  DeliveryFormDialog.tsx                        ← Task 11
  InvoiceDetail.tsx                             ← Task 12
  CustomerPaymentDialog.tsx                     ← Task 13
  CreditNoteFormDialog.tsx                      ← Task 13

src/app/(dashboard)/purchase/
  rfq/page.tsx                                  ← Task 7
  receivals/page.tsx                            ← Task 8
  bills/page.tsx                                ← Task 9
  payments/page.tsx                             ← Task 10

src/app/(dashboard)/sales/
  deliveries/page.tsx                           ← Task 11
  invoices/page.tsx                             ← Task 12
  payments/page.tsx                             ← Task 13
  credit-notes/page.tsx                         ← Task 13
```

**Modified files:**

```
src/components/layout/nav-config.ts             ← Task 3
src/hooks/useSaleOrders.ts                      ← Task 14 (useConfirmSO extended)
```

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260419000000_purchase_sales_expansion.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260419000000_purchase_sales_expansion.sql

-- ── 1. Extend invoices ─────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS direction          TEXT NOT NULL DEFAULT 'ar'
    CHECK (direction IN ('ar', 'ap')),
  ADD COLUMN IF NOT EXISTS supplier_id        UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS receival_id        UUID REFERENCES receivals(id),
  ADD COLUMN IF NOT EXISTS sale_order_id      UUID REFERENCES sale_orders(id),
  ADD COLUMN IF NOT EXISTS sale_delivery_id   UUID REFERENCES sale_deliveries(id),
  ADD COLUMN IF NOT EXISTS needs_refresh      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_status         TEXT NOT NULL DEFAULT 'draft'
    CHECK (doc_status IN (
      'draft','ready_to_send','sent',
      'pending_approval','approved','rejected'
    )),
  ADD COLUMN IF NOT EXISTS payment_status     TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN (
      'unpaid','partially_paid','paid','overdue'
    ));

-- Backfill doc_status + payment_status from the legacy status column (AR rows only)
UPDATE invoices SET
  doc_status = CASE
    WHEN status IN ('sent','partially_paid','paid','overdue') THEN 'sent'
    ELSE 'draft'
  END,
  payment_status = CASE
    WHEN status = 'partially_paid' THEN 'partially_paid'
    WHEN status = 'paid'           THEN 'paid'
    WHEN status = 'overdue'        THEN 'overdue'
    ELSE 'unpaid'
  END
WHERE direction = 'ar';

-- ── 2. Extend invoice_line_items ──────────────────────────────────────────
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS match_status TEXT
    CHECK (match_status IN (
      'matched','qty_discrepancy','price_discrepancy','unmatched','accepted_with_note'
    )),
  ADD COLUMN IF NOT EXISTS match_note TEXT;

-- ── 3. Extend payments ────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming','outgoing'));

-- ── 4. Extend customers ───────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── 5. Make sale_deliveries.warehouse_id nullable ─────────────────────────
-- Allows creating a stub delivery at SO confirm time (warehouse assigned later)
ALTER TABLE sale_deliveries
  ALTER COLUMN warehouse_id DROP NOT NULL;

-- ── 6. Create credit_note_lines ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id  UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES invoice_line_items(id),
  description     TEXT NOT NULL,
  qty             NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Create payment_plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('schedule','adhoc')),
  total_amount  NUMERIC(12,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 8. Create payment_installments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  due_date     DATE,
  amount       NUMERIC(12,2) NOT NULL,
  paid_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','partial')),
  payment_id   UUID REFERENCES payments(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 9. DB Views ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW customer_invoices AS
  SELECT * FROM invoices WHERE direction = 'ar';

CREATE OR REPLACE VIEW supplier_bills AS
  SELECT * FROM invoices WHERE direction = 'ap';
```

- [ ] **Step 2: Apply migration to Supabase**

```bash
npx supabase db push
```

Expected: `Applying migration 20260419000000_purchase_sales_expansion.sql... done`

If you see a FK error on `invoices.receival_id`, check that `receivals` table exists: `npx supabase db diff --schema public | grep receivals`

- [ ] **Step 3: Verify columns exist**

```bash
npx supabase db diff --schema public 2>/dev/null | grep -E "direction|doc_status|payment_status|needs_refresh|credit_note_lines|payment_plans|payment_installments"
```

Expected: several lines confirming the new columns and tables appear in diff output (or empty if already applied cleanly).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260419000000_purchase_sales_expansion.sql
git commit -m "feat(db): purchase & sales expansion migration — invoices direction/doc_status/payment_status, credit_note_lines, payment_plans, payment_installments"
```

---

## Task 2: TypeScript Invoice Types + Invoice Sync Utility

**Files:**
- Create: `src/types/invoice.ts`
- Create: `src/lib/invoiceSync.ts`
- Create: `src/lib/__tests__/invoiceSync.test.ts`

- [ ] **Step 1: Create `src/types/invoice.ts`**

```typescript
// src/types/invoice.ts

export type DocStatus =
  | 'draft'
  | 'ready_to_send'
  | 'sent'
  | 'pending_approval'
  | 'approved'
  | 'rejected'

export type BillPaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue'

export type MatchStatus =
  | 'matched'
  | 'qty_discrepancy'
  | 'price_discrepancy'
  | 'unmatched'
  | 'accepted_with_note'

export type InvoiceLineItem = {
  id: string
  invoice_id: string
  description: string
  qty: number | null
  unit_price: number | null
  total: number | null
  match_status: MatchStatus | null
  match_note: string | null
}

/** AR invoice — customer-facing, generated from Sale Order */
export type ArInvoice = {
  id: string
  invoice_id: string               // display string e.g. "INV-00001"
  direction: 'ar'
  customer_id: string
  sale_order_id: string | null
  sale_delivery_id: string | null
  doc_status: 'draft' | 'ready_to_send' | 'sent'
  payment_status: BillPaymentStatus
  needs_refresh: boolean
  total_amount: number | null
  subtotal: number | null
  tax: number | null
  issued_date: string
  due_date: string
  notes: string | null
  created_at: string | null
  // joined
  customer_name?: string
  so_number?: string
  invoice_line_items?: InvoiceLineItem[]
}

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

export const PAYMENT_PLAN_THRESHOLD = 10000 // QAR

export type PaymentPlan = {
  id: string
  invoice_id: string
  plan_type: 'schedule' | 'adhoc'
  total_amount: number
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  payment_installments?: PaymentInstallment[]
}

export type PaymentInstallment = {
  id: string
  plan_id: string
  due_date: string | null
  amount: number
  paid_amount: number
  status: 'pending' | 'paid' | 'overdue' | 'partial'
  payment_id: string | null
  created_at: string
}
```

- [ ] **Step 2: Create `src/lib/invoiceSync.ts`**

```typescript
// src/lib/invoiceSync.ts
import { createClient } from '@/lib/supabase/client'

type SOLine = {
  id: string
  item_name: string
  qty: number
  unit_price: number
  total: number
}

type SORow = {
  id: string
  so_number: string
  status: string
  customer_id: string
  sale_order_lines: SOLine[]
}

/**
 * Syncs (or creates) an AR invoice from a Sale Order.
 * Call after SO confirmation and after any SO line edit.
 * Does NOT create the sale_deliveries record — callers handle that separately.
 */
export async function syncInvoiceToSalesOrder(soId: string): Promise<void> {
  const supabase = createClient()

  // Load SO with lines
  const { data: so, error: soErr } = await (supabase as any)
    .from('sale_orders')
    .select('id, so_number, status, customer_id, sale_order_lines(*)')
    .eq('id', soId)
    .single()
  if (soErr || !so) return

  const totalAmount: number = (so.sale_order_lines ?? []).reduce(
    (sum: number, l: SOLine) => sum + (l.total ?? 0),
    0
  )

  // Find existing unpaid invoice for this SO
  const { data: existing } = await (supabase as any)
    .from('invoices')
    .select('id, doc_status, payment_status')
    .eq('sale_order_id', soId)
    .neq('payment_status', 'paid')
    .limit(1)

  const invoice = existing?.[0]

  if (invoice) {
    const isAlreadySent = invoice.doc_status === 'sent'
    const hasActivity =
      invoice.payment_status === 'partially_paid' ||
      invoice.payment_status === 'overdue'
    const needsRefresh = isAlreadySent || hasActivity

    // Rebuild line items
    await (supabase as any)
      .from('invoice_line_items')
      .delete()
      .eq('invoice_id', invoice.id)

    const lines = (so.sale_order_lines as SOLine[]).map((l) => ({
      invoice_id: invoice.id,
      description: l.item_name,
      qty: l.qty,
      unit_price: l.unit_price,
      total: l.total,
    }))
    if (lines.length > 0) {
      await (supabase as any).from('invoice_line_items').insert(lines)
    }

    await (supabase as any)
      .from('invoices')
      .update({ total_amount: totalAmount, subtotal: totalAmount, needs_refresh: needsRefresh })
      .eq('id', invoice.id)
  } else if ((so as SORow).status === 'confirmed') {
    // Create fresh AR invoice
    const { count } = await (supabase as any)
      .from('invoices')
      .select('*', { count: 'exact', head: true })
    const invoiceIdDisplay = `INV-${String((count ?? 0) + 1).padStart(5, '0')}`
    const today = new Date().toISOString().split('T')[0]
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: newInvoice, error: insErr } = await (supabase as any)
      .from('invoices')
      .insert({
        invoice_id: invoiceIdDisplay,
        customer_id: (so as SORow).customer_id,
        direction: 'ar',
        sale_order_id: soId,
        doc_status: 'draft',
        payment_status: 'unpaid',
        needs_refresh: false,
        source: 'order',
        source_id: soId,
        source_label: `SO #${(so as SORow).so_number}`,
        total_amount: totalAmount,
        subtotal: totalAmount,
        tax: 0,
        issued_date: today,
        due_date: due,
        status: 'draft',
      })
      .select()
      .single()
    if (insErr) throw insErr

    const lines = (so.sale_order_lines as SOLine[]).map((l) => ({
      invoice_id: newInvoice.id,
      description: l.item_name,
      qty: l.qty,
      unit_price: l.unit_price,
      total: l.total,
    }))
    if (lines.length > 0) {
      await (supabase as any).from('invoice_line_items').insert(lines)
    }
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to the new files).

- [ ] **Step 4: Commit**

```bash
git add src/types/invoice.ts src/lib/invoiceSync.ts
git commit -m "feat(types): ArInvoice/ApInvoice types + syncInvoiceToSalesOrder utility"
```

---

## Task 3: Nav Config Update

**Files:**
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Update nav-config.ts**

Replace the entire `NAV_ITEMS` array in `src/components/layout/nav-config.ts`:

```typescript
// src/components/layout/nav-config.ts
export type NavItem = {
  label: string
  href: string
  comingSoon?: boolean
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export type NavEntry = {
  label: string
  icon: string
  comingSoon?: boolean
  groups: NavGroup[]
}

export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: 'Database',
    groups: [
      {
        items: [
          { label: 'Companies & Divisions', href: '/master-data/admin/companies' },
          { label: 'Warehouses', href: '/master-data/admin/warehouses' },
          { label: 'Inventory Items', href: '/master-data/inventory' },
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail', href: '/master-data/audit-trail' },
          { label: 'Admin', href: '/master-data/admin' },
        ],
      },
      {
        items: [
          { label: 'Service List', href: '/master-data/services', comingSoon: true },
          { label: 'Team & Employee', href: '/master-data/teams', comingSoon: true },
          { label: 'Subscription Packages', href: '/master-data/subscriptions', comingSoon: true },
          { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
        ],
      },
    ],
  },
  {
    label: 'Orders',
    icon: 'ShoppingCart',
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Contracts',
    icon: 'FileText',
    comingSoon: true,
    groups: [],
  },
  // 'Invoices' top-level coming-soon removed — now under Purchase & Sales
  {
    label: 'Purchase & Sales',
    icon: 'ShoppingBag',
    groups: [
      {
        label: 'PURCHASE',
        items: [
          { label: 'RFQ', href: '/purchase/rfq' },
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Receivals', href: '/purchase/receivals' },
          { label: 'Bills', href: '/purchase/bills' },
          { label: 'Purchase Payments', href: '/purchase/payments' },
        ],
      },
      {
        // separator group — rendered as a thin HR by NavDropdown
        items: [
          { label: 'Approvals', href: '/purchase/approvals' },
          { label: 'Shipments', href: '/purchase/shipments' },
          { label: 'Landed Costs', href: '/purchase/landed-costs' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock' },
          { label: 'Warehouses', href: '/purchase/warehouses' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders', href: '/sales/orders' },
          { label: 'Deliveries', href: '/sales/deliveries' },
          { label: 'Invoices', href: '/sales/invoices' },
          { label: 'Payments', href: '/sales/payments' },
          { label: 'Credit Notes', href: '/sales/credit-notes' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
    ],
  },
  {
    label: 'Teams',
    icon: 'Users',
    comingSoon: true,
    groups: [],
  },
]
```

- [ ] **Step 2: Verify build still passes (nav only)**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/nav-config.ts
git commit -m "feat(nav): expand Purchase & Sales dropdown with 8 new routes, remove top-level Invoices coming-soon"
```

---

## Task 4: Purchase Hooks — useRfqs + useReceivals

**Files:**
- Create: `src/hooks/useRfqs.ts`
- Create: `src/hooks/useReceivals.ts`

### useRfqs.ts

- [ ] **Step 1: Create `src/hooks/useRfqs.ts`**

Note: actual `rfqs` table uses `title`, `suppliers[]` (array of names), `due_date`, `created_date`. Status enum: `draft | sent | received | cancelled`. `rfq_line_items` has `sku` + `target_price` (no `notes`). `rfq_quotes` has `supplier_id`, `items` (JSON), `received_date`, `total_amount`.

```typescript
// src/hooks/useRfqs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type RfqStatus = 'draft' | 'sent' | 'received' | 'cancelled'

export type RfqLineItem = {
  id: string
  rfq_id: string
  item_name: string
  qty: number
  unit: string
  sku: string | null
  target_price: number | null
  created_at: string | null
}

export type RfqQuote = {
  id: string
  rfq_id: string
  supplier_id: string
  supplier_name: string
  currency: string | null
  items: Record<string, unknown>
  total_amount: number | null
  received_date: string | null
  created_at: string | null
}

export type Rfq = {
  id: string
  rfq_number: string
  title: string
  status: RfqStatus | null
  suppliers: string[] | null     // array of supplier name strings
  due_date: string
  created_date: string
  created_at: string | null
  updated_at: string | null
  rfq_line_items?: RfqLineItem[]
  rfq_quotes?: RfqQuote[]
}

export type CreateRfqPayload = {
  title: string
  due_date: string
  suppliers: string[]
  line_items: { item_name: string; qty: number; unit: string; sku: string; target_price: number | null }[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useRfqs(filters?: { status?: RfqStatus | '' }) {
  return useQuery({
    queryKey: ['rfqs', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('rfqs')
        .select('*, rfq_line_items(*), rfq_quotes(*)')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Rfq[]
    },
  })
}

export function useRfq(id: string | null) {
  return useQuery({
    queryKey: ['rfq', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('rfqs')
        .select('*, rfq_line_items(*), rfq_quotes(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Rfq
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateRfqPayload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('rfqs')
        .select('*', { count: 'exact', head: true })
      const rfq_number = `RFQ-${String((count ?? 0) + 1).padStart(5, '0')}`
      const today = new Date().toISOString().split('T')[0]

      const { data: rfq, error } = await (supabase as any)
        .from('rfqs')
        .insert({
          rfq_number,
          title: payload.title,
          due_date: payload.due_date,
          created_date: today,
          suppliers: payload.suppliers,
          status: 'draft',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('rfq_line_items')
          .insert(payload.line_items.map((li) => ({ rfq_id: rfq.id, ...li })))
        if (liErr) throw liErr
      }
      return rfq as Rfq
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}

export function useUpdateRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      ...rest
    }: Partial<CreateRfqPayload> & { id: string; status?: RfqStatus }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('rfqs')
        .update({ ...(status ? { status } : {}), ...rest })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}

export function useCreateRfqQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      rfq_id: string
      supplier_id: string
      supplier_name: string
      currency: string
      items: Record<string, unknown>
      total_amount: number
      received_date: string
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('rfq_quotes').insert(payload)
      if (error) throw error
      // Mark RFQ as received when a quote is added
      await (supabase as any)
        .from('rfqs')
        .update({ status: 'received' })
        .eq('id', payload.rfq_id)
    },
    onSuccess: (_data: unknown, vars: { rfq_id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      queryClient.invalidateQueries({ queryKey: ['rfq', vars.rfq_id] })
    },
  })
}

export function useDeleteRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('rfqs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}
```

### useReceivals.ts

- [ ] **Step 2: Create `src/hooks/useReceivals.ts`**

Note: `receivals.po_id` is the FK (not `purchase_order_id`). `receival_items` has `po_line_item_id`, `unit_cost`, `is_free`.

```typescript
// src/hooks/useReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ReceivalStatus = 'pending_approval' | 'approved' | 'rejected'

export type ReceivalItem = {
  id: string
  receival_id: string
  po_line_item_id: string | null
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
  is_free: boolean | null
  // UI-computed: ordered qty comes from po_line_items join
  ordered_qty?: number
}

export type Receival = {
  id: string
  receival_number: string
  po_id: string
  warehouse_id: string
  date: string
  status: ReceivalStatus | null
  notes: string | null
  received_by_name: string | null
  created_at: string | null
  receival_items?: ReceivalItem[]
  // joined
  po_number?: string
  supplier_name?: string
}

export type CreateReceivalPayload = {
  po_id: string
  warehouse_id: string
  date: string
  notes: string
  items: {
    po_line_item_id: string | null
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
  }[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useReceivals(filters?: { status?: ReceivalStatus | '' }) {
  return useQuery({
    queryKey: ['receivals', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select(`
          *,
          receival_items(*),
          purchase_orders!receivals_po_id_fkey(po_number, suppliers(name))
        `)
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        po_number: r.purchase_orders?.po_number ?? null,
        supplier_name: r.purchase_orders?.suppliers?.name ?? null,
      })) as Receival[]
    },
  })
}

export function useReceival(id: string | null) {
  return useQuery({
    queryKey: ['receival', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select(`
          *,
          receival_items(*),
          purchase_orders!receivals_po_id_fkey(po_number, po_line_items(*), suppliers(name))
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      // Attach ordered_qty from PO line items
      const poLines: any[] = data.purchase_orders?.po_line_items ?? []
      const items = (data.receival_items ?? []).map((ri: any) => {
        const matched = poLines.find((pl: any) => pl.id === ri.po_line_item_id)
        return { ...ri, ordered_qty: matched?.qty ?? null }
      })
      return { ...data, receival_items: items } as Receival
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateReceivalPayload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('receivals')
        .select('*', { count: 'exact', head: true })
      const receival_number = `RCV-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: receival, error } = await (supabase as any)
        .from('receivals')
        .insert({
          receival_number,
          po_id: payload.po_id,
          warehouse_id: payload.warehouse_id,
          date: payload.date,
          notes: payload.notes || null,
          status: 'pending_approval',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.items.length > 0) {
        const { error: iErr } = await (supabase as any)
          .from('receival_items')
          .insert(
            payload.items.map((it) => ({
              receival_id: receival.id,
              po_line_item_id: it.po_line_item_id,
              item_name: it.item_name,
              sku: it.sku,
              qty_received: it.qty_received,
              unit_cost: it.unit_cost,
            }))
          )
        if (iErr) throw iErr
      }
      return receival as Receival
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receivals'] }),
  })
}

export function useApproveReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approved' | 'rejected' }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('receivals')
        .update({ status: action })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receivals'] }),
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRfqs.ts src/hooks/useReceivals.ts
git commit -m "feat(hooks): useRfqs (CRUD + quotes) and useReceivals (create/approve) hooks"
```

---

---

## Task 5: Purchase Hooks — useSupplierBills + useSupplierPayments + usePaymentPlans

**Files:**
- Create: `src/hooks/useSupplierBills.ts`
- Create: `src/hooks/useSupplierPayments.ts`
- Create: `src/hooks/usePaymentPlans.ts`

### useSupplierBills.ts

- [ ] **Step 1: Create `src/hooks/useSupplierBills.ts`**

```typescript
// src/hooks/useSupplierBills.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApInvoice, InvoiceLineItem } from '@/types/invoice'

export type { ApInvoice }

export type BillFilters = {
  search?: string
  doc_status?: ApInvoice['doc_status'] | ''
  payment_status?: ApInvoice['payment_status'] | ''
}

export function useSupplierBills(filters?: BillFilters) {
  return useQuery({
    queryKey: ['supplier-bills', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('supplier_bills')           // queries the VIEW
        .select(`
          *,
          invoice_line_items(*),
          suppliers(name),
          purchase_orders(po_number)
        `)
        .order('created_at', { ascending: false })
      if (filters?.doc_status) q = q.eq('doc_status', filters.doc_status)
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) {
        q = q.or(`invoice_id.ilike.%${filters.search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        ...b,
        supplier_name: b.suppliers?.name ?? null,
        po_number: b.purchase_orders?.po_number ?? null,
      })) as ApInvoice[]
    },
  })
}

export function useSupplierBill(id: string | null) {
  return useQuery({
    queryKey: ['supplier-bill', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('supplier_bills')
        .select('*, invoice_line_items(*), suppliers(name), purchase_orders(po_number, po_line_items(*))')
        .eq('id', id)
        .single()
      if (error) throw error
      return {
        ...data,
        supplier_name: data.suppliers?.name ?? null,
        po_number: data.purchase_orders?.po_number ?? null,
      } as ApInvoice
    },
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      supplier_id: string
      purchase_order_id: string
      receival_id: string | null
      due_date: string
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
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'ap')
      const invoiceIdDisplay = `BILL-${String((count ?? 0) + 1).padStart(5, '0')}`
      const today = new Date().toISOString().split('T')[0]
      const totalAmount = payload.line_items.reduce((s, l) => s + l.total, 0)

      const { data: bill, error } = await (supabase as any)
        .from('invoices')
        .insert({
          invoice_id: invoiceIdDisplay,
          direction: 'ap',
          supplier_id: payload.supplier_id,
          purchase_order_id: payload.purchase_order_id,
          receival_id: payload.receival_id,
          doc_status: 'draft',
          payment_status: 'unpaid',
          needs_refresh: false,
          source: 'order',
          source_id: payload.purchase_order_id,
          // invoices.customer_id is required — use a placeholder UUID for AP bills
          // and store the real party via supplier_id
          customer_id: '00000000-0000-0000-0000-000000000000',
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax: 0,
          issued_date: today,
          due_date: payload.due_date,
          notes: payload.notes || null,
          status: 'draft',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('invoice_line_items')
          .insert(
            payload.line_items.map((l) => ({
              invoice_id: bill.id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
              total: l.total,
              match_status: l.match_status,
              match_note: l.match_note,
            }))
          )
        if (liErr) throw liErr
      }
      return bill as ApInvoice
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplier-bills'] }),
  })
}

export function useApproveBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'pending_approval' | 'approved' | 'rejected'
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ doc_status: action })
        .eq('id', id)
        .eq('direction', 'ap')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
    },
  })
}
```

### useSupplierPayments.ts

- [ ] **Step 2: Create `src/hooks/useSupplierPayments.ts`**

Note: `payments` table requires `invoice_id` (FK to `invoices.id`) and `payment_id` (display string). The `direction` column is added by migration.

```typescript
// src/hooks/useSupplierPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type SupplierPayment = {
  id: string
  payment_id: string
  invoice_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'outgoing'
  status: string | null
  created_at: string | null
  // joined
  invoice_display?: string   // invoice_id (display)
  supplier_name?: string
}

export function useSupplierPayments(billId?: string) {
  return useQuery({
    queryKey: ['supplier-payments', billId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('*, invoices(invoice_id, suppliers(name))')
        .eq('direction', 'outgoing')
        .order('date', { ascending: false })
      if (billId) q = q.eq('invoice_id', billId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        invoice_display: p.invoices?.invoice_id ?? null,
        supplier_name: p.invoices?.suppliers?.name ?? null,
      })) as SupplierPayment[]
    },
  })
}

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string        // UUID (invoices.id)
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
      const payment_id = `SPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          notes: payload.notes,
          direction: 'outgoing',
          status: 'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute bill payment_status
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'outgoing')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: bill } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (bill?.total_amount ?? Infinity)
          ? 'paid'
          : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid'

      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', payload.invoice_id)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
    },
  })
}
```

### usePaymentPlans.ts

- [ ] **Step 3: Create `src/hooks/usePaymentPlans.ts`**

```typescript
// src/hooks/usePaymentPlans.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PaymentPlan, PaymentInstallment } from '@/types/invoice'

export type { PaymentPlan, PaymentInstallment }

export function usePaymentPlans(invoiceId: string | null) {
  return useQuery({
    queryKey: ['payment-plans', invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payment_plans')
        .select('*, payment_installments(*)')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PaymentPlan[]
    },
  })
}

export function useCreatePaymentPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      plan_type: 'schedule' | 'adhoc'
      total_amount: number
      installments: { due_date: string | null; amount: number }[]
    }) => {
      const supabase = createClient()
      const { data: plan, error } = await (supabase as any)
        .from('payment_plans')
        .insert({
          invoice_id: payload.invoice_id,
          plan_type: payload.plan_type,
          total_amount: payload.total_amount,
          status: 'active',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.installments.length > 0) {
        const { error: iErr } = await (supabase as any)
          .from('payment_installments')
          .insert(
            payload.installments.map((inst) => ({
              plan_id: plan.id,
              due_date: inst.due_date,
              amount: inst.amount,
              paid_amount: 0,
              status: 'pending',
            }))
          )
        if (iErr) throw iErr
      }
      return plan as PaymentPlan
    },
    onSuccess: (_: unknown, vars: { invoice_id: string }) =>
      queryClient.invalidateQueries({ queryKey: ['payment-plans', vars.invoice_id] }),
  })
}

export function useSettleInstallment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      installment_id: string
      plan_id: string
      invoice_id: string
      amount_paid: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
      date: string
      reference: string | null
      direction: 'incoming' | 'outgoing'
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
      const payment_id = `PAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: payment, error: payErr } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount_paid,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          direction: payload.direction,
          status: 'completed',
        })
        .select()
        .single()
      if (payErr) throw payErr

      await (supabase as any)
        .from('payment_installments')
        .update({
          paid_amount: payload.amount_paid,
          status: 'paid',
          payment_id: payment.id,
        })
        .eq('id', payload.installment_id)

      // Check if plan is fully settled
      const { data: installments } = await (supabase as any)
        .from('payment_installments')
        .select('status')
        .eq('plan_id', payload.plan_id)
      const allPaid = (installments ?? []).every((i: any) => i.status === 'paid')
      if (allPaid) {
        await (supabase as any)
          .from('payment_plans')
          .update({ status: 'completed' })
          .eq('id', payload.plan_id)
      }
    },
    onSuccess: (_: unknown, vars: { invoice_id: string; plan_id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['payment-plans', vars.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
    },
  })
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupplierBills.ts src/hooks/useSupplierPayments.ts src/hooks/usePaymentPlans.ts
git commit -m "feat(hooks): useSupplierBills, useSupplierPayments, usePaymentPlans"
```

---

## Task 6: Sales Hooks — useSaleDeliveries + useCustomerInvoices + useCustomerPayments + useCreditNotes

**Files:**
- Create: `src/hooks/useSaleDeliveries.ts`
- Create: `src/hooks/useCustomerInvoices.ts`
- Create: `src/hooks/useCustomerPayments.ts`
- Create: `src/hooks/useCreditNotes.ts`

### useSaleDeliveries.ts

- [ ] **Step 1: Create `src/hooks/useSaleDeliveries.ts`**

Note: `sale_delivery_status` enum is `pending | in_progress | delivered | cancelled`. `warehouse_id` is nullable after migration. `items` is JSON.

```typescript
// src/hooks/useSaleDeliveries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type DeliveryStatus = 'pending' | 'in_progress' | 'delivered' | 'cancelled'

export type DeliveryItem = {
  item_name: string
  sku: string | null
  qty_delivered: number
  brand_variant_id: string | null
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string | null
  warehouse_name: string | null
  date: string
  items: DeliveryItem[]
  status: DeliveryStatus | null
  created_by_name: string | null
  created_at: string
  // joined
  so_number?: string
  customer_name?: string
}

export function useSaleDeliveries(filters?: { status?: DeliveryStatus | '' }) {
  return useQuery({
    queryKey: ['sale-deliveries', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('sale_deliveries')
        .select('*, sale_orders(so_number, customers(name))')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((d: any) => ({
        ...d,
        so_number: d.sale_orders?.so_number ?? null,
        customer_name: d.sale_orders?.customers?.name ?? null,
      })) as SaleDelivery[]
    },
  })
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string
      warehouse_id?: string
      warehouse_name?: string
      date?: string
      items?: DeliveryItem[]
      status?: DeliveryStatus
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('sale_deliveries')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] }),
  })
}

export function useCompleteDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      invoiceId,
      remainingItems,
    }: {
      deliveryId: string
      soId: string
      invoiceId: string | null   // linked AR invoice, if any
      remainingItems: DeliveryItem[]  // items with qty not yet delivered (for follow-up)
    }) => {
      const supabase = createClient()
      // Mark delivery as delivered
      const { error } = await (supabase as any)
        .from('sale_deliveries')
        .update({ status: 'delivered' })
        .eq('id', deliveryId)
      if (error) throw error

      // Update linked invoice doc_status if not flagged for refresh
      if (invoiceId) {
        const { data: inv } = await (supabase as any)
          .from('invoices')
          .select('needs_refresh, doc_status')
          .eq('id', invoiceId)
          .single()

        if (inv && !inv.needs_refresh && inv.doc_status === 'draft') {
          await (supabase as any)
            .from('invoices')
            .update({ doc_status: 'ready_to_send' })
            .eq('id', invoiceId)
        }
        // If needs_refresh=true or already sent: do not change doc_status
      }

      // Create follow-up delivery stub for remaining items (partial delivery)
      if (remainingItems.length > 0) {
        const { data: orig } = await (supabase as any)
          .from('sale_deliveries')
          .select('sale_order_id')
          .eq('id', deliveryId)
          .single()
        if (orig) {
          const { count } = await (supabase as any)
            .from('sale_deliveries')
            .select('*', { count: 'exact', head: true })
          const delivery_number = `DEL-${String((count ?? 0) + 1).padStart(5, '0')}`
          await (supabase as any).from('sale_deliveries').insert({
            delivery_number,
            sale_order_id: orig.sale_order_id,
            warehouse_id: null,
            date: new Date().toISOString().split('T')[0],
            items: remainingItems,
            status: 'pending',
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

### useCustomerInvoices.ts

- [ ] **Step 2: Create `src/hooks/useCustomerInvoices.ts`**

```typescript
// src/hooks/useCustomerInvoices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ArInvoice } from '@/types/invoice'

export type { ArInvoice }

export type ArFilters = {
  search?: string
  doc_status?: ArInvoice['doc_status'] | ''
  payment_status?: ArInvoice['payment_status'] | ''
}

export function useCustomerInvoices(filters?: ArFilters) {
  return useQuery({
    queryKey: ['customer-invoices', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('customer_invoices')   // queries the VIEW
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .order('created_at', { ascending: false })
      if (filters?.doc_status) q = q.eq('doc_status', filters.doc_status)
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) q = q.ilike('invoice_id', `%${filters.search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customers?.name ?? null,
        so_number: inv.sale_orders?.so_number ?? null,
      })) as ArInvoice[]
    },
  })
}

export function useCustomerInvoice(id: string | null) {
  return useQuery({
    queryKey: ['customer-invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customer_invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('id', id)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
        so_number: data.sale_orders?.so_number ?? null,
      } as ArInvoice
    },
  })
}

export function useSendInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ doc_status: 'sent' })
        .eq('id', id)
        .eq('direction', 'ar')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-invoices'] }),
  })
}

export function useDismissRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ needs_refresh: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-invoices'] }),
  })
}
```

### useCustomerPayments.ts

- [ ] **Step 3: Create `src/hooks/useCustomerPayments.ts`**

```typescript
// src/hooks/useCustomerPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CustomerPayment = {
  id: string
  payment_id: string
  invoice_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'incoming'
  status: string | null
  created_at: string | null
  // joined
  invoice_display?: string
  customer_name?: string
}

export function useCustomerPayments(invoiceId?: string) {
  return useQuery({
    queryKey: ['customer-payments', invoiceId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('*, invoices(invoice_id, customers(name))')
        .eq('direction', 'incoming')
        .order('date', { ascending: false })
      if (invoiceId) q = q.eq('invoice_id', invoiceId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        invoice_display: p.invoices?.invoice_id ?? null,
        customer_name: p.invoices?.customers?.name ?? null,
      })) as CustomerPayment[]
    },
  })
}

export function useCreateCustomerPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer' | 'pos'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'incoming')
      const payment_id = `CPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          notes: payload.notes,
          direction: 'incoming',
          status: 'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute invoice payment_status
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'incoming')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (inv?.total_amount ?? Infinity)
          ? 'paid'
          : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid'

      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', payload.invoice_id)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

### useCreditNotes.ts

- [ ] **Step 4: Create `src/hooks/useCreditNotes.ts`**

Note: existing `credit_notes` table has `credit_note_id` (display), `customer_name`, `invoice_id`, `reason`, `type`, `status` enum (`draft | approved | issued | redeemed`). The new `credit_note_lines` table holds individual credit lines. `customers.credit_balance` is new from migration.

```typescript
// src/hooks/useCreditNotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditNoteStatus = 'draft' | 'approved' | 'issued' | 'redeemed'

export type CreditNoteLine = {
  id: string
  credit_note_id: string
  invoice_line_id: string | null
  description: string
  qty: number
  unit_price: number
  total: number
  created_at: string
}

export type CreditNote = {
  id: string
  credit_note_id: string
  invoice_id: string
  customer_name: string
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  created_at: string
  updated_at: string
  credit_note_lines?: CreditNoteLine[]
  // joined
  invoice_display?: string
}

export type CreateCreditNotePayload = {
  invoice_id: string
  customer_name: string
  reason: string
  lines: {
    invoice_line_id: string | null
    description: string
    qty: number
    unit_price: number
  }[]
}

export function useCreditNotes() {
  return useQuery({
    queryKey: ['credit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*, credit_note_lines(*), invoices(invoice_id)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        invoice_display: cn.invoices?.invoice_id ?? null,
      })) as CreditNote[]
    },
  })
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCreditNotePayload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('credit_notes')
        .select('*', { count: 'exact', head: true })
      const credit_note_id = `CN-${String((count ?? 0) + 1).padStart(5, '0')}`
      const totalAmount = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

      const { data: cn, error } = await (supabase as any)
        .from('credit_notes')
        .insert({
          credit_note_id,
          invoice_id: payload.invoice_id,
          customer_name: payload.customer_name,
          reason: payload.reason,
          type: 'manual',
          status: 'draft',
          total_amount: totalAmount,
        })
        .select()
        .single()
      if (error) throw error

      if (payload.lines.length > 0) {
        const { error: lErr } = await (supabase as any)
          .from('credit_note_lines')
          .insert(
            payload.lines.map((l) => ({
              credit_note_id: cn.id,
              invoice_line_id: l.invoice_line_id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
            }))
          )
        if (lErr) throw lErr
      }
      return cn as CreditNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-notes'] }),
  })
}

export function useApplyCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient()
      // Get CN total and invoice outstanding
      const { data: cn } = await (supabase as any)
        .from('credit_notes')
        .select('total_amount, invoice_id')
        .eq('id', id)
        .single()

      const { data: payments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId)
        .eq('direction', 'incoming')
      const alreadyPaid = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount, customer_id')
        .eq('id', invoiceId)
        .single()
      const outstanding = (inv?.total_amount ?? 0) - alreadyPaid
      const cnTotal = cn?.total_amount ?? 0
      const excess = Math.max(0, cnTotal - outstanding)

      // Record credit note as a payment
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
      const payment_id = `CPAY-${String((count ?? 0) + 1).padStart(5, '0')}`
      await (supabase as any).from('payments').insert({
        payment_id,
        invoice_id: invoiceId,
        amount: Math.min(cnTotal, outstanding),
        method: 'online',
        date: new Date().toISOString().split('T')[0],
        notes: `Credit note ${cn.credit_note_id ?? id} applied`,
        direction: 'incoming',
        status: 'completed',
      })

      // If excess: store in customers.credit_balance
      if (excess > 0 && inv?.customer_id) {
        await (supabase as any).rpc('increment_credit_balance', {
          p_customer_id: inv.customer_id,
          p_amount: excess,
        })
      }

      // Mark credit note as redeemed
      await (supabase as any)
        .from('credit_notes')
        .update({ status: 'redeemed' })
        .eq('id', id)

      // Update invoice payment_status
      const newPaid = alreadyPaid + Math.min(cnTotal, outstanding)
      const newStatus =
        newPaid >= (inv?.total_amount ?? Infinity) ? 'paid' : 'partially_paid'
      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoiceId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSaleDeliveries.ts src/hooks/useCustomerInvoices.ts src/hooks/useCustomerPayments.ts src/hooks/useCreditNotes.ts
git commit -m "feat(hooks): useSaleDeliveries, useCustomerInvoices, useCustomerPayments, useCreditNotes"
```

---

## Task 7: RFQ Components + Page

**Files:**
- Create: `src/components/purchase/RfqFormDialog.tsx`
- Create: `src/app/(dashboard)/purchase/rfq/page.tsx`

### RfqFormDialog

- [ ] **Step 1: Create `src/components/purchase/RfqFormDialog.tsx`**

```tsx
// src/components/purchase/RfqFormDialog.tsx
'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateRfq, useUpdateRfq, type Rfq } from '@/hooks/useRfqs'

const lineSchema = z.object({
  item_name: z.string().min(1, 'Required'),
  qty: z.coerce.number().positive('Must be > 0'),
  unit: z.string().min(1, 'Required'),
  sku: z.string().optional(),
  target_price: z.coerce.number().nullable().optional(),
})

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  due_date: z.string().min(1, 'Due date is required'),
  suppliers: z.string().min(1, 'At least one supplier name'),
  line_items: z.array(lineSchema).min(1, 'Add at least one item'),
})

type FormData = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  rfq?: Rfq | null
}

export function RfqFormDialog({ open, onOpenChange, rfq }: Props) {
  const isEdit = !!rfq
  const createRfq = useCreateRfq()
  const updateRfq = useUpdateRfq()
  const [saving, setSaving] = useState(false)

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: rfq?.title ?? '',
      due_date: rfq?.due_date ?? '',
      suppliers: rfq?.suppliers?.join(', ') ?? '',
      line_items: rfq?.rfq_line_items?.map((li) => ({
        item_name: li.item_name,
        qty: li.qty,
        unit: li.unit,
        sku: li.sku ?? '',
        target_price: li.target_price,
      })) ?? [{ item_name: '', qty: 1, unit: 'pcs', sku: '', target_price: null }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' })

  const close = () => { reset(); onOpenChange(false) }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      const suppliers = data.suppliers.split(',').map((s) => s.trim()).filter(Boolean)
      const line_items = data.line_items.map((li) => ({
        item_name: li.item_name,
        qty: li.qty,
        unit: li.unit,
        sku: li.sku ?? '',
        target_price: li.target_price ?? null,
      }))
      if (isEdit && rfq) {
        await updateRfq.mutateAsync({ id: rfq.id, title: data.title, due_date: data.due_date, suppliers })
      } else {
        await createRfq.mutateAsync({ title: data.title, due_date: data.due_date, suppliers, line_items })
      }
      toast.success(isEdit ? 'RFQ updated' : 'RFQ created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit RFQ' : 'Create RFQ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input {...register('title')} placeholder="e.g. Office Supplies Q2" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" {...register('due_date')} />
              {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Suppliers (comma-separated names) *</Label>
            <Input {...register('suppliers')} placeholder="ABC Supplies, XYZ Trading" />
            {errors.suppliers && <p className="text-xs text-destructive">{errors.suppliers.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ item_name: '', qty: 1, unit: 'pcs', sku: '', target_price: null })}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <Input {...register(`line_items.${idx}.item_name`)} placeholder="Item name" />
                </div>
                <div className="col-span-2">
                  <Input type="number" {...register(`line_items.${idx}.qty`)} placeholder="Qty" min={1} />
                </div>
                <div className="col-span-2">
                  <Input {...register(`line_items.${idx}.unit`)} placeholder="Unit" />
                </div>
                <div className="col-span-2">
                  <Input {...register(`line_items.${idx}.sku`)} placeholder="SKU" />
                </div>
                <div className="col-span-1">
                  <Input type="number" {...register(`line_items.${idx}.target_price`)} placeholder="Price" step="0.01" />
                </div>
                <div className="col-span-1 flex justify-center pt-1">
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create RFQ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### RFQ Page

- [ ] **Step 2: Create `src/app/(dashboard)/purchase/rfq/page.tsx`**

```tsx
// src/app/(dashboard)/purchase/rfq/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { RfqFormDialog } from '@/components/purchase/RfqFormDialog'
import { useRfqs, useUpdateRfq, type Rfq, type RfqStatus } from '@/hooks/useRfqs'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<RfqStatus, { label: string; className: string }> = {
  draft:      { label: 'Draft',     className: 'bg-slate-100 text-slate-700' },
  sent:       { label: 'Sent',      className: 'bg-blue-100 text-blue-700' },
  received:   { label: 'Received',  className: 'bg-amber-100 text-amber-700' },
  cancelled:  { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: RfqStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function RfqPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RfqStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editRfq, setEditRfq] = useState<Rfq | null>(null)

  const { data: rfqs, isLoading } = useRfqs({ status: statusFilter })
  const updateRfq = useUpdateRfq()

  const filtered = useMemo(() => {
    if (!search) return rfqs ?? []
    const q = search.toLowerCase()
    return (rfqs ?? []).filter(
      (r) => r.rfq_number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
    )
  }, [rfqs, search])

  const columns = useMemo<ColumnDef<Rfq>[]>(() => [
    {
      accessorKey: 'rfq_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="RFQ #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.getValue('rfq_number')}</span>
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due Date" />,
      cell: ({ row }) => formatDate(row.getValue('due_date')),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => (row.original.rfq_line_items?.length ?? 0) + ' items',
    },
    {
      id: 'suppliers',
      header: 'Suppliers',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {(row.original.suppliers ?? []).slice(0, 2).join(', ')}
          {(row.original.suppliers?.length ?? 0) > 2 ? ` +${row.original.suppliers!.length - 2}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as RfqStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
        return <Badge className={cn('text-xs font-medium', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditRfq(row.original)}>
            Edit
          </Button>
          {row.original.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await updateRfq.mutateAsync({ id: row.original.id, status: 'sent' })
                toast.success('RFQ marked as sent')
              }}
            >
              Mark Sent
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(
                `/purchase/orders/create?rfq_ref=${row.original.rfq_number}`
              )
            }
          >
            <ExternalLink className="w-3 h-3 mr-1" /> Ref on PO
          </Button>
        </div>
      ),
    },
  ], [router, updateRfq])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="RFQ"
        subtitle="Request for Quotation"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create RFQ
          </Button>
        }
      />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search RFQ # or title…" />

      <DataTable columns={columns} data={filtered} isLoading={isLoading} />

      <RfqFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editRfq && (
        <RfqFormDialog
          open={!!editRfq}
          onOpenChange={(v) => { if (!v) setEditRfq(null) }}
          rfq={editRfq}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/RfqFormDialog.tsx src/app/"(dashboard)"/purchase/rfq/page.tsx
git commit -m "feat(purchase): RFQ list page with status chips + create/edit dialog"
```

---

---

## Task 8: Receivals Components + Page

**Files:**
- Create: `src/components/purchase/ReceivalFormDialog.tsx`
- Create: `src/app/(dashboard)/purchase/receivals/page.tsx`

### ReceivalFormDialog

- [ ] **Step 1: Create `src/components/purchase/ReceivalFormDialog.tsx`**

Pre-fills expected lines from PO line items when a PO is selected.

```tsx
// src/components/purchase/ReceivalFormDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateReceival } from '@/hooks/useReceivals'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'

type DraftLine = {
  po_line_item_id: string | null
  item_name: string
  sku: string | null
  ordered_qty: number
  qty_received: number
  unit_cost: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function ReceivalFormDialog({ open, onOpenChange }: Props) {
  const createReceival = useCreateReceival()
  const { data: orders } = usePurchaseOrders({ status: 'approved' })
  const { data: warehouses } = useWarehouses()

  const [selectedPoId, setSelectedPoId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)

  // Pre-fill lines when PO is selected
  useEffect(() => {
    if (!selectedPoId) { setLines([]); return }
    const po = (orders ?? []).find((o) => o.id === selectedPoId)
    if (!po) return
    setLines(
      (po.po_line_items ?? []).map((li: any) => ({
        po_line_item_id: li.id,
        item_name: li.item_name ?? li.description ?? '',
        sku: li.sku ?? null,
        ordered_qty: li.qty ?? 0,
        qty_received: li.qty ?? 0,
        unit_cost: li.unit_price ?? 0,
      }))
    )
  }, [selectedPoId, orders])

  const close = () => {
    setSelectedPoId(''); setWarehouseId(''); setNotes(''); setLines([])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedPoId || !warehouseId || !date) {
      toast.error('Select PO, warehouse, and date')
      return
    }
    if (lines.some((l) => l.qty_received <= 0)) {
      toast.error('All received quantities must be > 0')
      return
    }
    setSaving(true)
    try {
      await createReceival.mutateAsync({
        po_id: selectedPoId,
        warehouse_id: warehouseId,
        date,
        notes,
        items: lines.map((l) => ({
          po_line_item_id: l.po_line_item_id,
          item_name: l.item_name,
          sku: l.sku,
          qty_received: l.qty_received,
          unit_cost: l.unit_cost,
        })),
      })
      toast.success('Receival submitted for approval')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const approvablePOs = (orders ?? []).filter((o) =>
    o.status === 'approved' || o.status === 'partially_received'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Receival</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Purchase Order *</Label>
              <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select PO" />
                </SelectTrigger>
                <SelectContent>
                  {approvablePOs.map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.po_number} — {(po as any).supplier_name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-2">Item</th>
                    <th className="text-right py-2 px-2">Ordered</th>
                    <th className="text-right py-2 px-2">Qty Received *</th>
                    <th className="text-right py-2 pl-2">Unit Cost *</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{line.item_name}</span>
                        {line.sku && <span className="text-muted-foreground ml-1">({line.sku})</span>}
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_qty}</td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="w-24 text-right ml-auto"
                          value={line.qty_received}
                          min={0}
                          max={line.ordered_qty}
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], qty_received: Number(e.target.value) }
                            setLines(updated)
                          }}
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <Input
                          type="number"
                          className="w-28 text-right ml-auto"
                          value={line.unit_cost}
                          min={0}
                          step="0.01"
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], unit_cost: Number(e.target.value) }
                            setLines(updated)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!selectedPoId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Select a PO to load expected line items
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedPoId || lines.length === 0}>
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Receivals Page

- [ ] **Step 2: Create `src/app/(dashboard)/purchase/receivals/page.tsx`**

```tsx
// src/app/(dashboard)/purchase/receivals/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ReceivalFormDialog } from '@/components/purchase/ReceivalFormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useReceivals, useApproveReceival, type Receival, type ReceivalStatus } from '@/hooks/useReceivals'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<ReceivalStatus, { label: string; className: string }> = {
  pending_approval: { label: 'Pending',  className: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected:         { label: 'Rejected', className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: ReceivalStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function ReceivalsPage() {
  const [statusFilter, setStatusFilter] = useState<ReceivalStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [approving, setApproving] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null)

  const { data: receivals, isLoading } = useReceivals({ status: statusFilter })
  const approveReceival = useApproveReceival()

  const columns = useMemo<ColumnDef<Receival>[]>(() => [
    {
      accessorKey: 'receival_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Receival #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('receival_number')}</span>,
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => row.original.po_number ?? '—',
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => `${row.original.receival_items?.length ?? 0} lines`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as ReceivalStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pending_approval
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) =>
        row.original.status === 'pending_approval' ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-green-600 hover:text-green-700"
              onClick={() => setApproving({ id: row.original.id, action: 'approved' })}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setApproving({ id: row.original.id, action: 'rejected' })}
            >
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
          </div>
        ) : null,
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Receivals"
        subtitle="Goods received from Purchase Orders"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Receival
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={receivals ?? []} isLoading={isLoading} />

      <ReceivalFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {approving && (
        <ConfirmDialog
          open
          title={approving.action === 'approved' ? 'Approve Receival?' : 'Reject Receival?'}
          description={
            approving.action === 'approved'
              ? 'This will mark the receival as approved and allow bill creation against it.'
              : 'This will reject the receival. It cannot be undone.'
          }
          confirmLabel={approving.action === 'approved' ? 'Approve' : 'Reject'}
          variant={approving.action === 'rejected' ? 'destructive' : 'default'}
          onConfirm={async () => {
            await approveReceival.mutateAsync({ id: approving.id, action: approving.action })
            toast.success(approving.action === 'approved' ? 'Receival approved' : 'Receival rejected')
            setApproving(null)
          }}
          onCancel={() => setApproving(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/ReceivalFormDialog.tsx "src/app/(dashboard)/purchase/receivals/page.tsx"
git commit -m "feat(purchase): Receivals page — create + approve/reject, pre-filled from PO lines"
```

---

## Task 9: Bills Components + Page

**Files:**
- Create: `src/components/purchase/ThreeWayMatchTable.tsx`
- Create: `src/components/purchase/BillFormDialog.tsx`
- Create: `src/app/(dashboard)/purchase/bills/page.tsx`

### ThreeWayMatchTable

- [ ] **Step 1: Create `src/components/purchase/ThreeWayMatchTable.tsx`**

```tsx
// src/components/purchase/ThreeWayMatchTable.tsx
'use client'

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MatchStatus } from '@/types/invoice'

export type MatchLine = {
  id: string                    // po_line_item id (used as key)
  description: string
  // Ordered (from PO)
  ordered_qty: number
  ordered_unit_price: number
  // Received (from receival)
  received_qty: number | null
  // Billed (user enters)
  billed_qty: number
  billed_unit_price: number
  // Computed
  match_status: MatchStatus
  match_note: string
}

function computeMatchStatus(line: Pick<MatchLine, 'ordered_qty' | 'ordered_unit_price' | 'received_qty' | 'billed_qty' | 'billed_unit_price'>): MatchStatus {
  if (line.received_qty === null) return 'unmatched'
  if (line.billed_qty !== line.received_qty) return 'qty_discrepancy'
  if (Math.abs(line.billed_unit_price - line.ordered_unit_price) > 0.001) return 'price_discrepancy'
  return 'matched'
}

const MATCH_CONFIG: Record<MatchStatus, { icon: React.ReactNode; className: string; label: string }> = {
  matched:           { icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-green-600', label: 'Matched' },
  qty_discrepancy:   { icon: <AlertTriangle className="w-4 h-4" />, className: 'text-amber-600', label: 'Qty Discrepancy' },
  price_discrepancy: { icon: <AlertTriangle className="w-4 h-4" />, className: 'text-amber-600', label: 'Price Discrepancy' },
  unmatched:         { icon: <XCircle className="w-4 h-4" />, className: 'text-red-600', label: 'Unmatched' },
  accepted_with_note:{ icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-blue-600', label: 'Accepted' },
}

type Props = {
  lines: MatchLine[]
  onChange?: (lines: MatchLine[]) => void
  readOnly?: boolean
}

export function ThreeWayMatchTable({ lines, onChange, readOnly = false }: Props) {
  const update = (idx: number, patch: Partial<MatchLine>) => {
    if (!onChange) return
    const updated = lines.map((l, i) => {
      if (i !== idx) return l
      const merged = { ...l, ...patch }
      merged.match_status = merged.match_status === 'accepted_with_note'
        ? 'accepted_with_note'
        : computeMatchStatus(merged)
      return merged
    })
    onChange(updated)
  }

  const toggleAccept = (idx: number) => {
    const l = lines[idx]
    const next = l.match_status === 'accepted_with_note'
      ? computeMatchStatus(l)
      : 'accepted_with_note' as MatchStatus
    update(idx, { match_status: next, match_note: next === 'accepted_with_note' ? l.match_note : '' })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left py-2 pr-2 min-w-[140px]">Item</th>
            <th className="text-right py-2 px-2">Ord Qty</th>
            <th className="text-right py-2 px-2">Ord Price</th>
            <th className="text-right py-2 px-2">Rcv Qty</th>
            <th className="text-right py-2 px-2">Bill Qty</th>
            <th className="text-right py-2 px-2">Bill Price</th>
            <th className="text-center py-2 px-2 min-w-[120px]">Match</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((line, idx) => {
            const cfg = MATCH_CONFIG[line.match_status]
            const hasDiscrepancy =
              line.match_status === 'qty_discrepancy' ||
              line.match_status === 'price_discrepancy' ||
              line.match_status === 'unmatched'
            return (
              <>
                <tr key={line.id} className="align-middle">
                  <td className="py-2 pr-2 font-medium">{line.description}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_qty}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_unit_price.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">
                    {line.received_qty ?? <span className="text-red-500">—</span>}
                  </td>
                  <td className="py-2 px-2">
                    {readOnly ? (
                      <span className="block text-right">{line.billed_qty}</span>
                    ) : (
                      <Input
                        type="number"
                        className="w-20 text-right ml-auto"
                        value={line.billed_qty}
                        min={0}
                        onChange={(e) => update(idx, { billed_qty: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {readOnly ? (
                      <span className="block text-right">{line.billed_unit_price.toFixed(2)}</span>
                    ) : (
                      <Input
                        type="number"
                        className="w-24 text-right ml-auto"
                        value={line.billed_unit_price}
                        step="0.01"
                        min={0}
                        onChange={(e) => update(idx, { billed_unit_price: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="text-center py-2 px-2">
                    <div className={cn('flex items-center justify-center gap-1', cfg.className)}>
                      {cfg.icon}
                      <span className="text-xs">{cfg.label}</span>
                    </div>
                    {!readOnly && hasDiscrepancy && line.match_status !== 'accepted_with_note' && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-xs h-auto p-0 mt-0.5"
                        onClick={() => toggleAccept(idx)}
                      >
                        Accept with note
                      </Button>
                    )}
                    {!readOnly && line.match_status === 'accepted_with_note' && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-xs h-auto p-0 mt-0.5 text-muted-foreground"
                        onClick={() => toggleAccept(idx)}
                      >
                        Undo
                      </Button>
                    )}
                  </td>
                </tr>
                {line.match_status === 'accepted_with_note' && !readOnly && (
                  <tr key={`${line.id}-note`}>
                    <td colSpan={7} className="pb-2 px-2">
                      <Textarea
                        className="text-xs"
                        rows={2}
                        placeholder="Required: explain why you accept this discrepancy…"
                        value={line.match_note}
                        onChange={(e) => update(idx, { match_note: e.target.value })}
                      />
                    </td>
                  </tr>
                )}
                {line.match_status === 'accepted_with_note' && readOnly && line.match_note && (
                  <tr key={`${line.id}-note-ro`}>
                    <td colSpan={7} className="pb-2 px-2">
                      <p className="text-xs text-blue-700 bg-blue-50 rounded p-2">{line.match_note}</p>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export { computeMatchStatus }
export type { MatchLine as ThreeWayMatchLine }
```

### BillFormDialog

- [ ] **Step 2: Create `src/components/purchase/BillFormDialog.tsx`**

```tsx
// src/components/purchase/BillFormDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThreeWayMatchTable, computeMatchStatus, type MatchLine } from './ThreeWayMatchTable'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useReceivals } from '@/hooks/useReceivals'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function BillFormDialog({ open, onOpenChange }: Props) {
  const createBill = useCreateBill()
  const { data: orders } = usePurchaseOrders({ status: 'approved' })
  const { data: allReceivals } = useReceivals({ status: 'approved' })

  const [selectedPoId, setSelectedPoId] = useState('')
  const [selectedReceivalId, setSelectedReceivalId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<MatchLine[]>([])
  const [saving, setSaving] = useState(false)

  const selectedPO = (orders ?? []).find((o) => o.id === selectedPoId)
  const poReceivals = (allReceivals ?? []).filter((r) => r.po_id === selectedPoId)

  useEffect(() => {
    if (!selectedPoId || !selectedReceivalId) { setLines([]); return }
    const po = selectedPO
    const receival = poReceivals.find((r) => r.id === selectedReceivalId)
    if (!po || !receival) return

    const poLines: any[] = (po as any).po_line_items ?? []
    setLines(
      poLines.map((pl: any) => {
        const ri = (receival.receival_items ?? []).find(
          (ri) => ri.po_line_item_id === pl.id
        )
        const initial: MatchLine = {
          id: pl.id,
          description: pl.item_name ?? pl.description ?? '',
          ordered_qty: pl.qty ?? 0,
          ordered_unit_price: pl.unit_price ?? 0,
          received_qty: ri ? ri.qty_received : null,
          billed_qty: ri ? ri.qty_received : (pl.qty ?? 0),
          billed_unit_price: pl.unit_price ?? 0,
          match_status: 'matched',
          match_note: '',
        }
        initial.match_status = computeMatchStatus(initial)
        return initial
      })
    )
  }, [selectedPoId, selectedReceivalId])

  const totalAmount = lines.reduce((s, l) => s + l.billed_qty * l.billed_unit_price, 0)
  const canSubmit = lines.every(
    (l) => l.match_status === 'matched' || l.match_status === 'accepted_with_note'
  ) && lines.every(
    (l) => l.match_status !== 'accepted_with_note' || l.match_note.trim().length > 0
  )

  const close = () => {
    setSelectedPoId(''); setSelectedReceivalId(''); setNotes(''); setLines([])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedPO || !dueDate || lines.length === 0) {
      toast.error('Select PO, due date, and ensure lines are loaded')
      return
    }
    if (!canSubmit) {
      toast.error('Resolve all unmatched lines or add acceptance notes')
      return
    }
    setSaving(true)
    try {
      await createBill.mutateAsync({
        supplier_id: (selectedPO as any).supplier_id,
        purchase_order_id: selectedPoId,
        receival_id: selectedReceivalId || null,
        due_date: dueDate,
        notes,
        line_items: lines.map((l) => ({
          description: l.description,
          qty: l.billed_qty,
          unit_price: l.billed_unit_price,
          total: l.billed_qty * l.billed_unit_price,
          match_status: l.match_status,
          match_note: l.match_note || null,
        })),
      })
      toast.success('Bill created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Supplier Bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Purchase Order *</Label>
              <Select value={selectedPoId} onValueChange={(v) => { setSelectedPoId(v); setSelectedReceivalId('') }}>
                <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                <SelectContent>
                  {(orders ?? []).filter((o) => o.status === 'approved' || o.status === 'received' || o.status === 'partially_received').map((po) => (
                    <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Approved Receival</Label>
              <Select value={selectedReceivalId} onValueChange={setSelectedReceivalId} disabled={!selectedPoId}>
                <SelectTrigger><SelectValue placeholder="Select receival" /></SelectTrigger>
                <SelectContent>
                  {poReceivals.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.receival_number} — {r.date}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes" />
          </div>

          {lines.length > 0 && (
            <>
              <ThreeWayMatchTable lines={lines} onChange={setLines} />
              <div className="flex justify-end text-sm font-semibold">
                Total: {formatCurrency(totalAmount, 'QAR')}
              </div>
              {!canSubmit && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  All lines must be matched or accepted-with-note (with required notes) before submitting.
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit || lines.length === 0}>
            {saving ? 'Saving…' : 'Create Bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Bills Page

- [ ] **Step 3: Create `src/app/(dashboard)/purchase/bills/page.tsx`**

```tsx
// src/app/(dashboard)/purchase/bills/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { useSupplierBills, useApproveBill, type ApInvoice } from '@/hooks/useSupplierBills'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const DOC_STATUS_CONFIG: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
}

const PAY_STATUS_CONFIG: Record<string, string> = {
  unpaid:          'bg-slate-100 text-slate-600',
  partially_paid:  'bg-amber-100 text-amber-700',
  paid:            'bg-green-100 text-green-700',
  overdue:         'bg-red-100 text-red-700',
}

export default function BillsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<ApInvoice | null>(null)

  const { data: bills, isLoading } = useSupplierBills({ search })
  const approveBill = useApproveBill()

  const columns = useMemo<ColumnDef<ApInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bill #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('invoice_id')}</span>,
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => row.original.po_number ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount') ?? 0, 'QAR'),
    },
    {
      accessorKey: 'doc_status',
      header: 'Approval',
      cell: ({ row }) => {
        const s = row.getValue('doc_status') as string
        return <Badge className={cn('text-xs', DOC_STATUS_CONFIG[s] ?? '')}>{s.replace('_', ' ')}</Badge>
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const s = row.getValue('payment_status') as string
        return <Badge className={cn('text-xs', PAY_STATUS_CONFIG[s] ?? '')}>{s.replace('_', ' ')}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const bill = row.original
        return (
          <div className="flex gap-1">
            {bill.doc_status === 'draft' && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await approveBill.mutateAsync({ id: bill.id, action: 'pending_approval' })
                  toast.success('Bill submitted for approval')
                }}
              >
                Submit
              </Button>
            )}
            {bill.doc_status === 'pending_approval' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-600 border-green-200 hover:bg-green-50"
                  onClick={async () => {
                    await approveBill.mutateAsync({ id: bill.id, action: 'approved' })
                    toast.success('Bill approved')
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-red-200 hover:bg-red-50"
                  onClick={async () => {
                    await approveBill.mutateAsync({ id: bill.id, action: 'rejected' })
                    toast.success('Bill rejected')
                  }}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ], [approveBill])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Supplier Bills"
        subtitle="AP invoices with 3-way match verification"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Bill
          </Button>
        }
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search bill # or supplier…" />
      <DataTable columns={columns} data={bills ?? []} isLoading={isLoading} />
      <BillFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase/ThreeWayMatchTable.tsx src/components/purchase/BillFormDialog.tsx "src/app/(dashboard)/purchase/bills/page.tsx"
git commit -m "feat(purchase): Bills page with 3-way match table, accept-with-note, approve/reject"
```

---

## Task 10: Purchase Payments Components + Page

**Files:**
- Create: `src/components/purchase/SupplierPaymentDialog.tsx`
- Create: `src/components/purchase/PaymentPlanDialog.tsx`
- Create: `src/app/(dashboard)/purchase/payments/page.tsx`

### SupplierPaymentDialog

- [ ] **Step 1: Create `src/components/purchase/SupplierPaymentDialog.tsx`**

```tsx
// src/components/purchase/SupplierPaymentDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateSupplierPayment, useSupplierPayments } from '@/hooks/useSupplierPayments'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'
import { formatCurrency } from '@/lib/utils/formatters'
import type { ApInvoice } from '@/types/invoice'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  bill: ApInvoice
  onSetUpPlan?: () => void
}

export function SupplierPaymentDialog({ open, onOpenChange, bill, onSetUpPlan }: Props) {
  const createPayment = useCreateSupplierPayment()
  const { data: existingPayments } = useSupplierPayments(bill.id)
  const alreadyPaid = (existingPayments ?? []).reduce((s, p) => s + p.amount, 0)
  const outstanding = (bill.total_amount ?? 0) - alreadyPaid

  const [amount, setAmount] = useState(String(outstanding > 0 ? outstanding.toFixed(2) : ''))
  const [method, setMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'>('bank_transfer')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const canPay = amountNum > 0 && amountNum <= outstanding && date

  const submit = async () => {
    setSaving(true)
    try {
      await createPayment.mutateAsync({
        invoice_id: bill.id,
        amount: amountNum,
        method,
        date,
        reference: reference || null,
        notes: null,
      })
      toast.success('Payment recorded')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {bill.invoice_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{formatCurrency(bill.total_amount ?? 0, 'QAR')}</span></div>
            <div><span className="text-muted-foreground">Paid:</span> <span className="font-medium">{formatCurrency(alreadyPaid, 'QAR')}</span></div>
            <div className="col-span-2 font-semibold text-base">Outstanding: {formatCurrency(outstanding, 'QAR')}</div>
          </div>
          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min={0.01} max={outstanding} />
          </div>
          <div className="space-y-1">
            <Label>Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_transfer">Online Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref #" />
            </div>
          </div>
          {outstanding >= PAYMENT_PLAN_THRESHOLD && onSetUpPlan && (
            <p className="text-xs text-muted-foreground bg-slate-50 rounded p-2">
              Outstanding ≥ QAR {PAYMENT_PLAN_THRESHOLD.toLocaleString()}.{' '}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => { onOpenChange(false); onSetUpPlan() }}
              >
                Set up a payment plan instead
              </button>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canPay}>
            {saving ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### PaymentPlanDialog

- [ ] **Step 2: Create `src/components/purchase/PaymentPlanDialog.tsx`**

```tsx
// src/components/purchase/PaymentPlanDialog.tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreatePaymentPlan } from '@/hooks/usePaymentPlans'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoiceId: string
  outstanding: number
}

type InstallmentDraft = { due_date: string; amount: string }

export function PaymentPlanDialog({ open, onOpenChange, invoiceId, outstanding }: Props) {
  const createPlan = useCreatePaymentPlan()
  const [planType, setPlanType] = useState<'schedule' | 'adhoc'>('schedule')
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    { due_date: '', amount: String(outstanding.toFixed(2)) },
  ])
  const [saving, setSaving] = useState(false)

  const totalDefined = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const balanceOk = Math.abs(totalDefined - outstanding) < 0.01

  const update = (idx: number, patch: Partial<InstallmentDraft>) => {
    setInstallments((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const submit = async () => {
    if (planType === 'schedule' && !balanceOk) {
      toast.error(`Installment total (${formatCurrency(totalDefined, 'QAR')}) must equal outstanding (${formatCurrency(outstanding, 'QAR')})`)
      return
    }
    setSaving(true)
    try {
      await createPlan.mutateAsync({
        invoice_id: invoiceId,
        plan_type: planType,
        total_amount: outstanding,
        installments: installments.map((i) => ({
          due_date: planType === 'schedule' ? i.due_date : null,
          amount: Number(i.amount),
        })),
      })
      toast.success('Payment plan created')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up Payment Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Outstanding: <span className="font-semibold text-foreground">{formatCurrency(outstanding, 'QAR')}</span>
          </p>
          <div className="flex gap-2">
            {(['schedule', 'adhoc'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPlanType(t)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  planType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
                }`}
              >
                {t === 'schedule' ? 'Schedule (with due dates)' : 'Ad-hoc (no due dates)'}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Installments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setInstallments((prev) => [...prev, { due_date: '', amount: '' }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {installments.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                {planType === 'schedule' && (
                  <Input
                    type="date"
                    className="flex-1"
                    value={inst.due_date}
                    onChange={(e) => update(idx, { due_date: e.target.value })}
                  />
                )}
                <Input
                  type="number"
                  className="flex-1"
                  placeholder="Amount"
                  value={inst.amount}
                  step="0.01"
                  min={0}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                />
                {installments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {planType === 'schedule' && (
              <p className={`text-xs ${balanceOk ? 'text-green-600' : 'text-amber-600'}`}>
                Total defined: {formatCurrency(totalDefined, 'QAR')} / {formatCurrency(outstanding, 'QAR')} outstanding
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || (planType === 'schedule' && !balanceOk)}>
            {saving ? 'Saving…' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Purchase Payments Page

- [ ] **Step 3: Create `src/app/(dashboard)/purchase/payments/page.tsx`**

```tsx
// src/app/(dashboard)/purchase/payments/page.tsx
'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useSupplierPayments, type SupplierPayment } from '@/hooks/useSupplierPayments'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online_transfer: 'Online Transfer',
}

export default function PurchasePaymentsPage() {
  const { data: payments, isLoading } = useSupplierPayments()

  const columns = useMemo<ColumnDef<SupplierPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('payment_id')}</span>,
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'bill',
      header: 'Bill #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('amount'), 'QAR'),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.getValue('method') as string] ?? row.getValue('method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Purchase Payments" subtitle="Outgoing supplier payments" />
      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase/SupplierPaymentDialog.tsx src/components/purchase/PaymentPlanDialog.tsx "src/app/(dashboard)/purchase/payments/page.tsx"
git commit -m "feat(purchase): SupplierPaymentDialog + PaymentPlanDialog + Purchase Payments list page"
```

---

## Task 11: Sale Deliveries Component + Page

**Files:**
- Create: `src/components/sales/DeliveryFormDialog.tsx`
- Create: `src/app/(dashboard)/sales/deliveries/page.tsx`

### DeliveryFormDialog

- [ ] **Step 1: Create `src/components/sales/DeliveryFormDialog.tsx`**

```tsx
// src/components/sales/DeliveryFormDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompleteDelivery, type SaleDelivery, type DeliveryItem } from '@/hooks/useSaleDeliveries'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { useSaleOrders } from '@/hooks/useSaleOrders'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  delivery: SaleDelivery
}

type DraftLine = DeliveryItem & { so_qty: number; delivered_qty_input: number }

export function DeliveryFormDialog({ open, onOpenChange, delivery }: Props) {
  const completeDelivery = useCompleteDelivery()
  const { data: warehouses } = useWarehouses()
  const { data: invoices } = useCustomerInvoices()
  const { data: orders } = useSaleOrders()

  const [warehouseId, setWarehouseId] = useState(delivery.warehouse_id ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)

  const so = (orders ?? []).find((o) => o.id === delivery.sale_order_id)
  const linkedInvoice = (invoices ?? []).find((inv) => inv.sale_order_id === delivery.sale_order_id)

  useEffect(() => {
    const items = (delivery.items as DeliveryItem[]) ?? []
    setLines(
      items.map((item) => {
        const soLine = (so?.sale_order_lines ?? []).find(
          (l) => l.item_name === item.item_name && l.brand_variant_id === item.brand_variant_id
        )
        return {
          ...item,
          so_qty: soLine?.qty ?? 0,
          delivered_qty_input: item.qty_delivered,
        }
      })
    )
  }, [delivery, so])

  const submit = async () => {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    setSaving(true)
    try {
      const remainingItems: DeliveryItem[] = lines
        .filter((l) => l.so_qty - l.delivered_qty_input > 0)
        .map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty_delivered: l.so_qty - l.delivered_qty_input,
          brand_variant_id: l.brand_variant_id,
        }))

      await completeDelivery.mutateAsync({
        deliveryId: delivery.id,
        soId: delivery.sale_order_id,
        invoiceId: linkedInvoice?.id ?? null,
        remainingItems,
      })
      toast.success('Delivery completed')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{delivery.delivery_number} — Complete Delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Warehouse *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Item</th>
                    <th className="text-right py-2 px-2">SO Qty</th>
                    <th className="text-right py-2 pl-2">Deliver Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2 font-medium">{line.item_name}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{line.so_qty}</td>
                      <td className="py-2 pl-2">
                        <Input
                          type="number"
                          className="w-24 text-right ml-auto"
                          value={line.delivered_qty_input}
                          min={0}
                          max={line.so_qty}
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], delivered_qty_input: Number(e.target.value) }
                            setLines(updated)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linkedInvoice?.needs_refresh && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
              ⚠ Invoice {linkedInvoice.invoice_id} has pending changes — review the invoice before sending to customer.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Completing…' : 'Mark as Delivered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Deliveries Page

- [ ] **Step 2: Create `src/app/(dashboard)/sales/deliveries/page.tsx`**

```tsx
// src/app/(dashboard)/sales/deliveries/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { DeliveryFormDialog } from '@/components/sales/DeliveryFormDialog'
import { useSaleDeliveries, type SaleDelivery, type DeliveryStatus } from '@/hooks/useSaleDeliveries'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  delivered:   { label: 'Delivered',   className: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: DeliveryStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | ''>('')
  const [activeDelivery, setActiveDelivery] = useState<SaleDelivery | null>(null)

  const { data: deliveries, isLoading } = useSaleDeliveries({ status: statusFilter })

  const columns = useMemo<ColumnDef<SaleDelivery>[]>(() => [
    {
      accessorKey: 'delivery_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Delivery #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('delivery_number')}</span>,
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => row.original.so_number ?? '—',
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const d = row.getValue('date') as string
        return d ? formatDate(d) : '—'
      },
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.items ?? []
        return `${items.length} lines`
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'pending') as DeliveryStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pending
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const d = row.original
        if (d.status === 'pending' || d.status === 'in_progress') {
          return (
            <Button variant="outline" size="sm" onClick={() => setActiveDelivery(d)}>
              Complete
            </Button>
          )
        }
        return null
      },
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Deliveries" subtitle="Sale order fulfilment tracking" />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <DataTable columns={columns} data={deliveries ?? []} isLoading={isLoading} />
      {activeDelivery && (
        <DeliveryFormDialog
          open
          onOpenChange={(v) => { if (!v) setActiveDelivery(null) }}
          delivery={activeDelivery}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sales/DeliveryFormDialog.tsx "src/app/(dashboard)/sales/deliveries/page.tsx"
git commit -m "feat(sales): Deliveries page — complete delivery with partial follow-up stub, invoice status update"
```

---

---

## Task 12: Customer Invoices Component + Page

**Files:**
- Create: `src/components/sales/InvoiceDetail.tsx`
- Create: `src/app/(dashboard)/sales/invoices/page.tsx`

### InvoiceDetail

- [ ] **Step 1: Create `src/components/sales/InvoiceDetail.tsx`**

Read-only invoice view with `needs_refresh` banner and action buttons.

```tsx
// src/components/sales/InvoiceDetail.tsx
'use client'

import { useState } from 'react'
import { AlertTriangle, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSendInvoice, useDismissRefresh } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { CustomerPaymentDialog } from './CustomerPaymentDialog'
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { PAYMENT_PLAN_THRESHOLD, type ArInvoice } from '@/types/invoice'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: ArInvoice
}

const DOC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:          { label: 'Draft',          className: 'bg-slate-100 text-slate-700' },
  ready_to_send:  { label: 'Ready to Send',  className: 'bg-blue-100 text-blue-700' },
  sent:           { label: 'Sent',           className: 'bg-green-100 text-green-700' },
}

const PAY_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid:         { label: 'Unpaid',         className: 'bg-slate-100 text-slate-600' },
  partially_paid: { label: 'Partially Paid', className: 'bg-amber-100 text-amber-700' },
  paid:           { label: 'Paid',           className: 'bg-green-100 text-green-700' },
  overdue:        { label: 'Overdue',        className: 'bg-red-100 text-red-700' },
}

export function InvoiceDetail({ open, onOpenChange, invoice }: Props) {
  const sendInvoice = useSendInvoice()
  const dismissRefresh = useDismissRefresh()
  const { data: payments } = useCustomerPayments(invoice.id)
  const { data: plans } = usePaymentPlans(invoice.id)
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0)
  const outstanding = (invoice.total_amount ?? 0) - totalPaid
  const docCfg = DOC_STATUS_CONFIG[invoice.doc_status] ?? DOC_STATUS_CONFIG.draft
  const payCfg = PAY_STATUS_CONFIG[invoice.payment_status] ?? PAY_STATUS_CONFIG.unpaid
  const hasActivePlan = (plans ?? []).some((p) => p.status === 'active')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle>{invoice.invoice_id}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {invoice.customer_name} · SO #{invoice.so_number}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className={cn('text-xs', docCfg.className)}>{docCfg.label}</Badge>
                <Badge className={cn('text-xs', payCfg.className)}>{payCfg.label}</Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* needs_refresh banner */}
            {invoice.needs_refresh && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Invoice regenerated — the Sale Order was modified.</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Review the changes below before resending to the customer.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    dismissRefresh.mutate(invoice.id)
                    toast.success('Refresh flag cleared')
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

            {/* Line items */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">Unit Price</th>
                    <th className="text-right py-2 pl-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(invoice.invoice_line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="py-2 pr-2">{li.description}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{li.qty ?? '—'}</td>
                      <td className="text-right py-2 px-2">{formatCurrency(li.unit_price ?? 0, 'QAR')}</td>
                      <td className="text-right py-2 pl-2 font-medium">{formatCurrency(li.total ?? 0, 'QAR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payment summary */}
            <div className="border rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span>{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-700">{formatCurrency(totalPaid, 'QAR')}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Outstanding</span>
                <span className={outstanding > 0 ? 'text-amber-700' : 'text-green-700'}>
                  {formatCurrency(outstanding, 'QAR')}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {invoice.doc_status === 'ready_to_send' && (
                <Button
                  onClick={() => {
                    sendInvoice.mutate(invoice.id)
                    toast.success('Invoice marked as sent')
                  }}
                >
                  <Send className="w-4 h-4 mr-2" /> Send to Customer
                </Button>
              )}
              {outstanding > 0 && invoice.doc_status !== 'draft' && (
                <Button variant="outline" onClick={() => setPayOpen(true)}>
                  Pay Now
                </Button>
              )}
              {outstanding >= PAYMENT_PLAN_THRESHOLD && !hasActivePlan && (
                <Button variant="outline" onClick={() => setPlanOpen(true)}>
                  Set Up Payment Plan
                </Button>
              )}
            </div>

            {/* Invoice dates */}
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>Issued: <span className="text-foreground">{formatDate(invoice.issued_date)}</span></div>
              <div>Due: <span className="text-foreground">{formatDate(invoice.due_date)}</span></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {payOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setPayOpen}
          invoice={invoice}
          alreadyPaid={totalPaid}
          plans={plans ?? []}
        />
      )}
      {planOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setPlanOpen}
          invoiceId={invoice.id}
          outstanding={outstanding}
        />
      )}
    </>
  )
}
```

### Customer Invoices Page

- [ ] **Step 2: Create `src/app/(dashboard)/sales/invoices/page.tsx`**

```tsx
// src/app/(dashboard)/sales/invoices/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { InvoiceDetail } from '@/components/sales/InvoiceDetail'
import { useCustomerInvoices, type ArInvoice } from '@/hooks/useCustomerInvoices'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const DOC_STATUSES = [
  { value: '' as const, label: 'All' },
  { value: 'draft' as const, label: 'Draft' },
  { value: 'ready_to_send' as const, label: 'Ready to Send' },
  { value: 'sent' as const, label: 'Sent' },
]

const DOC_STATUS_CONFIG: Record<string, string> = {
  draft:         'bg-slate-100 text-slate-700',
  ready_to_send: 'bg-blue-100 text-blue-700',
  sent:          'bg-green-100 text-green-700',
}

const PAY_STATUS_CONFIG: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

export default function CustomerInvoicesPage() {
  const [search, setSearch] = useState('')
  const [docFilter, setDocFilter] = useState<ArInvoice['doc_status'] | ''>('')
  const [selected, setSelected] = useState<ArInvoice | null>(null)

  const { data: invoices, isLoading } = useCustomerInvoices({
    search,
    doc_status: docFilter,
  })

  const columns = useMemo<ColumnDef<ArInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm font-medium">{row.getValue('invoice_id')}</span>
          {row.original.needs_refresh && (
            <AlertTriangle className="w-3 h-3 text-amber-500" title="Needs review — SO was modified" />
          )}
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => row.original.so_number ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount') ?? 0, 'QAR'),
    },
    {
      accessorKey: 'doc_status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('doc_status') as string
        return (
          <Badge className={cn('text-xs', DOC_STATUS_CONFIG[s] ?? '')}>
            {s.replace('_', ' ')}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const s = row.getValue('payment_status') as string
        return (
          <Badge className={cn('text-xs', PAY_STATUS_CONFIG[s] ?? '')}>
            {s.replace('_', ' ')}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => formatDate(row.getValue('due_date')),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(row.original)}>
          View
        </Button>
      ),
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Customer Invoices" subtitle="AR invoices auto-generated from Sale Orders" />

      <div className="flex flex-wrap gap-2">
        {DOC_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setDocFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              docFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search invoice # …" />
      <DataTable columns={columns} data={invoices ?? []} isLoading={isLoading} />

      {selected && (
        <InvoiceDetail
          open
          onOpenChange={(v) => { if (!v) setSelected(null) }}
          invoice={selected}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sales/InvoiceDetail.tsx "src/app/(dashboard)/sales/invoices/page.tsx"
git commit -m "feat(sales): Customer Invoices page — read-only detail, needs_refresh banner, send action"
```

---

## Task 13: Customer Payments + Credit Notes

**Files:**
- Create: `src/components/sales/CustomerPaymentDialog.tsx`
- Create: `src/components/sales/CreditNoteFormDialog.tsx`
- Create: `src/app/(dashboard)/sales/payments/page.tsx`
- Create: `src/app/(dashboard)/sales/credit-notes/page.tsx`

### CustomerPaymentDialog

- [ ] **Step 1: Create `src/components/sales/CustomerPaymentDialog.tsx`**

```tsx
// src/components/sales/CustomerPaymentDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateCustomerPayment } from '@/hooks/useCustomerPayments'
import { formatCurrency } from '@/lib/utils/formatters'
import type { ArInvoice, PaymentPlan } from '@/types/invoice'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: ArInvoice
  alreadyPaid: number
  plans: PaymentPlan[]
}

export function CustomerPaymentDialog({ open, onOpenChange, invoice, alreadyPaid, plans }: Props) {
  const createPayment = useCreateCustomerPayment()
  const outstanding = (invoice.total_amount ?? 0) - alreadyPaid

  const [amount, setAmount] = useState(String(outstanding > 0 ? outstanding.toFixed(2) : ''))
  const [method, setMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'online_transfer' | 'pos'>('bank_transfer')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const canPay = amountNum > 0 && amountNum <= outstanding && date

  const submit = async () => {
    setSaving(true)
    try {
      await createPayment.mutateAsync({
        invoice_id: invoice.id,
        amount: amountNum,
        method,
        date,
        reference: reference || null,
        notes: null,
      })
      toast.success('Payment recorded')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment — {invoice.invoice_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span></div>
            <div><span className="text-muted-foreground">Paid:</span> <span className="font-medium text-green-700">{formatCurrency(alreadyPaid, 'QAR')}</span></div>
            <div className="col-span-2 font-semibold">Outstanding: {formatCurrency(outstanding, 'QAR')}</div>
          </div>

          {plans.length > 0 && (
            <div className="text-xs bg-blue-50 rounded p-2 text-blue-700">
              Active payment plan — recording a direct payment will reduce the outstanding balance independently of the plan installments.
            </div>
          )}

          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min={0.01} max={outstanding} />
          </div>
          <div className="space-y-1">
            <Label>Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_transfer">Online Transfer</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref #" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canPay}>
            {saving ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### CreditNoteFormDialog

- [ ] **Step 2: Create `src/components/sales/CreditNoteFormDialog.tsx`**

```tsx
// src/components/sales/CreditNoteFormDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateCreditNote } from '@/hooks/useCreditNotes'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { formatCurrency } from '@/lib/utils/formatters'

type CreditLine = {
  invoice_line_id: string | null
  description: string
  qty: number
  unit_price: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreditNoteFormDialog({ open, onOpenChange }: Props) {
  const createCreditNote = useCreateCreditNote()
  const { data: invoices } = useCustomerInvoices()

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<CreditLine[]>([
    { invoice_line_id: null, description: '', qty: 1, unit_price: 0 },
  ])
  const [saving, setSaving] = useState(false)

  const selectedInvoice = (invoices ?? []).find((inv) => inv.id === selectedInvoiceId)

  useEffect(() => {
    if (!selectedInvoice) { setLines([{ invoice_line_id: null, description: '', qty: 1, unit_price: 0 }]); return }
    setLines(
      (selectedInvoice.invoice_line_items ?? []).map((li) => ({
        invoice_line_id: li.id,
        description: li.description,
        qty: li.qty ?? 1,
        unit_price: li.unit_price ?? 0,
      }))
    )
  }, [selectedInvoiceId])

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

  const close = () => {
    setSelectedInvoiceId(''); setReason(''); setLines([{ invoice_line_id: null, description: '', qty: 1, unit_price: 0 }])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedInvoiceId || !reason.trim()) {
      toast.error('Select an invoice and enter a reason')
      return
    }
    if (lines.some((l) => !l.description.trim())) {
      toast.error('All lines must have a description')
      return
    }
    setSaving(true)
    try {
      await createCreditNote.mutateAsync({
        invoice_id: selectedInvoiceId,
        customer_name: selectedInvoice?.customer_name ?? '',
        reason,
        lines,
      })
      toast.success('Credit note created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const eligibleInvoices = (invoices ?? []).filter((inv) => inv.doc_status !== 'draft')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Original Invoice *</Label>
            <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
              <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
              <SelectContent>
                {eligibleInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_id} — {inv.customer_name} — {formatCurrency(inv.total_amount ?? 0, 'QAR')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for credit note" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Credit Lines *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, { invoice_line_id: null, description: '', qty: 1, unit_price: 0 }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Line
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2 w-20">Qty</th>
                    <th className="text-right py-2 px-2 w-28">Unit Price</th>
                    <th className="text-right py-2 pl-2 w-28">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2">
                        <Input
                          value={line.description}
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))}
                          placeholder="Description"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="text-right"
                          value={line.qty}
                          min={0.01}
                          step="0.01"
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, qty: Number(e.target.value) } : l))}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="text-right"
                          value={line.unit_price}
                          min={0}
                          step="0.01"
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, unit_price: Number(e.target.value) } : l))}
                        />
                      </td>
                      <td className="text-right py-2 pl-2 font-medium">
                        {formatCurrency(line.qty * line.unit_price, 'QAR')}
                      </td>
                      <td className="py-2">
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm font-semibold">
              CN Total: {formatCurrency(total, 'QAR')}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedInvoiceId || !reason.trim()}>
            {saving ? 'Creating…' : 'Create Draft CN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Customer Payments Page

- [ ] **Step 3: Create `src/app/(dashboard)/sales/payments/page.tsx`**

```tsx
// src/app/(dashboard)/sales/payments/page.tsx
'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useCustomerPayments, type CustomerPayment } from '@/hooks/useCustomerPayments'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online_transfer: 'Online Transfer',
  pos:             'POS',
}

export default function CustomerPaymentsPage() {
  const { data: payments, isLoading } = useCustomerPayments()

  const columns = useMemo<ColumnDef<CustomerPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('payment_id')}</span>,
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('amount'), 'QAR'),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.getValue('method') as string] ?? row.getValue('method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Customer Payments" subtitle="Incoming payments from customers" />
      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />
    </div>
  )
}
```

### Credit Notes Page

- [ ] **Step 4: Create `src/app/(dashboard)/sales/credit-notes/page.tsx`**

```tsx
// src/app/(dashboard)/sales/credit-notes/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CreditNoteFormDialog } from '@/components/sales/CreditNoteFormDialog'
import { useCreditNotes, useApplyCreditNote, type CreditNote, type CreditNoteStatus } from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-slate-100 text-slate-700' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function CreditNotesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)

  const { data: creditNotes, isLoading } = useCreditNotes()
  const applyCreditNote = useApplyCreditNote()

  const columns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'draft') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => formatDate(row.getValue('created_at')),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const cn = row.original
        if (cn.status === 'issued' || cn.status === 'approved') {
          return (
            <Button variant="outline" size="sm" onClick={() => setApplyTarget(cn)}>
              Apply to Invoice
            </Button>
          )
        }
        return null
      },
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Credit Notes"
        subtitle="Manually issued credits against customer invoices"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Credit Note
          </Button>
        }
      />
      <DataTable columns={columns} data={creditNotes ?? []} isLoading={isLoading} />

      <CreditNoteFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {applyTarget && (
        <ConfirmDialog
          open
          title="Apply Credit Note?"
          description={`Apply ${applyTarget.credit_note_id} (${formatCurrency(applyTarget.total_amount, 'QAR')}) to invoice ${applyTarget.invoice_display ?? applyTarget.invoice_id}? Any excess will be stored as customer credit balance.`}
          confirmLabel="Apply"
          onConfirm={async () => {
            await applyCreditNote.mutateAsync({ id: applyTarget.id, invoiceId: applyTarget.invoice_id })
            toast.success('Credit note applied')
            setApplyTarget(null)
          }}
          onCancel={() => setApplyTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify build**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/CustomerPaymentDialog.tsx src/components/sales/CreditNoteFormDialog.tsx "src/app/(dashboard)/sales/payments/page.tsx" "src/app/(dashboard)/sales/credit-notes/page.tsx"
git commit -m "feat(sales): Customer Payments list + Credit Notes page with apply-to-invoice action"
```

---

## Task 14: Wire SO Confirm to Create Delivery + Invoice

**Files:**
- Modify: `src/hooks/useSaleOrders.ts` (extend `useConfirmSO`)

The `useConfirmSO` mutation currently updates SO status and calls `reserve-stock`. Extend it to:
1. Create a stub `sale_deliveries` record (status='pending', warehouse_id=null after migration)
2. Call `syncInvoiceToSalesOrder` to create the draft AR invoice

- [ ] **Step 1: Read `useConfirmSO` in `src/hooks/useSaleOrders.ts` (lines 359–392)**

Verify the current implementation to ensure the patch below is accurate.

- [ ] **Step 2: Replace `useConfirmSO` in `src/hooks/useSaleOrders.ts`**

Find the exact block starting with `export function useConfirmSO()` and replace it:

```typescript
export function useConfirmSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lineItems }: { id: string; lineItems: SOLineItem[] }) => {
      const supabase = createClient()

      // 1. Update SO status
      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
      if (soErr) throw soErr

      // 2. Reserve stock (best-effort)
      try {
        await supabase.functions.invoke('reserve-stock', {
          body: {
            sale_order_id: id,
            items: lineItems
              .filter((l) => l.brand_variant_id)
              .map((l) => ({ brand_variant_id: l.brand_variant_id, qty: l.qty })),
          },
        })
      } catch {
        console.warn('reserve-stock edge function failed — stock not reserved')
      }

      // 3. Create stub delivery (warehouse_id nullable after migration)
      const { count: delCount } = await (supabase as any)
        .from('sale_deliveries')
        .select('*', { count: 'exact', head: true })
      const delivery_number = `DEL-${String((delCount ?? 0) + 1).padStart(5, '0')}`
      await (supabase as any).from('sale_deliveries').insert({
        delivery_number,
        sale_order_id: id,
        warehouse_id: null,
        date: new Date().toISOString().split('T')[0],
        items: lineItems.map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty_delivered: l.qty,
          brand_variant_id: l.brand_variant_id,
        })),
        status: 'pending',
      })

      // 4. Create draft AR invoice via syncInvoiceToSalesOrder
      const { syncInvoiceToSalesOrder } = await import('@/lib/invoiceSync')
      await syncInvoiceToSalesOrder(id)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSaleOrders.ts
git commit -m "feat(sales): on SO confirm — create stub delivery + auto-generate draft AR invoice via invoiceSync"
```

---

## Task 15: Integration Test

**No new files — runs existing build + test suite.**

- [ ] **Step 1: Run TypeScript type check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1
```

Expected: zero errors. If errors appear, read each one and fix in the relevant file before continuing.

- [ ] **Step 2: Run unit tests**

```bash
cd D:/MMS && npx vitest run 2>&1
```

Expected: all existing tests pass (no new tests broken by the hooks or types changes).

- [ ] **Step 3: Run full build**

```bash
cd D:/MMS && npx next build 2>&1 | tail -30
```

Expected: build completes successfully. Confirm the following new routes appear in the route listing:
- `/purchase/rfq`
- `/purchase/receivals`
- `/purchase/bills`
- `/purchase/payments`
- `/sales/deliveries`
- `/sales/invoices`
- `/sales/payments`
- `/sales/credit-notes`

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Purchase & Sales Expansion plan complete"
```

---

## Self-Review Checklist

After the plan is fully implemented, verify these spec requirements are covered:

| Req | Task | Check |
|---|---|---|
| DB columns: `invoices.direction`, `doc_status`, `payment_status`, `needs_refresh` | 1 | migration §1.1 |
| DB: `invoice_line_items.match_status`, `match_note` | 1 | migration §1.2 |
| DB: `payments.direction` | 1 | migration §1.3 |
| DB: `customers.credit_balance` | 1 | migration §1.4 |
| DB: `credit_note_lines`, `payment_plans`, `payment_installments` | 1 | migration §1.5 |
| DB views: `customer_invoices`, `supplier_bills` | 1 | migration §1.6 |
| TypeScript types: `ArInvoice`, `ApInvoice`, `DocStatus`, `PaymentStatus`, `MatchStatus` | 2 | `src/types/invoice.ts` |
| `syncInvoiceToSalesOrder` utility | 2 | `src/lib/invoiceSync.ts` |
| Nav: 8 new routes, remove top-level Invoices coming-soon | 3 | `nav-config.ts` |
| RFQ: list, create/edit dialog, mark-sent, reference-on-PO | 7 | Task 7 |
| Receivals: pre-fill from PO, approve/reject | 8 | Task 8 |
| Bills: ThreeWayMatchTable, accept-with-note, approve | 9 | Task 9 |
| Purchase Payments: list of outgoing payments | 10 | Task 10 |
| SupplierPaymentDialog: Path A direct, offer plan link | 10 | Task 10 |
| PaymentPlanDialog: schedule + adhoc, installment rows | 10 | Task 10 |
| Deliveries: complete + partial follow-up stub | 11 | Task 11 |
| Customer Invoices: read-only, needs_refresh banner, send, pay | 12 | Task 12 |
| Customer Payments: list | 13 | Task 13 |
| Credit Notes: create, apply to invoice, excess to credit_balance | 13 | Task 13 |
| SO confirm → stub delivery + draft invoice | 14 | Task 14 |
