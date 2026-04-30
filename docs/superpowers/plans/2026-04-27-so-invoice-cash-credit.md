# SO Invoice — Cash/Credit Customer Types + Invoice Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cash customers (no credit group) to place sale orders, auto-generate correctly typed invoices (Cash or Credit) via a server-side RPC, and surface the linked invoice inside `SoDetailDialog` as a dedicated tab with send/pay actions.

**Architecture:** Three DB migrations add the data model and RPCs; four TypeScript files are updated (types, hooks, dialog, create-SO page). No new files are created — all changes extend existing patterns. The `generate_invoice_from_so` RPC serialises invoice numbering server-side with `pg_advisory_xact_lock` to prevent duplicates.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL RPCs, TanStack Query v5, shadcn/ui, TypeScript.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260428000005_customer_type_invoice_type.sql` | Create | Backfill + CHECK constraint on customer_type; add invoice_type column to invoices |
| `supabase/migrations/20260428000006_fix_create_sale_order_cash.sql` | Create | Replace create_sale_order RPC: LEFT JOIN + cash/credit branch |
| `supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql` | Create | Atomic invoice-generation RPC with locking, discount copy, date logic |
| `src/types/invoice.ts` | Modify | Add `invoice_type: 'cash' \| 'credit'` to `ArInvoice` |
| `src/hooks/useSaleOrders.ts` | Modify | Add `customer_type` to `useCreateCustomer` payload |
| `src/hooks/useCustomerInvoices.ts` | Modify | Add `useInvoicesBySO` query + `useGenerateInvoice` mutation |
| `src/components/sales/SoDetailDialog.tsx` | Modify | Add Invoice tab (5th) with generate/view/send/pay actions |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify | Cash UX: type state, null payload override, cash badge, hide terms, updated Add Customer dialog |

---

## Task 1: Migration 1 — customer_type CHECK + invoice_type column

**Files:**
- Create: `supabase/migrations/20260428000005_customer_type_invoice_type.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260428000005_customer_type_invoice_type.sql
-- Adds strict customer_type values (cash|credit) and invoice_type to invoices.
-- CRITICAL: backfill happens BEFORE the constraint so no rows are rejected.

BEGIN;

-- 1a. Backfill credit customers (have a credit group).
UPDATE customers
SET    customer_type = 'credit'
WHERE  credit_group_id IS NOT NULL
  AND  (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- 1b. Backfill cash customers (no credit group).
UPDATE customers
SET    customer_type = 'cash'
WHERE  credit_group_id IS NULL
  AND  (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- 2. Add CHECK constraint. NULL explicitly allowed so any legacy code path
--    that omits customer_type on INSERT doesn't crash (app treats NULL as credit).
ALTER TABLE customers
  ADD CONSTRAINT customers_type_check
  CHECK (customer_type IN ('cash', 'credit') OR customer_type IS NULL);

-- 3. Add invoice_type to invoices (NOT NULL, default credit so existing rows are valid).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'credit'
  CHECK (invoice_type IN ('cash', 'credit'));

-- 4. Backfill existing AR invoices from their linked customer.
--    COALESCE handles any customer still NULL → treat as credit.
UPDATE invoices i
SET    invoice_type = COALESCE(c.customer_type, 'credit')
FROM   customers c
WHERE  i.customer_id = c.id
  AND  i.direction   = 'ar';

COMMIT;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected output:
```
Applying migration 20260428000005_customer_type_invoice_type.sql...
Finished supabase db push.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428000005_customer_type_invoice_type.sql
git commit -m "feat(db): add customer_type CHECK constraint and invoice_type column"
```

---

## Task 2: Migration 2 — create_sale_order RPC with cash branch

**Files:**
- Create: `supabase/migrations/20260428000006_fix_create_sale_order_cash.sql`

**Context:** The current RPC (in `20260428000003`) uses `INNER JOIN credit_groups` which raises `'no_credit_group'` for any customer without a credit group. This migration replaces it with `LEFT JOIN` and branches on `customer_type`. All other logic (line items, reserved qty, advisory lock) is unchanged.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260428000006_fix_create_sale_order_cash.sql
-- Allows cash customers (customer_type='cash') to place orders without a
-- credit group. Credit check and pending_approval logic only apply to
-- credit customers.

BEGIN;

CREATE OR REPLACE FUNCTION create_sale_order(
  p_customer_id          UUID,
  p_intent               TEXT,
  p_currency             TEXT,
  p_exchange_rate        NUMERIC,
  p_expected_delivery    DATE,
  p_payment_terms        TEXT,
  p_payment_terms_notes  TEXT,
  p_payment_milestones   JSONB,
  p_delivery_terms       TEXT,
  p_delivery_terms_notes TEXT,
  p_customer_notes       TEXT,
  p_validity_days        INTEGER,
  p_discount_amount      NUMERIC,
  p_discount_label       TEXT,
  p_discount_type        TEXT,
  p_line_items           JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_so_number         TEXT;
  v_count             INTEGER;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_customer_type     TEXT;
BEGIN
  -- Serialize per-customer SO creation to prevent duplicate SO numbers.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- Resolve the profile row (profiles.id ≠ auth.uid()).
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  -- Sum line item totals.
  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  -- LEFT JOIN so cash customers (no credit group) don't raise NOT FOUND.
  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Cash branch ──────────────────────────────────────────────────────────
  -- Cash customers bypass the credit check entirely. They can never be put
  -- into pending_approval. NULL customer_type with no credit group is also
  -- treated as cash for backward compatibility.
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;

  -- ── Credit branch ────────────────────────────────────────────────────────
  ELSE
    -- Credit customers must have a credit group assigned.
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    SELECT COALESCE(SUM(total), 0)
    INTO   v_open_total
    FROM   sale_orders
    WHERE  customer_id = p_customer_id
      AND  status      NOT IN ('cancelled')
      AND  deleted_at  IS NULL;

    v_available := v_credit_limit - v_open_total;

    v_so_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      WHEN p_intent = 'confirm'      THEN 'confirmed'::sale_order_status
      ELSE                                'quotation'::sale_order_status
    END;
  END IF;

  -- Insert the sale order.
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id
  )
  RETURNING id INTO v_so_id;

  -- Insert line items.
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost,
    created_by
  )
  SELECT
    v_so_id,
    item->>'item_name',
    NULLIF(item->>'sku', ''),
    (item->>'qty')::INTEGER,
    COALESCE(NULLIF(item->>'unit', ''), 'pcs'),
    (item->>'unit_price')::NUMERIC,
    (item->>'total')::NUMERIC,
    COALESCE(NULLIF(item->>'line_type', ''), 'products'),
    CASE
      WHEN (item->>'brand_variant_id') IS NOT NULL
        AND (item->>'brand_variant_id') NOT IN ('', 'null')
      THEN (item->>'brand_variant_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN (item->>'tool_asset_item_id') IS NOT NULL
        AND (item->>'tool_asset_item_id') NOT IN ('', 'null')
      THEN (item->>'tool_asset_item_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

  -- Reserve stock for confirmed orders (cash or credit).
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER
       ))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale_order(UUID,TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,JSONB,TEXT,TEXT,TEXT,INTEGER,NUMERIC,TEXT,TEXT,JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected:
```
Applying migration 20260428000006_fix_create_sale_order_cash.sql...
Finished supabase db push.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428000006_fix_create_sale_order_cash.sql
git commit -m "feat(db): allow cash customers in create_sale_order RPC"
```

---

## Task 3: Migration 3 — generate_invoice_from_so RPC

**Files:**
- Create: `supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql`

**Context:** This RPC is called by the "Generate Invoice" button in `SoDetailDialog`. It uses `pg_advisory_xact_lock(hashtext('invoices_serial'))` to serialize invoice numbering globally — two simultaneous clicks cannot produce the same `INV-XXXXX`. It copies `subtotal`, `tax`, and `total` (already post-discount) from the sale order, so no discount arithmetic is needed.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql
-- Atomically generates an AR invoice from a delivered Sale Order.
-- Guards:
--   - SO must be partial_delivery or delivered (not confirmed/quotation)
--   - No AR invoice may already exist for this SO
-- Numbering is serialised with pg_advisory_xact_lock to prevent duplicates.

BEGIN;

CREATE OR REPLACE FUNCTION generate_invoice_from_so(p_so_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_so              RECORD;
  v_inv_count       INTEGER;
  v_invoice_id_str  TEXT;
  v_invoice_type    TEXT;
  v_issued_date     DATE;
  v_due_date        DATE;
  v_new_inv_id      UUID;
  v_new_inv_str     TEXT;
BEGIN
  -- Serialize invoice numbering across all sessions.
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  -- Guard: no AR invoice already linked to this SO.
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE  sale_order_id = p_so_id AND direction = 'ar'
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  -- Fetch SO + customer_type. Must be at a delivery stage.
  SELECT
    so.id,
    so.so_number,
    so.status,
    so.customer_id,
    so.subtotal,
    COALESCE(so.tax, 0)              AS tax,
    so.total                         AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_deliverable';
  END IF;

  -- Compute next invoice number (serialised by advisory lock above).
  SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
  v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');

  -- Derive invoice type and due date from customer type.
  v_invoice_type := v_so.customer_type;          -- 'cash' or 'credit'
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE          -- pay immediately
    ELSE             CURRENT_DATE + 30     -- net-30 for credit
  END;

  -- Insert invoice row.
  INSERT INTO invoices (
    invoice_id,
    customer_id,
    direction,
    sale_order_id,
    invoice_type,
    doc_status,
    status,
    payment_status,
    needs_refresh,
    total_amount,
    subtotal,
    tax,
    issued_date,
    due_date,
    source,
    source_id,
    source_label
  ) VALUES (
    v_invoice_id_str,
    v_so.customer_id,
    'ar',
    p_so_id,
    v_invoice_type,
    'draft',
    'draft',
    'unpaid',
    false,
    v_so.total_amount,
    v_so.subtotal,
    v_so.tax,
    v_issued_date,
    v_due_date,
    'order',
    p_so_id,
    'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  -- Insert one line item per sale_order_line.
  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT
    v_new_inv_id,
    sol.item_name,
    sol.qty,
    sol.unit_price,
    sol.total
  FROM sale_order_lines sol
  WHERE sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invoice_from_so(UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected:
```
Applying migration 20260428000007_rpc_generate_invoice_from_so.sql...
Finished supabase db push.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428000007_rpc_generate_invoice_from_so.sql
git commit -m "feat(db): add generate_invoice_from_so atomic RPC"
```

---

## Task 4: TypeScript types + hook additions

**Files:**
- Modify: `src/types/invoice.ts` — add `invoice_type` to `ArInvoice`
- Modify: `src/hooks/useSaleOrders.ts` — add `customer_type` to `useCreateCustomer`
- Modify: `src/hooks/useCustomerInvoices.ts` — add `useInvoicesBySO`, `useGenerateInvoice`

- [ ] **Step 1: Add `invoice_type` to `ArInvoice` in `src/types/invoice.ts`**

Find this block (lines 32–53):
```ts
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
```

Replace with:
```ts
/** AR invoice — customer-facing, generated from Sale Order */
export type ArInvoice = {
  id: string
  invoice_id: string               // display string e.g. "INV-00001"
  direction: 'ar'
  customer_id: string
  sale_order_id: string | null
  sale_delivery_id: string | null
  invoice_type: 'cash' | 'credit'  // set at generation time from customer_type
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
```

- [ ] **Step 2: Add `customer_type` to `useCreateCustomer` in `src/hooks/useSaleOrders.ts`**

Find:
```ts
export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; phone: string; email: string | null; credit_group_id?: string | null }) => {
```

Replace the type with:
```ts
    mutationFn: async (payload: { name: string; phone: string; email: string | null; credit_group_id?: string | null; customer_type?: 'cash' | 'credit' }) => {
```

- [ ] **Step 3: Add `useInvoicesBySO` and `useGenerateInvoice` to `src/hooks/useCustomerInvoices.ts`**

Append to the end of the file:

```ts
export function useInvoicesBySO(soId: string | null) {
  return useQuery({
    queryKey: ['invoices-by-so', soId],
    enabled: !!soId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('sale_order_id', soId!)
        .eq('direction', 'ar')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
        so_number:     data.sale_orders?.so_number ?? null,
      } as ArInvoice
    },
  })
}

export function useGenerateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (soId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('generate_invoice_from_so', { p_so_id: soId })
      if (error) throw error
      return data as { id: string; invoice_id: string; invoice_type: string }
    },
    onSuccess: (_data, soId) => {
      queryClient.invalidateQueries({ queryKey: ['invoices-by-so', soId] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', soId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/invoice.ts src/hooks/useSaleOrders.ts src/hooks/useCustomerInvoices.ts
git commit -m "feat(hooks): add useInvoicesBySO, useGenerateInvoice; invoice_type to ArInvoice"
```

---

## Task 5: SoDetailDialog — Invoice tab

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx`

**Context:** The dialog currently has 4 tabs: Items, Deliveries, Payments, Activity. We add a 5th tab "Invoice" at the end. It reuses `CustomerPaymentDialog` and `PaymentPlanDialog` that already exist in the codebase.

- [ ] **Step 1: Add new imports at the top of `src/components/sales/SoDetailDialog.tsx`**

Find the existing import block:
```ts
import { useCancelDelivery } from '@/hooks/useSaleDeliveries'
import { toast } from 'sonner'
import { useActivityLog } from '@/hooks/useActivityLog'
```

Replace with:
```ts
import { useCancelDelivery } from '@/hooks/useSaleDeliveries'
import {
  useInvoicesBySO,
  useGenerateInvoice,
  useSendInvoice,
} from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { CustomerPaymentDialog } from './CustomerPaymentDialog'
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'
import { toast } from 'sonner'
import { useActivityLog } from '@/hooks/useActivityLog'
```

- [ ] **Step 2: Add invoice state variables inside `SoDetailDialog` function**

Find:
```ts
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
```

Replace with:
```ts
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [invoicePayOpen, setInvoicePayOpen] = useState(false)
  const [invoicePlanOpen, setInvoicePlanOpen] = useState(false)
```

- [ ] **Step 3: Add invoice data hooks after the existing hook calls**

Find:
```ts
  const cancelDelivery = useCancelDelivery()
  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
```

Replace with:
```ts
  const cancelDelivery = useCancelDelivery()
  const generateInvoice = useGenerateInvoice()
  const sendInvoice = useSendInvoice()
  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: soInvoice } = useInvoicesBySO(open ? (so?.id ?? null) : null)
  const { data: invoicePayments } = useCustomerPayments(soInvoice?.id)
  const { data: paymentPlans } = usePaymentPlans(soInvoice?.id)
```

- [ ] **Step 4: Add computed invoice values after the existing `paymentStatus` block**

Find:
```ts
  function handleCancelDelivery(deliveryId: string) {
```

Insert before it:
```ts
  // Invoice tab computed values
  const totalInvoicePaid = (invoicePayments ?? []).reduce((s, p) => s + p.amount, 0)
  const invoiceOutstanding = (soInvoice?.total_amount ?? 0) - totalInvoicePaid
  const hasActivePlan = (paymentPlans ?? []).some((p) => p.status === 'active')
  const canGenerateInvoice =
    current !== null &&
    soInvoice === null &&
    ['partial_delivery', 'delivered'].includes(current.status)

  function handleGenerateInvoice() {
    if (!current) return
    generateInvoice.mutate(current.id, {
      onSuccess: () => toast.success('Invoice generated'),
      onError: (err) => {
        const msg = (err as Error).message
        if (msg === 'invoice_exists') toast.error('An invoice already exists for this order')
        else if (msg === 'so_not_deliverable') toast.error('Invoice can only be generated after delivery')
        else toast.error(msg)
      },
    })
  }

  function handleSendInvoice() {
    if (!soInvoice) return
    sendInvoice.mutate(soInvoice.id, {
      onSuccess: () => toast.success('Invoice marked as sent'),
      onError: () => toast.error('Failed to mark invoice as sent'),
    })
  }

  function handleCancelDelivery(deliveryId: string) {
```

- [ ] **Step 5: Add the Invoice tab trigger to `TabsList`**

Find:
```tsx
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
```

Replace with:
```tsx
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
              </TabsList>
```

- [ ] **Step 6: Add the Invoice tab content after the Activity tab content**

Find (the closing of the Activity TabsContent):
```tsx
              </TabsContent>
            </Tabs>
```

Replace with:
```tsx
              </TabsContent>

              {/* ── Invoice ──────────────────────────────────────── */}
              <TabsContent value="invoice" className="flex-1 overflow-y-auto space-y-4">
                {soInvoice === null && !canGenerateInvoice && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Invoice will be available once items are delivered.
                  </p>
                )}

                {soInvoice === null && canGenerateInvoice && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <p className="text-sm text-muted-foreground">No invoice generated yet.</p>
                    <Button
                      size="sm"
                      disabled={generateInvoice.isPending}
                      onClick={handleGenerateInvoice}
                    >
                      {generateInvoice.isPending ? 'Generating…' : 'Generate Invoice'}
                    </Button>
                  </div>
                )}

                {soInvoice !== null && (
                  <>
                    {/* Header badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{soInvoice.invoice_id}</span>
                      <Badge className={
                        soInvoice.doc_status === 'sent'           ? 'bg-green-100 text-green-700' :
                        soInvoice.doc_status === 'ready_to_send'  ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-slate-100 text-slate-700'
                      }>
                        {soInvoice.doc_status === 'ready_to_send' ? 'Ready to Send' :
                         soInvoice.doc_status === 'sent'          ? 'Sent' : 'Draft'}
                      </Badge>
                      <Badge className={
                        soInvoice.payment_status === 'paid'           ? 'bg-green-100 text-green-700' :
                        soInvoice.payment_status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                        soInvoice.payment_status === 'overdue'        ? 'bg-red-100 text-red-700' :
                                                                        'bg-slate-100 text-slate-600'
                      }>
                        {soInvoice.payment_status === 'partially_paid' ? 'Partially Paid' :
                         soInvoice.payment_status.charAt(0).toUpperCase() + soInvoice.payment_status.slice(1)}
                      </Badge>
                      <Badge className={
                        soInvoice.invoice_type === 'cash'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-purple-100 text-purple-700'
                      }>
                        {soInvoice.invoice_type === 'cash' ? 'Cash Invoice' : 'Credit Invoice'}
                      </Badge>
                    </div>

                    {/* Dates */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Issued: <span className="text-foreground">{formatDate(soInvoice.issued_date)}</span></span>
                      <span>Due: <span className="text-foreground">{formatDate(soInvoice.due_date)}</span></span>
                    </div>

                    {/* Line items */}
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="hidden sm:table-cell text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(soInvoice.invoice_line_items ?? []).map((li) => (
                            <TableRow key={li.id}>
                              <TableCell className="text-sm">{li.description}</TableCell>
                              <TableCell className="text-right text-sm">{li.qty ?? '—'}</TableCell>
                              <TableCell className="hidden sm:table-cell text-right text-sm">
                                {formatCurrency(li.unit_price ?? 0, 'QAR')}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(li.total ?? 0, 'QAR')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Totals */}
                    <div className="rounded-md border p-3 space-y-1 text-sm">
                      {(soInvoice.subtotal ?? 0) !== (soInvoice.total_amount ?? 0) && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{formatCurrency(soInvoice.subtotal ?? 0, 'QAR')}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span>{formatCurrency(soInvoice.total_amount ?? 0, 'QAR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="text-green-700">{formatCurrency(totalInvoicePaid, 'QAR')}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Outstanding</span>
                        <span className={invoiceOutstanding > 0 ? 'text-amber-700' : 'text-green-700'}>
                          {formatCurrency(invoiceOutstanding, 'QAR')}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {soInvoice.doc_status === 'ready_to_send' && (
                        <Button
                          size="sm"
                          disabled={sendInvoice.isPending}
                          onClick={handleSendInvoice}
                        >
                          {sendInvoice.isPending ? 'Sending…' : 'Send to Customer'}
                        </Button>
                      )}
                      {invoiceOutstanding > 0 && soInvoice.doc_status !== 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => setInvoicePayOpen(true)}>
                          Record Payment
                        </Button>
                      )}
                      {soInvoice.invoice_type === 'credit' &&
                        invoiceOutstanding >= PAYMENT_PLAN_THRESHOLD &&
                        !hasActivePlan && (
                        <Button variant="outline" size="sm" onClick={() => setInvoicePlanOpen(true)}>
                          Set Up Payment Plan
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
```

- [ ] **Step 7: Add the invoice dialogs at the bottom (inside the outer fragment, alongside the existing dialogs)**

Find:
```tsx
      {current && (
        <>
          <SoPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} so={current} />
          <SoDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} so={current} />
        </>
      )}
```

Replace with:
```tsx
      {current && (
        <>
          <SoPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} so={current} />
          <SoDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} so={current} />
        </>
      )}
      {soInvoice && invoicePayOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setInvoicePayOpen}
          invoice={soInvoice}
          alreadyPaid={totalInvoicePaid}
          plans={paymentPlans ?? []}
        />
      )}
      {soInvoice && invoicePlanOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setInvoicePlanOpen}
          invoiceId={soInvoice.id}
          outstanding={invoiceOutstanding}
        />
      )}
```

- [ ] **Step 8: Verify the file compiles (no TypeScript errors)**

```bash
npx tsc --noEmit 2>&1 | grep SoDetailDialog
```

Expected: no output (no errors in this file).

- [ ] **Step 9: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx
git commit -m "feat(ui): add Invoice tab to SoDetailDialog with generate/send/pay actions"
```

---

## Task 6: Create-SO page — cash customer UX

**Files:**
- Modify: `src/app/(dashboard)/sales/create-so/page.tsx`

**Context:** The page currently blocks SO creation for customers without a credit group (`noCreditGroup` check + button `disabled`). We remove that block, add a `customerType` state, show a cash badge instead of the credit panel, hide payment terms for cash, and update the "Add Customer" dialog to offer a type toggle.

- [ ] **Step 1: Add `customerType` state variable**

Find:
```ts
  const [customerCreditGroupId, setCustomerCreditGroupId]     = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]         = useState<number | null>(null)
```

Replace with:
```ts
  const [customerCreditGroupId, setCustomerCreditGroupId]     = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]         = useState<number | null>(null)
  const [customerType, setCustomerType]                       = useState<'cash' | 'credit' | null>(null)
```

- [ ] **Step 2: Add `newCustomerType` state for the "Add Customer" dialog**

Find:
```ts
  const [newCreditGroupId, setNewCreditGroupId]               = useState('')
```

Replace with:
```ts
  const [newCreditGroupId, setNewCreditGroupId]               = useState('')
  const [newCustomerType, setNewCustomerType]                 = useState<'cash' | 'credit'>('credit')
```

- [ ] **Step 3: Update `handleSelectCustomer` to capture customer_type**

Find:
```ts
  function handleSelectCustomer(c: {
    id: string; name: string
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
  }) {
    setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerOpen(false)
  }
```

Replace with:
```ts
  function handleSelectCustomer(c: {
    id: string; name: string
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
    customer_type?: string | null
  }) {
    setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerType((c.customer_type as 'cash' | 'credit') ?? 'credit')
    setCustomerOpen(false)
  }
```

- [ ] **Step 4: Remove `noCreditGroup` variable and update `validate()`**

Find:
```ts
  const noCreditGroup  = customerId !== '' && customerCreditGroupId === null

  function validate() {
    if (!customerId)            { toast.error('Please select a customer'); return false }
    if (noCreditGroup)          { toast.error('Customer has no credit group assigned'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
```

Replace with:
```ts
  function validate() {
    if (!customerId)            { toast.error('Please select a customer'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
```

- [ ] **Step 5: Update `buildPayload()` to force null payment fields for cash orders**

Find:
```ts
  function buildPayload(intent: 'quotation' | 'confirm') {
    return {
      customer_id:          customerId,
      intent,
      currency,
      exchange_rate:        exchangeRate,
      expected_delivery:    null,
      payment_terms:        terms.payment_terms || null,
      payment_terms_notes:  terms.payment_terms_notes || null,
      payment_milestones:   null,
```

Replace with:
```ts
  const isCash = customerType === 'cash'

  function buildPayload(intent: 'quotation' | 'confirm') {
    return {
      customer_id:          customerId,
      intent,
      currency,
      exchange_rate:        exchangeRate,
      expected_delivery:    null,
      payment_terms:        isCash ? null : (terms.payment_terms || null),
      payment_terms_notes:  isCash ? null : (terms.payment_terms_notes || null),
      payment_milestones:   null,
```

- [ ] **Step 6: Fix the toast message for pending_approval (credit-only)**

Find:
```ts
      onSuccess: (result) => {
        if (result.status === 'pending_approval') {
          toast.warning(`Saved — exceeds credit limit (available: ${fmtAmt(result.available, 'QAR')}). Sent for owner approval.`)
```

Replace with:
```ts
      onSuccess: (result) => {
        if (result.status === 'pending_approval') {
          toast.warning(`Saved — exceeds credit limit (available: ${fmtAmt(result.available, 'QAR')}). Submitted for owner approval.`)
```

(Same change is needed in `confirmOrder` — check that both toast messages are consistent.)

- [ ] **Step 7: Remove `noCreditGroup` disabled from header buttons**

Find:
```tsx
          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveQuotation} disabled={isPending || isPriceLoading || noCreditGroup}>
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Saving…' : 'Save as Quotation'}</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={confirmOrder} disabled={isPending || isPriceLoading || noCreditGroup}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Confirming…' : 'Confirm Order'}</span>
          </Button>
```

Replace with:
```tsx
          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveQuotation} disabled={isPending || isPriceLoading}>
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Saving…' : 'Save as Quotation'}</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={confirmOrder} disabled={isPending || isPriceLoading}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Confirming…' : 'Confirm Order'}</span>
          </Button>
```

- [ ] **Step 8: Replace the customer info panel (cash badge vs credit panel)**

Find:
```tsx
          {customerId && (
            noCreditGroup ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This customer has no credit group. Go to Master Data → Customers to assign one.
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
                <span>Limit: {fmtAmt(customerCreditLimit ?? 0, 'QAR')}</span>
              </div>
            )
          )}
```

Replace with:
```tsx
          {customerId && customerType === 'cash' && (
            <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              <Badge className="bg-orange-500 text-white text-[10px]">Cash Sale</Badge>
              <span>Payment due on delivery. No credit check applied.</span>
            </div>
          )}
          {customerId && customerType !== 'cash' && customerCreditGroupName && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
              <span>Limit: {fmtAmt(customerCreditLimit ?? 0, 'QAR')}</span>
            </div>
          )}
```

- [ ] **Step 9: Update customer list item to show "Cash" instead of the red "No credit group" warning**

Find:
```tsx
                          <CommandItem key={c.id} value={c.name} onSelect={() => handleSelectCustomer(c)}>
                            <Check className={`mr-2 h-4 w-4 ${customerId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex-1">
                              <span>{c.name}</span>
                              {!c.credit_group_id && <span className="ml-2 text-[10px] text-destructive">No credit group</span>}
                            </div>
                          </CommandItem>
```

Replace with:
```tsx
                          <CommandItem key={c.id} value={c.name} onSelect={() => handleSelectCustomer(c)}>
                            <Check className={`mr-2 h-4 w-4 ${customerId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex-1">
                              <span>{c.name}</span>
                              {c.customer_type === 'cash' && (
                                <span className="ml-2 text-[10px] text-orange-600 font-medium">Cash</span>
                              )}
                            </div>
                          </CommandItem>
```

- [ ] **Step 10: Hide Payment Terms section for cash customers in the Terms section**

Find:
```tsx
        {/* ⑤ Terms */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Terms</h2>
          <SoTermsSection value={terms} onChange={setTerms} />
        </section>
```

Replace with:
```tsx
        {/* ⑤ Terms */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Terms</h2>
          {isCash ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground rounded-md border border-orange-100 bg-orange-50 px-3 py-2">
                Cash sale — payment terms are not applicable. Delivery terms and notes are still available.
              </p>
              {/* Delivery terms + customer notes only */}
              <SoTermsSection value={terms} onChange={setTerms} hidePaymentTerms />
            </div>
          ) : (
            <SoTermsSection value={terms} onChange={setTerms} />
          )}
        </section>
```

- [ ] **Step 11: Add `hidePaymentTerms` prop to `SoTermsSection`**

In `src/components/sales/SoTermsSection.tsx`, find:
```ts
interface SoTermsSectionProps {
  value: SoTermsValues
  onChange: (values: SoTermsValues) => void
}

export function SoTermsSection({ value, onChange }: SoTermsSectionProps) {
```

Replace with:
```ts
interface SoTermsSectionProps {
  value: SoTermsValues
  onChange: (values: SoTermsValues) => void
  hidePaymentTerms?: boolean
}

export function SoTermsSection({ value, onChange, hidePaymentTerms = false }: SoTermsSectionProps) {
```

Then wrap the Payment Terms block inside the function:

Find:
```tsx
      <div className="space-y-2">
        <Label className="text-sm font-medium">Payment Terms</Label>
```

Replace with:
```tsx
      {!hidePaymentTerms && <div className="space-y-2">
        <Label className="text-sm font-medium">Payment Terms</Label>
```

And close the conditional right before the Delivery Terms block. Find the end of the Payment Terms block:
```tsx
        {value.payment_terms === 'Custom' && (
          <Input
            placeholder="Describe custom payment terms..."
            value={value.payment_terms_notes}
            onChange={(e) => set('payment_terms_notes', e.target.value)}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery Terms</Label>
```

Replace with:
```tsx
        {value.payment_terms === 'Custom' && (
          <Input
            placeholder="Describe custom payment terms..."
            value={value.payment_terms_notes}
            onChange={(e) => set('payment_terms_notes', e.target.value)}
          />
        )}
      </div>}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery Terms</Label>
```

- [ ] **Step 12: Update the "Add Customer" dialog — add type radio and conditional credit group**

Find the entire Add Customer Dialog content block:
```tsx
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Phone *</label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+974 XXXX XXXX" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Email</label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="optional" /></div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Credit Group *</label>
              <select
                value={newCreditGroupId}
                onChange={(e) => setNewCreditGroupId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a credit group…</option>
                {creditGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
```

Replace with:
```tsx
          <div className="space-y-3">
            {/* Customer type */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Customer Type *</label>
              <div className="flex gap-2">
                {(['credit', 'cash'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setNewCustomerType(t); if (t === 'cash') setNewCreditGroupId('') }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      newCustomerType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {t === 'credit' ? 'Credit' : 'Cash'}
                  </button>
                ))}
              </div>
              {newCustomerType === 'cash' && (
                <p className="text-[10px] text-muted-foreground">Cash customers pay on delivery. No credit limit applies.</p>
              )}
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Phone *</label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+974 XXXX XXXX" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Email</label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="optional" /></div>
            {newCustomerType === 'credit' && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Credit Group *</label>
                <select
                  value={newCreditGroupId}
                  onChange={(e) => setNewCreditGroupId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select a credit group…</option>
                  {creditGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
```

- [ ] **Step 13: Update `handleAddCustomer` validation and payload**

Find:
```ts
  function handleAddCustomer() {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return }
    if (!newCreditGroupId) { toast.error('Please select a credit group'); return }
    const groupId = newCreditGroupId || null
    createCust.mutate(
      { name: newName.trim(), phone: newPhone.trim(), email: newEmail || null, credit_group_id: groupId },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          const group = creditGroups.find((g) => g.id === groupId)
          handleSelectCustomer({
            id:                 data.id,
            name:               data.name,
            credit_group_id:    groupId,
            credit_group_name:  group?.name  ?? null,
            credit_group_limit: group?.credit_limit ?? null,
          })
          setAddOpen(false); setNewName(''); setNewPhone(''); setNewEmail(''); setNewCreditGroupId('')
```

Replace with:
```ts
  function handleAddCustomer() {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return }
    if (newCustomerType === 'credit' && !newCreditGroupId) { toast.error('Please select a credit group'); return }
    const groupId = newCustomerType === 'credit' ? (newCreditGroupId || null) : null
    createCust.mutate(
      { name: newName.trim(), phone: newPhone.trim(), email: newEmail || null, credit_group_id: groupId, customer_type: newCustomerType },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          const group = creditGroups.find((g) => g.id === groupId)
          handleSelectCustomer({
            id:                 data.id,
            name:               data.name,
            credit_group_id:    groupId,
            credit_group_name:  group?.name  ?? null,
            credit_group_limit: group?.credit_limit ?? null,
            customer_type:      newCustomerType,
          })
          setAddOpen(false); setNewName(''); setNewPhone(''); setNewEmail(''); setNewCreditGroupId(''); setNewCustomerType('credit')
```

- [ ] **Step 14: Remove the now-unused `AlertTriangle` import if no longer used**

Check the top of the file. If `AlertTriangle` is only used in the removed `noCreditGroup` panel, remove it from the import:

Find:
```ts
import { ArrowLeft, Plus, Save, CheckCircle2, Users, Package, AlertTriangle } from 'lucide-react'
```

Replace with:
```ts
import { ArrowLeft, Plus, Save, CheckCircle2, Users, Package } from 'lucide-react'
```

- [ ] **Step 15: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep -E "create-so|SoTerms"
```

Expected: no output.

- [ ] **Step 16: Commit**

```bash
git add src/app/(dashboard)/sales/create-so/page.tsx src/components/sales/SoTermsSection.tsx
git commit -m "feat(ui): cash customer UX on create-SO page — type toggle, hidden terms, no credit block"
```

---

## Final: Update PROGRESS.md

- [ ] **Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-27] **[SO Invoice Cash/Credit Plan] ALL TASKS COMPLETE** — `supabase/migrations/20260428000005–00007`, `src/types/invoice.ts`, `src/hooks/useCustomerInvoices.ts`, `src/hooks/useSaleOrders.ts`, `src/components/sales/SoDetailDialog.tsx`, `src/components/sales/SoTermsSection.tsx`, `src/app/(dashboard)/sales/create-so/page.tsx` — Cash/credit customer type enforcement; atomic generate_invoice_from_so RPC; Invoice tab in SoDetailDialog with generate/send/pay/plan actions; cash UX on create-SO page
```

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — SO invoice cash/credit complete"
```
