# Inventory Receivals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feature that lets authorized users create receival records directly from the Inventory view — carving stock out of existing FIFO layers (primary) or adding new stock (secondary) — so Landed Costs can be attached to specific batches after the Odoo data migration.

**Architecture:** Reuse the existing `receivals` + `receival_items` + `fifo_cost_layers` tables with a new `source_type` discriminator column. A new atomic RPC `create_inventory_receival` handles carve/new-stock modes. A new role toggle `is_inventory_receiver` gates the create action; regular `purchase.receivals.view` permission gates the read.

**Tech Stack:** PostgreSQL 15 (Supabase), Next.js 15 App Router, TypeScript, TanStack Query, react-hook-form + Zod, shadcn/ui, lucide-react icons.

**Design doc:** [`docs/specs/2026-07-09-inventory-receivals-design.md`](../specs/2026-07-09-inventory-receivals-design.md)

---

## Scope & Non-Goals

**In scope:**
- New DB migration for schema changes (5 columns/1 sequence/1 constraint)
- New `create_inventory_receival` RPC
- New role toggle `is_inventory_receiver` in RoleFormDialog
- New Inventory Receival dialog reachable from brand variant rows
- Warehouse column added to inventory FIFO source table
- View button on FIFO source rows + Receivals list rows
- Source filter + INV badge on Receivals list
- Inventory-receival-specific sections in ReceivalDetailDialog

**Out of scope:**
- Landed Cost creation flow (uses existing LC page unchanged)
- Multi-item inventory receivals (only single-item per receival)
- Bulk carve operations
- Editing an existing inventory receival (uses existing receival edit flow if needed)

---

## File Structure

**Phase 1 — Database:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

**Phase 2 — Types & Hooks:**
- Modify: `src/hooks/useRoles.ts` — add `is_inventory_receiver` to `CustomRole`
- Modify: `src/hooks/useReceivals.ts` — extend filter to accept `source_type`
- Create: `src/hooks/useInventoryReceivals.ts` — three new hooks

**Phase 3 — Role toggle UI:**
- Modify: `src/components/master-data/RoleFormDialog.tsx` — add third toggle

**Phase 4 — Inventory receival dialog + button:**
- Create: `src/components/inventory/InventoryReceivalDialog.tsx` — the popup
- Modify: inventory tree row component (find during Phase 4) — add trigger button + warehouse column + view button

**Phase 5 — Receivals page integration:**
- Modify: `src/app/(dashboard)/purchase/receivals/page.tsx` — source filter, INV badge, new source column
- Modify: `src/components/purchase/ReceivalDetailDialog.tsx` — hide PO section for inventory receivals, add Carved From + Created By/At sections

**Phase 6 — Manual QA and rollout:**
- No new files; verification against staging DB.

---

# Phase 1 — Database Schema & RPC

### Task 1: Create the migration file skeleton

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql` (replace `YYYYMMDDHHMMSS` with output of the `date` command below)

- [ ] **Step 1: Generate the migration filename**

Run:
```bash
date -u +"%Y%m%d%H%M%S"
```
Note the output (e.g., `20260709153000`). Use that as the prefix.

- [ ] **Step 2: Create the migration file with the header comment block**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Receivals feature — schema + RPC.
--
-- Adds a new "inventory" source_type to the receivals table so users can create
-- receivals that are not tied to a Purchase Order. Used primarily to carve
-- existing FIFO layers into batches so Landed Costs can be attached, after
-- migrating stock data from Odoo.
--
-- See docs/specs/2026-07-09-inventory-receivals-design.md.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ...body will follow in subsequent steps...

COMMIT;
```

- [ ] **Step 3: Commit the empty skeleton**

```bash
git add supabase/migrations/*_inventory_receivals.sql
git commit -m "feat(db): add empty inventory_receivals migration skeleton

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add the role toggle column

**Files:**
- Modify: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

- [ ] **Step 1: Insert the `custom_roles` alter above the `COMMIT;` line**

```sql
-- 1. Role toggle: users holding a role with is_inventory_receiver = true can
--    create Inventory Receivals from the Inventory view.
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS is_inventory_receiver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_roles.is_inventory_receiver IS
  'When TRUE, users holding this role can create Inventory Receivals (receivals not tied to any PO). Mirrors is_approval_slot and is_field_rp.';
```

- [ ] **Step 2: Verify the file parses locally by running a dry-run push**

```bash
npx supabase db push --dry-run
```
Expected: shows the migration file listed, no syntax errors.

---

### Task 3: Add source tracking columns to receivals

**Files:**
- Modify: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

- [ ] **Step 1: Add the three receivals-table changes above `COMMIT;`**

```sql
-- 2. Make po_id nullable so inventory receivals can exist without a PO.
ALTER TABLE public.receivals
  ALTER COLUMN po_id DROP NOT NULL;

-- 3. Discriminator column to distinguish purchase- vs inventory-sourced receivals.
ALTER TABLE public.receivals
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'purchase'
    CHECK (source_type IN ('purchase', 'inventory'));

COMMENT ON COLUMN public.receivals.source_type IS
  'purchase = created from a PO (existing flow). inventory = created from an existing FIFO layer (Inventory Receival feature).';

-- 4. When source_type = inventory AND mode = carve, this points to the source
--    FIFO layer that was split. NULL for new_stock mode and for purchase receivals.
ALTER TABLE public.receivals
  ADD COLUMN IF NOT EXISTS carved_from_layer_id uuid
    REFERENCES public.fifo_cost_layers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.receivals.carved_from_layer_id IS
  'Source FIFO layer that this receival was carved from. NULL for non-carve receivals.';
```

- [ ] **Step 2: Also relax `receival_items.po_line_item_id` to nullable**

```sql
-- 5. Inventory receivals do not reference a PO line item.
ALTER TABLE public.receival_items
  ALTER COLUMN po_line_item_id DROP NOT NULL;
```

---

### Task 4: Add the INV numbering sequence

**Files:**
- Modify: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

- [ ] **Step 1: Append the sequence definition**

```sql
-- 6. Sequence for INV-NNNNN numbering. Separate from receival_number_seq so
--    purchase receivals keep RCV-NNNNN and inventory receivals get INV-NNNNN.
CREATE SEQUENCE IF NOT EXISTS public.inventory_receival_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

GRANT USAGE, SELECT ON SEQUENCE public.inventory_receival_number_seq TO authenticated;
```

---

### Task 5: Extend inventory_stock_movements movement_type check

**Files:**
- Modify: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

- [ ] **Step 1: Find the current constraint name**

Run the following against the staging DB to confirm the constraint name:
```bash
python -c "
import requests
URL='https://mwvblpgbgxipvrevkeff.supabase.co'
SVC='<staging service key>'
h={'apikey':SVC,'Authorization':f'Bearer {SVC}','Content-Type':'application/json','Prefer':'params=single-object'}
r=requests.post(f'{URL}/rest/v1/rpc/pg_get_constraintdef', headers=h, json={})
print(r.text)
"
```

If that RPC isn't available, just query with SQL through the dashboard SQL Editor:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.inventory_stock_movements'::regclass
  AND contype = 'c';
```

Expected constraint name: `inventory_stock_movements_movement_type_check` (based on baseline schema line 8845).

- [ ] **Step 2: Append the constraint replacement**

```sql
-- 7. Allow two new movement_type values for inventory receivals.
ALTER TABLE public.inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE public.inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment',
    'receival_edit',
    'free_receival',
    'sale_return',
    'sale_return_damaged',
    'purchase_return',
    'purchase_return_cancelled',
    'inventory_check',
    'inventory_receival_carve',
    'inventory_receival_new'
  ));
```

- [ ] **Step 3: Commit the schema changes**

```bash
git add supabase/migrations/*_inventory_receivals.sql
git commit -m "feat(db): add inventory receival schema (columns + sequence + movement types)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Add the `create_inventory_receival` RPC

**Files:**
- Modify: `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

- [ ] **Step 1: Append the RPC to the migration (above `COMMIT;`)**

```sql
-- 8. Atomic RPC that creates an inventory receival in one transaction.
--    Handles both carve mode (splits an existing FIFO layer) and
--    new_stock mode (adds a fresh layer + increases stock_level).
CREATE OR REPLACE FUNCTION public.create_inventory_receival(
  p_mode              text,
  p_warehouse_id      uuid,
  p_brand_variant_id  uuid,
  p_qty               integer,
  p_unit_cost         numeric,
  p_source_layer_id   uuid,
  p_date              date,
  p_notes             text
) RETURNS public.receivals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id       uuid := auth.uid();
  v_caller_name     text;
  v_has_permission  boolean;
  v_receival_number text;
  v_new_receival    public.receivals;
  v_source_layer    public.fifo_cost_layers;
  v_landed_cost     numeric := 0;
  v_new_layer_id    uuid;
  v_movement_type   text;
  v_movement_qty    integer;
BEGIN
  -- === Step 1: Permission check ===
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_caller_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  -- === Step 2: Validate inputs ===
  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive' USING ERRCODE = '22023';
  END IF;
  IF p_warehouse_id IS NULL OR p_brand_variant_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and brand variant are required' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'Source layer is required for carve mode' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source layer % not found', p_source_layer_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION 'Source layer does not belong to warehouse %', p_warehouse_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.brand_variant_id <> p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to brand variant %', p_brand_variant_id USING ERRCODE = '22023';
    END IF;
    IF p_qty > v_source_layer.remaining_qty THEN
      RAISE EXCEPTION 'Requested qty % exceeds source layer remaining %', p_qty, v_source_layer.remaining_qty USING ERRCODE = '22023';
    END IF;

    v_landed_cost := v_source_layer.landed_cost_per_unit;
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- === Step 3: Look up caller name ===
  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.profiles p
  JOIN   auth.users au ON au.id = p.id
  WHERE  p.id = v_caller_id;

  -- === Step 4: Generate INV-NNNNN receival number ===
  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  -- === Step 5: Insert the receivals row ===
  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    v_caller_id, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  -- === Step 6: Insert receival_items row (single line) ===
  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false
  FROM public.inventory_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 7: Handle FIFO layers ===
  IF p_mode = 'carve' THEN
    -- Decrement source layer
    UPDATE public.fifo_cost_layers
       SET qty = qty - p_qty,
           remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    -- Insert new carved layer, inheriting landed_cost_per_unit
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, p_unit_cost + v_landed_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    v_movement_type := 'inventory_receival_carve';
    v_movement_qty  := 0;
  ELSE
    -- new_stock: add fresh layer + bump stock_level
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;

    v_movement_type := 'inventory_receival_new';
    v_movement_qty  := p_qty;
  END IF;

  -- === Step 8: Insert stock movement row ===
  INSERT INTO public.inventory_stock_movements (
    warehouse_id, brand_variant_id, item_name, sku,
    movement_type, qty, unit_cost,
    reference_type, reference_id, notes
  )
  SELECT
    p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
    v_movement_type, v_movement_qty, p_unit_cost,
    'receival', v_new_receival.id::text,
    'Inventory Receival ' || v_receival_number
  FROM public.inventory_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 9: Recompute average cost ===
  PERFORM public.recalc_average_cost(p_brand_variant_id);

  -- === Step 10: Return ===
  RETURN v_new_receival;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_receival(
  text, uuid, uuid, integer, numeric, uuid, date, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit the RPC**

```bash
git add supabase/migrations/*_inventory_receivals.sql
git commit -m "feat(db): add create_inventory_receival RPC

Atomic function for carving/adding stock as Inventory Receivals.
Handles permission check, FIFO layer split or creation, stock
movement recording, and average-cost recalculation.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Push migration to staging DB and verify

**Files:**
- Read: staging DB via `npx supabase db push`

- [ ] **Step 1: Link CLI to staging**

Run:
```bash
npx supabase link --project-ref mwvblpgbgxipvrevkeff
```
Expected: `Finished supabase link.`

- [ ] **Step 2: Push the migration**

Run:
```bash
npx supabase db push
```
Expected: shows the new migration file listed, then `Applying migration ...` and `Finished supabase db push.`

- [ ] **Step 3: Verify columns exist**

Run:
```bash
python -c "
import requests
URL='https://mwvblpgbgxipvrevkeff.supabase.co'
SVC='<staging service key>'
h={'apikey':SVC,'Authorization':f'Bearer {SVC}'}
# Verify custom_roles.is_inventory_receiver
r=requests.get(f'{URL}/rest/v1/custom_roles?select=id,name,is_inventory_receiver&limit=3', headers=h)
print('custom_roles:', r.status_code, r.text[:200])
# Verify receivals.source_type default
r=requests.get(f'{URL}/rest/v1/receivals?select=id,source_type,carved_from_layer_id&limit=3', headers=h)
print('receivals:', r.status_code, r.text[:200])
"
```
Expected: both queries return status 200 and include the new columns.

- [ ] **Step 4: Relink to dev DB**

```bash
npx supabase link --project-ref wkmvjxxmzstsvahuiwsz
```

- [ ] **Step 5: Push same migration to dev**

```bash
npx supabase db push
```

---

# Phase 2 — TypeScript Types & Hooks

### Task 8: Extend the CustomRole type with `is_inventory_receiver`

**Files:**
- Modify: `src/hooks/useRoles.ts:7-14`

- [ ] **Step 1: Update the `CustomRole` type in `src/hooks/useRoles.ts`**

Locate lines 7-14 which currently read:

```ts
// is_approval_slot was added in migration 20260615125619_unified_roles_columns.sql.
// is_field_rp was added in migration 20260627117000_custom_roles_is_field_rp.sql.

export type CustomRole = DBTable<'custom_roles'> & {
  is_approval_slot?: boolean
  is_field_rp?:      boolean
}
```

Change to:

```ts
// is_approval_slot was added in migration 20260615125619_unified_roles_columns.sql.
// is_field_rp was added in migration 20260627117000_custom_roles_is_field_rp.sql.
// is_inventory_receiver was added in migration 20260709_inventory_receivals.sql.

export type CustomRole = DBTable<'custom_roles'> & {
  is_approval_slot?:      boolean
  is_field_rp?:           boolean
  is_inventory_receiver?: boolean
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoles.ts
git commit -m "feat(types): add is_inventory_receiver to CustomRole

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Extend `useReceivals` to filter by source_type

**Files:**
- Modify: `src/hooks/useReceivals.ts:73`

- [ ] **Step 1: Add the filter parameter and query condition**

Locate the current `useReceivals` signature (around line 73):

```ts
export function useReceivals(filters?: { status?: ReceivalStatus | '' }) {
```

Change to:

```ts
export function useReceivals(filters?: {
  status?: ReceivalStatus | ''
  source_type?: 'purchase' | 'inventory' | 'all'
}) {
```

- [ ] **Step 2: Extend the Receival type to include source_type**

Locate lines 23-40 (the `Receival` type). Add the new field:

```ts
export type Receival = {
  id: string
  receival_number: string
  po_id: string | null      // was string — now nullable for inventory receivals
  warehouse_id: string
  date: string
  status: ReceivalStatus | null
  notes: string | null
  received_by_name: string | null
  created_at: string | null
  receival_items?: ReceivalItem[]
  is_replacement?: boolean
  source_debit_note_id?: string | null
  source_type: 'purchase' | 'inventory'         // NEW
  carved_from_layer_id?: string | null          // NEW
  // joined
  po_number?: string | null                     // now nullable
  supplier_name?: string | null                 // now nullable
  warehouse_name?: string
}
```

- [ ] **Step 3: Add source_type to the select string and the filter application**

Locate the `select` string in `useReceivals` (around line 80-85). It currently begins with `id,receival_number,po_id,warehouse_id,date,status,notes,...`. Add `source_type,carved_from_layer_id` to it:

```ts
.select(`
  id,receival_number,po_id,warehouse_id,date,status,notes,received_by_name,created_at,is_replacement,source_debit_note_id,source_type,carved_from_layer_id,
  receival_items(id,receival_id,po_line_item_id,item_name,sku,qty_received,unit_cost,is_free,brand_variant_id),
  purchase_orders!receivals_po_id_fkey(po_number,supplier_name),
  warehouses!receivals_warehouse_id_fkey(name)
`)
```

Locate the filter application (currently `if (filters?.status) q = q.eq('status', filters.status)`). Add below it:

```ts
if (filters?.source_type && filters.source_type !== 'all') {
  q = q.eq('source_type', filters.source_type)
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useReceivals.ts
git commit -m "feat(hooks): extend useReceivals with source_type filter

Adds support for filtering by 'purchase' | 'inventory' | 'all'.
Widens Receival type to include source_type and carved_from_layer_id,
and marks po_id/po_number/supplier_name as nullable for inventory
receivals.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Create `useInventoryReceivals.ts` with the three new hooks

**Files:**
- Create: `src/hooks/useInventoryReceivals.ts`
- Modify: `src/lib/queryKeys.ts` — add new query keys

- [ ] **Step 1: Add query keys to `src/lib/queryKeys.ts`**

Find the `receivals:` block (around line 395). Add three new keys inside it, right after `itemsFifo`:

```ts
inventoryReceivable: (brandVariantId: Nullable, warehouseId: Nullable) =>
  ['fifo-layers-for-variant', brandVariantId, warehouseId] as const,
canCreateInventoryReceival: ['can-create-inventory-receival'] as const,
```

- [ ] **Step 2: Create `src/hooks/useInventoryReceivals.ts`**

```ts
// src/hooks/useInventoryReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type InventoryReceivalMode = 'carve' | 'new_stock'

export type CreateInventoryReceivalPayload = {
  mode: InventoryReceivalMode
  warehouse_id: string
  brand_variant_id: string
  qty: number
  unit_cost: number
  source_layer_id: string | null
  date: string
  notes: string | null
}

export type FifoLayerOption = {
  id: string
  receival_number: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
}

// ─── Permission check ─────────────────────────────────────────────────────────

export function useCanCreateInventoryReceivals() {
  return useQuery({
    queryKey: queryKeys.receivals.canCreateInventoryReceival,
    queryFn: async (): Promise<boolean> => {
      const supabase = createClient()
      const { data: user, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user.user) return false

      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(is_inventory_receiver, deleted_at)')
        .eq('profile_id', user.user.id)

      if (error) return false
      type Row = {
        custom_roles: {
          is_inventory_receiver: boolean | null
          deleted_at: string | null
        } | null
      }
      return (data ?? []).some(
        (r: Row) =>
          r.custom_roles?.is_inventory_receiver === true &&
          !r.custom_roles.deleted_at,
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── FIFO layers for a variant/warehouse ──────────────────────────────────────

export function useFifoLayersForVariant(
  brandVariantId: string | null,
  warehouseId: string | null,
) {
  return useQuery({
    enabled: !!brandVariantId && !!warehouseId,
    queryKey: queryKeys.receivals.inventoryReceivable(brandVariantId, warehouseId),
    queryFn: async (): Promise<FifoLayerOption[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('id,receival_number,date,qty,remaining_qty,unit_cost,landed_cost_per_unit,total_unit_cost')
        .eq('brand_variant_id', brandVariantId!)
        .eq('warehouse_id', warehouseId!)
        .gt('remaining_qty', 0)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as FifoLayerOption[]
    },
  })
}

// ─── Create mutation ──────────────────────────────────────────────────────────

export function useCreateInventoryReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateInventoryReceivalPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_inventory_receival', {
        p_mode: payload.mode,
        p_warehouse_id: payload.warehouse_id,
        p_brand_variant_id: payload.brand_variant_id,
        p_qty: payload.qty,
        p_unit_cost: payload.unit_cost,
        p_source_layer_id: payload.source_layer_id,
        p_date: payload.date,
        p_notes: payload.notes,
      })
      if (error) throw error

      void logActivity({
        action: 'Inventory Receival Created',
        module: 'receivals',
        entity_id: (data as { id: string }).id,
        entity_type: 'receival',
        new_data: data as unknown as Record<string, unknown>,
      })

      return data as {
        id: string
        receival_number: string
        [key: string]: unknown
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receivals.all })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers-for-variant'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-variants'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
    },
  })
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInventoryReceivals.ts src/lib/queryKeys.ts
git commit -m "feat(hooks): add useInventoryReceivals with 3 hooks

- useCanCreateInventoryReceivals: permission check
- useFifoLayersForVariant: source layer dropdown data
- useCreateInventoryReceival: mutation calling the new RPC

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

# Phase 3 — Role Toggle UI

### Task 11: Add `is_inventory_receiver` toggle to RoleFormDialog

**Files:**
- Modify: `src/components/master-data/RoleFormDialog.tsx`

- [ ] **Step 1: Add the field to the Zod schema (line 41-47)**

Currently:
```ts
const roleSchema = z.object({
  name:             z.string().min(1, 'Name is required'),
  description:      z.string().optional().default(''),
  permissions:      z.array(z.string()).default([]),
  is_approval_slot: z.boolean().default(false),
  is_field_rp:      z.boolean().default(false),
})
```

Change to:
```ts
const roleSchema = z.object({
  name:                   z.string().min(1, 'Name is required'),
  description:            z.string().optional().default(''),
  permissions:            z.array(z.string()).default([]),
  is_approval_slot:       z.boolean().default(false),
  is_field_rp:            z.boolean().default(false),
  is_inventory_receiver:  z.boolean().default(false),
})
```

- [ ] **Step 2: Update the form default values (around line 198)**

Locate:
```ts
defaultValues: { name: '', description: '', permissions: [], is_approval_slot: false, is_field_rp: false },
```

Change to:
```ts
defaultValues: {
  name: '',
  description: '',
  permissions: [],
  is_approval_slot: false,
  is_field_rp: false,
  is_inventory_receiver: false,
},
```

- [ ] **Step 3: Update the role-load reset (around line 208)**

Locate the section that loads existing role data (near `is_field_rp: Boolean((role as ...`):

```ts
is_field_rp:      Boolean((role as CustomRole & { is_field_rp?: boolean }).is_field_rp),
```

Add after it:

```ts
is_inventory_receiver: Boolean((role as CustomRole & { is_inventory_receiver?: boolean }).is_inventory_receiver),
```

- [ ] **Step 4: Add the third Switch below the `is_field_rp` FormField (after line 326)**

Locate the closing `</FormField>` at line 326 (end of the `is_field_rp` toggle). Insert immediately after:

```tsx
              <FormField
                control={form.control}
                name="is_inventory_receiver"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border p-3 bg-card">
                    <div className="space-y-0.5 pr-3">
                      <FormLabel className="text-sm">Can Create Inventory Receivals</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Users holding this role can create receivals directly from
                        existing inventory stock (independent of Purchase Orders).
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
```

- [ ] **Step 5: Manual verification**

Run:
```bash
npm run dev
```
Open `http://localhost:3000/master-data/admin/users-roles` (or wherever roles are managed), click Edit on a role. Confirm three toggles are visible and the new one saves + reloads correctly.

- [ ] **Step 6: Verify TypeScript**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/master-data/RoleFormDialog.tsx
git commit -m "feat(roles): add 'Can Create Inventory Receivals' toggle

Third role-level toggle alongside is_approval_slot and is_field_rp.
When enabled, users holding the role see the Inventory Receival
button in the Inventory view.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

# Phase 4 — Inventory Receival Dialog & Button

### Task 12: Locate the inventory tree brand-variant row component

**Files:**
- Read: `src/app/(dashboard)/master-data/inventory/**` and `src/components/master-data/inventory/**`

- [ ] **Step 1: Find the file that renders the brand-variant row (the one with the `[↑] [↓] [✏️] [🗑️]` action buttons)**

Run:
```bash
grep -rln "brand_variant\|BrandVariant" src/app/\(dashboard\)/master-data/inventory src/components/master-data 2>/dev/null | head
```

- [ ] **Step 2: Read the identified file(s) to understand the row structure**

Read the top ~200 lines of each file to find the row rendering. Note the component name (likely `BrandVariantRow` or inline JSX inside a category page).

- [ ] **Step 3: Note the file path and component in a scratchpad note**

Write the file path in `docs/plans/inventory-receivals-notes.md` (a working scratchpad) so subsequent tasks can reference it. This file is NOT committed.

---

### Task 13: Add the "Warehouse" column to the FIFO source table

**Files:**
- Modify: the file identified in Task 12 (the one rendering the expanded FIFO source rows)

- [ ] **Step 1: Locate the FIFO source table (headers: `SOURCE | DATE | QTY IN | REMAINING | UNIT COST | LANDED | TOTAL/UNIT`)**

Run:
```bash
grep -rln "QTY IN\|REMAINING\|Qty In\|Remaining" src/app/\(dashboard\)/master-data/inventory src/components/master-data 2>/dev/null
```

- [ ] **Step 2: Identify the query that supplies FIFO layers to this table**

Look for calls to `fifo_cost_layers` — likely a hook. If the query does not currently include a warehouse join, extend the `select` to include `warehouses!fifo_cost_layers_warehouse_id_fkey(name)`.

- [ ] **Step 3: Add the "Warehouse" column header cell**

Between the `SOURCE` and `DATE` column headers, insert:

```tsx
<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">WAREHOUSE</th>
```

- [ ] **Step 4: Add the corresponding data cell in each row**

Between the source column and date column data cells, insert:

```tsx
<td className="px-3 py-2 text-sm">{layer.warehouse_name ?? '—'}</td>
```

(Adapt the variable name to whatever the row iterates as.)

- [ ] **Step 5: Manual verification**

Run:
```bash
npm run dev
```
Navigate to Inventory. Expand a brand variant. Verify the Warehouse column appears with the correct warehouse name.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/master-data/inventory src/components/master-data
git commit -m "feat(inventory): add Warehouse column to FIFO source table

Prevents confusion when the same variant has layers in multiple
warehouses (previously they looked like duplicate rows).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: Create the `InventoryReceivalDialog` component

**Files:**
- Create: `src/components/inventory/InventoryReceivalDialog.tsx`

- [ ] **Step 1: Create the file with the full dialog implementation**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { format } from 'date-fns'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

import { useWarehouses } from '@/hooks/useWarehouses'
import {
  useCreateInventoryReceival,
  useFifoLayersForVariant,
} from '@/hooks/useInventoryReceivals'

const schema = z.object({
  mode: z.enum(['carve', 'new_stock']),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  source_layer_id: z.string().nullable(),
  qty: z.coerce.number().int().positive('Qty must be > 0'),
  unit_cost: z.coerce.number().nonnegative('Cost must be ≥ 0'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().nullable(),
}).refine(
  (v) => v.mode === 'new_stock' || (v.mode === 'carve' && !!v.source_layer_id),
  { message: 'Source batch is required for carve mode', path: ['source_layer_id'] },
)

type FormValues = z.infer<typeof schema>

export interface InventoryReceivalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandVariantId: string
  variantLabel: string   // e.g. "PureWater - Alkauther"
  variantCode: string    // e.g. "KIT-KIT-001"
}

export function InventoryReceivalDialog({
  open,
  onOpenChange,
  brandVariantId,
  variantLabel,
  variantCode,
}: InventoryReceivalDialogProps) {
  const [costEditable, setCostEditable] = useState(false)
  const [confirmCostEdit, setConfirmCostEdit] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: 'carve',
      warehouse_id: '',
      source_layer_id: null,
      qty: 0,
      unit_cost: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    },
  })

  const mode = form.watch('mode')
  const warehouseId = form.watch('warehouse_id')
  const sourceLayerId = form.watch('source_layer_id')

  const { data: warehouses = [] } = useWarehouses()
  const { data: layers = [] } = useFifoLayersForVariant(
    mode === 'carve' ? brandVariantId : null,
    mode === 'carve' ? warehouseId || null : null,
  )
  const createMutation = useCreateInventoryReceival()

  // When source layer changes, pre-fill unit cost from that layer.
  useEffect(() => {
    if (mode === 'carve' && sourceLayerId) {
      const layer = layers.find((l) => l.id === sourceLayerId)
      if (layer) form.setValue('unit_cost', Number(layer.unit_cost))
    }
    if (mode === 'new_stock') {
      // Reset unit cost + source layer when switching to new_stock
      form.setValue('source_layer_id', null)
    }
  }, [sourceLayerId, mode, layers, form])

  // Reset editable flag whenever dialog opens
  useEffect(() => {
    if (open) {
      setCostEditable(false)
      form.reset({
        mode: 'carve',
        warehouse_id: '',
        source_layer_id: null,
        qty: 0,
        unit_cost: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      })
    }
  }, [open, form])

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === sourceLayerId) ?? null,
    [layers, sourceLayerId],
  )
  const maxQty = mode === 'carve' && selectedLayer ? selectedLayer.remaining_qty : undefined

  async function onSubmit(v: FormValues) {
    if (maxQty !== undefined && v.qty > maxQty) {
      form.setError('qty', {
        message: `Cannot exceed ${maxQty} units available in source batch`,
      })
      return
    }

    try {
      const result = await createMutation.mutateAsync({
        mode: v.mode,
        warehouse_id: v.warehouse_id,
        brand_variant_id: brandVariantId,
        qty: v.qty,
        unit_cost: v.unit_cost,
        source_layer_id: v.mode === 'carve' ? v.source_layer_id : null,
        date: v.date,
        notes: v.notes?.trim() || null,
      })
      toast.success(`Inventory Receival ${result.receival_number} created`, {
        action: {
          label: 'View Receivals',
          onClick: () => {
            window.location.href = '/purchase/receivals?source=inventory'
          },
        },
      })
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create receival'
      toast.error(msg)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Inventory Receival</DialogTitle>
            <DialogDescription>
              {variantLabel} · <span className="font-mono text-xs">{variantCode}</span>
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Mode toggle */}
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid grid-cols-2 gap-2"
                      >
                        <Label
                          htmlFor="mode-carve"
                          className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <RadioGroupItem value="carve" id="mode-carve" />
                          Carve from stock
                        </Label>
                        <Label
                          htmlFor="mode-new"
                          className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <RadioGroupItem value="new_stock" id="mode-new" />
                          Add new stock
                        </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Warehouse */}
              <FormField
                control={form.control}
                name="warehouse_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select warehouse…" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Source layer — carve mode only */}
              {mode === 'carve' && (
                <FormField
                  control={form.control}
                  name="source_layer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Batch *</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v || null)}
                          disabled={!warehouseId || layers.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !warehouseId
                                  ? 'Select a warehouse first'
                                  : layers.length === 0
                                    ? 'No stock in this warehouse'
                                    : 'Select source batch…'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {layers.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {(l.receival_number || 'INIT-IMPORT')} — {l.remaining_qty} available
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Qty */}
              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    {maxQty !== undefined && (
                      <p className="text-xs text-muted-foreground">Max: {maxQty} units</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Unit cost — locked until Edit clicked */}
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Unit Cost (QAR) *</FormLabel>
                      {!costEditable && (
                        <button
                          type="button"
                          onClick={() => setConfirmCostEdit(true)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        readOnly={!costEditable}
                        className={!costEditable ? 'bg-muted' : undefined}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder="Optional notes…"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="sticky bottom-0 bg-background pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !form.formState.isValid}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unit cost edit confirmation */}
      <AlertDialog open={confirmCostEdit} onOpenChange={setConfirmCostEdit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to edit the unit cost?</AlertDialogTitle>
            <AlertDialogDescription>
              This affects your inventory valuation and future landed cost calculations.
              Only change this if you have a specific reason (correction, currency
              conversion, etc.).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCostEditable(true)
                setConfirmCostEdit(false)
              }}
            >
              Yes, edit unit cost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0. If any import can't resolve (e.g., `RadioGroup`), check it's installed under `src/components/ui/` or add the shadcn component with `npx shadcn@latest add radio-group`.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/InventoryReceivalDialog.tsx
git commit -m "feat(inventory): add InventoryReceivalDialog popup

Popup dialog for creating Inventory Receivals with carve or new-stock
mode. Includes source-layer dropdown, editable-unit-cost with warning,
and success toast linking to the receivals list.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Add the "Create Inventory Receival" button to the brand variant row

**Files:**
- Modify: the brand variant row file identified in Task 12

- [ ] **Step 1: Add the dialog state to the parent (or a wrapper) component**

Add at the top of the component that renders brand variant rows:

```tsx
import { PackagePlus } from 'lucide-react'
import { useCanCreateInventoryReceivals } from '@/hooks/useInventoryReceivals'
import { InventoryReceivalDialog } from '@/components/inventory/InventoryReceivalDialog'
```

Inside the component body:

```tsx
const { data: canCreateInvRcv = false } = useCanCreateInventoryReceivals()
const [invReceivalTarget, setInvReceivalTarget] = useState<{
  brandVariantId: string
  variantLabel: string
  variantCode: string
} | null>(null)
```

- [ ] **Step 2: Add the button in the actions cell**

Just before the existing `[↑] [↓] [✏️] [🗑️]` buttons on the brand variant row, add:

```tsx
{canCreateInvRcv && (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            setInvReceivalTarget({
              brandVariantId: variant.id,
              variantLabel: variant.brand ?? '(no brand)',
              variantCode: variant.code ?? variant.sku ?? '',
            })
          }
          aria-label="Create Inventory Receival"
        >
          <PackagePlus className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Create Inventory Receival</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

(Adapt `variant.id`, `variant.brand`, `variant.code`, `variant.sku` to whatever field names the row iterator actually uses.)

- [ ] **Step 3: Render the dialog once per component**

Near the bottom of the component (after any existing dialogs):

```tsx
{invReceivalTarget && (
  <InventoryReceivalDialog
    open={!!invReceivalTarget}
    onOpenChange={(open) => !open && setInvReceivalTarget(null)}
    brandVariantId={invReceivalTarget.brandVariantId}
    variantLabel={invReceivalTarget.variantLabel}
    variantCode={invReceivalTarget.variantCode}
  />
)}
```

- [ ] **Step 4: Manual verification**

- Log in as a user WITHOUT the `is_inventory_receiver` role → button should NOT appear
- Grant the toggle to the user's role → refresh, button should appear
- Click button → dialog opens with variant pre-filled
- Try to create with qty > source layer remaining → validation error shown
- Create a valid carve → toast shows "Inventory Receival INV-00001 created"
- Expand the variant row → new INV-00001 layer visible, source layer's remaining decreased

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/master-data/inventory src/components/master-data
git commit -m "feat(inventory): add Create Inventory Receival button on variant rows

Icon button appears only when the current user has a role with
is_inventory_receiver = true. Clicking opens the InventoryReceivalDialog
with the variant pre-filled.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 16: Add the view (eye) button to FIFO source rows

**Files:**
- Modify: same brand variant row file (FIFO source table area)
- Optionally reuse: `src/components/purchase/ReceivalDetailDialog.tsx`

- [ ] **Step 1: Add the eye icon column header**

Add a new header cell at the end of the FIFO source table:

```tsx
<th className="w-10"></th>
```

- [ ] **Step 2: Add state + import for the receival detail dialog**

At the top of the component:

```tsx
import { Eye } from 'lucide-react'
import { ReceivalDetailDialog } from '@/components/purchase/ReceivalDetailDialog'
```

Inside the component:

```tsx
const [viewingReceivalId, setViewingReceivalId] = useState<string | null>(null)
```

- [ ] **Step 3: Add the eye button as the last cell in each FIFO row**

The FIFO layer row iterator (`layer` or similar) will have a `receival_id` field. Render:

```tsx
<td className="px-3 py-2 w-10">
  {layer.receival_id ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={() => setViewingReceivalId(String(layer.receival_id))}
      aria-label="View receival"
    >
      <Eye className="h-3.5 w-3.5" />
    </Button>
  ) : (
    <span className="text-muted-foreground text-xs">—</span>
  )}
</td>
```

Note: `receival_id` on `fifo_cost_layers` is `text`, not `uuid`, so cast to string.

- [ ] **Step 4: Render `ReceivalDetailDialog` once**

Near the bottom of the component:

```tsx
{viewingReceivalId && (
  <ReceivalDetailDialog
    open={!!viewingReceivalId}
    onOpenChange={(open) => !open && setViewingReceivalId(null)}
    receivalId={viewingReceivalId}
  />
)}
```

(If the existing `ReceivalDetailDialog` uses different props, adapt accordingly — read that component's exported interface first.)

- [ ] **Step 5: Manual verification**

- Expand a variant with `INIT-IMPORT` (no receival) → eye button shows `—`
- Expand a variant with an `INV-*` layer → eye button visible, clicking opens detail dialog

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/master-data/inventory src/components/master-data
git commit -m "feat(inventory): add view (eye) button to FIFO source rows

Rows with a receival_id (INV-* or RCV-*) get an eye icon that opens
the ReceivalDetailDialog. INIT-IMPORT rows show a dash.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

# Phase 5 — Receivals Page Integration

### Task 17: Add Source filter to Receivals page

**Files:**
- Modify: `src/app/(dashboard)/purchase/receivals/page.tsx`

- [ ] **Step 1: Add local state for the source filter**

Near the top of the component, alongside the existing status filter state:

```tsx
const [sourceFilter, setSourceFilter] = useState<'all' | 'purchase' | 'inventory'>('all')
```

- [ ] **Step 2: Pass it to `useReceivals`**

Find the `useReceivals(...)` call and extend the filter object:

```tsx
const { data: receivals = [], isLoading } = useReceivals({
  status: statusFilter,
  source_type: sourceFilter,
})
```

- [ ] **Step 3: Add the Source select next to the status select**

Near the existing status filter UI:

```tsx
<Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
  <SelectTrigger className="w-40">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All sources</SelectItem>
    <SelectItem value="purchase">Purchase</SelectItem>
    <SelectItem value="inventory">Inventory</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 4: Read the `?source=inventory` URL param on mount to preselect**

Add above the state declaration:

```tsx
import { useSearchParams } from 'next/navigation'
```

Then:

```tsx
const searchParams = useSearchParams()
const [sourceFilter, setSourceFilter] = useState<'all' | 'purchase' | 'inventory'>(
  (searchParams.get('source') as 'purchase' | 'inventory') ?? 'all',
)
```

- [ ] **Step 5: Manual verification**

- Load `/purchase/receivals` → filter shows "All sources", both RCV and INV rows visible
- Change to "Inventory" → only INV rows visible
- Load `/purchase/receivals?source=inventory` → filter preselected to Inventory

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/purchase/receivals/page.tsx
git commit -m "feat(receivals): add Source filter (Purchase/Inventory/All)

Also preselects filter from ?source= URL param so the create success
toast can deep-link to /purchase/receivals?source=inventory.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 18: Add distinct badge styling for INV numbers + Source column

**Files:**
- Modify: `src/app/(dashboard)/purchase/receivals/page.tsx`

- [ ] **Step 1: Style the INV receival number differently in the table**

Find the column definition that renders `receival_number` (likely inside a `columns` array). Update the cell renderer:

```tsx
{
  accessorKey: 'receival_number',
  header: 'Number',
  cell: ({ row }) => {
    const num = row.original.receival_number
    const isInventory = row.original.source_type === 'inventory'
    return (
      <Badge
        variant={isInventory ? 'default' : 'secondary'}
        className={isInventory ? 'bg-purple-500 hover:bg-purple-500/90' : ''}
      >
        {num}
      </Badge>
    )
  },
}
```

- [ ] **Step 2: Add a new Source column right after the Number column**

```tsx
{
  id: 'source',
  header: 'Source',
  cell: ({ row }) => {
    const r = row.original
    if (r.source_type === 'inventory') {
      return <span className="text-xs">Inventory</span>
    }
    return r.po_number ? (
      <a
        href={`/purchase/po/${r.po_id}`}
        className="text-xs text-primary hover:underline"
      >
        {r.po_number}
      </a>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  },
}
```

- [ ] **Step 3: Manual verification**

- Filter to "Inventory" → INV badges show in purple
- Filter to "Purchase" → RCV badges show in default color
- Source column shows "Inventory" for INV rows and clickable PO number for RCV rows

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/purchase/receivals/page.tsx
git commit -m "feat(receivals): distinct badge + Source column for INV receivals

Purple badge on INV-* numbers, secondary badge on RCV-* numbers.
New Source column shows 'Inventory' or PO link based on source_type.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 19: Add view (eye) button to Receivals list rows

**Files:**
- Modify: `src/app/(dashboard)/purchase/receivals/page.tsx`

- [ ] **Step 1: Add an eye-icon action column left of the existing `[⋯]` dropdown**

```tsx
{
  id: 'view',
  cell: ({ row }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setViewingReceivalId(row.original.id)}
      aria-label="View receival"
    >
      <Eye className="h-4 w-4" />
    </Button>
  ),
}
```

Ensure `viewingReceivalId` state exists in the page component (same pattern as Task 16).

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/purchase/receivals/page.tsx
git commit -m "feat(receivals): add view (eye) icon button to list rows

Adjacent to the existing dropdown menu, provides one-click access
to the receival detail dialog.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 20: Update ReceivalDetailDialog for inventory receivals

**Files:**
- Modify: `src/components/purchase/ReceivalDetailDialog.tsx`

- [ ] **Step 1: Detect inventory receivals inside the dialog**

At the top of the dialog body, after the receival data is loaded:

```tsx
const isInventoryReceival = receival?.source_type === 'inventory'
```

- [ ] **Step 2: Hide the PO Reference section for inventory receivals**

Find the section that renders `po_number` or "PO Reference". Wrap it in:

```tsx
{!isInventoryReceival && (
  /* existing PO reference block */
)}
```

- [ ] **Step 3: Add a "Carved From" section for inventory receivals**

Where the PO section used to appear, add:

```tsx
{isInventoryReceival && (
  <div className="rounded-md border p-3 space-y-1">
    <p className="text-xs font-medium text-muted-foreground">
      {receival.carved_from_layer_id ? 'CARVED FROM' : 'NEW STOCK'}
    </p>
    {receival.carved_from_layer_id ? (
      <CarvedFromLayerInfo layerId={receival.carved_from_layer_id} />
    ) : (
      <p className="text-sm">Fresh stock addition (no source layer)</p>
    )}
  </div>
)}
```

Where `CarvedFromLayerInfo` is a small helper that queries the layer and renders its receival number + remaining qty. Add it below the main component:

```tsx
function CarvedFromLayerInfo({ layerId }: { layerId: string }) {
  const supabase = createClient()
  const { data } = useQuery({
    queryKey: ['fifo-layer-detail', layerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('receival_number,remaining_qty,qty,warehouse_id,warehouses(name)')
        .eq('id', layerId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <p className="text-sm">
      <span className="font-mono">{data.receival_number ?? 'INIT-IMPORT'}</span>
      {' · '}
      {(data as { warehouses?: { name?: string } }).warehouses?.name ?? '—'}
      {' · '}
      Remaining {data.remaining_qty}/{data.qty}
    </p>
  )
}
```

Add imports at the top:

```ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 4: Add Created By and Created At in the header metadata**

Find the metadata rows (Warehouse, Date, etc.) and add:

```tsx
<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">Created By</span>
  <span>{receival.received_by_name ?? '—'}</span>
</div>
<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">Created At</span>
  <span>
    {receival.created_at
      ? new Date(receival.created_at).toLocaleString()
      : '—'}
  </span>
</div>
```

- [ ] **Step 5: Add "Attach LC →" button when no LC applied to this receival**

Find the section that shows landed cost info. Ensure that when no LC is attached:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    window.location.href = `/purchase/landed-costs?attach_to=${receival.id}`
  }}
>
  Attach LC →
</Button>
```

(The LC page can read `?attach_to=` to preselect the receival in its create dialog. If that URL param isn't yet supported, add a task to wire it up in the LC page — but the button itself can land there for now.)

- [ ] **Step 6: Manual verification**

- Open an INV receival → PO section absent, "Carved From" shown, Created By/At shown
- Open an RCV receival → PO section present as before
- Verify Attach LC button links correctly

- [ ] **Step 7: Commit**

```bash
git add src/components/purchase/ReceivalDetailDialog.tsx
git commit -m "feat(receivals): show Carved From + Created metadata for inventory receivals

Hides PO Reference section for source_type=inventory. Adds Carved From
block showing the source layer (or 'New Stock' when null). Adds Created
By and Created At rows to header metadata. Adds Attach LC button.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

# Phase 6 — Manual QA & Rollout

### Task 21: Full end-to-end manual test on staging

**Files:**
- Read: staging DB via app UI at deployed staging URL

- [ ] **Step 1: Prepare test data on staging**

- Ensure staging DB has at least one warehouse and a few brand variants with FIFO layers (either from a fresh Excel upload or manually created)
- If needed, re-upload the Excel data via the earlier upload script

- [ ] **Step 2: Test permission gating**

- Log in as a user WITHOUT `is_inventory_receiver` → confirm the `PackagePlus` button is NOT visible on any brand variant row
- Assign a role with `is_inventory_receiver = true` → refresh → button visible

- [ ] **Step 3: Test carve mode happy path**

- Click button on a variant with an INIT-IMPORT layer of qty 87
- Select warehouse (auto-picked if only one)
- Select source batch INIT-IMPORT
- Enter qty 30, keep unit cost, add note "test batch 1"
- Click Create
- Confirm toast shows `Inventory Receival INV-00001 created`
- Expand variant → source layer now shows qty 57 / remaining 57, new INV-00001 layer shows qty 30 / remaining 30
- Total variant stock unchanged (still 87)

- [ ] **Step 4: Test carve mode validation**

- Try to carve 100 (over source layer qty) → validation error visible, no DB change

- [ ] **Step 5: Test unit cost edit warning**

- Open the dialog again
- Click "Edit" next to unit cost → confirmation dialog appears
- Click "Yes, edit unit cost" → field becomes editable, background changes from grey to white

- [ ] **Step 6: Test new_stock mode**

- Switch mode to "Add new stock"
- Source batch dropdown disappears
- Enter qty 20, unit cost 100
- Create → toast `INV-00002 created`
- Expand variant → new INV-00002 layer visible with qty 20, source layer unchanged, total stock now 87 + 20 = 107

- [ ] **Step 7: Test Receivals list**

- Navigate to `/purchase/receivals`
- INV-00001 and INV-00002 appear with purple badges
- Source column shows "Inventory"
- Change filter to "Purchase" → INV rows disappear
- Change to "Inventory" → only INV rows visible

- [ ] **Step 8: Test receival detail**

- Click eye icon on INV-00001 → detail dialog opens
- No PO Reference section
- "Carved From" section shows source layer info
- Created By shows current user name
- Created At shows correct timestamp
- Attach LC button visible

- [ ] **Step 9: Test LC integration**

- Navigate to `/purchase/landed-costs`
- Create LC → the receival dropdown includes INV-00001 alongside any RCV-* numbers
- Select INV-00001, add a line (e.g., $50 shipping), Save + Apply
- Return to Inventory → INV-00001 layer's LANDED column now shows the allocated cost

- [ ] **Step 10: Test view button on FIFO source rows**

- On the Inventory page, expand a variant
- Rows with `receival_id` show the eye icon
- INIT-IMPORT rows show `—`
- Clicking eye opens the detail dialog

- [ ] **Step 11: Test carve-from-carved-layer (LC inheritance)**

- Apply an LC to INV-00001 (from Step 9 above): `landed_cost_per_unit` becomes non-zero on the INV-00001 layer
- Carve another layer FROM the INV-00001 layer (30 units → INV-00003, say 10 units)
- Verify INV-00003's `landed_cost_per_unit` matches INV-00001's (inheritance)

- [ ] **Step 12: Log any issues and iterate**

Any failing step: file a fix task, resolve, re-run the failing step.

---

### Task 22: Push migration to dev DB

**Files:**
- Read: dev DB via `npx supabase db push`

- [ ] **Step 1: Confirm dev CLI link**

Run:
```bash
npx supabase link --project-ref wkmvjxxmzstsvahuiwsz
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```
Expected: shows the inventory_receivals migration listed, applies successfully.

- [ ] **Step 3: Confirm schema state matches staging**

Run the same verification queries as in Task 7 Step 3 but against the dev URL.

---

### Task 23: Final push + PR

**Files:**
- Push branch, open PR to `main`

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Verify all commits are in order**

Run:
```bash
git log --oneline origin/main..HEAD
```
Confirm the commit list follows the phases: schema → RPC → types/hooks → role toggle → dialog → button → warehouse column → view buttons → receivals page → detail dialog.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat: Inventory Receivals with LC support" --body "$(cat <<'EOF'
## Summary
- Adds Inventory Receivals feature — create receivals from existing warehouse stock (carve mode) or add new stock (new-stock mode) — independent of any PO
- New role toggle `is_inventory_receiver` gates the create action
- New atomic RPC `create_inventory_receival` handles both modes
- Distinct INV-NNNNN numbering, purple badges on the Receivals list, Source filter, view (eye) buttons on both the Inventory FIFO table and the Receivals list
- New Warehouse column on the inventory FIFO source table (fixes the "duplicate row" confusion)

Design: [docs/specs/2026-07-09-inventory-receivals-design.md](docs/specs/2026-07-09-inventory-receivals-design.md)
Plan: [docs/plans/2026-07-09-inventory-receivals.md](docs/plans/2026-07-09-inventory-receivals.md)

## Test plan
- [ ] Log in without `is_inventory_receiver` → button hidden
- [ ] Enable toggle → button appears; carve 30 out of 87 → source becomes 57, INV-00001 created with 30
- [ ] Add new stock 20 → stock_level increases, new INV layer created
- [ ] Verify LC allocation targets INV layers alongside RCV layers
- [ ] Filter Receivals list by source → correct rows shown
- [ ] Detail dialog for INV receival shows Carved From + Created By/At

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Assumptions & Notes

- **Testing framework:** This repo has no automated test suite for feature code; verification is manual UI-driven per phase. If a test harness is added later, add unit-test tasks retroactively.
- **Naming of the brand variant row component:** Task 12 explicitly locates the file before Task 13 touches it — the plan doesn't hardcode the path because the codebase organization for the inventory tree component wasn't fully explored during planning.
- **LC `?attach_to=` URL param:** Task 20 Step 5 assumes the LC page accepts this param to preselect the receival. If it doesn't, the button still lands on the LC page and the user manually picks the receival — a minor UX regression that can be fixed later. Not blocking.
- **`profiles` table `full_name` fallback:** RPC uses `COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')` — matches the pattern in `create_and_approve_receival`. If the auth.users email join is prohibited for some reason, fall back to just profiles.full_name.
- **Backfill:** No backfill required. `source_type` defaults to `'purchase'` for all existing rows.
- **RLS on the new columns:** No RLS changes needed. Existing `authenticated` policies on `receivals` and `receival_items` cover both source types.

---

## Rollback

If the migration needs to be reverted:

```sql
BEGIN;

DROP FUNCTION IF EXISTS public.create_inventory_receival(
  text, uuid, uuid, integer, numeric, uuid, date, text
);

-- Restore the old movement_type check constraint (without the two new values).
ALTER TABLE public.inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;
ALTER TABLE public.inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment', 'transfer_in',
    'transfer_out', 'cost_adjustment', 'receival_edit', 'free_receival',
    'sale_return', 'sale_return_damaged', 'purchase_return',
    'purchase_return_cancelled', 'inventory_check'
  ));

DROP SEQUENCE IF EXISTS public.inventory_receival_number_seq;

ALTER TABLE public.receivals DROP COLUMN IF EXISTS carved_from_layer_id;
ALTER TABLE public.receivals DROP COLUMN IF EXISTS source_type;
-- (Leave po_id nullable — reverting to NOT NULL would fail if any inventory receivals exist.)

ALTER TABLE public.custom_roles DROP COLUMN IF EXISTS is_inventory_receiver;

COMMIT;
```

Only run this rollback if there are ZERO `receivals` rows with `source_type = 'inventory'`, otherwise you'll orphan data.
