# Cascade Inventory Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `InventoryItemLookup` in PO line items with a cascading Category → Item → Brand/Variant selector that uses cached TanStack Query hooks, supports backward lookup on reload, and shows Arabic subtitles.

**Architecture:** One new hook (`useBrandVariantAncestry`) handles reverse lookup when loading a saved PO. One new component (`CascadeInventorySelector`) renders three chained shadcn Command/Popover comboboxes. `PoLineItemsEditor` swaps the old lookup for the new component with no change to the `handleInventorySelect` callback.

**Tech Stack:** React, TanStack Query, shadcn/ui (`Command`, `Popover`, `Button`), Supabase JS client, TypeScript

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/hooks/usePurchaseOrders.ts` | Extend `InventoryLookupResult` with `category_name`, `category_name_ar`, `brand` |
| Create | `src/hooks/useBrandVariantAncestry.ts` | Reverse-lookup hook: variant id → item → category |
| Create | `src/components/purchase/CascadeInventorySelector.tsx` | Three-step cascade component |
| Modify | `src/components/purchase/PoLineItemsEditor.tsx` | Swap `InventoryItemLookup` → `CascadeInventorySelector` |

---

## Task 1: Extend InventoryLookupResult type

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts`

- [ ] **Step 1: Locate and update the type**

Open `src/hooks/usePurchaseOrders.ts`. Find the `InventoryLookupResult` export (used by `InventoryItemLookup` and `handleInventorySelect`). Add three optional fields:

```typescript
export type InventoryLookupResult = {
  brand_variant_id: string
  item_name:        string
  item_name_ar:     string | null
  sku:              string | null
  unit:             string
  cost_price:       number
  selling_price:    number
  // Ancestry fields — populated by CascadeInventorySelector on fresh selection;
  // null when reconstructed from a saved PO (backward lookup handles display).
  category_name:    string | null
  category_name_ar: string | null
  brand:            string | null
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (the new fields are optional-compatible because existing callers that construct `InventoryLookupResult` literals will need the three new fields). If you see errors about missing fields in `InventoryItemLookup.tsx` or `PoLineItemsEditor.tsx`, add `category_name: null, category_name_ar: null, brand: null` to those sites.

The one place that constructs this type in `PoLineItemsEditor.tsx` (the `value` prop built from `row.*`) will be updated in Task 4.

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

The component has two render paths:
1. **Pill** — when `value` is set; uses ancestry hook for display when loaded from a saved PO
2. **Cascade** — three chained Command/Popover comboboxes

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
}

async function fetchLastFifoCost(variantId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await (supabase as any)
    .from('fifo_cost_layers')
    .select('total_unit_cost')
    .eq('brand_variant_id', variantId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as any)?.total_unit_cost ?? 0
}

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
}: CascadeInventorySelectorProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [itemId,     setItemId]     = useState<string | null>(null)
  const [catOpen,    setCatOpen]    = useState(false)
  const [itemOpen,   setItemOpen]   = useState(false)
  const [varOpen,    setVarOpen]    = useState(false)

  const { data: categories = [], isLoading: catsLoading } =
    useInventoryCategoriesByType(lineType)
  const { data: items = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(categoryId)
  const { data: variants = [], isLoading: varsLoading } =
    useInventoryBrandVariants(itemId)

  // Backward lookup: fires only when value is set but we have no internal state
  // (i.e. the PO was loaded from the database, not freshly selected this session).
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

    const rawCost = variant.cost_price ?? 0
    const effectiveCost =
      rawCost > 0 ? rawCost : await fetchLastFifoCost(variant.id)

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
    setVarOpen(false)
  }

  function handleClear() {
    onChange(null)
    setCategoryId(null)
    setItemId(null)
  }

  // ── PILL ───────────────────────────────────────────────────────────────────
  if (value) {
    // Prefer internal cascade state; fall back to backward-lookup ancestry;
    // fall back to fields stored on the value itself (set during fresh selection).
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
        {ancestryLoading && !categoryLabel ? (
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
              {catsLoading
                ? 'Loading…'
                : (selectedCategory?.name_en ?? 'Category…')}
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
                  <Check
                    className={cn(
                      'mr-2 h-3 w-3 shrink-0',
                      categoryId === cat.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div>
                    <div>{cat.name_en}</div>
                    {cat.name_ar && (
                      <div className="text-muted-foreground">{cat.name_ar}</div>
                    )}
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
              {itemsLoading
                ? 'Loading…'
                : (selectedItem?.name_en ?? 'Item…')}
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
                  <Check
                    className={cn(
                      'mr-2 h-3 w-3 shrink-0',
                      itemId === item.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div>
                    <div>{item.name_en}</div>
                    {item.name_ar && (
                      <div className="text-muted-foreground">{item.name_ar}</div>
                    )}
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
                    {v.code && (
                      <div className="text-muted-foreground">{v.code}</div>
                    )}
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
- `useInventoryItemsByCategory` not exported from `useInventory` — check the exact export name in `src/hooks/useInventory.ts`
- `useInventoryBrandVariants` — same check
- If `Command*` imports fail, check the exact shadcn import path in the project (may be `@/components/ui/command`)

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "feat(purchase): add CascadeInventorySelector — Category > Item > Brand/Variant cascade"
```

---

## Task 4: Wire CascadeInventorySelector into PoLineItemsEditor

**Files:**
- Modify: `src/components/purchase/PoLineItemsEditor.tsx`

- [ ] **Step 1: Swap the import**

At the top of `src/components/purchase/PoLineItemsEditor.tsx`, replace:

```typescript
import { InventoryItemLookup, type InventoryLookupResult } from './InventoryItemLookup'
```

with:

```typescript
import { CascadeInventorySelector } from './CascadeInventorySelector'
```

The `InventoryLookupResult` type is now imported from `usePurchaseOrders` (already used elsewhere in the file, or add the import):

```typescript
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
```

- [ ] **Step 2: Replace the lookup usage in the JSX**

Find the `isInventory ? (` block (around line 221). Replace the `<InventoryItemLookup ... />` with `<CascadeInventorySelector ... />`, and add the three new ancestry fields as `null` (the backward lookup resolves them at render time):

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
  />
) : (
  <ToolAssetLookup
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Open the app at `http://localhost:3000/purchase/create-po`.

1. Click **+ Products** to add a row
2. Verify Row A shows three disabled buttons: `Category… | Item… | Brand / Variant…`
3. Click **Category…** → popover opens, type to filter, select a category
4. **Item…** button becomes enabled → click it, select an item
5. **Brand / Variant…** becomes enabled → click it, select a variant
6. Row A collapses to a pill: `CategoryName › ItemName · Brand Code`
7. Row B auto-fills: vendor name, SKU, unit, unit price
8. Click × on the pill → cascade resets to three empty buttons
9. Open a saved Draft PO that has an existing product line item
10. Verify the pill renders correctly (backward lookup fires, shows category name)

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase/PoLineItemsEditor.tsx
git commit -m "feat(purchase): wire CascadeInventorySelector into PoLineItemsEditor"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Replace InventoryItemLookup with 3-step cascade | Task 3 + 4 |
| Use TanStack Query hooks (no local createClient calls for lists) | Task 3 — uses `useInventoryCategoriesByType`, `useInventoryItemsByCategory`, `useInventoryBrandVariants` |
| Backward lookup when loading saved PO | Task 2 (`useBrandVariantAncestry`) + Task 3 (pill render path) |
| Command/Combobox pattern for scalable lists | Task 3 — uses shadcn `Command` + `Popover` |
| Arabic subtitles in dropdowns and pill | Task 3 — `name_ar` shown as muted subtitle in each `CommandItem` and in pill |
| FIFO cost fallback when `cost_price === 0` | Task 3 — `fetchLastFifoCost` called in `handleVariantSelect` |
| Extend `InventoryLookupResult` type | Task 1 |
| Category pre-filtered by `lineType` | Task 3 — `useInventoryCategoriesByType(lineType)` |
| Cascade resets on parent change | Task 3 — `setItemId(null)` + `onChange(null)` on category change |
| Responsive stacking on `< sm:` | Task 3 — `grid-cols-1 sm:grid-cols-3` |
| Tools rows unchanged | Task 4 — `ToolAssetLookup` branch untouched |
| Read-only mode unchanged | Task 4 — `readOnly` branch unchanged |

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** `InventoryLookupResult` defined in Task 1, used identically in Tasks 2, 3, and 4. `BrandVariantAncestry` defined and used within Task 2 only.
