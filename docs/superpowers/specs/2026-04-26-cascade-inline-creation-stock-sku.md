# Cascade Selector Enhancements — Inline Inventory Creation, Stock Display, Editable SKU

**Date:** 2026-04-26
**Status:** Approved (v2 — post-review fixes)

---

## Overview

Three enhancements to `CascadeInventorySelector` and `PoLineItemsEditor` that allow purchase order creators to add new inventory items on-the-fly, see available stock in the selection pill, and enter a vendor-specific SKU independently of the inventory SKU.

---

## Feature 1: Inline Inventory Creation

### Goal

When an inventory category, item, or brand/variant does not exist yet, the user can create it directly from the cascade dropdown without leaving the PO creation page.

### UX Flow

Each of the three cascade popovers (Category, Item, Brand/Variant) gains a **"+ Add new…"** entry at the bottom of the `CommandGroup`. Clicking it replaces the `Command` search list with a compact inline form inside the same `PopoverContent`. A "Cancel" link returns to the search list.

After a successful save:
- The newly created entity is automatically selected in the cascade.
- The popover closes and the next cascade step opens automatically (Category → Item popover opens; Item → Brand/Variant popover opens; Brand/Variant → `handleVariantSelect` fires as if the user picked it from the list).
- A success toast is shown.
- On error, the toast shows the error message and the form stays open.

### Fields

**New Category form** (inside Category popover):

| Field | Type | Required | Notes |
|---|---|---|---|
| English name | text | ✅ | min 1 char |
| Arabic name | text | ❌ | optional |
| type | hidden | — | pre-filled from `lineType` prop |

**New Item form** (inside Item popover):

| Field | Type | Required | Notes |
|---|---|---|---|
| English name | text | ✅ | min 1 char |
| Arabic name | text | ❌ | optional |
| Unit | text | ✅ | default `pcs` |
| SKU | text | ❌ | optional; can be filled in master data later |
| Cost price | number | ❌ | default `0` |
| category_id | hidden | — | pre-filled from selected category |

**New Brand/Variant form** (inside Brand/Variant popover):

| Field | Type | Required | Notes |
|---|---|---|---|
| Brand name | text | ✅ | min 1 char; see Brand Note below |
| Variant code / SKU | text | ❌ | optional |
| Cost price | number | ❌ | default `0` |
| Selling price | number | ❌ | default `0` |
| item_id | hidden | — | pre-filled from selected item |

> **Brand Note:** `brand` on `inventory_brand_variants` is a plain `TEXT` column, not a FK — confirmed by the existing `BrandVariantFormDialog` which also uses a free-text `<Input>`. Free text is correct. To reduce duplicate spellings, render a `<datalist>` populated with distinct brand names already on the selected item's variants (from the already-loaded `variants` list in the cascade's Step 3). This gives autocomplete suggestions without forcing a FK constraint.

### Implementation

#### State change in `CascadeInventorySelector` — store full objects, not IDs

Replace the current `categoryId`/`itemId` state with full-object state. This eliminates the race condition where `handleVariantSelect` calls `.find()` on an array that hasn't yet refetched after an inline creation.

**Before (race-prone):**
```typescript
const [categoryId, setCategoryId] = useState<string | null>(null)
const [itemId,     setItemId]     = useState<string | null>(null)
// derived — breaks if list hasn't refetched yet:
const selectedCategory = categories.find((c) => c.id === categoryId) ?? null
const selectedItem     = items.find((i) => i.id === itemId)     ?? null
```

**After (race-safe):**
```typescript
const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | null>(null)
const [selectedItem,     setSelectedItem]     = useState<InventoryItem | null>(null)
// query hooks use the ID extracted from the stored object:
const { data: items    = [] } = useInventoryItemsByCategory(selectedCategory?.id ?? null)
const { data: variants = [] } = useInventoryBrandVariants(selectedItem?.id ?? null)
```

All places that previously read `categoryId` or `itemId` switch to `selectedCategory?.id` or `selectedItem?.id`. The pill display reads `selectedCategory?.name_en`, `selectedCategory?.name_ar`, `selectedItem?.name_en`, `selectedItem?.name_ar` directly from state instead of via ancestry priority.

#### New file: `src/components/purchase/CascadeInlineForms.tsx`

Exports three components:

```
CascadeNewCategoryForm
  props: { lineType: LineType; onCreated: (category: InventoryCategory) => void; onCancel: () => void }

CascadeNewItemForm
  props: { categoryId: string; onCreated: (item: InventoryItem) => void; onCancel: () => void }

CascadeNewVariantForm
  props: { itemId: string; existingBrands: string[]; onCreated: (variant: BrandVariant) => void; onCancel: () => void }
```

`existingBrands` is passed from the cascade's already-loaded `variants` list: `variants.map(v => v.brand)` (deduplicated). Used to populate the `<datalist>` on the brand text input.

Each component:
- Uses simple `useState` for field values (not react-hook-form — too heavy for an inline popover)
- Validates synchronously before calling the mutation
- Calls the existing hooks: `useCreateInventoryCategory`, `useCreateInventoryItem`, `useCreateBrandVariant`
- On success: calls `onCreated(result)` — the parent `CascadeInventorySelector` handles auto-selection and popover transitions
- On error: calls `toast.error(err.message)` and keeps the form open

#### Modified file: `src/components/purchase/CascadeInventorySelector.tsx`

Three new boolean states: `isCatCreating`, `isItemCreating`, `isVarCreating`.

In each popover's `PopoverContent`:
- When `isCreating` is false: render `<Command>` with search list + "Add new…" item at the bottom
- When `isCreating` is true: render the corresponding `Cascade*Form` component

`onCreated` callbacks — store full objects, not IDs:
- `handleCategoryCreated(cat)`: calls `setSelectedCategory(cat)`, resets `isCatCreating`, opens Item popover
- `handleItemCreated(item)`: calls `setSelectedItem(item)`, resets `isItemCreating`, opens Brand/Variant popover
- `handleVariantCreated(variant)`: calls `handleVariantSelect(variant)`, resets `isVarCreating`

The "Add new…" `CommandItem` uses `onSelect={() => setIsCatCreating(true)}` (no `value` prop so it never filters out on search).

### Query Invalidation

Three hooks need `onSuccess` updates in `useInventory.ts`:

| Hook | Current invalidation | Missing invalidation | Why |
|---|---|---|---|
| `useCreateInventoryCategory` | `['inventory-categories', v.type]` | none — prefix match covers `useInventoryCategoriesByType` key | ✅ already correct |
| `useCreateInventoryItem` | `['inventory-items']` | `['inventory-items-by-category']` | cascade uses `useInventoryItemsByCategory` whose key is `['inventory-items-by-category', categoryId, showArchived]` — different root |
| `useCreateBrandVariant` | `['brand-variants', item_id]` | `['brand-variants-v2', variables.item_id]` | cascade uses `useInventoryBrandVariants` whose key is `['brand-variants-v2', itemId, showArchived]` |

**Actions:**
1. `useCreateInventoryItem.onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['inventory-items-by-category'] })`
2. `useCreateBrandVariant.onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['brand-variants-v2', variables.item_id] })`

---

## Feature 2: Stock Display in Pill

### Goal

After selecting a brand/variant, the pill shows available stock so the buyer knows how much is on hand before entering a quantity.

### Display

In the pill's secondary line (below the item name row), show:

```
Water Heater ›  Alfha heat
[category_ar ›] [item_name_ar]               [stock indicator]
```

The stock indicator appears at the end of the pill, right-aligned:
- `8 in stock` — green text (`text-green-600`) when available > 0
- `Out of stock` — muted-foreground when available = 0
- Omitted while loading and no data is available yet

Available = `Math.max(0, (stock_level ?? 0) - (reserved_qty ?? 0))`

The null-safe formula must be used at every point where stock is computed — both the fresh-selection path and the ancestry path — so that new variants with `null` fields never render `NaN in stock`.

### Data Sources

**Fresh cascade selection path:**
- `variant` passed to `handleVariantSelect` already comes from `useInventoryBrandVariants select('*')`, which includes `stock_level` and `reserved_qty`
- Add `stock_level: number | null` and `reserved_qty: number | null` to the `handleVariantSelect` parameter type
- Store the result in new state: `selectedVariantStock: number | null`
  ```typescript
  setSelectedVariantStock(Math.max(0, (variant.stock_level ?? 0) - (variant.reserved_qty ?? 0)))
  ```

**DB reload path (ancestry lookup):**
- Extend `useBrandVariantAncestry` query to also select `stock_level, reserved_qty` from `inventory_brand_variants`
- Extend `BrandVariantAncestry` type to include `stock_level: number | null` and `reserved_qty: number | null`
- Pill computes stock from ancestry using the same null-safe formula:
  ```typescript
  const ancestryStock =
    ancestry != null
      ? Math.max(0, (ancestry.stock_level ?? 0) - (ancestry.reserved_qty ?? 0))
      : null
  const stockToShow = selectedVariantStock ?? ancestryStock
  ```

**Clear path:**
- `handleClear` resets `selectedVariantStock` to `null`

---

## Feature 3: Editable Vendor SKU

### Goal

The SKU column in the PO line item is the vendor's SKU — independent of the inventory variant code. Users must be able to type a different value (or clear it).

### Change — `PoLineItemsEditor.tsx` SKU input

Replace the read-only `<span>` at the SKU position with a writable `<Input>`:

```tsx
// Before (read-only):
<span className="h-7 px-2 flex items-center rounded-md bg-muted/40 border text-xs text-muted-foreground truncate">
  {row.sku || '—'}
</span>

// After (editable):
<Input
  className="h-7 text-xs"
  placeholder="Vendor SKU"
  value={row.sku ?? ''}
  onChange={(e) => updateRow(row._key, { sku: e.target.value })}
/>
```

### Change — `PoLineItemsEditor.tsx` SKU pre-fill guard

In `handleInventorySelect`, pre-filling `sku` from the inventory variant must not overwrite a SKU the user already typed. Change the pre-fill to be conditional:

```typescript
function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
  if (!item) {
    updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, brand_variant_id: null })
    return
  }
  const existingRow = value.find((r) => r._key === key)
  updateRow(key, {
    item_name: item.item_name,
    // Only use the inventory SKU if the user hasn't typed a vendor SKU yet.
    sku: existingRow?.sku?.trim() ? existingRow.sku : (item.sku ?? ''),
    unit: item.unit,
    unit_price: item.cost_price,
    total_price: item.cost_price,
    brand_variant_id: item.brand_variant_id,
    tool_asset_item_id: null,
  })
}
```

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/components/purchase/CascadeInlineForms.tsx` | Three inline creation form components |
| Modify | `src/components/purchase/CascadeInventorySelector.tsx` | Full-object state, inline form states, stock state |
| Modify | `src/hooks/useBrandVariantAncestry.ts` | Add stock_level + reserved_qty to query and type |
| Modify | `src/hooks/useInventory.ts` | Fix query invalidation for all three creation hooks |
| Modify | `src/components/purchase/PoLineItemsEditor.tsx` | Editable SKU input + pre-fill guard |

---

## Constraints

- No new DB migrations required — all data already exists in the schema
- No new hooks required — all three creation mutations already exist
- `CascadeInlineForms.tsx` must not import from `PoLineItemsEditor.tsx` (would create a circular dep); it imports directly from `@/hooks/useInventory`
- Inline forms must be keyboard-accessible: Enter submits, Escape cancels
- All three features are independent and can be implemented in separate tasks
- Responsive: inline forms must be usable on tablet (`sm:` breakpoint) — the popover widths (56/64 chars) are already set; form inputs must use `w-full`
- The null-safe stock formula `Math.max(0, (x ?? 0) - (y ?? 0))` must be used everywhere stock is computed — no raw subtraction
