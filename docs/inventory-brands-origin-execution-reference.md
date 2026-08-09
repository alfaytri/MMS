# Execution Reference — Inventory Brands & Origin

**Purpose:** durable fact-set gathered during brainstorming/planning so execution
can resume after a context `/clear` without re-auditing. Read this alongside the
plan and spec.

- **Branch:** `feature/inventory-brands-and-origin` (off `deploy/warehouse-shipping`)
- **Plan:** [docs/plans/2026-08-08-inventory-brands-origin.md](plans/2026-08-08-inventory-brands-origin.md)
- **Spec:** [docs/specs/2026-08-08-inventory-brands-origin-design.md](specs/2026-08-08-inventory-brands-origin-design.md)
- **Deferred trackers:** [PO/SO pickers](inventory-brands-origin-po-so-followup.md) ·
  [N+1 attribute chips](inventory-attribute-chip-n1-followup.md) ·
  `docs/future-plans.md` (fifo text→uuid, dead components, nits)
- **Staging DB ref:** `mwvblpgbgxipvrevkeff` (migrations go here only)

## Resume instruction (paste after /clear)

> Resume the Inventory Brands & Origin feature. Read
> `docs/inventory-brands-origin-execution-reference.md`, then
> `docs/plans/2026-08-08-inventory-brands-origin.md`, and execute from Task 0 on
> branch `feature/inventory-brands-and-origin`. Follow AGENTS.md rules
> (migrations mirrored to `supabase/migrations-staging/`, both commit trailers,
> operator smoke for UI, commit code only after I confirm).

## Concrete migration filenames (use these exact names — order is load-bearing)

1. `supabase/migrations/20260819000000_inventory_origin_and_integrity.sql`
2. `supabase/migrations/20260819010000_backfill_brands_from_text.sql`
3. `supabase/migrations/20260819020000_inventory_variant_unique_swap.sql`
4. `supabase/migrations/20260819030000_inventory_rls_permissions.sql`

(Latest existing migration is `20260818000000` — these sort after it. Mirror each
to `supabase/migrations-staging/` with the identical name.)

## Verified schema facts (do NOT re-derive)

- **Priced/stocked leaf table:** `public.inventory_item_brand_variants` (renamed
  from `inventory_brand_variants` on 2026-07-24; the CREATE TABLE in baseline is
  under the OLD name at `20240101000000_baseline_schema.sql:8633`).
- **Variant columns:** `id uuid`, `item_id uuid NOT NULL`, `brand text NOT NULL`,
  `code text`, `cost_price numeric`, `selling_price numeric`, `stock_level int`,
  `incoming int`, `incoming_eta date`, `average_cost numeric`, `created_at`,
  `updated_at`, `reserved_qty int`, `linked_services_count int`, `status text`,
  `sort_order int`, `reorder_point int`, `margin_percent numeric(8,4)`,
  `damaged_qty int`. **`brand_id uuid` (nullable) already exists** (added
  `20260720140000_brands_table_and_fk.sql`, FK `ON DELETE SET NULL`).
- **Price columns to gate under `inventory.pricing.manage`:** `cost_price`,
  `selling_price`, `margin_percent` ONLY. NOT `average_cost` / `stock_level`
  (system-computed by receival/FIFO RPCs — gating them would break stock moves).
- **Old brand unique index to drop:** `uq_inventory_brand_variants_item_brand`
  on `(item_id, lower(trim(brand)))` (`20260712100000_inventory_unique_constraints.sql:75`).
- **`country_codes`:** `id integer` (NOT uuid), `code`, `iso`, `flag`, `name`,
  `is_active`, `sort_order`. So the new column is `country_id integer REFERENCES
  country_codes(id)`. Display via `name` (+ `flag`). Same target as
  `suppliers.country_id`.
- **`brands` table:** `id uuid`, `name text`, `name_ar text`, `sort_order`. RLS on,
  but policy likely open — lock it in migration 4. No case-insensitive unique yet.
- **RLS helpers (exist):** `public._user_has_permission(p_profile_id uuid,
  p_permission text)` and `public._current_user_data_id()`. Money-table lockdown
  template: `20260806000000_lock_money_table_rls.sql`.
- **`set_updated_at()`** exists in baseline (`:6472`) but is NOT wired to
  inventory_categories / inventory_items / inventory_item_brand_variants.
- **FIFO FK:** `fifo_cost_layers_brand_variant_id_fkey` is `ON DELETE CASCADE`
  (`baseline:14320`) → change to RESTRICT.
- **`markup_percent`:** dead column on `inventory_items` (`baseline:8818`), removed
  concept per `20260708214900_remove_markup_and_margin.sql`. Confirm
  `grep -rn markup_percent src/` is empty before dropping.
- **Inventory RLS is currently OPEN** (`USING(true) WITH CHECK(true)`) on
  categories/items/variants — verified NOT locked by any later migration
  (`20260801500000_phase_d12_item_sharing_column.sql:15` comment confirms as of
  Aug 1; money lockdown `20260806000000` did NOT include inventory).
- **Photos bucket** `inventory-item-photos` (from `20260815001800_inventory_item_photos.sql`)
  is world-writable to authenticated — lock write ops on `inventory.catalog.manage`.

## Verified code facts (files + line anchors)

- **Test runner:** Vitest present (`npm run test:run <file>`). Example suites:
  `src/lib/permissions.test.ts`, `src/lib/utils.test.ts`.
- **`useCountryCodes()`** — `src/hooks/useCountryCodes.ts`, returns
  `{ id:number, code, iso, flag, name }`, active + sorted. Reuse for origin picker.
- **`useBrands()` / `useCreateBrand()`** — `src/hooks/useBrands.ts`.
  `useCreateBrand` currently returns the existing row silently on dup (the false
  "added" toast bug) → change to return `{ brand, created }`.
- **Variant hooks** — `src/hooks/useInventory.ts`: `useBrandVariants` ~L64,
  `useCreateBrandVariant` ~L172, `useUpdateBrandVariant` ~L201,
  `useArchiveInventoryCategory` ~L857 (3 client round-trips → RPC),
  `useUpdateSortOrders` ~L912 (N parallel PATCH → RPC).
- **Variant editor (live):** `src/components/services/inventory/BrandVariantEditDialog.tsx`
  — free-text brand `<Input>` at ~L157-166 (replace with brand+origin selects);
  `avgCostLocked` load-window race at ~L52.
- **Item row / tree:** `src/components/services/inventory/ItemRow.tsx`
  (brand-variant sub-table; price cols `hidden md:`/`hidden sm:` at ~L143-176 —
  make price always-visible); brand row `src/components/services/inventory/BrandVariantRow.tsx`.
- **Item editor dirty-check bug:** `src/components/services/inventory/ItemEditDialog.tsx`
  — `warrantyPolicyId` read ~L69, submitted ~L196, but MISSING from isDirty ~L139-161.
- **Category parent picker (3-level cap):** `src/components/services/inventory/CategoryEditDialog.tsx`
  ~L239-284. Tree is arbitrary depth via `buildTree` in
  `src/hooks/useInventoryTree.ts:21-37`. Flat categories: `useAllCategoriesFlat`
  in `useInventoryTree.ts:137-153`.
- **Manual receival:** `grep -rn "useInventoryReceivals\|InventoryReceivalDialog" src/components`
  to locate; hook `src/hooks/useInventoryReceivals.ts`.
- **Permission registry:** `src/lib/permissions.ts` (Bills group ~L225-231 as the
  shape to copy) + `src/components/master-data/PermissionTree.tsx` (~L296-305).
- **Dead code (do NOT delete here — logged in future-plans):**
  `InventoryColumnPicker.tsx`, `BrandVariantFormDialog.tsx`,
  `InventoryItemFormDialog.tsx`.

## Decisions locked (from brainstorming)

- Option A: origin = nullable dimension on the variant (not a new child table).
- Both brand_id and country_id nullable → all four combos supported.
- Two permissions: `inventory.catalog.manage` (structure) + `inventory.pricing.manage`
  (price columns, via BEFORE UPDATE trigger). `inventory.catalog.view` for read.
- Free-text `brand` column retained as a synced mirror (not dropped this slice).
- Category parent-picker arbitrary-depth: IN scope. `markup_percent` drop: IN scope.
- PO/SO pickers + PO-driven receival origin: OUT (tracker). N+1 chips: OUT (tracker).
  fifo text→uuid, dead-component deletion, nits: OUT (future-plans.md).

## Commit trailers (every commit)

```
Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
