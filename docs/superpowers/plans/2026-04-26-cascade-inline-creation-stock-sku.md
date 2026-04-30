# Cascade Inline Creation, Stock Display & Editable SKU — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline inventory creation from cascade dropdowns, show available stock in the selection pill, and make the vendor SKU field editable.

**Architecture:** Seven sequential tasks. Tasks 1–2 fix foundational data layer issues (query invalidation, stock fields in ancestry). Task 3 refactors CascadeInventorySelector to store full objects (race-condition fix). Task 4 creates the three inline form components. Task 5 wires them into the selector. Task 6 adds the stock pill. Task 7 makes the SKU editable.

**Tech Stack:** Next.js 15 App Router, TanStack Query v5, Supabase JS client, shadcn/ui (Command, Input, Button), Base UI Popover, Sonner toasts

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/hooks/useInventory.ts` | Fix `onSuccess` invalidation for `useCreateInventoryItem` and `useCreateBrandVariant` |
| Modify | `src/hooks/useBrandVariantAncestry.ts` | Add `stock_level` + `reserved_qty` to type and query |
| Modify | `src/components/purchase/CascadeInventorySelector.tsx` | Full-object state; inline form states; stock state; "Add new…" buttons |
| Create | `src/components/purchase/CascadeInlineForms.tsx` | Three inline creation form components |
| Modify | `src/components/purchase/PoLineItemsEditor.tsx` | Editable SKU input + pre-fill guard |

---

### Task 1: Fix query invalidation in useInventory.ts

**Files:**
- Modify: `src/hooks/useInventory.ts`

Two query keys are wrong. `useCreateInventoryItem` only invalidates `['inventory-items']` but the cascade uses `useInventoryItemsByCategory` whose key is `['inventory-items-by-category', ...]`. `useCreateBrandVariant` only invalidates `['brand-variants', item_id]` but the cascade uses `useInventoryBrandVariants` whose key is `['brand-variants-v2', itemId]`. Without this fix, newly created items/variants won't appear in the cascade dropdowns.

- [ ] **Step 1: Update `useCreateInventoryItem.onSuccess`**

In `src/hooks/useInventory.ts`, locate the `useCreateInventoryItem` function (around line 82). Change `onSuccess`:

```typescript
// Before:
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
},

// After:
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
  queryClient.invalidateQueries({ queryKey: ['inventory-items-by-category'] })
},
```

- [ ] **Step 2: Update `useCreateBrandVariant.onSuccess`**

In the same file, locate `useCreateBrandVariant` (around line 121). Change `onSuccess`:

```typescript
// Before:
onSuccess: (_: unknown, variables: BrandVariantInsert) => {
  queryClient.invalidateQueries({ queryKey: ['brand-variants', variables.item_id] })
  queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
},

// After:
onSuccess: (_: unknown, variables: BrandVariantInsert) => {
  queryClient.invalidateQueries({ queryKey: ['brand-variants', variables.item_id] })
  queryClient.invalidateQueries({ queryKey: ['brand-variants-v2', variables.item_id] })
  queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInventory.ts
git commit -m "fix(inventory): add missing query invalidations for item and variant creation"
```

---

### Task 2: Extend useBrandVariantAncestry with stock fields

**Files:**
- Modify: `src/hooks/useBrandVariantAncestry.ts`

The ancestry hook is used to display the pill when a PO is loaded from the DB. It currently lacks `stock_level` and `reserved_qty`, so the stock indicator can't be shown on the DB-reload path.

- [ ] **Step 1: Replace the entire file**

```typescript
// src/hooks/useBrandVariantAncestry.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type BrandVariantAncestry = {
  id: string
  brand: string
  code: string | null
  cost_price: number | null
  stock_level: number | null
  reserved_qty: number | null
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
          id, brand, code, cost_price, stock_level, reserved_qty,
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBrandVariantAncestry.ts
git commit -m "feat(ancestry): add stock_level and reserved_qty to useBrandVariantAncestry"
```

---

### Task 3: Refactor CascadeInventorySelector to full-object state

**Files:**
- Modify: `src/components/purchase/CascadeInventorySelector.tsx`

Currently the selector stores `categoryId: string | null` and `itemId: string | null`, then derives `selectedCategory` and `selectedItem` via `.find()` on the data arrays. When an entity is created inline, TanStack Query triggers a refetch — but the `.find()` executes _before_ the refetch completes, returning `null`. This causes `handleVariantSelect` to return early and drop the selection.

Fix: store the full `InventoryCategory` and `InventoryItem` objects directly in state.

Also import the two types and update all references.

- [ ] **Step 1: Replace `src/components/purchase/CascadeInventorySelector.tsx` with the refactored version**

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
  type InventoryCategory,
  type InventoryItem,
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

const triggerCls =
  'h-8 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
  onPriceLoading,
}: CascadeInventorySelectorProps) {
  // Full objects stored directly — avoids .find() race with TanStack Query refetches
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | null>(null)
  const [selectedItem,     setSelectedItem]     = useState<InventoryItem | null>(null)

  const [catOpen,        setCatOpen]        = useState(false)
  const [itemOpen,       setItemOpen]       = useState(false)
  const [varOpen,        setVarOpen]        = useState(false)
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const [selectedVariantCode,  setSelectedVariantCode]  = useState<string | null>(null)
  const [selectedVariantBrand, setSelectedVariantBrand] = useState<string | null>(null)

  const { data: categories = [], isLoading: catsLoading } =
    useInventoryCategoriesByType(lineType)
  const { data: items = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(selectedCategory?.id ?? null)
  const { data: variants = [], isLoading: varsLoading } =
    useInventoryBrandVariants(selectedItem?.id ?? null)

  const { data: ancestry, isLoading: ancestryLoading } = useBrandVariantAncestry(
    value && !selectedCategory ? value.brand_variant_id : null
  )

  async function handleVariantSelect(variant: {
    id: string
    brand: string
    code: string | null
    cost_price: number | null
    selling_price: number | null
  }) {
    if (!selectedItem || !selectedCategory) return
    setVarOpen(false)

    setSelectedVariantCode(variant.code ?? null)
    setSelectedVariantBrand(variant.brand)

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
    setSelectedCategory(null)
    setSelectedItem(null)
    setSelectedVariantCode(null)
    setSelectedVariantBrand(null)
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
    const inventoryName   = selectedItem?.name_en ?? ancestry?.inventory_items?.name_en ?? null
    const inventoryNameAr = selectedItem?.name_ar ?? ancestry?.inventory_items?.name_ar ?? null
    const brand = selectedVariantBrand ?? ancestry?.brand ?? null
    const code  = selectedVariantCode  ?? ancestry?.code  ?? null

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
              <span className="font-medium truncate">{inventoryName ?? value.item_name}</span>
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
            {(categoryLabelAr || inventoryNameAr) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                {categoryLabelAr && <span>{categoryLabelAr} ›</span>}
                {inventoryNameAr && <span>{inventoryNameAr}</span>}
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
        <PopoverTrigger
          className={triggerCls}
          render={(props) => <button type="button" {...props} />}
        >
          <span className="truncate">
            {catsLoading ? 'Loading…' : (selectedCategory?.name_en ?? 'Category…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
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
                    setSelectedCategory(cat)
                    setSelectedItem(null)
                    onChange(null)
                    setCatOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', selectedCategory?.id === cat.id ? 'opacity-100' : 'opacity-0')} />
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
        <PopoverTrigger
          className={cn(triggerCls, !selectedCategory && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!selectedCategory} {...props} />}
        >
          <span className="truncate">
            {itemsLoading ? 'Loading…' : (selectedItem?.name_en ?? 'Item…')}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
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
                    setSelectedItem(item)
                    onChange(null)
                    setItemOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0')} />
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
        <PopoverTrigger
          className={cn(triggerCls, !selectedItem && 'pointer-events-none opacity-50')}
          render={(props) => <button type="button" disabled={!selectedItem} {...props} />}
        >
          <span className="truncate">
            {varsLoading ? 'Loading…' : 'Brand / Variant…'}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "refactor(cascade): store full category/item objects in state to eliminate .find() race condition"
```

---

### Task 4: Create CascadeInlineForms.tsx

**Files:**
- Create: `src/components/purchase/CascadeInlineForms.tsx`

Three self-contained inline form components, each with `useState` (no react-hook-form — too heavy for a popover), synchronous validation, and keyboard accessibility (Enter submits, Escape cancels).

Note: `brand` on `inventory_brand_variants` is a plain `TEXT` column — free text is correct (same as `BrandVariantFormDialog`). The `<datalist>` gives autocomplete suggestions from already-loaded variants to reduce duplicate spellings without enforcing a FK.

Note: `inventory_items` does not have a `cost_price` column — that field lives on `inventory_brand_variants`. The item form omits cost_price.

- [ ] **Step 1: Create the file**

```typescript
// src/components/purchase/CascadeInlineForms.tsx
'use client'

import { useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCreateInventoryCategory,
  useCreateInventoryItem,
  useCreateBrandVariant,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
} from '@/hooks/useInventory'
import type { LineType } from './PoLineItemsEditor'

// ── CascadeNewCategoryForm ─────────────────────────────────────────────────────

interface NewCategoryFormProps {
  lineType: LineType
  onCreated: (category: InventoryCategory) => void
  onCancel: () => void
}

export function CascadeNewCategoryForm({ lineType, onCreated, onCancel }: NewCategoryFormProps) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const create = useCreateInventoryCategory()

  function handleSubmit() {
    if (!nameEn.trim()) return
    create.mutate(
      { name_en: nameEn.trim(), name_ar: nameAr.trim() || null, type: lineType },
      {
        onSuccess: (cat) => { toast.success('Category created'); onCreated(cat) },
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Category</p>
      <Input
        autoFocus
        className="h-7 text-xs w-full"
        placeholder="English name *"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Arabic name (optional)"
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
      />
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!nameEn.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CascadeNewItemForm ─────────────────────────────────────────────────────────

interface NewItemFormProps {
  categoryId: string
  onCreated: (item: InventoryItem) => void
  onCancel: () => void
}

export function CascadeNewItemForm({ categoryId, onCreated, onCancel }: NewItemFormProps) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [unit,   setUnit]   = useState('pcs')
  const [sku,    setSku]    = useState('')
  const create = useCreateInventoryItem()

  function handleSubmit() {
    if (!nameEn.trim() || !unit.trim()) return
    create.mutate(
      {
        name_en:     nameEn.trim(),
        name_ar:     nameAr.trim() || null,
        unit:        unit.trim(),
        sku:         sku.trim() || null,
        category_id: categoryId,
      } as any,
      {
        onSuccess: (item) => { toast.success('Item created'); onCreated(item as InventoryItem) },
        onError:   (err)  => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Item</p>
      <Input
        autoFocus
        className="h-7 text-xs w-full"
        placeholder="English name *"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Arabic name (optional)"
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="h-7 text-xs"
          placeholder="Unit *"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <Input
          className="h-7 text-xs"
          placeholder="SKU (optional)"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!nameEn.trim() || !unit.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CascadeNewVariantForm ──────────────────────────────────────────────────────

interface NewVariantFormProps {
  itemId: string
  existingBrands: string[]
  onCreated: (variant: BrandVariant) => void
  onCancel: () => void
}

export function CascadeNewVariantForm({ itemId, existingBrands, onCreated, onCancel }: NewVariantFormProps) {
  const [brand,         setBrand]         = useState('')
  const [code,          setCode]          = useState('')
  const [costPrice,     setCostPrice]     = useState('0')
  const [sellingPrice,  setSellingPrice]  = useState('0')
  const create = useCreateBrandVariant()

  const datalistId = `brands-${itemId}`

  function handleSubmit() {
    if (!brand.trim()) return
    create.mutate(
      {
        item_id:       itemId,
        brand:         brand.trim(),
        code:          code.trim() || null,
        cost_price:    Number(costPrice)    || 0,
        selling_price: Number(sellingPrice) || 0,
      },
      {
        onSuccess: (variant) => { toast.success('Brand/variant created'); onCreated(variant as BrandVariant) },
        onError:   (err)     => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Brand / Variant</p>
      <datalist id={datalistId}>
        {[...new Set(existingBrands)].map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <Input
        autoFocus
        list={datalistId}
        className="h-7 text-xs w-full"
        placeholder="Brand name *"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
      />
      <Input
        className="h-7 text-xs w-full"
        placeholder="Variant code / SKU (optional)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Cost price"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Selling price"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!brand.trim() || create.isPending}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/CascadeInlineForms.tsx
git commit -m "feat(cascade): add CascadeInlineForms — inline Category, Item, and Brand/Variant creation"
```

---

### Task 5: Wire CascadeInlineForms into CascadeInventorySelector

**Files:**
- Modify: `src/components/purchase/CascadeInventorySelector.tsx`

Add three `isCreating` boolean states, three `onCreated` callbacks that auto-advance the cascade, and "Add new…" buttons at the bottom of each popover. When a creating flag is true, the popover content shows the form instead of the command list.

The "Add new…" trigger is placed _outside_ the `<Command>` block (below it, separated by a border) so it is never hidden by the Command's search filter.

- [ ] **Step 1: Add imports at top of file**

After the existing import block in `CascadeInventorySelector.tsx`, add:

```typescript
import {
  CascadeNewCategoryForm,
  CascadeNewItemForm,
  CascadeNewVariantForm,
} from './CascadeInlineForms'
import type { BrandVariant } from '@/hooks/useInventory'
```

- [ ] **Step 2: Add the three creating-mode state variables**

Inside the component function, after the existing state declarations, add:

```typescript
const [isCatCreating,  setIsCatCreating]  = useState(false)
const [isItemCreating, setIsItemCreating] = useState(false)
const [isVarCreating,  setIsVarCreating]  = useState(false)
```

- [ ] **Step 3: Add the three `onCreated` callbacks**

Add these functions after `handleClear`:

```typescript
function handleCategoryCreated(cat: InventoryCategory) {
  setSelectedCategory(cat)
  setSelectedItem(null)
  setIsCatCreating(false)
  setCatOpen(false)
  setItemOpen(true)
}

function handleItemCreated(item: InventoryItem) {
  setSelectedItem(item)
  setIsItemCreating(false)
  setItemOpen(false)
  setVarOpen(true)
}

function handleVariantCreated(variant: BrandVariant) {
  handleVariantSelect(variant as any)
  setIsVarCreating(false)
}
```

- [ ] **Step 4: Update Category popover content**

Replace the existing `<PopoverContent>` for Step 1 — Category with:

```tsx
<PopoverContent className="w-56 p-0" align="start">
  {isCatCreating ? (
    <CascadeNewCategoryForm
      lineType={lineType}
      onCreated={handleCategoryCreated}
      onCancel={() => setIsCatCreating(false)}
    />
  ) : (
    <>
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
                setSelectedCategory(cat)
                setSelectedItem(null)
                onChange(null)
                setCatOpen(false)
              }}
              className="text-xs"
            >
              <Check className={cn('mr-2 h-3 w-3 shrink-0', selectedCategory?.id === cat.id ? 'opacity-100' : 'opacity-0')} />
              <div>
                <div>{cat.name_en}</div>
                {cat.name_ar && <div className="text-muted-foreground">{cat.name_ar}</div>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </Command>
      <div className="border-t px-2 py-1.5">
        <button
          type="button"
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
          onClick={() => setIsCatCreating(true)}
        >
          + Add new category
        </button>
      </div>
    </>
  )}
</PopoverContent>
```

- [ ] **Step 5: Update Item popover content**

Replace the existing `<PopoverContent>` for Step 2 — Item with:

```tsx
<PopoverContent className="w-64 p-0" align="start">
  {isItemCreating ? (
    <CascadeNewItemForm
      categoryId={selectedCategory!.id}
      onCreated={handleItemCreated}
      onCancel={() => setIsItemCreating(false)}
    />
  ) : (
    <>
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
                setSelectedItem(item)
                onChange(null)
                setItemOpen(false)
              }}
              className="text-xs"
            >
              <Check className={cn('mr-2 h-3 w-3 shrink-0', selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0')} />
              <div>
                <div>{item.name_en}</div>
                {item.name_ar && <div className="text-muted-foreground">{item.name_ar}</div>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </Command>
      <div className="border-t px-2 py-1.5">
        <button
          type="button"
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
          onClick={() => setIsItemCreating(true)}
        >
          + Add new item
        </button>
      </div>
    </>
  )}
</PopoverContent>
```

- [ ] **Step 6: Update Brand/Variant popover content**

Replace the existing `<PopoverContent>` for Step 3 — Brand / Variant with:

```tsx
<PopoverContent className="w-56 p-0" align="start">
  {isVarCreating ? (
    <CascadeNewVariantForm
      itemId={selectedItem!.id}
      existingBrands={variants.map((v) => v.brand as string)}
      onCreated={handleVariantCreated}
      onCancel={() => setIsVarCreating(false)}
    />
  ) : (
    <>
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
      <div className="border-t px-2 py-1.5">
        <button
          type="button"
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
          onClick={() => setIsVarCreating(true)}
        >
          + Add new brand / variant
        </button>
      </div>
    </>
  )}
</PopoverContent>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "feat(cascade): wire inline creation forms into cascade popovers with auto-advance"
```

---

### Task 6: Add stock display to the cascade pill

**Files:**
- Modify: `src/components/purchase/CascadeInventorySelector.tsx`

After selection, the pill's secondary line shows "8 in stock" (green) or "Out of stock" (muted). Uses the null-safe formula `Math.max(0, (x ?? 0) - (y ?? 0))` everywhere to avoid `NaN` on new variants that have `null` stock fields.

- [ ] **Step 1: Add `selectedVariantStock` state**

Inside the component function, after the `selectedVariantBrand` state declaration, add:

```typescript
const [selectedVariantStock, setSelectedVariantStock] = useState<number | null>(null)
```

- [ ] **Step 2: Extend `handleVariantSelect` parameter type and capture stock**

Replace the `handleVariantSelect` function signature and the two capture lines:

```typescript
async function handleVariantSelect(variant: {
  id: string
  brand: string
  code: string | null
  cost_price: number | null
  selling_price: number | null
  stock_level?: number | null
  reserved_qty?: number | null
}) {
  if (!selectedItem || !selectedCategory) return
  setVarOpen(false)

  setSelectedVariantCode(variant.code ?? null)
  setSelectedVariantBrand(variant.brand)
  setSelectedVariantStock(
    Math.max(0, (variant.stock_level ?? 0) - (variant.reserved_qty ?? 0))
  )

  // ... rest of function unchanged
```

- [ ] **Step 3: Reset `selectedVariantStock` in `handleClear`**

```typescript
function handleClear() {
  onChange(null)
  setSelectedCategory(null)
  setSelectedItem(null)
  setSelectedVariantCode(null)
  setSelectedVariantBrand(null)
  setSelectedVariantStock(null)
}
```

- [ ] **Step 4: Add stock display to the pill JSX**

In the pill section (inside `if (value) { ... }`), add the stock computation and update the secondary line. Add after the `code` constant:

```typescript
const ancestryStock =
  ancestry != null
    ? Math.max(0, (ancestry.stock_level ?? 0) - (ancestry.reserved_qty ?? 0))
    : null
const stockToShow = selectedVariantStock ?? ancestryStock
```

Then update the secondary `<div>` (the one containing `categoryLabelAr` and `inventoryNameAr`) to also show the stock indicator:

```tsx
{(categoryLabelAr || inventoryNameAr || stockToShow != null) && (
  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
    {categoryLabelAr && <span className="shrink-0">{categoryLabelAr} ›</span>}
    {inventoryNameAr && <span className="truncate">{inventoryNameAr}</span>}
    {stockToShow != null && (
      <span
        className={cn(
          'ml-auto shrink-0 font-medium',
          stockToShow > 0 ? 'text-green-600' : 'text-muted-foreground'
        )}
      >
        {stockToShow > 0 ? `${stockToShow} in stock` : 'Out of stock'}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "feat(cascade): show available stock in selection pill"
```

---

### Task 7: Editable vendor SKU in PoLineItemsEditor

**Files:**
- Modify: `src/components/purchase/PoLineItemsEditor.tsx`

Two changes: (1) replace the read-only SKU `<span>` with an editable `<Input>`, and (2) add a pre-fill guard in `handleInventorySelect` so that a vendor SKU the user typed before finishing the cascade selection is not silently overwritten.

- [ ] **Step 1: Update `handleInventorySelect` to guard the SKU pre-fill**

Find the `handleInventorySelect` function (around line 113). Replace it:

```typescript
function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
  if (!item) {
    updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, brand_variant_id: null })
    return
  }
  const existingRow = value.find((r) => r._key === key)
  updateRow(key, {
    item_name:        item.item_name,
    sku:              existingRow?.sku?.trim() ? existingRow.sku : (item.sku ?? ''),
    unit:             item.unit,
    unit_price:       item.cost_price,
    total_price:      item.cost_price,
    brand_variant_id: item.brand_variant_id,
    tool_asset_item_id: null,
  })
}
```

- [ ] **Step 2: Replace the read-only SKU span with an Input**

Find this block in the Row B grid (around line 290):

```tsx
<span className="h-7 px-2 flex items-center rounded-md bg-muted/40 border text-xs text-muted-foreground truncate">
  {row.sku || '—'}
</span>
```

Replace it with:

```tsx
<Input
  className="h-7 text-xs"
  placeholder="Vendor SKU"
  value={row.sku ?? ''}
  onChange={(e) => updateRow(row._key, { sku: e.target.value })}
  readOnly={readOnly}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/PoLineItemsEditor.tsx
git commit -m "feat(po-editor): make vendor SKU editable; guard against overwriting user-typed SKU on cascade select"
```

---

## Manual Verification Checklist

After all tasks complete, verify these flows in the browser at the Create PO page:

### Inline creation
- [ ] Category popover: search shows "Add new category" button at the bottom, not hidden by typing
- [ ] Clicking "Add new category" replaces the list with the category form; Escape returns to list
- [ ] Creating a new category selects it and automatically opens the Item popover
- [ ] Item popover shows the newly created category's items (empty list at first); "Add new item" works
- [ ] Creating a new item selects it and automatically opens the Brand/Variant popover
- [ ] Brand/Variant form shows brand autocomplete with existing brand names for the item
- [ ] Creating a new variant fires `handleVariantSelect`, closes the popover, shows the pill

### Stock indicator
- [ ] Selecting a variant with stock shows "N in stock" in green on the pill's second line
- [ ] Selecting a variant with no stock shows "Out of stock" in muted color
- [ ] Loading a saved PO from DB shows stock in the pill (ancestry path)
- [ ] Clearing the selection removes the stock indicator

### Editable SKU
- [ ] The SKU column in the line item row is now an editable input
- [ ] Typing a vendor SKU before completing the cascade selection is preserved after selecting a variant
- [ ] Selecting a variant with a code pre-fills SKU only when the field is empty
- [ ] In read-only mode the SKU input is not editable
