# Spec: Cascade Inventory Selector for PO Line Items

**Date:** 2026-04-26  
**Status:** Approved  
**Scope:** Replace the free-text search in PO line item Row A with a cascading Category → Item → Brand Variant selector.

---

## Problem

The current `InventoryItemLookup` is a free-text search over `inventory_brand_variants`. Users who don't know the exact item name or code get no results and feel stuck. There is no way to browse by category or narrow down by item before picking a variant.

---

## Goal

Replace Row A of each PO line item (for Products, Spare Parts, Consumables) with three chained dropdowns: Category → Item → Brand Variant. When a variant is selected, it pre-fills the line item's vendor name, SKU, unit, and unit price — and links `brand_variant_id` so that receival updates inventory stock.

---

## Out of Scope

- Tools & Assets rows are unaffected — they use `ToolAssetLookup` which stays as-is.
- The existing `InventoryItemLookup` component is not deleted (may be used elsewhere).
- No new database tables or migrations required.

---

## Architecture

### New File
`src/components/purchase/CascadeInventorySelector.tsx`

### Modified File
`src/components/purchase/PoLineItemsEditor.tsx`
- Import `CascadeInventorySelector` instead of `InventoryItemLookup` for `isInventory` rows.
- Props interface and `handleInventorySelect` callback are unchanged.

---

## Component: CascadeInventorySelector

### Props
```typescript
interface CascadeInventorySelectorProps {
  lineType: LineType                          // 'products' | 'spare-parts' | 'consumables'
  value: InventoryLookupResult | null        // existing type, unchanged
  onChange: (item: InventoryLookupResult | null) => void
}
```

### Internal State
```typescript
const [categoryId,  setCategoryId]  = useState<string | null>(null)
const [itemId,      setItemId]      = useState<string | null>(null)

const [categories,  setCategories]  = useState<{ id: string; name_en: string }[]>([])
const [items,       setItems]       = useState<{ id: string; name_en: string; unit: string }[]>([])
const [variants,    setVariants]    = useState<{ id: string; brand: string; code: string; cost_price: number }[]>([])

const [loadingCats,  setLoadingCats]  = useState(false)
const [loadingItems, setLoadingItems] = useState(false)
const [loadingVars,  setLoadingVars]  = useState(false)
```

---

## Visual States

### Unselected (no value)
Three dropdowns in a row with widths `[1fr] [1.5fr] [1fr]`:

```
[Category ▼]   [Item ▼ — disabled]   [Brand/Variant ▼ — disabled]
```

- Category populates on mount.
- Item enables and loads when category is chosen.
- Brand/Variant enables and loads when item is chosen.
- Disabled dropdowns render grayed (`opacity-50 pointer-events-none`).
- Each dropdown shows "Loading…" while its query is in flight.
- If a step returns zero rows: show "No items found" and leave next step disabled.

### Selected (value set)
Collapsed single-line pill replacing all three dropdowns:

```
[ Category name  ›  Item name  ·  Brand  Code  ×  ]
```

Clicking × calls `onChange(null)`, resets internal state, returns to dropdowns.

---

## Data Queries (client-side, `createClient()`)

### Step 1 — Categories (on mount)
```sql
SELECT id, name_en
FROM inventory_categories
WHERE type = :lineType AND status != 'archived'
ORDER BY sort_order, name_en
```

### Step 2 — Items (when categoryId changes)
```sql
SELECT id, name_en, unit
FROM inventory_items
WHERE category_id = :categoryId AND status != 'archived'
ORDER BY sort_order, name_en
```

### Step 3 — Variants (when itemId changes)
```sql
SELECT id, brand, code, cost_price
FROM inventory_brand_variants
WHERE item_id = :itemId AND status != 'archived'
ORDER BY sort_order, brand
```

---

## On Variant Selected

Builds and calls `onChange` with:

```typescript
onChange({
  brand_variant_id: variant.id,
  item_name:        item.name_en,      // pre-fills Row B vendor name input
  item_name_ar:     null,
  sku:              variant.code,      // pre-fills SKU input
  unit:             item.unit,         // pre-fills unit input
  cost_price:       variant.cost_price, // pre-fills unit price input
  selling_price:    0,
})
```

The existing `handleInventorySelect` in `PoLineItemsEditor` handles the rest (sets `brand_variant_id` on the line item, which ensures receival increments inventory stock).

---

## Cascade Reset Rules

| Action | Resets |
|--------|--------|
| Category changed | itemId, variants, value |
| Item changed | variants, value |
| × clicked | categoryId, itemId, all lists, value |

---

## Responsive Layout

The three-dropdown row uses CSS grid `grid-cols-3 gap-2` inside the existing Row A flex container. On narrow screens (< `sm:`), the dropdowns stack vertically `grid-cols-1`.

---

## Unchanged Behaviour

- `ToolAssetLookup` for Tools rows — untouched.
- `handleInventorySelect` callback in `PoLineItemsEditor` — untouched.
- `InventoryLookupResult` type — untouched.
- `InventoryItemLookup` component file — untouched.
- Row B (vendor name, SKU, unit, qty, price) — untouched.
- Read-only mode — shows item name as plain text, same as before.
