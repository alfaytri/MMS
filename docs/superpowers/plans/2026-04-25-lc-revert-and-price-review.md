# LC Revert & Selling Price Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two post-apply capabilities to the Landed Cost page: (1) a Revert action that rolls back FIFO layer cost changes after an LC is applied, and (2) a post-apply "Review Selling Prices" dialog where each affected brand variant can be repriced using either a margin-based formula or kept at its current fixed price.

**Architecture:** One DB migration adds `revert_snapshot JSONB` to `landed_costs`, `margin_percent NUMERIC` to `inventory_brand_variants`, modifies `allocate_landed_cost` to capture a pre-apply snapshot, and creates a `revert_landed_cost` RPC. Hook additions wire the new mutations. The LC detail dialog gains a Revert button + warning dialog; after a successful apply the apply-confirm dialog transitions to a Price Review step (same dialog, new content) before closing.

**Tech Stack:** Supabase Postgres (PL/pgSQL), TanStack Query v5 mutations, shadcn/ui Dialog + Table + RadioGroup, React `useState`, TypeScript

**Branch:** `feature/purchase-module`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260425000300_lc_revert_and_margin.sql` | Create | `revert_snapshot` column, `margin_percent` column, `allocate_landed_cost` (modified), `revert_landed_cost` RPC |
| `src/hooks/useLandedCosts.ts` | Modify | Add `revert_snapshot` to `LandedCost` type; add `useRevertLandedCost` hook |
| `src/hooks/useInventory.ts` | Modify | Add `margin_percent` to `BrandVariantInsert`/`Update`; add `useBrandVariantsByIds`; add `useBatchUpdateSellingPrices` |
| `src/components/services/inventory/BrandVariantEditDialog.tsx` | Modify | Add `margin_percent` field |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Modify | Revert button + warning dialog; post-apply price review step |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260425000300_lc_revert_and_margin.sql`

This single migration does four things:
1. Adds `revert_snapshot JSONB` to `landed_costs` — stores `[{layer_id, brand_variant_id, old_landed_cost_per_unit, old_total_unit_cost}]` for every FIFO layer touched during apply.
2. Adds `margin_percent NUMERIC(8,4) DEFAULT 0` to `inventory_brand_variants` — persists the user's preferred margin so it survives future LC reviews.
3. Replaces `allocate_landed_cost` — identical logic but captures the snapshot before updating FIFO layers.
4. Creates `revert_landed_cost` — atomically restores the snapshot, recalculates average costs, deletes the cost_adjustment movements, and resets the LC record.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260425000300_lc_revert_and_margin.sql
BEGIN;

-- ── 1. Snapshot column on landed_costs ────────────────────────────────────────
ALTER TABLE landed_costs
  ADD COLUMN IF NOT EXISTS revert_snapshot JSONB;

-- ── 2. Margin percent on brand variants ───────────────────────────────────────
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(8,4) NOT NULL DEFAULT 0;

-- ── 3. Replace allocate_landed_cost — capture snapshot before layer updates ───
CREATE OR REPLACE FUNCTION allocate_landed_cost(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc              RECORD;
  v_grand_total     NUMERIC := 0;
  v_total_remaining BIGINT  := 0;
  v_allocations     JSONB   := '[]'::JSONB;
  v_snapshot        JSONB   := '[]'::JSONB;
  v_bv              RECORD;
  v_bv_lc_share     NUMERIC;
  v_bv_remaining    BIGINT;
  v_per_unit_lc     NUMERIC;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free    = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                        AS item_name,
      MAX(ri.sku)                              AS sku,
      SUM(ri.qty_received)                     AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)      AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0
      END                                      AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free     = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    -- Capture snapshot: store per-unit LC delta so revert subtracts only this LC's
    -- contribution — safe when multiple LCs are applied to the same FIFO batch.
    SELECT v_snapshot || COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'layer_id',              id::TEXT,
        'brand_variant_id',      brand_variant_id::TEXT,
        'allocated_lc_per_unit', CASE WHEN v_bv_remaining > 0
                                   THEN ROUND(v_bv_lc_share / v_bv_remaining, 4)
                                   ELSE 0 END
      ))
      FROM fifo_cost_layers
      WHERE brand_variant_id = v_bv.brand_variant_id
        AND remaining_qty > 0
      FOR UPDATE),
      '[]'::JSONB
    )
    INTO v_snapshot;

    WITH locked_layers AS (
      SELECT remaining_qty
        FROM fifo_cost_layers
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0
       FOR UPDATE
    )
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM locked_layers;

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',    v_bv.brand_variant_id,
      'item_name',           v_bv.item_name,
      'sku',                 v_bv.sku,
      'qty_received',        v_bv.qty_received,
      'qty_remaining_at_lc', v_bv_remaining,
      'original_unit_cost',  ROUND(v_bv.avg_unit_cost, 4),
      'lc_per_unit',         CASE WHEN v_bv_remaining > 0
                               THEN ROUND(v_bv_lc_share / v_bv_remaining, 4)
                               ELSE 0 END,
      'allocated_lc_total',  ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',   CASE WHEN v_bv_remaining > 0
                               THEN ROUND(v_bv.avg_unit_cost + v_bv_lc_share / v_bv_remaining, 4)
                               ELSE ROUND(v_bv.avg_unit_cost, 4) END,
      'allocated_cost',      ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    IF v_bv_remaining > 0 THEN
      v_per_unit_lc := v_bv_lc_share / v_bv_remaining;

      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_bv_lc_share, 2) || ' ' || v_lc.currency || ' over '
           || v_bv_remaining || ' units');

      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET item_allocations = v_allocations,
         applied_at       = now(),
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = now()
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

-- ── 4. revert_landed_cost RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION revert_landed_cost(p_lc_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc      RECORD;
  v_layer   JSONB;
  v_bv_ids  UUID[] := '{}';
  v_bv_id   UUID;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;
  IF v_lc.revert_snapshot IS NULL OR jsonb_array_length(v_lc.revert_snapshot) = 0 THEN
    RAISE EXCEPTION 'No revert snapshot available for landed cost %', p_lc_id;
  END IF;

  -- Subtract this LC's delta from each FIFO layer (not overwrite — safe for
  -- multi-LC stacking: LC #2 contributions are preserved when reverting LC #1).
  FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
    UPDATE fifo_cost_layers
       SET landed_cost_per_unit = landed_cost_per_unit - (v_layer->>'allocated_lc_per_unit')::NUMERIC,
           total_unit_cost      = total_unit_cost      - (v_layer->>'allocated_lc_per_unit')::NUMERIC
     WHERE id = (v_layer->>'layer_id')::UUID;

    -- Accumulate distinct brand_variant_ids for recalc
    v_bv_id := (v_layer->>'brand_variant_id')::UUID;
    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for each affected variant
  FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  -- Insert reversing movements — never delete audit ledger entries.
  -- Mirrors the original cost_adjustment rows with negated unit_cost.
  INSERT INTO inventory_stock_movements
    (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
     reference_type, reference_id, notes)
  SELECT ism.brand_variant_id, ism.item_name, ism.sku,
         'cost_adjustment', ism.qty, -ism.unit_cost,
         'landed_cost', p_lc_id,
         'Reversal of LC ' || v_lc.lc_number
  FROM inventory_stock_movements ism
  WHERE ism.reference_type = 'landed_cost'
    AND ism.reference_id   = p_lc_id
    AND ism.movement_type  = 'cost_adjustment';

  -- Reset the landed_cost record
  UPDATE landed_costs
     SET applied_at      = NULL,
         all_items_sold  = FALSE,
         item_allocations = NULL,
         revert_snapshot  = NULL,
         updated_at       = now()
   WHERE id = p_lc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_landed_cost(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revert_landed_cost(UUID)   TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected: migration applied. Verify `landed_costs.revert_snapshot` and `inventory_brand_variants.margin_percent` columns exist in the Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000300_lc_revert_and_margin.sql
git commit -m "feat(db): revert_snapshot on landed_costs, margin_percent on brand_variants, revert_landed_cost RPC"
```

---

### Task 2: Hook updates — `useLandedCosts.ts` + `useInventory.ts`

**Files:**
- Modify: `src/hooks/useLandedCosts.ts`
- Modify: `src/hooks/useInventory.ts`

Two additions to `useLandedCosts.ts`:
1. Add `revert_snapshot?: unknown` to the `LandedCost` type (the snapshot is opaque to the client — only the server reads it).
2. Add `useRevertLandedCost` mutation that calls `revert_landed_cost` RPC and invalidates `landed_costs` queries.

Three additions to `useInventory.ts`:
1. Add `margin_percent?: number | null` to `BrandVariantInsert` and `BrandVariantUpdate`.
2. Add `useBrandVariantsByIds(ids: string[])` — fetches `{id, selling_price, margin_percent}` for a list of IDs (used by the price review dialog).
3. Add `useBatchUpdateSellingPrices` — single mutation that accepts an array of `{id, selling_price, margin_percent}` and issues parallel Supabase updates.

- [ ] **Step 1: Update `LandedCost` type and add `useRevertLandedCost` in `src/hooks/useLandedCosts.ts`**

Find the `LandedCost` type and add `revert_snapshot` after `created_at`:

```typescript
export type LandedCost = {
  id: string
  lc_number: string
  description: string | null
  total_amount: number
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
  all_items_sold: boolean
  date: string
  item_allocations: LandedCostItemAllocation[] | null
  voided_at: string | null
  voided_reason: string | null
  applied_at: string | null
  revert_snapshot: unknown | null   // opaque JSONB — only the RPC reads it
  created_at: string
  updated_at: string
}
```

Then append `useRevertLandedCost` after `useApplyLandedCost`:

```typescript
export function useRevertLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('revert_landed_cost', { p_lc_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}
```

- [ ] **Step 2: Update `BrandVariantInsert`, add `useBrandVariantsByIds` and `useBatchUpdateSellingPrices` in `src/hooks/useInventory.ts`**

Find `BrandVariantInsert` and add `margin_percent`:

```typescript
export type BrandVariantInsert = {
  item_id: string
  brand: string
  code?: string | null
  cost_price?: number | null
  selling_price?: number | null
  average_cost?: number | null
  reorder_point?: number
  margin_percent?: number | null
}
```

`BrandVariantUpdate` extends `Partial<Omit<BrandVariantInsert, 'item_id'>>` so it picks up `margin_percent` automatically — no change needed there.

Then append two new exported functions at the end of the file:

```typescript
export type BrandVariantPriceSummary = {
  id: string
  selling_price: number | null
  margin_percent: number | null
}

export function useBrandVariantsByIds(ids: string[]) {
  return useQuery({
    queryKey: ['brand-variants-price-summary', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, selling_price, margin_percent')
        .in('id', ids)
      if (error) throw error
      return (data ?? []) as BrandVariantPriceSummary[]
    },
    staleTime: 0,
  })
}

export type SellingPriceUpdate = {
  id: string
  selling_price: number
  margin_percent: number
}

export function useBatchUpdateSellingPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: SellingPriceUpdate[]) => {
      const supabase = createClient()
      await Promise.all(
        updates.map((u) =>
          (supabase as any)
            .from('inventory_brand_variants')
            .update({ selling_price: u.selling_price, margin_percent: u.margin_percent })
            .eq('id', u.id)
            .throwOnError(),
        ),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-variants'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['brand-variants-price-summary'] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLandedCosts.ts src/hooks/useInventory.ts
git commit -m "feat(hooks): useRevertLandedCost + useBrandVariantsByIds + useBatchUpdateSellingPrices"
```

---

### Task 3: `BrandVariantEditDialog` — add `margin_percent` field

**Files:**
- Modify: `src/components/services/inventory/BrandVariantEditDialog.tsx`

Add a `margin_percent` input next to the selling price. When the user edits either field, the other shows an informational preview (e.g., "implied margin: X%"). Keep them independent — neither auto-calculates the other on change (that would be surprising UX). The user sets both intentionally.

- [ ] **Step 1: Replace `BrandVariantEditDialog.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
}

export function BrandVariantEditDialog({ open, onOpenChange, itemId, variant }: Props) {
  const isEdit = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()

  const [brand, setBrand] = useState('')
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [marginPercent, setMarginPercent] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('0')

  useEffect(() => {
    if (open) {
      setBrand((variant as any)?.brand ?? '')
      setCode((variant as any)?.code ?? '')
      setSellingPrice((variant as any)?.selling_price != null ? String((variant as any).selling_price) : '')
      setMarginPercent((variant as any)?.margin_percent != null ? String((variant as any).margin_percent) : '0')
      setReorderPoint(variant ? String((variant as any).reorder_point ?? 0) : '0')
    }
  }, [open, variant])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brand.trim()) {
      toast.error('Brand name is required')
      return
    }

    const payload = {
      brand: brand.trim(),
      code: code.trim() || null,
      selling_price: sellingPrice ? Number(sellingPrice) : 0,
      margin_percent: Number(marginPercent) || 0,
      reorder_point: Number(reorderPoint),
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => { toast.success('Variant updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: () => { toast.success('Variant added'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Brand Variant' : 'Add Brand Variant'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. LG, Alfacool"
            />
          </div>
          <div className="space-y-1">
            <Label>SKU Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto-generated if blank"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Selling Price (QAR)</Label>
              <Input
                type="number" min="0" step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Margin %</Label>
              <Input
                type="number" min="0" step="0.01"
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Used by LC price review</p>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reorder Point</Label>
            <Input
              type="number" min="0" step="1"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/BrandVariantEditDialog.tsx
git commit -m "feat(inventory): add margin_percent field to BrandVariantEditDialog"
```

---

### Task 4: LC Detail Dialog — Revert button + warning + price review

**Files:**
- Modify: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

This task adds two new UI flows inside `LcDetailDialog`:

**Flow A — Revert:**
- A "Revert Apply" button appears in the `DialogFooter` when `isApplied && !isVoided && lc.revert_snapshot != null`.
- Clicking it opens a `revertOpen` confirm dialog that explains exactly what reverting does: FIFO layers will be restored to pre-apply values, average costs will be recalculated, cost-adjustment movements will be deleted, and the LC will return to "Active" status.
- The user must type "REVERT" to confirm (prevents accidental clicks).
- On confirm: calls `useRevertLandedCost().mutate(lc.id)`. On success: closes dialogs, calls `onClose()`.

**Flow B — Price Review (post-apply):**
- After `applyLc.mutate` succeeds, instead of immediately calling `onClose()`, set `priceReviewAllocations` state with the returned `LandedCostItemAllocation[]` and open a `priceReviewOpen` dialog.
- The price review dialog fetches current `{selling_price, margin_percent}` for each brand_variant via `useBrandVariantsByIds`.
- It renders a table with one row per allocation. Each row has:
  - Item name, old cost, new cost
  - Current selling price (read-only display)
  - Method radio: "Margin-based" | "Fixed (no change)"
  - When "Margin-based": a `margin%` number input (pre-filled from `bv.margin_percent`), and a live preview `new cost × (1 + margin/100)`
- "Update Prices" button calls `useBatchUpdateSellingPrices` for all rows where method = "margin", then closes and calls `onClose()`.
- "Skip" button closes without updating prices and calls `onClose()`.

- [ ] **Step 1: Add new imports and hooks at the top of `page.tsx`**

In the imports section, add `useRevertLandedCost` and the two new inventory hooks:

```typescript
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost, useApplyLandedCost,
  useRevertLandedCost, useValidateLcAllocation, useBillSignedUrls,
  type LandedCost, type LandedCostLine, type LandedCostItemAllocation,
} from '@/hooks/useLandedCosts'
import {
  useReceivalsForLcSelector, useReceivalItemsWithFifo,
} from '@/hooks/useReceivals'
import {
  useBrandVariantsByIds, useBatchUpdateSellingPrices,
} from '@/hooks/useInventory'
```

Note: `LandedCostItemAllocation` is already exported from `useLandedCosts.ts`.

- [ ] **Step 2: Add `PriceReviewDialog` component above `LcDetailDialog`**

Insert this new component directly above the `// ─── LC Detail Dialog ─────` comment:

```typescript
// ─── Price Review Dialog ──────────────────────────────────────────────────────

type PriceReviewRow = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  original_unit_cost: number
  updated_unit_cost: number
  method: 'margin' | 'fixed'
  margin_percent: number
}

function PriceReviewDialog({
  open,
  allocations,
  onDone,
}: {
  open: boolean
  allocations: LandedCostItemAllocation[]
  onDone: () => void
}) {
  const bvIds = allocations.map((a) => a.brand_variant_id).filter(Boolean)
  const { data: bvPrices, isLoading: loadingPrices } = useBrandVariantsByIds(bvIds)
  const batchUpdate = useBatchUpdateSellingPrices()

  const [rows, setRows] = useState<PriceReviewRow[]>([])

  // Build rows once bvPrices loads
  useEffect(() => {
    if (!open || !bvPrices) return
    setRows(
      allocations
        .filter((a) => a.qty_remaining_at_lc > 0)
        .map((a) => {
          const bv = bvPrices.find((b) => b.id === a.brand_variant_id)
          return {
            brand_variant_id: a.brand_variant_id,
            item_name: a.item_name,
            sku: a.sku,
            original_unit_cost: a.original_unit_cost,
            updated_unit_cost: a.updated_unit_cost,
            method: 'margin' as const,
            margin_percent: bv?.margin_percent ?? 0,
          }
        }),
    )
  }, [open, bvPrices, allocations])

  function updateRow(idx: number, patch: Partial<PriceReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function handleUpdate() {
    const updates = rows
      .filter((r) => r.method === 'margin')
      .map((r) => ({
        id: r.brand_variant_id,
        selling_price: parseFloat(
          (r.updated_unit_cost * (1 + r.margin_percent / 100)).toFixed(2),
        ),
        margin_percent: r.margin_percent,
      }))
    if (updates.length === 0) { onDone(); return }
    batchUpdate.mutate(updates, {
      onSuccess: () => { toast.success('Selling prices updated'); onDone() },
      onError: (err) => toast.error(err.message),
    })
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={() => onDone()}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Review Selling Prices</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The LC has been applied. Unit costs have changed — review each product&apos;s selling price.
        </p>
        {loadingPrices ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items with remaining inventory to price.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-[55vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Old Cost</TableHead>
                  <TableHead className="text-right">New Cost</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right w-24">Margin %</TableHead>
                  <TableHead className="text-right">New Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const suggestedPrice =
                    row.method === 'margin'
                      ? (row.updated_unit_cost * (1 + row.margin_percent / 100)).toFixed(2)
                      : null
                  return (
                    <TableRow key={row.brand_variant_id}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{row.item_name}</p>
                        {row.sku && <p className="text-xs text-muted-foreground font-mono">{row.sku}</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatCurrency(row.original_unit_cost, 'QAR')}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-blue-700">
                        {formatCurrency(row.updated_unit_cost, 'QAR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`method-${idx}`}
                              checked={row.method === 'margin'}
                              onChange={() => updateRow(idx, { method: 'margin' })}
                            />
                            Margin-based
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`method-${idx}`}
                              checked={row.method === 'fixed'}
                              onChange={() => updateRow(idx, { method: 'fixed' })}
                            />
                            Fixed (no change)
                          </label>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.method === 'margin' ? (
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 w-20 text-right text-sm"
                            value={row.margin_percent}
                            onChange={(e) =>
                              updateRow(idx, { margin_percent: parseFloat(e.target.value) || 0 })
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {suggestedPrice
                          ? formatCurrency(parseFloat(suggestedPrice), 'QAR')
                          : <span className="text-muted-foreground text-xs">unchanged</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={batchUpdate.isPending}>
            Skip
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={batchUpdate.isPending || loadingPrices || rows.every((r) => r.method === 'fixed')}
          >
            {batchUpdate.isPending ? 'Updating…' : 'Update Prices'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Update `LcDetailDialog` — add new state + wire Revert + wire price review**

Inside `function LcDetailDialog`, after the existing state declarations (`const [voidReason, setVoidReason] = useState('')`), add:

```typescript
  const revertLc = useRevertLandedCost()
  const [revertOpen, setRevertOpen] = useState(false)
  const [revertConfirmText, setRevertConfirmText] = useState('')
  const [priceReviewOpen, setPriceReviewOpen] = useState(false)
  const [priceReviewAllocations, setPriceReviewAllocations] = useState<LandedCostItemAllocation[]>([])
```

- [ ] **Step 4: Update the Apply `onSuccess` handler to open price review instead of closing**

Find the existing `applyLc.mutate` call inside the Apply confirm dialog and replace its `onSuccess`:

```typescript
                  onClick={() =>
                    applyLc.mutate(lc.id, {
                      onSuccess: (data) => {
                        toast.success('Landed cost applied to inventory')
                        setApplyOpen(false)
                        if (Array.isArray(data) && data.length > 0) {
                          setPriceReviewAllocations(data as LandedCostItemAllocation[])
                          setPriceReviewOpen(true)
                        } else {
                          onClose()
                        }
                      },
                      onError: (err) => toast.error(err.message),
                    })
                  }
```

- [ ] **Step 5: Add Revert button to the main `DialogFooter`**

Find the `DialogFooter` that contains the Void LC and Apply to Inventory buttons and replace it:

```tsx
          {!isVoided && !isApplied && (
            <DialogFooter className="gap-2">
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
              <Button
                size="sm"
                onClick={() => setApplyOpen(true)}
                disabled={lc.attached_receival_ids.length === 0}
              >
                Apply to Inventory
              </Button>
            </DialogFooter>
          )}
          {isApplied && !isVoided && lc.revert_snapshot != null && (
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => { setRevertConfirmText(''); setRevertOpen(true) }}
              >
                Revert Apply
              </Button>
            </DialogFooter>
          )}
```

- [ ] **Step 6: Add Revert confirm dialog and Price Review dialog to the JSX returned from `LcDetailDialog`**

Inside the outer `<>...</>` fragment (after the Void confirm `</Dialog>`), append:

```tsx
      {/* Revert confirm */}
      <Dialog open={revertOpen} onOpenChange={(v) => { if (!v) setRevertOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Revert Landed Cost Apply</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will <strong>undo</strong> the LC application for{' '}
              <strong>{lc?.lc_number}</strong>:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>FIFO layer costs restored to pre-apply values</li>
              <li>Average costs recalculated for all affected variants</li>
              <li>Cost-adjustment stock movements deleted</li>
              <li>LC returns to Active status (can be re-applied)</li>
            </ul>
            <p className="text-sm font-medium">
              Selling price changes made after apply are <em>not</em> automatically reversed.
            </p>
            <div className="space-y-1">
              <Label className="text-sm">Type REVERT to confirm</Label>
              <Input
                value={revertConfirmText}
                onChange={(e) => setRevertConfirmText(e.target.value)}
                placeholder="REVERT"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revertConfirmText !== 'REVERT' || revertLc.isPending}
              onClick={() =>
                revertLc.mutate(lc!.id, {
                  onSuccess: () => {
                    toast.success('LC reverted — FIFO costs restored')
                    setRevertOpen(false)
                    onClose()
                  },
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              {revertLc.isPending ? 'Reverting…' : 'Confirm Revert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-apply price review */}
      <PriceReviewDialog
        open={priceReviewOpen}
        allocations={priceReviewAllocations}
        onDone={() => { setPriceReviewOpen(false); onClose() }}
      />
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors. Common issues:
- `LandedCostItemAllocation` not imported — add it to the useLandedCosts import line
- `Label` not imported — it's already in the import block from Task 6
- `useRevertLandedCost`, `useBrandVariantsByIds`, `useBatchUpdateSellingPrices` not imported — add them to their respective import lines (done in Step 1)

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/purchase/landed-costs/page.tsx"
git commit -m "feat(lc): Revert Apply button + price review dialog after LC apply"
```

---

### Task 5: Build verification + PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Next.js production build**

```bash
npx next build 2>&1 | tail -20
```

Expected: clean exit. `/purchase/landed-costs` route must appear.

- [ ] **Step 3: Update PROGRESS.md**

In `## ✅ Completed`, add at the top:

```
- [2026-04-25] **LC Revert & Price Review Tasks 1–5** — `supabase/migrations/20260425000300_lc_revert_and_margin.sql`, `src/hooks/useLandedCosts.ts`, `src/hooks/useInventory.ts`, `src/components/services/inventory/BrandVariantEditDialog.tsx`, `src/app/(dashboard)/purchase/landed-costs/page.tsx` — revert_snapshot on landed_costs, margin_percent on brand_variants, revert_landed_cost RPC, Revert Apply button with REVERT-to-confirm guard, post-apply PriceReviewDialog with per-row margin/fixed choice and batch selling price update
```

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — LC revert and price review complete"
```

---

## Acceptance Criteria

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx next build` → clean exit
- [ ] `inventory_brand_variants.margin_percent` column exists in DB
- [ ] `landed_costs.revert_snapshot` column exists in DB; populated after apply
- [ ] `revert_landed_cost` function exists in DB
- [ ] Applying an LC sets `revert_snapshot` (visible in `item_allocations` JSON on the record)
- [ ] Applied LC shows "Revert Apply" button in detail dialog footer
- [ ] Clicking "Revert Apply" opens warning dialog listing what will be undone
- [ ] Confirm button stays disabled until user types "REVERT" exactly
- [ ] Successful revert: LC status returns to Active, FIFO layers restored, toast shown, dialog closes
- [ ] LC with no revert_snapshot (old LCs applied before this migration) does NOT show Revert button
- [ ] After apply, Price Review dialog opens automatically (only for items with remaining qty > 0)
- [ ] Price Review shows old cost, new cost, current margin, method selector per row
- [ ] "Margin-based" method: live preview of `new_cost × (1 + margin/100)` updates as margin% changes
- [ ] "Fixed" method: row is excluded from updates
- [ ] "Update Prices" calls batch update; selling prices and margin_percent saved to brand_variants
- [ ] "Skip" closes dialog without updating any prices
- [ ] `BrandVariantEditDialog` shows Margin % field; value persisted to DB
