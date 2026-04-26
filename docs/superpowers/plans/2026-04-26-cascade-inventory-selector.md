# Cascade Inventory Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `InventoryItemLookup` in PO line items with a cascading Category → Item → Brand/Variant selector that uses cached TanStack Query hooks, supports backward lookup on reload, shows Arabic subtitles, and prevents saving while a price fetch is in flight.

**Architecture:** One new hook (`useBrandVariantAncestry`) handles reverse lookup when loading a saved PO. One new component (`CascadeInventorySelector`) renders three chained shadcn Command/Popover comboboxes and exposes an `onPriceLoading` callback so the parent page can block submission during async cost fetch. `PoLineItemsEditor` tracks per-row loading state and surfaces a single boolean upward. A companion migration adds an ATP guard to `apply_receival_edit`.

**Tech Stack:** React, TanStack Query, shadcn/ui (`Command`, `Popover`, `Button`), Supabase JS client, TypeScript, PostgreSQL

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/hooks/usePurchaseOrders.ts` | Extend `InventoryLookupResult` with `category_name`, `category_name_ar`, `brand` |
| Create | `src/hooks/useBrandVariantAncestry.ts` | Reverse-lookup hook: variant id → item → category |
| Create | `src/components/purchase/CascadeInventorySelector.tsx` | Three-step cascade component with price-loading callback |
| Modify | `src/components/purchase/PoLineItemsEditor.tsx` | Swap lookup, track per-row price loading, surface `onPriceLoading` |
| Modify | `src/app/(dashboard)/purchase/create-po/page.tsx` | Disable submit while any row price is loading |
| Create | `supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql` | Add ATP (available-to-promise) guard to apply_receival_edit RPC |

---

## Task 1: Extend InventoryLookupResult type

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts`

- [ ] **Step 1: Locate and update the type**

Open `src/hooks/usePurchaseOrders.ts`. Find the `InventoryLookupResult` export and add three ancestry fields:

```typescript
export type InventoryLookupResult = {
  brand_variant_id: string
  item_name:        string
  item_name_ar:     string | null
  sku:              string | null
  unit:             string
  cost_price:       number
  selling_price:    number
  // Populated on fresh cascade selection; null when rebuilt from a saved PO row.
  // The backward lookup hook (useBrandVariantAncestry) resolves display at render time.
  category_name:    string | null
  category_name_ar: string | null
  brand:            string | null
}
```

- [ ] **Step 2: Fix any construction sites that now miss the new fields**

Run:
```bash
npx tsc --noEmit 2>&1 | head -30
```

If errors appear about object literals missing `category_name / category_name_ar / brand`, find those sites and add `category_name: null, category_name_ar: null, brand: null`. The one in `PoLineItemsEditor.tsx` is handled in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts
git commit -m "feat(types): extend InventoryLookupResult with category_name, category_name_ar, brand"
```

---

## Task 2: Create useBrandVariantAncestry hook

**Files:**
- Create: `src/hooks/useBrandVariantAncestry.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/hooks/useBrandVariantAncestry.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type BrandVariantAncestry = {
  id: string
  brand: string
  code: string | null
  cost_price: number | null
  inventory_items: {
    id: string
    name_en: string
    name_ar: string | null
    unit: string
    inventory_categories: {
      id: string
      name_en: string
      name_ar: string | null
    }
  }
}

export function useBrandVariantAncestry(variantId: string | null) {
  return useQuery({
    queryKey: ['brand-variant-ancestry', variantId],
    enabled: !!variantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<BrandVariantAncestry> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select(`
          id, brand, code, cost_price,
          inventory_items!inner (
            id, name_en, name_ar, unit,
            inventory_categories!inner (
              id, name_en, name_ar
            )
          )
        `)
        .eq('id', variantId!)
        .single()
      if (error) throw error
      return data as BrandVariantAncestry
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBrandVariantAncestry.ts
git commit -m "feat(hooks): add useBrandVariantAncestry for cascade pill backward lookup"
```

---

## Task 3: Create CascadeInventorySelector component

**Files:**
- Create: `src/components/purchase/CascadeInventorySelector.tsx`

Two render paths:
1. **Pill** — `value` is set; ancestry hook fills display when loaded from saved PO
2. **Cascade** — three chained Command/Popover comboboxes

Key behaviours addressed here:
- `fetchLastFifoCost` orders by `date DESC, created_at DESC, id DESC` (deterministic even when multiple shipments share a date)
- `handleVariantSelect` sets `isPriceLoading` around the async fetch and calls `onPriceLoading` to notify the parent

- [ ] **Step 1: Create the component file**

```typescript
// src/components/purchase/CascadeInventorySelector.tsx
'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  useInventoryCategoriesByType,
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
} from '@/hooks/useInventory'
import { useBrandVariantAncestry } from '@/hooks/useBrandVariantAncestry'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import type { LineType } from './PoLineItemsEditor'

interface CascadeInventorySelectorProps {
  lineType: LineType
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  onPriceLoading?: (loading: boolean) => void
}

// Orders by date DESC, created_at DESC, id DESC to be deterministic when
// multiple FIFO layers share the same date (e.g. two shipments in one day).
async function fetchLastFifoCost(variantId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await (supabase as any)
    .from('fifo_cost_layers')
    .select('total_unit_cost')
    .eq('brand_variant_id', variantId)
    .order('date',       { ascending: false })
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as any)?.total_unit_cost ?? 0
}

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
  onPriceLoading,
}: CascadeInventorySelectorProps) {
  const [categoryId,    setCategoryId]    = useState<string | null>(null)
  const [itemId,        setItemId]        = useState<string | null>(null)
  const [catOpen,       setCatOpen]       = useState(false)
  const [itemOpen,      setItemOpen]      = useState(false)
  const [varOpen,       setVarOpen]       = useState(false)
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const { data: categories = [], isLoading: catsLoading } =
    useInventoryCategoriesByType(lineType)
  const { data: items = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(categoryId)
  const { data: variants = [], isLoading: varsLoading } =
    useInventoryBrandVariants(itemId)

  // Backward lookup: fires only when value exists but cascade state is absent
  // (i.e. PO loaded from DB rather than freshly selected in this session).
  const { data: ancestry, isLoading: ancestryLoading } = useBrandVariantAncestry(
    value && !categoryId ? value.brand_variant_id : null
  )

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null
  const selectedItem     = items.find((i) => i.id === itemId) ?? null

  async function handleVariantSelect(variant: {
    id: string
    brand: string
    code: string | null
    cost_price: number | null
    selling_price: number | null
  }) {
    if (!selectedItem || !selectedCategory) return
    setVarOpen(false)

    const rawCost = variant.cost_price ?? 0
    if (rawCost > 0) {
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       rawCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
      return
    }

    // cost_price is 0 or null — fetch last FIFO cost asynchronously.
    // Signal the parent to block submission while the fetch is in flight.
    setIsPriceLoading(true)
    onPriceLoading?.(true)
    try {
      const effectiveCost = await fetchLastFifoCost(variant.id)
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       effectiveCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
    } finally {
      setIsPriceLoading(false)
      onPriceLoading?.(false)
    }
  }

  function handleClear() {
    onChange(null)
    setCategoryId(null)
    setItemId(null)
  }

  // ── PILL ───────────────────────────────────────────────────────────────────
  if (value) {
    const categoryLabel =
      selectedCategory?.name_en ??
      ancestry?.inventory_items?.inventory_categories?.name_en ??
      value.category_name ??
      null
    const categoryLabelAr =
      selectedCategory?.name_ar ??
      ancestry?.inventory_items?.inventory_categories?.name_ar ??
      value.category_name_ar ??
      null
    const brand = value.brand ?? ancestry?.brand ?? null
    const code  = value.sku   ?? ancestry?.code  ?? null

    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm min-h-[32px]">
        {isPriceLoading ? (
          <span className="flex-1 text-xs text-muted-foreground animate-pulse">
            Fetching price…
          </span>
        ) : ancestryLoading && !categoryLabel ? (
          <span className="flex-1 h-4 rounded bg-muted animate-pulse" />
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 truncate">
              {categoryLabel && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {categoryLabel} ›
                </span>
              )}
              <span className="font-medium truncate">{value.item_name}</span>
              {brand && (
                <span className="text-muted-foreground text-xs shrink-0">
                  · {brand}
                </span>
              )}
              {code && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {code}
                </span>
              )}
            </div>
            {(categoryLabelAr || value.item_name_ar) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                {categoryLabelAr && <span>{categoryLabelAr} ›</span>}
                {value.item_name_ar && <span>{value.item_name_ar}</span>}
              </div>
            )}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={handleClear}
          disabled={isPriceLoading}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  // ── CASCADE ────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {/* Step 1 — Category */}
      <Popover open={catOpen} onOpenChange={setCatOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-8 justify-between text-xs font-normal w-full"
          >
            <span className="truncate">
              {catsLoading ? 'Loading…' : (selectedCategory?.name_en ?? 'Category…')}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search category…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No categories found.
            </CommandEmpty>
            <CommandGroup>
              {categories.map((cat) => (
                <CommandItem
                  key={cat.id}
                  value={cat.name_en}
                  onSelect={() => {
                    setCategoryId(cat.id)
                    setItemId(null)
                    onChange(null)
                    setCatOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', categoryId === cat.id ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <div>{cat.name_en}</div>
                    {cat.name_ar && <div className="text-muted-foreground">{cat.name_ar}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Step 2 — Item */}
      <Popover open={itemOpen} onOpenChange={setItemOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={!categoryId}
            className="h-8 justify-between text-xs font-normal w-full"
          >
            <span className="truncate">
              {itemsLoading ? 'Loading…' : (selectedItem?.name_en ?? 'Item…')}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search item…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No items found.
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name_en}
                  onSelect={() => {
                    setItemId(item.id)
                    onChange(null)
                    setItemOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', itemId === item.id ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <div>{item.name_en}</div>
                    {item.name_ar && <div className="text-muted-foreground">{item.name_ar}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Step 3 — Brand / Variant */}
      <Popover open={varOpen} onOpenChange={setVarOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={!itemId}
            className="h-8 justify-between text-xs font-normal w-full"
          >
            <span className="truncate">
              {varsLoading ? 'Loading…' : 'Brand / Variant…'}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search brand…" className="h-8 text-xs" />
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              No variants found.
            </CommandEmpty>
            <CommandGroup>
              {variants.map((v) => (
                <CommandItem
                  key={v.id}
                  value={`${v.brand} ${v.code ?? ''}`}
                  onSelect={() => handleVariantSelect(v)}
                  className="text-xs"
                >
                  <div>
                    <div className="font-medium">{v.brand}</div>
                    {v.code && <div className="text-muted-foreground">{v.code}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. Common issues:
- `useInventoryItemsByCategory` / `useInventoryBrandVariants` — verify exact export names in `src/hooks/useInventory.ts`
- `Command*` imports — path may be `@/components/ui/command`

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "feat(purchase): add CascadeInventorySelector — Category > Item > Brand/Variant cascade"
```

---

## Task 4: Wire CascadeInventorySelector into PoLineItemsEditor + surface price-loading state

**Files:**
- Modify: `src/components/purchase/PoLineItemsEditor.tsx`

- [ ] **Step 1: Add `onPriceLoading` to the editor's props and state**

In `src/components/purchase/PoLineItemsEditor.tsx`, add to the `PoLineItemsEditorProps` interface and the component signature:

```typescript
// Add to interface:
interface PoLineItemsEditorProps {
  value: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  currency: string
  readOnly?: boolean
  onPriceLoading?: (loading: boolean) => void   // NEW
}

// Add inside the component body, before the return:
const [priceLoadingKeys, setPriceLoadingKeys] = useState<Set<string>>(new Set())

function handleRowPriceLoading(key: string, loading: boolean) {
  setPriceLoadingKeys((prev) => {
    const next = new Set(prev)
    loading ? next.add(key) : next.delete(key)
    onPriceLoading?.(next.size > 0)
    return next
  })
}
```

- [ ] **Step 2: Swap the import and replace the JSX**

Replace:
```typescript
import { InventoryItemLookup, type InventoryLookupResult } from './InventoryItemLookup'
```
with:
```typescript
import { CascadeInventorySelector } from './CascadeInventorySelector'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
```

Find the `isInventory ? (` block and replace `<InventoryItemLookup ... />` with:

```tsx
) : isInventory ? (
  <CascadeInventorySelector
    lineType={lineType}
    value={
      row.brand_variant_id
        ? {
            brand_variant_id: row.brand_variant_id,
            item_name:        row.item_name,
            item_name_ar:     null,
            sku:              row.sku,
            unit:             row.unit,
            cost_price:       row.unit_price,
            selling_price:    0,
            category_name:    null,
            category_name_ar: null,
            brand:            null,
          }
        : null
    }
    onChange={(item) => handleInventorySelect(row._key, item)}
    onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
  />
) : (
  <ToolAssetLookup
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/PoLineItemsEditor.tsx
git commit -m "feat(purchase): wire CascadeInventorySelector, surface onPriceLoading to parent"
```

---

## Task 5: Disable submit while price is loading (create-po page)

**Files:**
- Modify: `src/app/(dashboard)/purchase/create-po/page.tsx`

- [ ] **Step 1: Add `isPriceLoading` state**

In the create-po page component, add:

```typescript
const [isPriceLoading, setIsPriceLoading] = useState(false)
```

- [ ] **Step 2: Pass `onPriceLoading` to `PoLineItemsEditor`**

Find the `<PoLineItemsEditor` usage in the JSX and add the prop:

```tsx
<PoLineItemsEditor
  value={lineItems}
  onChange={setLineItems}
  currency={currency}
  onPriceLoading={setIsPriceLoading}
/>
```

- [ ] **Step 3: Disable the submit buttons while loading**

Find the "Save as RFQ / Draft" and "Submit for Approval" buttons. Add `disabled={isPriceLoading}` to both:

```tsx
<Button
  variant="outline"
  disabled={isSubmitting || isPriceLoading}
  onClick={() => handleSubmit('rfq')}
>
  Save as RFQ / Draft
</Button>
<Button
  disabled={isSubmitting || isPriceLoading}
  onClick={() => handleSubmit('pending_approval')}
>
  {isPriceLoading ? 'Fetching price…' : 'Submit for Approval'}
</Button>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Open Create PO, add a Products line item
2. Select a variant whose `cost_price` is 0 (or temporarily set one to 0 in the DB)
3. Observe Row A shows "Fetching price…" and the submit buttons are disabled while the FIFO fetch runs
4. Once the price resolves, buttons re-enable and Row B shows the fetched price

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/purchase/create-po/page.tsx
git commit -m "feat(purchase): disable PO submit while cascade selector fetches fallback price"
```

---

## Task 6: ATP guard migration for apply_receival_edit

**Files:**
- Create: `supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql`

When reducing a receival quantity, the RPC must verify that the resulting `stock_level` will not fall below `reserved_qty`. Without this, an edit could produce negative available-to-promise stock while appearing to succeed.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql
--
-- RISK: apply_receival_edit allows qty decreases that would drop stock_level
-- below reserved_qty, producing negative available (ATP) stock.
--
-- FIX: after the FIFO layer remaining_qty guard, add a second check that
-- (current stock_level - |delta|) >= reserved_qty before committing.

BEGIN;

CREATE OR REPLACE FUNCTION apply_receival_edit(
  p_edit_request_id UUID,
  p_items           JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_bv_id           UUID;
  v_pli_id          UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;
  v_new_cost        NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
  v_stock_level     INT;      -- NEW
  v_reserved_qty    INT;      -- NEW
BEGIN
  -- ── 1. Lock and validate the edit request ──────────────────────────────────
  SELECT * INTO v_req FROM receival_edit_requests WHERE id = p_edit_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit request % not found', p_edit_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Edit request % is not approved (status: %)', p_edit_request_id, v_req.status;
  END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
    UPDATE receival_edit_requests SET status = 'expired' WHERE id = p_edit_request_id;
    RAISE EXCEPTION 'Edit window expired. Please request a new edit.';
  END IF;

  -- ── 2. Lock the receival ────────────────────────────────────────────────────
  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  -- ── 3. Pre-flight LC check ──────────────────────────────────────────────────
  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  -- ── 4. Process each item ────────────────────────────────────────────────────
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id, ri.po_line_item_id
    INTO v_old_qty, v_old_cost, v_bv_id, v_pli_id
    FROM receival_items ri
    WHERE ri.id = (v_item_input->>'receival_item_id')::UUID
      AND ri.receival_id = v_req.receival_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found (or does not belong to receival %)',
        v_item_input->>'receival_item_id', v_req.receival_id;
    END IF;

    v_new_qty  := (v_item_input->>'new_qty')::INT;
    v_new_cost := (v_item_input->>'new_unit_cost')::NUMERIC;
    v_delta    := v_new_qty - v_old_qty;

    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'new_qty must be a positive integer for item %', v_item_input->>'receival_item_id';
    END IF;
    IF v_new_cost IS NULL OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'new_unit_cost must be non-negative for item %', v_item_input->>'receival_item_id';
    END IF;

    -- Sync PO line item received_qty (always, regardless of inventory linkage)
    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- ── QTY CHANGE ────────────────────────────────────────────────────────────
    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;

      ELSE  -- v_delta < 0
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        -- ATP guard: new stock_level must not fall below reserved_qty
        SELECT stock_level, COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_brand_variants
        WHERE id = v_bv_id;

        IF (v_stock_level - ABS(v_delta)) < v_reserved_qty THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: new stock level (%) would be below reserved qty (%)',
            ABS(v_delta),
            v_stock_level - ABS(v_delta),
            v_reserved_qty;
        END IF;

        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    -- ── UNIT COST CHANGE ──────────────────────────────────────────────────────
    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost,
            total_cost = v_new_cost * qty
        WHERE id IN (
          SELECT id FROM cogs_entries
          WHERE brand_variant_id = v_bv_id
            AND unit_cost = v_old_cost
            AND date >= v_receival_date
          ORDER BY date ASC
          LIMIT v_sold_qty
        );
      END IF;

      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost,
          total_unit_cost = v_new_cost + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;
    END IF;

    PERFORM recalc_average_cost(v_bv_id);

    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id = ANY(
          SELECT unnest(v_lc_rec.attached_receival_ids)::TEXT
        );
        IF v_total_remaining = 0 THEN
          UPDATE landed_costs SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    UPDATE receival_items
    SET qty_received = v_new_qty, unit_cost = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;

  END LOOP;

  UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true, 'edit_request_id', p_edit_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_receival_edit(UUID, JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected output:
```
Applying migration 20260426000003_fix_apply_receival_edit_atp_guard.sql...
Finished supabase db push.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql
git commit -m "fix(rpc): add ATP guard to apply_receival_edit — block qty decrease below reserved_qty"
```

---

## Self-Review

**Spec + review coverage check:**

| Requirement | Task |
|---|---|
| Replace InventoryItemLookup with 3-step cascade | Tasks 3 + 4 |
| TanStack Query hooks — no N+1 local fetches | Task 3 — uses `useInventoryCategoriesByType`, `useInventoryItemsByCategory`, `useInventoryBrandVariants` |
| Backward lookup on PO reload | Task 2 (`useBrandVariantAncestry`) + Task 3 (pill path) |
| Command/Combobox — scalable for 200+ items | Task 3 — shadcn `Command` + `Popover` |
| Arabic subtitles in dropdowns and pill | Task 3 — `name_ar` in each `CommandItem` and pill |
| FIFO cost fallback when `cost_price === 0` | Task 3 — `fetchLastFifoCost` with deterministic ordering |
| Deterministic FIFO cost ordering | Task 3 — `ORDER BY date DESC, created_at DESC, id DESC` |
| Block save during async price fetch | Tasks 3, 4, 5 — `onPriceLoading` callback chain |
| Extend `InventoryLookupResult` type | Task 1 |
| Category pre-filtered by `lineType` | Task 3 — `useInventoryCategoriesByType(lineType)` |
| Cascade resets on parent change | Task 3 — `setItemId(null)` + `onChange(null)` on category change |
| Responsive stacking on `< sm:` | Task 3 — `grid-cols-1 sm:grid-cols-3` |
| Tools rows unchanged | Task 4 — `ToolAssetLookup` branch untouched |
| Read-only mode unchanged | Task 4 — `readOnly` branch unchanged |
| ATP guard on receival qty decrease | Task 6 — `(stock_level - delta) >= reserved_qty` check in RPC |

**Placeholder scan:** No TBDs, TODOs, or vague steps.

**Type consistency:** `InventoryLookupResult` defined in Task 1, used identically in Tasks 3, 4, 5. `BrandVariantAncestry` defined in Task 2, used only in Task 3. `onPriceLoading: (loading: boolean) => void` signature is identical across Tasks 3, 4, 5.
