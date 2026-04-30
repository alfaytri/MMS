# PO Status Auto-Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic PO status transitions (`approved` -> `partially_received` -> `received` -> `completed`) triggered by receival and payment events, and expose the new `completed` status in the UI.

**Architecture:** A single SQL function `refresh_po_status` computes the correct status from live data and updates the PO row; it is called at the end of `create_and_approve_receival` (receival path) and from the TypeScript payment hook (payment path). A one-time backfill runs the function over all non-terminal, non-draft POs. The TypeScript type union and UI badge map are extended to cover the new status.

**Tech Stack:** PostgreSQL 15 (Supabase), TypeScript 5, Next.js 14 App Router, TanStack Query v5, Tailwind CSS

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/20260429000002_po_auto_progress_status.sql` | Create | Adds `completed` to the `po_status` enum; creates `refresh_po_status(UUID)`; backfills existing POs; patches `create_and_approve_receival` to call it |
| `src/hooks/usePurchaseOrders.ts` | Modify | Adds `'completed'` to `POStatus` type; calls `refresh_po_status` RPC after a payment insert succeeds |
| `src/app/(dashboard)/purchase/orders/page.tsx` | Modify | Adds `completed` entry to `STATUS_OPTIONS` and `STATUS_COLORS`; fixes `paid` payment-filter predicate to include `completed` |

---

### Task 1: Migration — enum value, refresh function, receival hook, backfill

**Files:**
- Create: `supabase/migrations/20260429000002_po_auto_progress_status.sql`

- [ ] **Step 1: Create the migration file with the full SQL**

Create `supabase/migrations/20260429000002_po_auto_progress_status.sql` with the content below (copy verbatim):

```sql
-- supabase/migrations/20260429000002_po_auto_progress_status.sql
BEGIN;

-- 1. Extend the enum
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'received';

-- 2. refresh_po_status
--
-- Rules (only applies to POs that are NOT draft / pending_approval / cancelled):
--
--   approved          -> partially_received  when ANY line item has received_qty > 0
--   partially_received -> received           when ALL line items are fully received
--                                            (received_qty >= qty for every row)
--   received          -> completed           when fully received AND
--                                            SUM(payments.amount_qar) >= purchase_orders.total_qar
--
-- Transitions are strictly forward; the function never moves a status backward.
-- POs in draft / pending_approval / cancelled are left untouched.
CREATE OR REPLACE FUNCTION refresh_po_status(p_po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status  po_status;
  v_total_qar       NUMERIC;
  v_total_paid_qar  NUMERIC;
  v_line_count      INT;
  v_fully_received  INT;
  v_any_received    INT;
  v_new_status      po_status;
BEGIN
  -- Load current state
  SELECT status, COALESCE(total_qar, 0)
  INTO   v_current_status, v_total_qar
  FROM   purchase_orders
  WHERE  id = p_po_id;

  -- Skip statuses that auto-progression must never touch
  IF v_current_status IN ('draft', 'pending_approval', 'cancelled') THEN
    RETURN;
  END IF;

  -- Receival counters from po_line_items
  SELECT
    COUNT(*)                                                 AS total_lines,
    COUNT(*) FILTER (WHERE received_qty > 0)                 AS any_received,
    COUNT(*) FILTER (WHERE received_qty >= qty AND qty > 0)  AS fully_received
  INTO v_line_count, v_any_received, v_fully_received
  FROM po_line_items
  WHERE po_id = p_po_id;

  -- Total confirmed payments in QAR
  SELECT COALESCE(SUM(amount_qar), 0)
  INTO   v_total_paid_qar
  FROM   payments
  WHERE  source_type = 'purchase_order'
    AND  source_id   = p_po_id
    AND  status NOT IN ('cancelled', 'rejected');

  -- Determine target status (forward-only)
  v_new_status := v_current_status;

  IF v_current_status = 'approved' AND v_any_received > 0 THEN
    IF v_line_count > 0 AND v_fully_received = v_line_count THEN
      -- All items fully received on first receival: jump straight to received
      v_new_status := 'received';
    ELSE
      v_new_status := 'partially_received';
    END IF;
  END IF;

  IF v_new_status = 'partially_received'
     AND v_line_count > 0
     AND v_fully_received = v_line_count
  THEN
    v_new_status := 'received';
  END IF;

  IF v_new_status = 'received'
     AND v_total_qar > 0
     AND v_total_paid_qar >= v_total_qar
  THEN
    v_new_status := 'completed';
  END IF;

  -- Write only if changed
  IF v_new_status <> v_current_status THEN
    UPDATE purchase_orders
    SET    status     = v_new_status,
           updated_at = now()
    WHERE  id = p_po_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_po_status(UUID) TO authenticated;

-- 3. Patch create_and_approve_receival to call refresh_po_status
--
-- Re-create the function from 20260425000065 with one extra line:
--   PERFORM refresh_po_status(p_po_id);
-- inserted immediately before the RETURN statement.
CREATE OR REPLACE FUNCTION create_and_approve_receival(
  p_po_id            UUID,
  p_warehouse_id     UUID,
  p_date             DATE,
  p_received_by_name TEXT,
  p_receival_number  TEXT,
  p_notes            TEXT,
  p_items            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receival_id UUID;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_pli_id      UUID;
BEGIN
  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    p_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false)
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, p_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  -- Auto-progress PO status based on received quantities
  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- 4. Backfill existing POs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM   purchase_orders
    WHERE  status NOT IN ('draft', 'pending_approval', 'cancelled')
    ORDER BY created_at
  LOOP
    PERFORM refresh_po_status(r.id);
  END LOOP;
END;
$$;

COMMIT;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: output ending with `Finished supabase db push.` and no errors. If the `ADD VALUE IF NOT EXISTS` line errors, confirm CLI >= 1.150 with `npx supabase --version`.

- [ ] **Step 3: Smoke-test the function exists in the DB**

```bash
npx supabase db execute --sql "SELECT proname FROM pg_proc WHERE proname = 'refresh_po_status';"
```

Expected: one row returned — `refresh_po_status`.

- [ ] **Step 4: Verify the enum now contains `completed`**

```bash
npx supabase db execute --sql "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'po_status' ORDER BY enumsortorder;"
```

Expected rows (in order): `draft`, `pending_approval`, `approved`, `partially_received`, `received`, `cancelled`, `completed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260429000002_po_auto_progress_status.sql
git commit -m "feat: add po_status=completed and refresh_po_status RPC with backfill"
```

---

### Task 2: TypeScript hook — type union and payment trigger

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts` lines 22-28 (POStatus type) and lines 576-578 (payment hook mutationFn)

- [ ] **Step 1: Add `'completed'` to the `POStatus` union**

Open `src/hooks/usePurchaseOrders.ts`. Find the `POStatus` type at line 22. Replace the entire type declaration.

Before (lines 22-28):
```typescript
export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'
```

After:
```typescript
export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'
  | 'completed'
```

- [ ] **Step 2: Call `refresh_po_status` after a successful payment insert**

In the same file, find the `useCreatePOPayment` `mutationFn`. The relevant block at line 576 currently reads:

```typescript
      if (error) throw error

      const payPerformer = await resolveMyName()
```

Insert one `await` call between the error guard and the activity log:

```typescript
      if (error) throw error

      await (supabase as any).rpc('refresh_po_status', { p_po_id: payment.po_id })

      const payPerformer = await resolveMyName()
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts
git commit -m "feat: extend POStatus with completed; call refresh_po_status after payment"
```

---

### Task 3: UI changes and final type-check

**Files:**
- Modify: `src/app/(dashboard)/purchase/orders/page.tsx`

- [ ] **Step 1: Add `completed` to `STATUS_OPTIONS`**

Find the `STATUS_OPTIONS` array (line 31). Add one entry after `received` and before `cancelled`.

Before:
```typescript
const STATUS_OPTIONS: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]
```

After:
```typescript
const STATUS_OPTIONS: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
```

- [ ] **Step 2: Add `completed` to `STATUS_COLORS`**

Find the `STATUS_COLORS` object at line 55. Add the `completed` entry between `received` and `cancelled`.

Before:
```typescript
const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}
```

After:
```typescript
const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
}
```

- [ ] **Step 3: Fix the `paid` payment-filter predicate**

Find the payment filter block at line 143. Change the single-status check for `paid` to an array check.

Before (line 145):
```typescript
        if (paymentFilter === 'paid') return o.status === 'received'
```

After:
```typescript
        if (paymentFilter === 'paid') return ['received', 'completed'].includes(o.status)
```

The full block after the edit:
```typescript
    if (paymentFilter) {
      result = result.filter((o) => {
        if (paymentFilter === 'paid') return ['received', 'completed'].includes(o.status)
        if (paymentFilter === 'unpaid') return ['draft', 'pending_approval', 'approved'].includes(o.status)
        if (paymentFilter === 'partial') return o.status === 'partially_received'
        return true
      })
    }
```

- [ ] **Step 4: Run the full TypeScript type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. The `Record<POStatus, string>` type on `STATUS_COLORS` enforces that every member of the union has an entry — this confirms the `completed` key satisfies that exhaustiveness constraint.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/purchase/orders/page.tsx
git commit -m "feat: show completed status badge and fix paid filter to include completed"
```

---

## Self-Review Checklist

| Spec requirement | Covered by |
|---|---|
| Add `completed` to DB enum | Task 1 Step 1 — `ALTER TYPE po_status ADD VALUE` |
| `approved` -> `partially_received` on first receival | Task 1 — `refresh_po_status` forward-progression block 1 |
| `partially_received` -> `received` when all items fully received | Task 1 — `refresh_po_status` forward-progression block 2 |
| `received` -> `completed` when fully received AND paid in full | Task 1 — `refresh_po_status` forward-progression block 3 |
| Never touch `draft` / `pending_approval` / `cancelled` | Task 1 — early `RETURN` guard in `refresh_po_status` |
| Call `refresh_po_status` from `create_and_approve_receival` | Task 1 — `CREATE OR REPLACE` of the receival RPC with `PERFORM refresh_po_status` before `RETURN` |
| Call `refresh_po_status` from payment hook | Task 2 Step 2 |
| Backfill existing POs | Task 1 Step 1 — `DO $$ ... LOOP PERFORM refresh_po_status` block |
| Add `'completed'` to `POStatus` TypeScript type | Task 2 Step 1 |
| UI status filter shows Completed option | Task 3 Step 1 |
| UI badge renders teal for Completed | Task 3 Step 2 |
| `paid` filter includes `completed` POs | Task 3 Step 3 |
| `tsc --noEmit` passes | Task 3 Step 4 |
