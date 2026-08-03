# Category Attributes — Design Spec

**Date:** 2026-08-04
**Branch:** `feature/category-attributes`
**Author:** Mohamed Ismail (product), Claude (design partner)

---

## Purpose

Add a **category-level attribute schema** to inventory so items are described by structured specs (e.g. Capacity, Legs, Wheels) instead of baking specs into item names. The payoff is a **cascading guided picker** in Sales / Quotations / Service Links / Consumption that turns "customer wants an 80-gallon horizontal heater" into one exact `inventory_items` row without the agent hunting the catalog tree.

Attributes cascade down the category tree: define once at a parent, every descendant inherits.

---

## Locked-in decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Category is a schema. Items pick the value.** | Attributes are for filtering across many items in a category — items differ within a category, catalog stays flat. |
| 2 | **Additive-only inheritance down the tree.** Items may leave inherited attrs empty. | Simplest data model — effective schema = union of self + ancestors. Overrides can be added later without breaking data. |
| 3 | **Single value per (item, attribute).** | Every practical filter is single-valued; multi-select complicates the cascade with ANY-vs-ALL semantics. |
| 4 | **Soft-hide archived options** via `is_archived` flag; keep historical item values. | Preserves the reporting audit trail ("we sold 200 8-leg coolers in 2024") even after discontinuation. |
| 5 | **Pure-cascade picker** — one attribute at a time by `sort_order`, changing an upper pick clears lower picks. | Guides the agent through a decision tree; prevents the "20 filters at once" overwhelm of faceted search. |
| 6 | **Picker surfaces v1:** Create SO / Edit SO / Quotations / Service Links / Consumption. **NOT** PO / Receival / Transfer / Custody. | These four are guided flows where operator translates a customer/job request into a specific item. Warehouse-internal flows have operators who already know the SKU. |
| 7 | **Bilingual options** — each option has `value_en` + `value_ar`. | Arabic UI is a first-class surface (quotations, invoices); monolingual options would be jarring. |
| 8 | **Attribute-key uniqueness per top-level branch.** Reuse across independent trees OK; no re-definition within one tree. | Matches Option A of Q2 (can't override parent's key). Independent product trees own their own vocab. |

---

## Data model

Three new tables. Reuse existing `authenticated` RLS posture from `inventory_categories`.

### `inventory_attribute_definitions` — the schema

```
id              uuid PK
category_id     uuid FK inventory_categories(id) ON DELETE CASCADE
attribute_key   text                 -- snake_case, e.g. 'water_capacity'
label_en        text
label_ar        text
sort_order      int                  -- cascade order in the picker
created_at      timestamptz
updated_at      timestamptz
created_by      uuid FK user_data(id)

UNIQUE (category_id, attribute_key)
```

Plus a **BEFORE INSERT/UPDATE trigger** enforcing "attribute_key can appear at most once per top-level tree" (walks up to root + down to descendants, blocks duplicate). Depth cap: 10.

### `inventory_attribute_options` — allowed values per definition

```
id              uuid PK
definition_id   uuid FK inventory_attribute_definitions(id) ON DELETE CASCADE
value_en        text
value_ar        text
sort_order      int                  -- display order in the option dropdown
is_archived     boolean default false
created_at      timestamptz

UNIQUE (definition_id, lower(value_en))
```

Archived options don't appear in new-item pickers or in `ProductAttributePicker`, but existing item values referencing them remain queryable.

### `inventory_item_attributes` — per-item picked value

```
id              uuid PK
item_id         uuid FK inventory_items(id) ON DELETE CASCADE
definition_id   uuid FK inventory_attribute_definitions(id) ON DELETE CASCADE
option_id       uuid FK inventory_attribute_options(id) ON DELETE RESTRICT  -- NULL = empty value
updated_at      timestamptz
updated_by      uuid FK user_data(id)

UNIQUE (item_id, definition_id)
```

Design choice: **when an operator clears a value, delete the row** (rather than storing `option_id = NULL`). Simpler queries, no distinction between "never set" and "explicitly cleared".

### Support functions

- **`get_effective_attributes(category_id)`** — returns the union of definitions on `(category_id + ancestors)` sorted by `sort_order`, tie-broken by depth (ancestors before descendants). Used by editor + item-edit dialog + picker.
- **`rpc_attribute_picker_step(p_category_id, p_picks jsonb)`** — takes the current set of picks, returns `{ items[], next_attribute, next_options }` in one round-trip. Powers the cascading picker.

### RLS

All three tables: `authenticated` read/write. No division scoping — attribute schemas are global metadata.

---

## Inheritance walkthrough

### Category tree

```
Water Cooler                        (top-level)
  └─ Portable Water Cooler          (child)
       └─ Portable — 4-Leg          (grandchild)
```

### Definitions declared

| Defined at | attribute_key | label_en | options |
|---|---|---|---|
| Water Cooler | `capacity` | Capacity | 10L, 20L, 30L |
| Water Cooler | `legs` | Legs | 4, 6, 8 |
| Portable Water Cooler | `wheels` | Wheels | Yes, No |
| Portable — 4-Leg | *(nothing new)* | | |

### Effective schema per category

| Category | Effective schema |
|---|---|
| Water Cooler | `capacity`, `legs` |
| Portable Water Cooler | `capacity`, `legs`, `wheels` |
| Portable — 4-Leg | `capacity`, `legs`, `wheels` |

### Duplicate-key trigger behavior

- Adding `capacity` at "Portable Water Cooler" → **blocked** (parent already declared it)
- Adding `capacity` under a separate top-level tree ("Water Heater") → **allowed** (Option C of Q8)
- Adding `legs` at a sibling category with no shared ancestor holding the key → **allowed**

---

## UX

### Definition editor — Master Data → Inventory

New "Attributes" tab on the category detail pane, alongside the existing Items tab.

**Layout:**

- **Inherited attributes** — read-only, dimmed, one row per attribute with the parent name labeled ("↑ from Water Cooler")
- **Local attributes** — editable, drag-to-reorder
- **[+ Add attribute]** button opens the add/edit dialog

**Add/Edit attribute dialog fields:**

- `attribute_key` (snake_case, auto-slug from label, validated inline against the branch-uniqueness trigger — red inline error on conflict)
- `label_en`, `label_ar`
- `sort_order` (integer)
- **Options mini-editor** — add rows with `value_en` + `value_ar`, drag-to-reorder, archive toggle
- **Save / Cancel / Delete attribute** (delete confirmed; blocked if any item still holds a value for it)

**Archived options** render greyed at the bottom of the option list with a Restore button.

**Permissions:**
- `master_data.inventory.attributes.view` — see the tab
- `master_data.inventory.attributes.manage` — add/edit/archive/delete

### Item-level value entry

Two existing dialogs grow one new section:

- `InventoryItemFormDialog` (add/edit item on Master Data → Inventory)
- `ItemEditDialog` (row-level popover editor on the same page)

**Section shape** — dynamic form driven by `get_effective_attributes(category_id)`:

```
Attributes
──────────────────────────────────────────
Capacity                    [ 20L ▾ ]  ✕
Legs                        [ 4 ▾  ]  ✕
Wheels                      [ ─── ▾]  ✕     ← left empty (allowed)
```

- Label + option value use the current locale (`label_en` or `label_ar`, `value_en` or `value_ar`)
- Dropdown lists non-archived options in `sort_order`
- If an item still holds an archived option, it stays selected with a small archive indicator
- `✕` clears the value (deletes the row on save)
- On category change mid-edit, the schema refetches; a confirm warns if existing values would be dropped

**Item-list display** — `ItemsListView` gains a compact chip strip under each item name showing the first 3-4 attribute values as `Label: Value` chips, `···` if more.

### `ProductAttributePicker` — the guided picker

Same component reused across four surfaces (SO / Quotations / Service Links / Consumption). Each surface gets a `[Browse tree]  [Guided pick]` toggle so operators keep their existing fast-path.

**Component contract:**

```tsx
<ProductAttributePicker
  onPick={(itemId, brandVariantId) => addLine(itemId, brandVariantId)}
  categoryFilter?: string       // pre-scope to a category subtree
  contextHint?: string          // helper text
  warehouseScope?: string       // for Consumption — filter to items in stock at this WH
/>
```

Output contract matches the existing `CascadeInventorySelector` so callers don't care which picker was used.

**Flow per step:**

Client calls `rpc_attribute_picker_step(category_id, current_picks)` on every user action. Server returns:

```json
{
  "items":         [ { id, name, sku, image_url, brand_variants: [...] } ],
  "next_attribute": { id, key, label_en, label_ar, sort_order } | null,
  "next_options":   [ { id, value_en, value_ar, item_count } ]
}
```

- `next_attribute` = first attribute in `sort_order` not yet picked, IF `items.length > 1`; else null (final step, show items directly)
- `next_options` = options that at least one remaining item holds (dead options never shown)
- Each option shows an inline count of items it would leave

**Behaviors:**

- Changing an upper pick immediately clears every lower pick and re-runs the RPC (pure cascade — Q5)
- Operator can stop picking early; the "matching items" panel always shows the current candidate list. If they see the item they want, they can pick it directly
- Items with `NULL` for an attribute match ANY value for that attribute (they're "unknown / either" per Q2 semantics)
- Zero matches → amber banner "No items match — clear a pick above"; lower options disabled
- Final step exposes brand variants + stock qty (reuses existing `BrandVariantChip`)

### Integration wire-up

Five surface wire-ups spanning the four flow-groups from Q6 Option D (Sales, Quotations, Service Links, Consumption):

1. **Create SO** (`src/app/(dashboard)/sales/create-so/page.tsx`) — over `CascadeInventorySelector`
2. **Edit SO** (`src/app/(dashboard)/sales/edit-so/[id]/page.tsx`) — same
3. **Quotations** (SO quotations + contract quotations — one shared line-picker component, one wire-up) — same
4. **Service Links** admin (`InventoryTableView`) — same
5. **Consumption** (`NewConsumptionDialog`) — over `WhItemPicker` with `warehouseScope` set to the picked source WH; `warehouseScope` filters the RPC's candidate item set to items with stock at that WH (matches current `WhItemPicker` behavior)

Default toggle state remembered per session per surface, stored client-side.

---

## Migrations

Timestamp prefix picked at implementation time — file names below use `_XXXX##_` as a placeholder for the real `YYYYMMDDHHMMSS_` prefix.

| # | File | Purpose |
|---|---|---|
| 1 | `_XXXX01_attribute_definitions_table.sql` | Table + branch-uniqueness trigger + RLS |
| 2 | `_XXXX02_attribute_options_table.sql` | Table + FK cascade + `is_archived` + RLS |
| 3 | `_XXXX03_item_attributes_table.sql` | Table + unique `(item_id, definition_id)` + RLS |
| 4 | `_XXXX04_effective_attributes_function.sql` | `get_effective_attributes(category_id)` |
| 5 | `_XXXX05_picker_step_rpc.sql` | `rpc_attribute_picker_step(category_id, picks)` |

---

## Hooks (new)

- `useAttributeDefinitions(categoryId)` — returns `{ inherited, local }` split
- `useAttributeOptions(definitionId)` — for the option mini-editor
- `useEffectiveAttributes(categoryId)` — flat effective schema for item-edit + picker
- `useUpsertAttributeDefinition` — create/update definition
- `useArchiveAttributeOption` / `useRestoreAttributeOption`
- `useItemAttributes(itemId)` — reads current per-item values
- `useUpsertItemAttributes` — write per-item values (batch upsert + delete-on-clear)
- `useAttributePickerStep(categoryId, picks)` — wraps `rpc_attribute_picker_step` with sensible caching

### Hook deletion

The existing `useUpsertInventoryItemAttributes` in `src/hooks/useInventory.ts:906` writes plain string attributes to a non-existent table via a type-bypass cast. No callers today. This branch deletes it, and its `queryKeys.inventory.itemAttributes` key is replaced by the new hook's key.

---

## Permissions

Two new keys added to `src/lib/permissions.ts` (under Master Data → Inventory) and `src/components/master-data/PermissionTree.tsx`:

```
master_data.inventory.attributes.view     — see the Attributes tab
master_data.inventory.attributes.manage   — add/edit/archive/delete
```

No route-level changes — attributes lives inside the existing `/master-data/inventory` page.

---

## Out of scope for v1

- **Filter master-list by attribute value** — data supports it, UI doesn't ship v1
- **Attribute-based reports** — deferred
- **Bulk-edit attributes across items** — v1 is one-item-at-a-time
- **Category overrides / removal of inherited attrs** — locked out by Q2 Option A; clean upgrade path
- **Multi-select attributes** — locked out by Q3 Option A; clean upgrade path
- **Range / free-text attribute values** — v1 is enum-from-options only
- **Attribute-driven photo variation** — one photo per item, unchanged
- **PO / Receival / Transfer / Custody pickers** — kept browse-tree only per Q6 Option D
- **Approval workflow for attribute changes** — v1 is trust-based; revisit if governance becomes an issue

---

## Risks

- **Trigger complexity for branch uniqueness** — walks up + down at insert/update time. Mitigation: index `(category_id, attribute_key)`, cap depth at 10. Realistic depths are 3–4.
- **Picker RPC latency** — runs on every option click. At 10K items per top category could be sluggish. Mitigation: measure first with unoptimized version, add a materialized item→category path map if slow.
- **Empty Arabic labels** — silent fallback to English. Consider an editor warning banner if a definition has no Arabic label. Data-quality issue, not a bug.

---

## Effort estimate

Aggregate size: 5 migrations + 8 new hooks + 1 new tab + 1 shared picker + 5 integration wire-ups + permission plumbing + PROGRESS.md updates. Comparable in scope to the Teams+Places+Consumption module — **10–14 tasks across 6 phases**.

Phases will be defined in the follow-up implementation plan (`superpowers:writing-plans`):

- **Phase 1: DB** — 5 migrations + type regen
- **Phase 2: Definition editor** — Attributes tab + add/edit dialog + option mini-editor + permissions
- **Phase 3: Item-level values** — dialog sections + item-list chip strip
- **Phase 4: Picker** — `ProductAttributePicker` shared component + `rpc_attribute_picker_step` wire-up
- **Phase 5: Integration** — 5 surface wire-ups (SO create/edit, quotations, service links, consumption)
- **Phase 6: Cleanup + smoke + audit** — delete dead hook, PROGRESS.md, 4-point security audit

---

## Related plans

- [docs/plans/2026-08-03-teams-places-consumption.md](docs/plans/2026-08-03-teams-places-consumption.md) — the module last merged; comparable scope
- [docs/plans/2026-08-03-inventory-item-photos.md](docs/plans/2026-08-03-inventory-item-photos.md) — recent inventory extension
- [docs/flows-registry.md](docs/flows-registry.md) — attribute-driven line-add flows will be registered here as they land
