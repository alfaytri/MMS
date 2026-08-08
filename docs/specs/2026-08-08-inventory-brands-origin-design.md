# Design: Inventory Brands & Origin (catalog + receivals slice)

**Date:** 2026-08-08
**Branch:** `feature/inventory-brands-and-origin`
**Status:** Approved design — ready for implementation plan
**Scope decision:** Option A — catalog + receivals only. PO/SO pickers deferred to
[docs/inventory-brands-origin-po-so-followup.md](../../inventory-brands-origin-po-so-followup.md).

---

## 1. Goal

Make **origin** a first-class, priced/stocked dimension of the inventory catalog so
the operator sees and manages:

```
category (tree) → item → brand → origin → receivals
```

where **price and stock vary by origin**. Brand and origin are each **optional**, so
the system must handle branded-only, origin-only, both, and generic (neither) items.

While in these tables, close the pre-existing security hole (inventory RLS is
`USING(true)`) with real permission gates, and adopt the half-built `brands` master
table that currently sits unused behind free-text brand strings.

## 2. Scope

**In scope**
- Origin as a nullable dimension on the priced/stocked leaf (`inventory_item_brand_variants`).
- Adopt the `brands` master table: live picker, backfill, uniqueness, sync fix.
- RLS lockdown + two new permissions on the inventory catalog + pricing.
- Catalog tree UI: item → brand group → origin row → receivals/FIFO.
- Manual inventory-receival flow targets the (item, brand, origin) leaf.
- Folded-in fixes: FIFO FK `CASCADE`→`RESTRICT`, `updated_at` triggers on the three
  tables, `ItemEditDialog` warranty dirty-check, mobile price visibility, photos
  storage-bucket lockdown, transactional archive/sort-order RPCs.

**Out of scope (tracked separately)**
- PO/SO line-editor origin awareness → `docs/inventory-brands-origin-po-so-followup.md`.
- PO-driven receivals targeting a specific origin (depends on PO picker).
- Category parent-picker 3-level depth cap.
- N+1 attribute-chip fetches, `.limit()` gaps on untouched hooks, `markup_percent`
  dead column, `fifo_cost_layers.receival_id` text→uuid, dead-component deletion, nits.
  These are spawned as tracked task chips, not built here.

## 3. Data model

### 3.1 Origin dimension
- Add `country_id integer REFERENCES public.country_codes(id)` (nullable) to
  `public.inventory_item_brand_variants`. **Note:** `country_codes.id` is `integer`
  (not uuid) — the referencing column matches, same as `suppliers.country_id`.
  `brand_id uuid` already exists (nullable). Origin display column is
  `country_codes.name` (with `flag` / `iso` available for the picker).
- The row is the **priced + stocked + FIFO leaf**. Every unique
  `(item_id, brand_id, country_id)` combination is one leaf. Both dimensions
  nullable → all four cases are just null combinations:

  | Case | brand_id | country_id |
  |---|---|---|
  | brand + origin | set | set |
  | brand only | set | null |
  | origin only | null | set |
  | generic | null | null |

- **Null-safe uniqueness:** `UNIQUE NULLS NOT DISTINCT (item_id, brand_id, country_id)`
  (Postgres 15+, confirmed on Supabase) so two "LG / no-origin" leaves are rejected
  even though `country_id` is null. Replaces the existing
  `(item_id, lower(trim(brand)))` unique index, which is retired with the free-text
  column's demotion (see 3.2).

### 3.2 Brand master (adopt existing `brands` table)
- Add `UNIQUE (lower(trim(name)))` on `public.brands` — DB-level guard against
  "LG" / "lg " duplicates (today only a client-side `ilike` check exists).
- **Backfill:** for each distinct normalized (`trim`, case-fold) value of
  `inventory_item_brand_variants.brand`, create a `brands` row if absent, then set
  the variant's `brand_id`. Conservative — near-duplicates that differ by more than
  case/whitespace ("LG" vs "LG Electronics") are left as separate brands for manual
  merge. Variants whose brand text is empty/generic get `brand_id = null`.
- **Sync direction fix:** `brand_id` is the single source of truth. Keep the
  denormalized `brand` text in sync by (a) the existing `BEFORE INSERT OR UPDATE OF
  brand_id` trigger, plus (b) a new `AFTER UPDATE OF name ON brands` trigger that
  propagates a rename to every referencing variant's text. The app writes only
  `brand_id`; direct text writes are removed from the UI.
- The free-text `brand` column is **retained but demoted** to a denormalized mirror
  (kept for existing read paths / search until a later cleanup drops it). Not dropped
  in this slice to avoid breaking untouched consumers.

### 3.3 Integrity fixes (folded in)
- `fifo_cost_layers.brand_variant_id`: `ON DELETE CASCADE` → **`ON DELETE RESTRICT`**.
  Deleting a leaf that still owns cost layers is blocked, not silently wiped. Delete
  flows must archive/empty first.
- Wire `public.set_updated_at()` as a `BEFORE UPDATE` trigger on
  `inventory_categories`, `inventory_items`, `inventory_item_brand_variants` (none
  have it today, so audit timestamps are stuck at insert time).

### 3.4 Origin backfill
- None. Existing variants get `country_id = null` ("origin unknown"), filled over time.

## 4. RLS + permissions

### 4.1 Policies
Replace `USING(true) WITH CHECK(true)` on `inventory_categories`, `inventory_items`,
`inventory_item_brand_variants`, and `brands` with:
- **SELECT:** `TO authenticated USING (true)` — viewing the catalog stays open.
- **INSERT / UPDATE / DELETE:** `_user_has_permission(_current_user_data_id(),
  'inventory.catalog.manage')`.

### 4.2 Pricing as a separate column-level gate
- A `BEFORE UPDATE` trigger on `inventory_item_brand_variants` raises
  `42501` if any **price column** changed and the actor lacks
  `inventory.pricing.manage`. Price columns: the variant's selling price + cost
  fields (exact list finalized against the live column set during implementation).
- Result: `catalog.manage` can restructure (rename, re-parent, add/remove
  brands/origins) but cannot move prices; `pricing.manage` (e.g. Accounting) can.

### 4.3 Permission registration
- Add `inventory.catalog.view`, `inventory.catalog.manage`, `inventory.pricing.manage`
  to `src/lib/permissions.ts` and the permission tree
  (`src/components/master-data/PermissionTree.tsx`).
- Grant `catalog.manage` + `pricing.manage` to the seeded system-admin / owner roles
  in the same migration so we don't lock ourselves out.

### 4.4 Photos storage bucket
- Fold in the inventory-photos bucket lockdown (currently INSERT/UPDATE/DELETE open to
  any authenticated user) under `inventory.catalog.manage`.

### 4.5 CRUD hardening (folded in)
- `useArchiveInventoryCategory` (3 client round-trips) and `useUpdateSortOrders`
  (N parallel PATCHes) become single transactional RPCs, so a mid-operation failure
  can't half-apply.

## 5. Catalog tree UI

### 5.1 Drill-down
```
▸ Air Conditioners            (category — arbitrary depth, unchanged)
  ▸ Split AC 1.5 Ton          (item)
    ▸ LG                      (brand group)
      ▸ Korea   QAR 2,100 · 12 in stock    (origin = priced/stocked leaf)
          └ receivals + FIFO layers
      ▸ China   QAR 1,850 · 30 in stock
          └ receivals + FIFO layers
    ▸ Samsung                 (brand group)
      ▸ —       QAR 1,950 · 8 in stock     (brand, no origin)
          └ receivals + FIFO layers
  ▸ Copper Pipe               (item)
    ▸ Unbranded               (no-brand group)
      ▸ India   QAR 40 · 500 in stock      (origin-only)
          └ receivals + FIFO layers
```

### 5.2 Level rendering
- **Item row** expands into **brand groups** (group variants by `brand_id`). Items
  with no brands render a single **"Unbranded"** group — never a dead end.
- **Brand group** expands into **origin rows**; each origin row *is* one variant leaf
  (price + stock). A brand with no origin shows one row labeled **"—"**.
- **Origin row** expands to reveal the existing `FifoLayersTable` + that leaf's
  receival history ("origin opens the receivals"), keyed off `brand_variant_id`.

### 5.3 Editors
- `BrandVariantEditDialog` gains two optional selects:
  - **Brand** — live from `brands`, searchable, with inline "+ Add brand" inserting a
    real `brands` row (dedup-guarded). Renders `brands.name`, never id.
  - **Origin** — from `country_codes`, clearable. Renders `country_codes.name`,
    never id.
- Creating a leaf = optional brand + optional origin + price; null-safe unique index
  rejects duplicate combos with a clear message.

### 5.4 Folded-in UI fixes
- Price moves into always-visible row content (no longer `hidden md:` with no
  fallback).
- `ItemEditDialog` dirty-check includes the warranty field.
- Dropdown UUID guard: every new select shows names.
- Layout stability: brand/origin group rows use reserved heights so expand/collapse
  doesn't shift siblings.

## 6. Receivals

- The **manual inventory-receival flow** (inventory module) targets the
  (item, brand, origin) leaf — its item/variant selector gets the same brand + origin
  resolution so new stock and FIFO land on the correct leaf.
- Expanding an origin row shows the leaf's FIFO layers + receival records.
- **PO-driven receivals unchanged** in this slice (deferred; see follow-up tracker).

## 7. Data migration (one-time, at deploy)

1. Create `brands` rows from distinct normalized existing `brand` text; set variant
   `brand_id`; report unmapped/ambiguous.
2. All existing variants get `country_id = null`.
3. Post-migration the picker shows real brands; the tree groups by them with a single
   "—" origin per leaf until origins are set.

## 8. Deferred items (spawned as tracked chips)

PO/SO origin pickers (own tracker); category parent-picker depth cap; N+1
attribute-chip fetches; `.limit()` gaps on untouched hooks; `markup_percent` dead
column; `fifo_cost_layers.receival_id` text→uuid; dead-component deletion
(`InventoryColumnPicker`, unreferenced form dialogs); remaining nits.

## 9. Acceptance criteria

- [ ] Catalog tree shows category → item → brand group → origin row → receivals for
      all four cases (brand+origin, brand-only, origin-only, generic).
- [ ] A variant can be created/edited with optional brand + optional origin; duplicate
      combos are rejected with a readable error.
- [ ] Price + stock are per-origin and visible on mobile.
- [ ] Manual inventory receival lands FIFO on the chosen (brand, origin) leaf; the
      origin row shows it.
- [ ] Brand picker is live off `brands` (no free-text write); adding a duplicate brand
      is prevented and reported honestly (no false "added" toast).
- [ ] A user without `inventory.catalog.manage` cannot insert/update/delete catalog
      rows via the API (verified against the REST endpoint, not just hidden buttons).
- [ ] A user with `catalog.manage` but not `pricing.manage` cannot change price
      columns (trigger raises 42501).
- [ ] Deleting a brand/origin leaf with cost layers is blocked (RESTRICT), not
      cascaded.
- [ ] Renaming a brand propagates to the denormalized text on all its variants.
- [ ] `updated_at` advances on edits to the three tables.
- [ ] No raw UUIDs in any brand/origin dropdown.
- [ ] `tsc --noEmit` clean; all new migrations applied to staging + mirrored to
      `supabase/migrations-staging/`.

## 10. Security checklist (module completion)

Run the four-point check before final commit and record in PROGRESS.md
`## 🔒 Security Audit Log`: secrets, RLS (this feature *adds* RLS — verify every
touched table ends with permission-gated policies), auth gate (permission trigger),
error handling (RPCs surface real Postgres errors), layout stability (tree
expand/collapse + selects).

## 11. Open questions — resolved

- **Origin source:** reuse `country_codes` (same as `suppliers.country_id`);
  `id` is `integer`, display via `name`. ✔
- **Brand vs origin optionality:** both nullable on the leaf; all four cases
  supported. ✔
- **Two permissions vs one:** two (`catalog.manage`, `pricing.manage`), price gated by
  trigger. Collapsible to one later if desired. ✔
- **Free-text brand column:** demoted to denormalized mirror, not dropped this slice. ✔
