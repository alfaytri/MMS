# Spec: Cascade Inventory Selector for PO Line Items

**Date:** 2026-04-26  
**Status:** Approved (v2 — post code review)  
**Scope:** Replace the free-text search in PO line item Row A with a cascading Category → Item → Brand Variant selector.

---

## Problem

The current `InventoryItemLookup` is a free-text search over `inventory_brand_variants`. Users who don't know the exact item name or code get no results and feel stuck. There is no way to browse by category or narrow down by item before picking a variant.

---

## Goal

Replace Row A of each PO line item (Products, Spare Parts, Consumables) with three chained comboboxes: Category → Item → Brand Variant. When a variant is selected, it pre-fills the line item's vendor name, SKU, unit, and unit price — and links `brand_variant_id` so that receival increments inventory stock.

---

## Out of Scope

- Tools & Assets rows — unaffected, `ToolAssetLookup` stays as-is.
- The existing `InventoryItemLookup` component — not deleted.
- Full UOM conversion (unit field is already editable per prior fix).
- No new database tables required.

---

## Architecture

### New Files
- `src/components/purchase/CascadeInventorySelector.tsx` — the three-step selector
- `src/hooks/useBrandVariantAncestry.ts` — reverse-lookup hook (see below)

### Modified Files
- `src/components/purchase/PoLineItemsEditor.tsx` — swap `InventoryItemLookup` → `CascadeInventorySelector` for `isInventory` rows
- `src/hooks/usePurchaseOrders.ts` — extend `InventoryLookupResult` type (see below)

---

## Type Extension: InventoryLookupResult

Add two new optional fields to carry ancestry data through the cascade:

```typescript
export type InventoryLookupResult = {
  brand_variant_id: string
  item_name:        string
  item_name_ar:     string | null
  sku:              string | null
  unit:             string
  cost_price:       number
  selling_price:    number
  // NEW — populated by cascade selector and backward lookup
  category_name:    string | null
  category_name_ar: string | null
  brand:            string | null   // inventory_brand_variants.brand (TEXT)
}
```

---

## Hook: useBrandVariantAncestry

**File:** `src/hooks/useBrandVariantAncestry.ts`

Fetches the full ancestry (category + item + variant) for a given `brand_variant_id`. Used when the component mounts with an existing value (i.e., loading a saved PO draft) but has no internal cascade state.

```typescript
export function useBrandVariantAncestry(variantId: string | null) {
  return useQuery({
    queryKey: ['brand-variant-ancestry', variantId],
    enabled: !!variantId,
    staleTime: 10 * 60 * 1000,  // ancestry rarely changes
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
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
      return data
    },
  })
}
```

Returns: variant with nested item and category — enough to render the pill and restore cascade state.

---

## Component: CascadeInventorySelector

### Props
```typescript
interface CascadeInventorySelectorProps {
  lineType: LineType                          // 'products' | 'spare-parts' | 'consumables'
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
}
```

### Data — TanStack Query hooks (no local createClient calls)

| Step | Hook | Key argument |
|------|------|--------------|
| Categories | `useInventoryCategoriesByType(lineType)` | `lineType` |
| Items | `useInventoryItemsByCategory(categoryId)` | `categoryId \| null` |
| Variants | `useInventoryBrandVariants(itemId)` | `itemId \| null` |

All three queries are globally cached. If 20 rows share the same `lineType`, categories are fetched once and served from cache for the other 19.

### Internal State
```typescript
const [categoryId, setCategoryId] = useState<string | null>(null)
const [itemId,     setItemId]     = useState<string | null>(null)
```

Only the two selected IDs live in local state. The data lists come from the hooks above.

---

## Visual States

### Unselected — 3 chained comboboxes (Command pattern)

```
[Category ▼]   [Item ▼ — disabled]   [Brand/Variant ▼ — disabled]
```

Layout: `grid grid-cols-3 gap-2` inside Row A. On `< sm:` screens: `grid-cols-1`.

- **Category**: uses shadcn `Command` + `Popover` — filterable by typing.
- **Item**: same pattern, enabled after category is chosen.
- **Brand/Variant**: same pattern, enabled after item is chosen.
- Disabled steps render `opacity-50 pointer-events-none`.
- Each step shows `"Loading…"` while its hook is fetching (`isLoading`).
- Zero results shows `"No items found"` and leaves the next step disabled.

Each combobox list item renders:
```
Item name EN                   (font-medium)
اسم العنصر بالعربي             (text-xs text-muted-foreground, only if name_ar exists)
```

### Selected — collapsed pill

```
[ Category EN  ›  Item EN  ·  Brand  Code  ×  ]
```

Arabic subtitles appear below the pill on a second line if present:
```
[ فئة  ›  عنصر  ·  علامة  كود  ×  ]  (text-xs text-muted-foreground)
```

Clicking × calls `onChange(null)` and resets `categoryId` and `itemId`.

---

## Backward Lookup (Loading Existing PO)

When the component receives `value !== null` but `categoryId` is still `null` (page reload with a saved PO), it calls `useBrandVariantAncestry(value.brand_variant_id)`.

On success, it renders the pill using the fetched ancestry data — no cascade interaction needed. If the lookup is loading, the pill shows a skeleton. If it errors, the pill shows `item_name · sku` from the stored value as fallback.

This ensures a single shared query per unique `brand_variant_id`, not one per row.

---

## Cascade Reset Rules

| Action | Resets |
|--------|--------|
| Category changed | `itemId → null`, `onChange(null)` |
| Item changed | `onChange(null)` |
| × clicked | `categoryId → null`, `itemId → null`, `onChange(null)` |

---

## On Variant Selected — Building InventoryLookupResult

```typescript
// item comes from useInventoryItemsByCategory data
// variant comes from useInventoryBrandVariants data
// category comes from useInventoryCategoriesByType data (find by categoryId)

const effectiveCost = variant.cost_price > 0
  ? variant.cost_price
  : await fetchLastFifoCost(variant.id)   // see below

onChange({
  brand_variant_id: variant.id,
  item_name:        item.name_en,
  item_name_ar:     item.name_ar ?? null,
  sku:              variant.code ?? '',
  unit:             item.unit,
  cost_price:       effectiveCost,
  selling_price:    variant.selling_price ?? 0,
  category_name:    category.name_en,
  category_name_ar: category.name_ar ?? null,
  brand:            variant.brand,
})
```

### Fallback Cost (variant.cost_price === 0)

A one-time query fires if the variant has no cost price:

```typescript
async function fetchLastFifoCost(variantId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('fifo_cost_layers')
    .select('total_unit_cost')
    .eq('brand_variant_id', variantId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.total_unit_cost ?? 0
}
```

This gives users a meaningful starting price from the last purchase rather than 0.

---

## Unchanged Behaviour

- `ToolAssetLookup` for Tools rows — untouched.
- `handleInventorySelect` callback in `PoLineItemsEditor` — untouched.
- Row B (vendor name, SKU, unit, qty, price) — untouched.
- Read-only mode — shows `item_name` as plain text, same as before.

---

## Related Fix (separate migration)

`apply_receival_edit` RPC must be updated to apply a delta to `po_line_items.received_qty` when quantities are edited. This is a separate migration delivered alongside this feature.
