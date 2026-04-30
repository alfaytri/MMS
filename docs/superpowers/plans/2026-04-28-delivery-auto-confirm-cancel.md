# Delivery Auto-Confirm + Cancel-Delivered Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliveries confirm instantly on creation (no separate "Complete" step), and users can cancel a delivered delivery to reverse inventory and re-deliver later.

**Architecture:** Two new Postgres RPCs: `create_and_confirm_delivery` (atomically inserts + completes in one transaction) and `cancel_delivery_inventory` (atomically reverses FIFO layers, COGS entries, stock level, delivered_qty, and SO status). The "Complete" button is removed from the deliveries page; the Cancel button is extended to show on `delivered` deliveries. Delivery number generation moves to a DB sequence to eliminate the client-side race condition.

**Tech Stack:** Next.js 15, Supabase (Postgres RPCs, RLS), React Query, TypeScript, Tailwind CSS / shadcn

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/20260428000001_delivery_sequence_and_rpcs.sql` | DB sequence + `create_and_confirm_delivery` RPC + `cancel_delivery_inventory` RPC |
| `src/hooks/useSaleOrders.ts` | `useCreateDelivery` — call single `create_and_confirm_delivery` RPC |
| `src/hooks/useSaleDeliveries.ts` | `useCancelDelivery` — call `cancel_delivery_inventory` RPC |
| `src/components/sales/SoDetailDialog.tsx` | Cancel button shows for `delivered` too |
| `src/app/(dashboard)/sales/deliveries/page.tsx` | Remove Complete button, remove unused `DeliveryFormDialog` import/state |

---

## Task 1: Migration — Sequence + Two RPCs

**Files:**
- Create: `supabase/migrations/20260428000001_delivery_sequence_and_rpcs.sql`

### What this migration contains

**a) `sale_delivery_number_seq`** — Postgres sequence for collision-free delivery numbers. Initialized from the highest existing number so it doesn't reuse IDs.

**b) `create_and_confirm_delivery(p_so_id, p_warehouse_id, p_warehouse_name, p_date, p_items)`**
- Generates a delivery number atomically using the sequence
- INSERTs into `sale_deliveries` with `status='pending'`
- Calls `complete_delivery_inventory` (runs in the same transaction — fully atomic)
- Returns `(id UUID, delivery_number TEXT)` so the client has the created record

**c) `cancel_delivery_inventory(p_delivery_id, p_so_id)`**
- Guards: raises if already `cancelled`
- Sets status → `cancelled`
- If was `delivered`: loops over `cogs_entries` for this delivery to get the exact cost per item (one entry per item, containing weighted average cost from the original FIFO deduction), then for each entry:
  - Restores a `fifo_cost_layers` row using the delivery's own date (not CURRENT_DATE — preserves chronological queue position)
  - Updates `inventory_brand_variants.stock_level += qty`
  - Calls `recalc_average_cost`
  - Deletes the `cogs_entry`
  - Deletes the `inventory_stock_movements` row for this item
- Updates `sale_order_lines.delivered_qty` by matching on `brand_variant_id` (same strategy as `complete_delivery_inventory` — consistent across the codebase; a follow-up PR will add `sale_order_line_id` to `DeliveryItem` for exact-line matching)
- Recalculates SO status: `delivered → partial_delivery → confirmed`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260428000001_delivery_sequence_and_rpcs.sql

BEGIN;

-- ─── Delivery number sequence ────────────────────────────────────────────────
-- Generates collision-free DEL-XXXXX numbers without client-side race conditions.
-- Initialized to max existing number so no IDs are reused.

CREATE SEQUENCE IF NOT EXISTS sale_delivery_number_seq START WITH 1;

SELECT setval(
  'sale_delivery_number_seq',
  GREATEST(1, COALESCE(
    (SELECT MAX(
       CASE WHEN delivery_number ~ '^DEL-[0-9]+$'
            THEN CAST(SUBSTRING(delivery_number FROM 5) AS INT)
            ELSE 0
       END
     ) FROM sale_deliveries),
    0
  ))
);

-- ─── create_and_confirm_delivery ─────────────────────────────────────────────
-- Inserts a new sale_delivery row and immediately confirms it in one transaction.
-- Returns the created delivery id and delivery_number.

CREATE OR REPLACE FUNCTION create_and_confirm_delivery(
  p_so_id          UUID,
  p_warehouse_id   UUID,
  p_warehouse_name TEXT,
  p_date           DATE,
  p_items          JSONB
)
RETURNS TABLE(id UUID, delivery_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
BEGIN
  v_delivery_number := 'DEL-' || LPAD(nextval('sale_delivery_number_seq')::TEXT, 5, '0');

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, items, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, p_items, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  -- Runs in the same transaction — fully atomic
  PERFORM complete_delivery_inventory(v_new_id, p_so_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_confirm_delivery(UUID, UUID, TEXT, DATE, JSONB) TO authenticated;

-- ─── cancel_delivery_inventory ───────────────────────────────────────────────
-- Cancels a delivery and reverses all inventory effects if it was delivered.

CREATE OR REPLACE FUNCTION cancel_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery  RECORD;
  v_cogs      RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_total_qty INT;
  v_delivered INT;
BEGIN
  SELECT warehouse_id, date, items, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery % is already cancelled', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;

  UPDATE sale_deliveries
  SET    status = 'cancelled', updated_at = now()
  WHERE  id = p_delivery_id;

  IF v_delivery.status = 'delivered' THEN

    -- ── Reverse delivered_qty on SO lines (match by bv_id, same as complete_delivery_inventory) ──
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
    LOOP
      v_bv_id := (v_item->>'brand_variant_id')::UUID;
      v_qty   := (v_item->>'qty_delivered')::INT;

      CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

      IF v_bv_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_bv_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = (v_item->>'item_name')
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- ── Restore FIFO layers from cogs_entries (one entry per item, weighted avg cost) ──
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      -- Restore FIFO layer using delivery date (preserves chronological queue order)
      -- total_unit_cost is per-unit in this schema (unit_cost + landed_cost_per_unit)
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      -- Delete outbound stock movement for this item
      DELETE FROM inventory_stock_movements
      WHERE  reference_type  = 'sale_delivery'
        AND  reference_id    = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    -- Delete all COGS entries for this delivery
    DELETE FROM cogs_entries
    WHERE  sale_delivery_id = p_delivery_id;

    -- ── Recalculate SO status ────────────────────────────────────────────────
    SELECT COALESCE(SUM(qty), 0), COALESCE(SUM(delivered_qty), 0)
    INTO   v_total_qty, v_delivered
    FROM   sale_order_lines
    WHERE  sale_order_id = p_so_id;

    IF v_delivered >= v_total_qty AND v_total_qty > 0 THEN
      UPDATE sale_orders
      SET    status = 'delivered', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    ELSIF v_delivered > 0 THEN
      UPDATE sale_orders
      SET    status = 'partial_delivery', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    ELSE
      UPDATE sale_orders
      SET    status = 'confirmed', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    END IF;

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_inventory(UUID, UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Verify both RPCs exist**

```bash
npx supabase db diff
```

Expected: no pending diff.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428000001_delivery_sequence_and_rpcs.sql
git commit -m "feat(db): delivery sequence + create_and_confirm_delivery + cancel_delivery_inventory RPCs"
```

---

## Task 2: Update `useCreateDelivery` to call single RPC

**Files:**
- Modify: `src/hooks/useSaleOrders.ts` (lines ~534–599)

Replace the entire `mutationFn` and `onSuccess` of `useCreateDelivery`.

- [ ] **Step 1: Replace the mutationFn**

Find the `mutationFn: async (payload` block inside `useCreateDelivery` and replace it entirely with:

```typescript
mutationFn: async (payload: {
  so_id: string
  warehouse_id: string
  warehouse_name: string
  date: string
  items: { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[]
}) => {
  const supabase = createClient()

  const { data, error } = await (supabase as any)
    .rpc('create_and_confirm_delivery', {
      p_so_id:          payload.so_id,
      p_warehouse_id:   payload.warehouse_id,
      p_warehouse_name: payload.warehouse_name,
      p_date:           payload.date,
      p_items:          payload.items,
    })
    .single()
  if (error) throw new Error(error.message)

  return data as { id: string; delivery_number: string }
},
```

- [ ] **Step 2: Replace the onSuccess**

Find the `onSuccess` callback of `useCreateDelivery` and replace it with:

```typescript
onSuccess: (_data, variables) => {
  queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
  queryClient.invalidateQueries({ queryKey: ['sale-order', variables.so_id] })
  queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
  queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
  queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
  queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
  queryClient.invalidateQueries({ queryKey: ['cogs-entries'] })
  queryClient.invalidateQueries({ queryKey: ['activity-log'] })
  logActivity({
    action:    'Delivery Created',
    module:    'sale_orders',
    entity_id: variables.so_id,
    details:   `${variables.items.length} item(s) · ${variables.warehouse_name} · auto-confirmed`,
    severity:  'info',
  })
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSaleOrders.ts
git commit -m "feat(hooks): useCreateDelivery calls create_and_confirm_delivery RPC — atomic insert + confirm"
```

---

## Task 3: Update `useCancelDelivery` to call new RPC

**Files:**
- Modify: `src/hooks/useSaleDeliveries.ts` (lines ~149–174)

- [ ] **Step 1: Replace the entire `useCancelDelivery` export**

```typescript
export function useCancelDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, soId }: { id: string; soId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('cancel_delivery_inventory', {
          p_delivery_id: id,
          p_so_id:       soId,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.soId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ['cogs-entries'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      logActivity({
        action:    'Delivery Cancelled',
        module:    'sale_orders',
        entity_id: variables.soId,
        severity:  'warning',
      })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSaleDeliveries.ts
git commit -m "feat(hooks): useCancelDelivery calls cancel_delivery_inventory RPC — supports cancelling delivered deliveries"
```

---

## Task 4: UI changes

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx`
- Modify: `src/app/(dashboard)/sales/deliveries/page.tsx`

### 4a — SoDetailDialog: Cancel button shows for `delivered`

- [ ] **Step 1: Update cancel button guard**

In `src/components/sales/SoDetailDialog.tsx`, find:

```tsx
{(d.status === 'pending' || d.status === 'in_progress') && (
```

Replace with:

```tsx
{(d.status === 'pending' || d.status === 'in_progress' || d.status === 'delivered') && (
```

### 4b — Deliveries page: remove Complete button + dead state

- [ ] **Step 2: Remove the `actions` column from the columns array**

In `src/app/(dashboard)/sales/deliveries/page.tsx`, find and remove the entire object:

```tsx
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
```

- [ ] **Step 3: Remove `activeDelivery` state**

Find and remove:

```tsx
const [activeDelivery, setActiveDelivery] = useState<SaleDelivery | null>(null)
```

- [ ] **Step 4: Remove `DeliveryFormDialog` import**

Find and remove the import line:

```tsx
import { DeliveryFormDialog } from '@/components/sales/DeliveryFormDialog'
```

- [ ] **Step 5: Remove `DeliveryFormDialog` JSX**

Find and remove the rendered `<DeliveryFormDialog ... />` component block at the bottom of the page JSX. It will look like:

```tsx
{activeDelivery && (
  <DeliveryFormDialog
    open={!!activeDelivery}
    onOpenChange={(v) => { if (!v) setActiveDelivery(null) }}
    delivery={activeDelivery}
  />
)}
```

(The exact shape may vary slightly — remove the entire block that references `activeDelivery` and `DeliveryFormDialog`.)

- [ ] **Step 6: Check and clean React imports**

Open the file and inspect the React import line (usually line 1). If `useState` is no longer used anywhere in the file after removing `activeDelivery`, remove it from the import:

```tsx
// Before (if useState was the only hook used):
import { useState, useMemo } from 'react'

// After:
import { useMemo } from 'react'
```

If `useMemo` or other hooks are still used, keep only those.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. No unused import warnings.

- [ ] **Step 8: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx src/app/(dashboard)/sales/deliveries/page.tsx
git commit -m "feat(ui): cancel button on delivered deliveries; remove Complete button from deliveries page"
```

---

## Task 5: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed` (top of list):

```
- [2026-04-28] **Delivery Auto-Confirm + Cancel-Delivered: All Tasks** — `supabase/migrations/20260428000001_delivery_sequence_and_rpcs.sql`, `src/hooks/useSaleOrders.ts`, `src/hooks/useSaleDeliveries.ts`, `src/components/sales/SoDetailDialog.tsx`, `src/app/(dashboard)/sales/deliveries/page.tsx` — Deliveries auto-confirm on creation via atomic RPC; cancel reverses inventory for delivered deliveries; delivery numbers generated by DB sequence
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — delivery auto-confirm + cancel-delivered complete"
```

---

## Known Follow-up (out of scope for this PR)

**Issue: SO line matching by `brand_variant_id` is imprecise when an SO has two lines for the same product.**
Both `complete_delivery_inventory` and `cancel_delivery_inventory` match `sale_order_lines` by `brand_variant_id`. This is consistent across both RPCs. The proper fix requires adding `sale_order_line_id` to the `DeliveryItem` type, updating `SoDeliveryDialog`, and updating both RPCs — a separate, coordinated schema change.
