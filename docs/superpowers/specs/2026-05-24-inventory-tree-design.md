# Inventory Category Tree — Design

**Date:** 2026-05-24
**Status:** Approved (pending implementation plan)
**Owner:** Mohamed Ismail / Claude

## Problem

Inventory categories today are stored flat: rows like `"AC – Split – Rotary"` encode the hierarchy in the display name itself. There are 27 such categories spread across the `products`, `spare-parts`, and `consumables` types of `inventory_categories`. (The Inventory tab also has Tools and Service Links sub-tabs, but those are backed by different tables — `tool_asset_items` and `services` — and are *not* affected by this change.) The hierarchy works as a label but can't be navigated as a tree — you can't expand "AC" to see only its sub-types, and you can't filter or pick by intermediate level.

We want the inventory tab — and downstream pickers (orders, quotations, service catalog) — to render a real tree:

```
AC
├─ Split
│  ├─ Rotary       → 1.5 Ton → Midea (QAR 2100), GREE (QAR 2490), …
│  ├─ Inverter     → …
│  └─ Piston       → …
├─ Window
├─ Stand
└─ Floor Ceiling
Water Cooler
Water Heater
…
```

Existing rows (`inventory_items`, `inventory_brand_variants`) stay where they are — only the category layer becomes nested.

## Schema change

Add one nullable, self-referential column to `inventory_categories`:

```sql
ALTER TABLE inventory_categories
  ADD COLUMN parent_id UUID REFERENCES inventory_categories(id) ON DELETE RESTRICT;
CREATE INDEX idx_inventory_categories_parent
  ON inventory_categories(parent_id);
```

- `parent_id IS NULL` → top-level node.
- `ON DELETE RESTRICT` — deleting a parent that still has children is rejected. Archive instead (existing pattern).
- A category may have either sub-categories *or* direct items. The UI guides users to put items only on leaves, but the schema allows both so we don't have to enforce structure at the DB level.

`inventory_items` and `inventory_brand_variants` are unchanged.

## Data migration — auto-split

A single SQL migration walks every existing `inventory_categories` row and explodes its name into a chain:

1. Split `name_en` on the em-dash separator `" – "` (U+2013 surrounded by spaces — the only separator present in the existing data).
2. For each segment except the last: find-or-create a sibling row under the running ancestor with that segment as `name_en`, copying `type` from the original.
3. Re-point the original row: `name_en` becomes the last segment, `parent_id` becomes the immediate ancestor. SKU stays as-is on the leaf (e.g., `AC-SPL-ROT` remains on `Rotary`).
4. Ancestor SKUs are derived by prefix-stripping from the leaf SKU (`AC-SPL-ROT` → ancestors `AC-SPL`, `AC`). When two leaves disagree on a derived parent SKU, the longest common prefix wins.

### Arabic names

The Arabic side doesn't decompose as cleanly — `"مكيف سبلت"` is a single phrase for `"AC – Split"`. The migration uses a small lookup table for the common segments and leaves an empty `name_ar` on intermediate nodes the lookup doesn't cover:

| EN segment | AR |
|---|---|
| AC | مكيف |
| Split | سبلت |
| Window | شباك |
| Stand | ستاند |
| Floor Ceiling | أرضي سقفي |
| Rotary | روتاري |
| Piston | بيستون |
| Inverter | إنفرتر |
| Copeland | كوبلاند |
| Water Cooler | مبرد مياه |
| Water Heater | سخان مياه |
| Water Pump | مضخة |
| Electrical | كهرباء |
| Plumbing | سباكة |

Anything outside this dictionary keeps the original Arabic on the leaf row (it's still correct as a leaf label) and leaves ancestor rows' `name_ar` NULL. The admin fills the gaps from the UI.

### Idempotency

The migration is one-shot. It guards itself by checking `parent_id IS NULL AND name_en LIKE '% – %'` — once a row's been split into a chain, its name no longer contains the separator, so the migration is safe to re-run (no-op on subsequent passes).

## UI changes

### Inventory tab (`ItemsListView` + `CategoryRow`)

- `ItemsListView` queries top-level categories only (`parent_id IS NULL`).
- `CategoryRow` renders recursively. When expanded, it loads:
  1. Sub-categories (recursive `CategoryRow`)
  2. Then items (`ItemRow`)
  3. Then brand variants (existing nested render in `ItemRow`)
- Visual indent: `paddingLeft = depth * 20px` on the first cell.
- Add **"+ Add Subcategory"** action next to the existing "+ Add Item" on each category row.
- `CategoryEditDialog` gets a **Parent Category** picker (a recursive `<Select>` showing the same tree, excluding self and self's descendants to prevent cycles).
- `sort_order` is already scoped naturally — it'll be applied per-parent.

### Downstream pickers

Wherever the app uses `useInventoryCategoriesByType` to populate a flat list, we add a sibling hook `useInventoryTree(type)` returning the same data shaped as a tree:

```ts
type InventoryTreeNode = InventoryCategory & {
  children: InventoryTreeNode[]
  items?: InventoryItem[]   // only present on leaves
}
```

Known consumers to update (the implementation plan enumerates exact line ranges):
- `src/app/(dashboard)/master-data/inventory/page.tsx`
- `src/components/master-data/InventoryItemFormDialog.tsx` — category picker
- `src/components/purchase/CascadeInventorySelector.tsx`
- `src/components/purchase/PoReceiveTab.tsx`
- `src/components/purchase/wh/WhAdjustmentDialog.tsx`
- `src/components/services/inventory/CategoryRow.tsx` + `ItemsListView.tsx`

Each picker shows a breadcrumb path (`AC > Split > Rotary`) on selected rows so the user always sees the full lineage.

## Out of scope (deliberate)

- **Drag-and-drop reordering across parents.** Use the parent-picker in the edit dialog.
- **Materialized path / `ltree` column.** Recompute paths at query time. Add materialization only if a real query becomes slow.
- **Brand normalization.** `inventory_brand_variants.brand` stays free text. Separate concern.
- **Tree depth limit.** No hard cap. Existing data goes 3 deep; future categories can go further.

## Testing

- Migration applied on a copy of production data: assert all 27 leaves preserved, every `inventory_items.category_id` still resolves to one of those leaves, and `inventory_brand_variants` row counts are unchanged.
- Re-running the migration is a no-op (zero new rows, zero updates).
- Round-trip: creating a category with a parent, then loading via `useInventoryTree`, returns the category at the correct depth with the correct ancestor chain.
- Cycle prevention: edit dialog's parent picker excludes self and descendants.

## Rollout

1. Land schema migration + data migration in the same Supabase migration file. Apply via `npx supabase db push`.
2. Ship UI changes in one PR. The tree renderer is additive — no flag needed since the existing rows after migration *are* the tree.
3. Verify the picker round-trips selected items in orders/quotations before closing.
