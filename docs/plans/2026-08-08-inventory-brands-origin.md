# Inventory Brands & Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make origin a nullable, priced/stocked dimension of the inventory brand-variant leaf, adopt the existing `brands` master table, and lock down inventory RLS with catalog + pricing permissions — catalog + receivals slice only.

**Architecture:** The priced/stocked/FIFO leaf stays `inventory_item_brand_variants`; we add a nullable `country_id` alongside the existing nullable `brand_id`, so every unique `(item_id, brand_id, country_id)` is one leaf and all four brand/origin combinations are just null patterns. Brand text is demoted to a synced mirror of `brands.name`. RLS moves from `USING(true)` to permission-gated policies plus a column-level pricing trigger. The catalog tree UI groups leaves by brand then origin; the origin row reveals receivals/FIFO.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, shadcn/ui + Tailwind, Supabase (Postgres 15, staging ref `mwvblpgbgxipvrevkeff`), TanStack Query v5, Vitest.

**Spec:** [docs/specs/2026-08-08-inventory-brands-origin-design.md](../specs/2026-08-08-inventory-brands-origin-design.md)

## Global Constraints

- **Migrations:** every `.sql` goes to BOTH `supabase/migrations/` AND `supabase/migrations-staging/` in the same commit. Apply with `npx supabase db push` (staging only, ref `mwvblpgbgxipvrevkeff`). Never ask the user to run SQL manually.
- **RPC bodies:** when rewriting an existing function, source the live body via `pg_get_functiondef` — never copy from the stale baseline.
- **After `supabase gen types`:** re-append the four helper aliases (`DBTable`/`DBInsert`/`DBUpdate`/`AllTables`) — the CLI wipes them.
- **Dropdown UUID guard:** every `<Select>` renders a human label (`brands.name`, `country_codes.name`) — never a raw id.
- **Side-by-side dropdowns:** hierarchical pickers use parallel side-by-side selects, never flyout submenus.
- **Responsive:** all four breakpoints; touch targets ≥ 44px (`min-h-11`); no layout shift on select/expand.
- **Commits:** every commit ends with both trailers:
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` and
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (via HEREDOC).
- **Commit policy:** do NOT commit feature code until the user confirms it works; migrations + docs may be committed once applied/verified. (This plan marks each commit step; hold code commits for user confirmation per session rule.)
- **PROGRESS.md + EOD:** start-marker commit before Phase 1; completion + EOD after the final phase.

## Testing Approach (project-adapted)

This is a Next.js/Supabase app, not a pytest project. "Tests" per task mean:
- **Pure logic** (helpers under `src/lib/inventory/…`): real Vitest unit tests (`npm run test:run <file>`).
- **Migrations / RLS / triggers / RPCs:** apply via `npx supabase db push`, then verify with `npx supabase db push --dry-run` ("Remote database is up to date") and a targeted `psql`-style check where noted; deeper behavioural checks are **operator smoke** checkpoints.
- **Hooks / UI:** `npx tsc --noEmit` for type safety; behaviour is **operator smoke** (do not drive the browser — hand the operator a checklist).

Each task states which kind applies. Operator-smoke checkpoints are explicit `⏸ OPERATOR SMOKE` steps — pause and hand off, don't self-verify UI.

## File Structure

**Migrations (create; mirror each to `supabase/migrations-staging/`):**
- `…_inventory_origin_and_integrity.sql` — country_id, FIFO FK→RESTRICT, updated_at triggers, drop markup_percent, brands unique + rename-sync trigger.
- `…_backfill_brands_from_text.sql` — create brands from distinct text, set brand_id.
- `…_inventory_variant_unique_swap.sql` — drop old text unique, add null-safe `(item_id, brand_id, country_id)`.
- `…_inventory_rls_permissions.sql` — permission-gated policies, pricing trigger, photos bucket, archive/sort RPCs, seed grants.

**Pure helpers (create; unit-tested):**
- `src/lib/inventory/brandNormalize.ts` (+ `.test.ts`)
- `src/lib/inventory/groupVariants.ts` (+ `.test.ts`)
- `src/lib/inventory/categoryLevels.ts` (+ `.test.ts`)

**Hooks (modify):**
- `src/hooks/useBrands.ts` — `useCreateBrand` returns `{ brand, created }`.
- `src/hooks/useInventory.ts` — variant read/write carry `brand_id` + `country_id`; `useArchiveInventoryCategory` + `useUpdateSortOrders` call RPCs.
- `src/lib/queryKeys.ts` — no new keys expected (reuse `inventory.*`); add only if a new list surface appears.

**Permissions (modify):**
- `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx` — add `inventory.catalog.view/manage`, `inventory.pricing.manage`.

**UI (modify/create):**
- `src/components/services/inventory/BrandVariantEditDialog.tsx` — brand + origin selects.
- `src/components/services/inventory/ItemRow.tsx` — brand-group → origin-row rendering.
- `src/components/services/inventory/BrandGroupRow.tsx` (create) + `OriginVariantRow.tsx` (create or refactor from `BrandVariantRow.tsx`).
- `src/components/services/inventory/ItemEditDialog.tsx` — warranty dirty-check.
- `src/components/services/inventory/CategoryEditDialog.tsx` — N-level parent picker.
- The manual inventory-receival dialog — origin-aware variant target.

**Docs:** `docs/flows-registry.md` (new flows), `PROGRESS.md`, `EOD/`.

---

## Phase 0 — Kickoff

### Task 0: PROGRESS start marker

- [ ] **Step 1: Update PROGRESS.md `## 🔄 In Progress`** with:
  `🚀 Starting: **Inventory Brands & Origin (catalog+receivals)** on feature/inventory-brands-and-origin` plus a one-paragraph scope pointer to the spec.
- [ ] **Step 2: Commit (docs only)**
```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting Inventory Brands & Origin

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — DB foundation

### Task 1: Integrity + origin column migration

**Files:**
- Create: `supabase/migrations/<ts>_inventory_origin_and_integrity.sql`
- Mirror: `supabase/migrations-staging/<ts>_inventory_origin_and_integrity.sql`

**Interfaces:**
- Produces: `inventory_item_brand_variants.country_id integer NULL` (FK → `country_codes(id)`); `brands` unique `lower(trim(name))`; `set_updated_at` on the three tables; `fifo_cost_layers.brand_variant_id` FK now `RESTRICT`; `inventory_items.markup_percent` dropped; `brands` rename-sync trigger.

- [ ] **Step 1: Pre-check no live reader of markup_percent**

Run: `grep -rn "markup_percent" src/` — Expected: no matches (safe to drop). If any appear, stop and report.

- [ ] **Step 2: Write the migration**

```sql
BEGIN;

-- 1. Origin dimension (country_codes.id is integer, not uuid)
ALTER TABLE public.inventory_item_brand_variants
  ADD COLUMN IF NOT EXISTS country_id integer
  REFERENCES public.country_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inventory_item_brand_variants_country_id_idx
  ON public.inventory_item_brand_variants (country_id);

-- 2. brands: case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_lower_name
  ON public.brands (lower(trim(name)));

-- 3. FIFO FK: CASCADE -> RESTRICT (block silent cost-history wipe)
ALTER TABLE public.fifo_cost_layers
  DROP CONSTRAINT IF EXISTS fifo_cost_layers_brand_variant_id_fkey;
ALTER TABLE public.fifo_cost_layers
  ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey
  FOREIGN KEY (brand_variant_id)
  REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;

-- 4. updated_at triggers (set_updated_at() already exists in baseline)
DROP TRIGGER IF EXISTS set_updated_at_inventory_categories ON public.inventory_categories;
CREATE TRIGGER set_updated_at_inventory_categories BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_inventory_items ON public.inventory_items;
CREATE TRIGGER set_updated_at_inventory_items BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_inventory_item_brand_variants ON public.inventory_item_brand_variants;
CREATE TRIGGER set_updated_at_inventory_item_brand_variants BEFORE UPDATE ON public.inventory_item_brand_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Drop dead markup_percent column
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS markup_percent;

-- 6. Brand rename propagates to denormalized variant text (fills the reverse-sync gap)
CREATE OR REPLACE FUNCTION public.brands_propagate_name_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.inventory_item_brand_variants
      SET brand = NEW.name
    WHERE brand_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS brands_propagate_name_trg ON public.brands;
CREATE TRIGGER brands_propagate_name_trg AFTER UPDATE OF name ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.brands_propagate_name_fn();

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Mirror + apply**
```bash
cp supabase/migrations/<ts>_inventory_origin_and_integrity.sql supabase/migrations-staging/
npx supabase db push
```
Expected: "Applying migration …" then "Finished supabase db push."

- [ ] **Step 4: Verify applied**

Run: `npx supabase db push --dry-run` — Expected: "Remote database is up to date."

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/<ts>_inventory_origin_and_integrity.sql supabase/migrations-staging/<ts>_inventory_origin_and_integrity.sql
git commit -m "$(cat <<'EOF'
feat(db,inventory): origin column + integrity (FIFO RESTRICT, updated_at, brand sync, drop markup)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Brand backfill migration

**Files:**
- Create + mirror: `<ts>_backfill_brands_from_text.sql`

**Interfaces:**
- Consumes: `brands` unique index (Task 1).
- Produces: every variant with non-empty brand text has a matching `brands` row and `brand_id` set; generic/empty brand → `brand_id` stays null. A `NOTICE` reports unmapped rows (should be zero after run).

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

-- Create a brand row for each distinct normalized brand text not already present.
INSERT INTO public.brands (name)
SELECT DISTINCT trim(v.brand)
FROM public.inventory_item_brand_variants v
WHERE v.brand IS NOT NULL
  AND trim(v.brand) <> ''
  AND lower(trim(v.brand)) NOT IN ('generic')
  AND NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE lower(trim(b.name)) = lower(trim(v.brand))
  );

-- Map each variant to its brand row by normalized name.
UPDATE public.inventory_item_brand_variants v
SET brand_id = b.id
FROM public.brands b
WHERE v.brand_id IS NULL
  AND v.brand IS NOT NULL
  AND trim(v.brand) <> ''
  AND lower(trim(v.brand)) = lower(trim(b.name));

-- Report anything still unmapped (non-generic text with no brand_id).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.inventory_item_brand_variants
  WHERE brand_id IS NULL AND brand IS NOT NULL AND trim(brand) <> ''
    AND lower(trim(brand)) <> 'generic';
  RAISE NOTICE 'Unmapped brand-text variants remaining: %', n;
END $$;

COMMIT;
```

- [ ] **Step 2: Mirror + apply** (`cp` then `npx supabase db push`) — read the `NOTICE`; expected "Unmapped … : 0".
- [ ] **Step 3: Verify** `npx supabase db push --dry-run` → up to date.
- [ ] **Step 4: Commit** (message: `feat(db,inventory): backfill brand_id from free-text brand`, both trailers).

### Task 3: Variant unique-index swap

**Files:**
- Create + mirror: `<ts>_inventory_variant_unique_swap.sql`

**Interfaces:**
- Consumes: brand_id populated (Task 2).
- Produces: old `uq_inventory_brand_variants_item_brand` dropped; new null-safe `uq_iibv_item_brand_origin` on `(item_id, brand_id, country_id) NULLS NOT DISTINCT`.

- [ ] **Step 1: Write the migration**

```sql
BEGIN;
DROP INDEX IF EXISTS public.uq_inventory_brand_variants_item_brand;
CREATE UNIQUE INDEX IF NOT EXISTS uq_iibv_item_brand_origin
  ON public.inventory_item_brand_variants (item_id, brand_id, country_id)
  NULLS NOT DISTINCT;
COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Mirror + apply.** If it errors on a duplicate, a pre-existing duplicate leaf exists — stop, report the offending `(item_id, brand_id, country_id)`, do not force.
- [ ] **Step 3: Verify** dry-run up to date.
- [ ] **Step 4: Commit** (`feat(db,inventory): null-safe unique on (item,brand,origin)`, both trailers).

### Task 4: RLS + permissions + pricing trigger + RPCs

**Files:**
- Create + mirror: `<ts>_inventory_rls_permissions.sql`

**Interfaces:**
- Consumes: `_user_has_permission(uuid, text)`, `_current_user_data_id()` (existing helpers).
- Produces: permission-gated policies on `inventory_categories`, `inventory_items`, `inventory_item_brand_variants`, `brands`; `inventory_pricing_guard_trg` (BEFORE UPDATE) blocking `cost_price`/`selling_price`/`margin_percent` changes without `inventory.pricing.manage`; `rpc_archive_inventory_category(uuid)`; `rpc_update_inventory_sort_orders(jsonb)`; photos-bucket policy lockdown; seed grants to system-admin roles.

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

-- Helper: replace open policies on a table with SELECT-open + CUD-gated.
-- (inventory_categories)
DROP POLICY IF EXISTS "Authenticated users can manage inventory_categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "inventory_categories_all" ON public.inventory_categories;
CREATE POLICY inv_cat_select ON public.inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_cat_ins ON public.inventory_categories FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_cat_upd ON public.inventory_categories FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));
CREATE POLICY inv_cat_del ON public.inventory_categories FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage'));

-- (inventory_items) — repeat the same four policies with names inv_item_*
-- (inventory_item_brand_variants) — repeat with names inv_var_*
-- (brands) — repeat with names inv_brand_*
--   NOTE: exact DROP POLICY names must match what exists live. Before writing,
--   the executor lists current policies:
--     select polname from pg_policies where tablename in
--       ('inventory_categories','inventory_items','inventory_item_brand_variants','brands');
--   and DROPs each by its real name, then creates the gated set above.

-- Pricing column guard (column-level gate that RLS can't express)
CREATE OR REPLACE FUNCTION public.inventory_pricing_guard_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.cost_price    IS DISTINCT FROM OLD.cost_price
   OR NEW.selling_price IS DISTINCT FROM OLD.selling_price
   OR NEW.margin_percent IS DISTINCT FROM OLD.margin_percent)
   AND NOT public._user_has_permission(public._current_user_data_id(),'inventory.pricing.manage')
  THEN
    RAISE EXCEPTION 'Permission denied: inventory.pricing.manage required to change prices'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS inventory_pricing_guard_trg ON public.inventory_item_brand_variants;
CREATE TRIGGER inventory_pricing_guard_trg BEFORE UPDATE ON public.inventory_item_brand_variants
  FOR EACH ROW EXECUTE FUNCTION public.inventory_pricing_guard_fn();

-- Transactional archive cascade (replaces 3 client round-trips)
CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_category(p_category_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  UPDATE public.inventory_item_brand_variants v SET status='archived'
    WHERE v.item_id IN (SELECT id FROM public.inventory_items WHERE category_id = p_category_id);
  UPDATE public.inventory_items SET status='archived' WHERE category_id = p_category_id;
  UPDATE public.inventory_categories SET status='archived' WHERE id = p_category_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.rpc_archive_inventory_category(uuid) TO authenticated;

-- Single-call sort-order update
CREATE OR REPLACE FUNCTION public.rpc_update_inventory_sort_orders(p_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_updates) AS x(table_name text, id uuid, sort_order int) LOOP
    IF r.table_name = 'inventory_categories' THEN
      UPDATE public.inventory_categories SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_items' THEN
      UPDATE public.inventory_items SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_item_brand_variants' THEN
      UPDATE public.inventory_item_brand_variants SET sort_order = r.sort_order WHERE id = r.id;
    END IF;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.rpc_update_inventory_sort_orders(jsonb) TO authenticated;

-- Photos bucket lockdown: gate write ops on inventory.catalog.manage.
--   The executor lists current policies on storage.objects for bucket
--   'inventory-item-photos' (name per migration 20260815001800), drops the
--   open INSERT/UPDATE/DELETE ones, and recreates them with an added
--   AND public._user_has_permission(public._current_user_data_id(),'inventory.catalog.manage').
--   SELECT stays authenticated-open (public bucket read is fine).

-- Seed grants: give system-admin / owner roles the new perms so we don't lock out.
UPDATE public.custom_roles
  SET permissions = (SELECT array(SELECT DISTINCT unnest(permissions ||
        ARRAY['inventory.catalog.view','inventory.catalog.manage','inventory.pricing.manage'])))
  WHERE is_system_admin = true OR lower(name) IN ('owner','admin','administrator');

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Before applying — enumerate live policy names.** The executor runs the `pg_policies` / storage-policy lookups noted inline and fills the exact `DROP POLICY` names. Do NOT guess names.
- [ ] **Step 3: Mirror + apply** (`cp` then `npx supabase db push`).
- [ ] **Step 4: Verify** dry-run up to date.
- [ ] **Step 5: Commit** (`feat(db,inventory): RLS lockdown + catalog/pricing permissions + archive/sort RPCs`, both trailers).

### Task 5: Regenerate types

**Files:** Modify `src/types/database.types.ts`

- [ ] **Step 1: Regenerate + restore helper aliases**
```bash
npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > /tmp/db.new
head -n -2 /tmp/db.new > src/types/database.types.ts.tmp
cat >> src/types/database.types.ts.tmp <<'EOF'

export type DBTable<T extends keyof Database['public']['Tables']>  = Database['public']['Tables'][T]['Row']
export type DBInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type DBUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type AllTables = keyof Database['public']['Tables']
EOF
mv src/types/database.types.ts.tmp src/types/database.types.ts
```
- [ ] **Step 2: Confirm** `grep -c "country_id" src/types/database.types.ts` ≥ 1 and helper aliases present at EOF.
- [ ] **Step 3: `npx tsc --noEmit`** — Expected: clean (or only pre-existing errors unrelated to inventory; note them).
- [ ] **Step 4: Commit** (`chore(types): regenerate after inventory origin/RLS migrations`, both trailers).

---

## Phase 2 — Permissions registry

### Task 6: Register the three permissions in the UI tree

**Files:**
- Modify: `src/lib/permissions.ts` (Inventory group)
- Modify: `src/components/master-data/PermissionTree.tsx` (Inventory node)
- Test: `src/lib/permissions.test.ts` (existing — extend)

**Interfaces:**
- Produces: permission keys `inventory.catalog.view`, `inventory.catalog.manage`, `inventory.pricing.manage` present in the exported permission catalog consumed by the role editor.

- [ ] **Step 1: Add a failing test** in `src/lib/permissions.test.ts` asserting the catalog contains the three new keys (follow the file's existing assertion style).
- [ ] **Step 2: Run** `npm run test:run src/lib/permissions.test.ts` — Expected: FAIL (keys absent).
- [ ] **Step 3: Add an Inventory permission group** to `src/lib/permissions.ts` and the matching node in `PermissionTree.tsx`, mirroring the existing "Bills" / "Supplier Payments" group shape:
```ts
{ key: 'inventory.catalog.view',   label: 'View Inventory Catalog',   description: 'View categories, items, brands, origins' },
{ key: 'inventory.catalog.manage', label: 'Manage Inventory Catalog', description: 'Create/edit/delete categories, items, brands, origins' },
{ key: 'inventory.pricing.manage', label: 'Manage Inventory Pricing', description: 'Change cost/selling price on variants. Gate behind Accounting.' },
```
- [ ] **Step 4: Run** the test — Expected: PASS. Then `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** (`feat(permissions): inventory catalog + pricing permission keys`, both trailers).

---

## Phase 3 — Pure helpers (unit-tested)

### Task 7: Brand-name normalizer

**Files:** Create `src/lib/inventory/brandNormalize.ts` + `.test.ts`

**Interfaces:**
- Produces: `normalizeBrandName(raw: string): string` (trim + collapse inner whitespace; preserves case for display, used for equality via `.toLowerCase()` by callers) and `sameBrand(a: string, b: string): boolean` (case + whitespace-insensitive).

- [ ] **Step 1: Write failing tests**
```ts
import { describe, it, expect } from 'vitest'
import { normalizeBrandName, sameBrand } from './brandNormalize'
describe('brandNormalize', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeBrandName('  LG   Electronics ')).toBe('LG Electronics')
  })
  it('sameBrand is case + space insensitive', () => {
    expect(sameBrand(' lg ', 'LG')).toBe(true)
    expect(sameBrand('LG', 'LG Electronics')).toBe(false)
  })
})
```
- [ ] **Step 2: Run** `npm run test:run src/lib/inventory/brandNormalize.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement**
```ts
export function normalizeBrandName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
export function sameBrand(a: string, b: string): boolean {
  return normalizeBrandName(a).toLowerCase() === normalizeBrandName(b).toLowerCase()
}
```
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** (`feat(inventory): brand-name normalizer helper`, both trailers).

### Task 8: Variant → brand-group → origin-row grouping

**Files:** Create `src/lib/inventory/groupVariants.ts` + `.test.ts`

**Interfaces:**
- Consumes: a `VariantLite = { id, brand_id: string|null, brand_name: string|null, country_id: number|null, country_name: string|null, ... }`.
- Produces: `groupVariants(variants: VariantLite[]): BrandGroup[]` where `BrandGroup = { brandKey: string; brandLabel: string; origins: VariantLite[] }`. Null brand → one group `{ brandKey: '__nobrand__', brandLabel: 'Unbranded' }`; within a group, null origin renders with label `'—'`. Stable sort: brands by label (Unbranded last), origins by country_name (null last).

- [ ] **Step 1: Write failing tests** covering: brand+origin, brand-only (origin label `—`), origin-only (group `Unbranded`), generic (Unbranded + `—`), and stable ordering. (Full test body — write concrete cases, do not stub.)
- [ ] **Step 2: Run** — Expected FAIL.
- [ ] **Step 3: Implement** `groupVariants` per the interface (pure reduce + sort).
- [ ] **Step 4: Run** — Expected PASS.
- [ ] **Step 5: Commit** (`feat(inventory): variant→brand→origin grouping helper`, both trailers).

### Task 9: Category ancestor-levels builder (for N-level picker)

**Files:** Create `src/lib/inventory/categoryLevels.ts` + `.test.ts`

**Interfaces:**
- Consumes: flat `CategoryNode[] = { id, name_en, parent_id: string|null }` (from `useAllCategoriesFlat`).
- Produces: `buildLevels(flat, selectedId|null): Level[]` where each `Level = { options: CategoryNode[]; selectedId: string|null }` — level 0 = roots; each subsequent level = children of the prior selection; stops when the selected node has no children. Also `ancestorPath(flat, id): string[]` (ids root→node) to pre-seed edit mode.

- [ ] **Step 1: Write failing tests** for a 4-deep chain (roots → L2 → L3 → L4), confirming `buildLevels` yields 4 levels when the deepest is selected, and appends an empty next level only while children exist. Include a no-children stop case.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement. Step 4: Run** — PASS.
- [ ] **Step 5: Commit** (`feat(inventory): arbitrary-depth category level builder`, both trailers).

---

## Phase 4 — Data hooks

### Task 10: `useCreateBrand` honest result

**Files:** Modify `src/hooks/useBrands.ts`

**Interfaces:**
- Produces: `useCreateBrand()` mutation now returns `{ brand: Brand; created: boolean }` (`created=false` when an existing case-insensitive match was found). Callers use `created` to avoid a false "added" toast.

- [ ] **Step 1:** Change the mutationFn to return `{ brand, created }` (`created=false` on the `existing` branch, `true` after insert). Keep the `ilike` guard.
- [ ] **Step 2:** `npx tsc --noEmit` — fix the one call site in the new brand picker (Task 12) to read `.created`.
- [ ] **Step 3: Commit** (`fix(inventory): useCreateBrand reports created vs existing`, both trailers).

### Task 11: Variant read/write carry brand_id + country_id

**Files:** Modify `src/hooks/useInventory.ts` (`useBrandVariants` ~L64, `useCreateBrandVariant` ~L172, `useUpdateBrandVariant` ~L201, `useArchiveInventoryCategory` ~L857, `useUpdateSortOrders` ~L912)

**Interfaces:**
- Produces:
  - `useBrandVariants(itemId)` rows include `brand_id`, `country_id`, joined `brands(name)` and `country_codes(name, flag, iso)`.
  - `useCreateBrandVariant` / `useUpdateBrandVariant` payloads accept `brand_id: string|null` and `country_id: number|null` (write both; keep denormalized `brand` text in sync by looking up the brand name client-side OR relying on the Task-1 insert/update-of-brand_id trigger — prefer the trigger).
  - `useArchiveInventoryCategory` calls `rpc_archive_inventory_category`.
  - `useUpdateSortOrders` calls `rpc_update_inventory_sort_orders`.

- [ ] **Step 1:** Update the `useBrandVariants` `.select(...)` to `id, item_id, brand, brand_id, code, cost_price, selling_price, average_cost, stock_level, reserved_qty, incoming, status, sort_order, country_id, brands(name), country_codes(name, flag, iso)` with `.limit(...)`.
- [ ] **Step 2:** Extend create/update payload types with `brand_id?: string|null` and `country_id?: number|null`; include them in the insert/update objects. Do NOT write the free-text `brand` directly — let the DB trigger mirror it from `brand_id`. (For origin-only variants where `brand_id` is null, set `brand` to `''` or keep existing.)
- [ ] **Step 3:** Replace the `useArchiveInventoryCategory` 3-step body with a single `supabase.rpc('rpc_archive_inventory_category', { p_category_id })`; replace `useUpdateSortOrders` Promise.all with one `supabase.rpc('rpc_update_inventory_sort_orders', { p_updates })`. Keep the same `onSuccess` invalidations.
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** (`feat(inventory): variant hooks carry brand_id+country_id; archive/sort via RPC`, both trailers).

---

## Phase 5 — Catalog tree UI

### Task 12: Brand + Origin pickers in the variant editor

**Files:** Modify `src/components/services/inventory/BrandVariantEditDialog.tsx`

**Interfaces:**
- Consumes: `useBrands`, `useCreateBrand` (`.created`), `useCountryCodes`, `normalizeBrandName`, updated `useCreateBrandVariant`/`useUpdateBrandVariant`.
- Produces: dialog writes `brand_id` (optional) + `country_id` (optional); no free-text brand `<Input>` remains.

- [ ] **Step 1:** Replace the free-text brand `<Input>` (current ~L157-166) with a **Brand `<Select>`** sourced from `useBrands()` (renders `name`), plus an inline "+ Add brand" affordance that calls `useCreateBrand` and toasts based on `.created` (honest message). Brand is optional (a "— none —" item).
- [ ] **Step 2:** Add an **Origin `<Select>`** from `useCountryCodes()` rendering `flag name` (value = `id`), clearable/optional.
- [ ] **Step 3:** On submit, pass `brand_id` + `country_id`; keep price fields. Preserve the existing `avgCostLocked` behaviour; guard the load-window race (disable cost input until `whStockData` resolves).
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5: ⏸ OPERATOR SMOKE** — create four leaves on one item (brand+origin, brand-only, origin-only, generic); confirm each saves, the origin dropdown shows names+flags (no UUID), and a duplicate combo is rejected with a readable error.
- [ ] **Step 6: Commit after user confirms** (`feat(inventory): brand + origin pickers in variant editor`, both trailers).

### Task 13: Tree rows — brand groups → origin rows → receivals

**Files:**
- Modify: `src/components/services/inventory/ItemRow.tsx`
- Create: `src/components/services/inventory/BrandGroupRow.tsx`
- Create/refactor: `src/components/services/inventory/OriginVariantRow.tsx` (from `BrandVariantRow.tsx`)

**Interfaces:**
- Consumes: `useBrandVariants(itemId)` (now with brand/origin joins), `groupVariants`, existing `FifoLayersTable`.
- Produces: item expands → `BrandGroupRow` per brand group → `OriginVariantRow` per origin leaf (price + stock always visible, incl. mobile) → expandable receivals/FIFO via `FifoLayersTable`.

- [ ] **Step 1:** In `ItemRow`, replace the flat brand-variant list with `groupVariants(variants)` → render a `BrandGroupRow` per group. Remove the `hidden md:` price columns; price/stock live in always-visible row content.
- [ ] **Step 2:** `BrandGroupRow` renders the brand label (or "Unbranded") and maps its `origins` to `OriginVariantRow`.
- [ ] **Step 3:** `OriginVariantRow` shows origin label (`flag name` or `—`), price, stock, action buttons (edit → `BrandVariantEditDialog`), and expands to `FifoLayersTable` + receival history for that `brand_variant_id`. Icon buttons get `aria-label`. Reserve row heights (`min-h-11`) so expand/collapse doesn't shift siblings.
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5: ⏸ OPERATOR SMOKE** — expand an item with all four leaf types; confirm the drill-down category→item→brand→origin→receivals matches the spec §5.1 diagram, price shows on mobile, and expanding an origin reveals its FIFO/receivals.
- [ ] **Step 6: Commit after user confirms** (`feat(inventory): brand-group/origin-row catalog tree`, both trailers).

### Task 14: ItemEditDialog warranty dirty-check

**Files:** Modify `src/components/services/inventory/ItemEditDialog.tsx` (~L139-161)

- [ ] **Step 1:** Add `warrantyPolicyId` to the `isDirty` comparison (compare against the value read on open, ~L69).
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** (`fix(inventory): ItemEditDialog dirty-check includes warranty`, both trailers).

---

## Phase 6 — Category picker arbitrary depth

### Task 15: N-level parent picker

**Files:** Modify `src/components/services/inventory/CategoryEditDialog.tsx` (~L239-284)

**Interfaces:**
- Consumes: `useAllCategoriesFlat`, `buildLevels`, `ancestorPath` (Task 9).
- Produces: parent picker renders one side-by-side `<Select>` per level, dynamically appending the next level while the chosen category has children; edit mode pre-seeds via `ancestorPath`.

- [ ] **Step 1:** Replace the fixed L1/L2/L3 selects with a `buildLevels(flat, selectedParentId)` map → render a `<Select>` per level. Selecting a level resets deeper levels. Renders `name_en`, never id.
- [ ] **Step 2:** Edit mode: seed selection from `ancestorPath(flat, category.parent_id)`.
- [ ] **Step 3:** `npx tsc --noEmit` clean.
- [ ] **Step 4: ⏸ OPERATOR SMOKE** — with a ≥4-deep category tree, create a sub-category under a depth-4 parent; confirm the 4th select appears and saves the correct `parent_id`.
- [ ] **Step 5: Commit after user confirms** (`feat(inventory): arbitrary-depth category parent picker`, both trailers).

---

## Phase 7 — Receivals target origin

### Task 16: Manual inventory-receival targets the origin leaf

**Files:** Modify the manual inventory-receival dialog + `src/hooks/useInventoryReceivals.ts`

**Interfaces:**
- Consumes: brand + origin resolution (Task 12 pattern), `useBrandVariants`.
- Produces: the manual receival's variant target resolves to a `(item, brand, origin)` leaf, so new stock + FIFO land on the correct `brand_variant_id`.

- [ ] **Step 1:** Locate the dialog: `grep -rn "useInventoryReceivals\|InventoryReceivalDialog" src/components`. In its item/variant selector, add brand + origin resolution to pick the exact leaf (reuse the picker pattern from Task 12).
- [ ] **Step 2:** Ensure the receival RPC/hook receives the resolved `brand_variant_id`; no change to FIFO plumbing (it already keys off the variant).
- [ ] **Step 3:** `npx tsc --noEmit` clean.
- [ ] **Step 4: ⏸ OPERATOR SMOKE** — receive stock into a specific (brand, origin) leaf; confirm the origin row's stock + FIFO layers update, and a different-origin leaf of the same brand is untouched.
- [ ] **Step 5: Commit after user confirms** (`feat(inventory): manual receival targets brand+origin leaf`, both trailers).

---

## Phase 8 — Close-out

### Task 17: Flow registry + security audit + PROGRESS + EOD

**Files:** Modify `docs/flows-registry.md`, `PROGRESS.md`, `EOD/EOD-<today>.md`

- [ ] **Step 1:** Add flow-registry entries: "Create/Edit Brand-Origin Variant", "Archive Inventory Category (RPC)", "Update Inventory Sort Orders (RPC)", "Manual Inventory Receival (origin-aware)" — with module, RPCs, guards (`inventory.catalog.manage` / `inventory.pricing.manage`), and `[[links]]`.
- [ ] **Step 2:** Run the 5-point security checklist (secrets, RLS — verify every touched table ends permission-gated, auth gate — pricing trigger, error handling — RPCs surface real Postgres errors, layout stability). Record a row in PROGRESS.md `## 🔒 Security Audit Log`.
- [ ] **Step 3:** Move the completed item to PROGRESS.md `## ✅ Completed`; clear `## 🔄 In Progress`. Append the task to today's EOD file.
- [ ] **Step 4: Commit (docs only)** (`docs: PROGRESS/EOD/flows — Inventory Brands & Origin complete`, both trailers).

### Task 18: Full-branch verification

- [ ] **Step 1:** `npx tsc --noEmit` — clean.
- [ ] **Step 2:** `npm run test:run` — all inventory helper suites pass.
- [ ] **Step 3:** `npx supabase db push --dry-run` — "Remote database is up to date."
- [ ] **Step 4:** `grep -rn "USING (true)" supabase/migrations/<the four new files>` — confirm no open policy shipped on a CUD path.
- [ ] **Step 5: ⏸ OPERATOR SMOKE (full)** — run the spec §9 acceptance-criteria checklist end-to-end, including the two permission-negative cases (no `catalog.manage` → API refuses write; `catalog.manage` without `pricing.manage` → price change raises 42501).

---

## Self-Review notes (for the executor)

- **Migration order is load-bearing:** Task 1 (add country_id, brands unique) → Task 2 (backfill brand_id) → Task 3 (null-safe unique swap) → Task 4 (RLS). Do not reorder — the unique swap assumes brand_id is populated.
- **Pricing trigger scope:** gates `cost_price`, `selling_price`, `margin_percent` only — never `average_cost`/`stock_level` (system-computed by receival/FIFO RPCs), so it won't block stock movements.
- **Live policy names:** Task 4 requires enumerating real `pg_policies` names before `DROP POLICY` — the baseline names may have drifted through the table rename. Never guess.
- **`country_id` is `integer`** (matches `country_codes.id`), not uuid.
- **Do not delete** the dead form dialogs here — that's logged in `docs/future-plans.md` for after this branch.
