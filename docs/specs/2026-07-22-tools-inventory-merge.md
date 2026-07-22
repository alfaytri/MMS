# Tools & Assets → Inventory Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate tool-asset catalog into `inventory_items`/`inventory_brand_variants` so PO/SO line items use one picker, one FK column, and auto-fill sku/unit/cost for all four line types (products, spare-parts, consumables, tools).

**Architecture:** The infrastructure already exists — `CascadeInventorySelector` and `useInventoryTree` both accept `lineType: 'tools'` and filter `inventory_categories.type = 'tools'`. The `services/inventory/ToolsAssetsView` and its master-data page already manage tools *as inventory*. What's left is: (1) route the "tools" branch of the two line-item editors through `CascadeInventorySelector` instead of the legacy `ToolAssetLookup`; (2) migrate any live `tool_asset_item_id` references to `brand_variant_id`; (3) delete the shadow `tool_asset_items` catalog + related dead code.

**Tech Stack:** Next.js 15 (App Router), React 19, TanStack Query v5, Supabase Postgres (staging: `mwvblpgbgxipvrevkeff`, prod: `wkmvjxxmzstsvahuiwsz`), TypeScript strict, Tailwind. Migrations applied via `npx supabase db push`.

## Global Constraints

- **Every commit** must include both authors:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **Migrations mirror to both folders** — write to `supabase/migrations/` AND `supabase/migrations-staging/` with identical content. `db push` reads only from `supabase/migrations/`; the staging folder is a manual mirror for the record.
- **All CREATE/DROP/ALTER inside `IF EXISTS`/`IF NOT EXISTS` guards** so migrations are idempotent and safe against both staging (currently patched via the 2026-07-22 restore migration) and prod (which still has the full schema).
- **Regen types after every DB migration**: `npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts` then re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`) that the CLI strips.
- **No commits until the user confirms the change works** in the browser or via a targeted query. Write code, apply DB changes, hand over — do not commit unprompted.
- **Prod is currently paused.** Every migration is applied to staging only. Prod push is deferred until it's unpaused; the mirrored migration file will be picked up automatically when it is.
- **No test infrastructure exists** for these components. Verification is manual browser smoke test + `tsc --noEmit --skipLibCheck` for type safety. Do not write React Testing Library specs — they'd be the first in the codebase and out of scope for this plan.
- **Feature stays behind normal code paths** — no feature flags. Keep changes small enough that revert = one commit.

---

## File Structure

**Modified (7 files):**
- `src/components/purchase/PoLineItemsEditor.tsx` — remove `isInventory = lineType !== 'tools'` branch (line 219), always render `CascadeInventorySelector`
- `src/components/sales/SoLineItemsEditor.tsx` — same simplification
- `src/app/(dashboard)/purchase/create-po/page.tsx` — remove `tool_asset_item_id` from line-items map + filters
- `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` — remove `tool_asset_item_id`; simplify `line_type` derivation to use category ancestry
- `src/app/(dashboard)/sales/create-so/page.tsx` — remove `tool_asset_item_id` from filters
- `src/app/(dashboard)/sales/edit-so/[id]/page.tsx` — remove `tool_asset_item_id`
- `src/types/database.types.ts` — regenerated at end of Phase 3, no manual edit

**Deleted (1 file):**
- `src/components/purchase/ToolAssetLookup.tsx`

**Created (2 migration files, mirrored):**
- Phase 2: `supabase/migrations/YYYYMMDD000000_migrate_tool_asset_items_to_inventory.sql`
- Phase 3: `supabase/migrations/YYYYMMDD100000_drop_tool_asset_items_and_columns.sql`
- Plus the same two files under `supabase/migrations-staging/`

**Untouched (context, do not edit):**
- `src/components/purchase/CascadeInventorySelector.tsx` — already accepts `lineType='tools'`
- `src/hooks/useInventoryTree.ts` — already accepts `type='tools'`
- `src/components/services/inventory/ToolsAssetsView.tsx` — master-data tool management (already uses inventory)
- `src/components/services/inventory/CategoryEditDialog.tsx` — has the `'tools': 'Tools & Assets'` label mapping the merged flow uses

---

# Phase 1 — Code Prep

Goal: The Tools & Assets branch in PO and SO editors renders the same cascading picker as the other three line types, and pre-fills sku/unit/cost from the selected brand variant. Existing `tool_asset_item_id` data stays untouched in the DB and old PO records continue to load and display.

---

### Task 1: Simplify PoLineItemsEditor — one picker for all line types

**Files:**
- Modify: `src/components/purchase/PoLineItemsEditor.tsx`

**Interfaces:**
- Consumes: `CascadeInventorySelector` (existing, already accepts `lineType: 'tools'`)
- Produces: `LineItemRow` — same shape; still exports `LineType`; `tool_asset_item_id` field remains on the row type for backward compat with existing data but is never populated by user action anymore (always `null` on new rows).

- [ ] **Step 1: Read the current editor to lock in the exact lines**

Run: `sed -n '215,270p' src/components/purchase/PoLineItemsEditor.tsx`
Expected: See the `isInventory = lineType !== 'tools'` branch that decides between `CascadeInventorySelector` and `ToolAssetLookup`.

- [ ] **Step 2: Remove the ToolAssetLookup import**

Edit line 1-14 (the import block). Delete the line:
```typescript
import { ToolAssetLookup, ToolAssetLookupResult } from './ToolAssetLookup'
```

If `ToolAssetLookupResult` is used elsewhere in this file (search first), delete those uses in later steps. Currently used in `handleToolSelect` — that function is removed in step 4.

- [ ] **Step 3: Remove the `handleToolSelect` handler**

Search for `function handleToolSelect(` (or `const handleToolSelect =`). Delete the whole function body. Also delete any code that populates `tool_asset_item_id` on user selection (the tool-picker onChange path).

- [ ] **Step 4: Replace the picker branch with a single CascadeInventorySelector**

At line 218-263, replace:
```tsx
{rows.map((row) => {
  const isInventory = lineType !== 'tools'
  return (
    <div key={row._key} className="px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="h-9 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
              {row.item_name || '—'}
            </div>
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
              onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
            />
          ) : (
            <ToolAssetLookup
              value={
                row.tool_asset_item_id
                  ? {
                      tool_asset_item_id: row.tool_asset_item_id,
                      item_name: row.item_name,
                    }
                  : null
              }
              onChange={(item) => handleToolSelect(row._key, item)}
            />
          )}
        </div>
```

with:
```tsx
{rows.map((row) => {
  return (
    <div key={row._key} className="px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="h-9 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
              {row.item_name || '—'}
            </div>
          ) : (
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
              onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
            />
          )}
        </div>
```

- [ ] **Step 5: Confirm `makeRow` still returns a valid `LineItemRow`**

Run: `sed -n '55,75p' src/components/purchase/PoLineItemsEditor.tsx`
Expected: `makeRow` should still return a row with `brand_variant_id: null` and `tool_asset_item_id: null`. Do NOT remove `tool_asset_item_id` from `makeRow` yet — old PO records still have that field and TS types still expose it until Phase 3. Leaving it as `null` on new rows is correct.

- [ ] **Step 6: Typecheck the file**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep "PoLineItemsEditor" | head -5`
Expected: no output (no errors from this file). Pre-existing errors elsewhere are OK — they're not this task's concern.

- [ ] **Step 7: Ask the user to smoke-test in the browser**

Message the user:
> "PoLineItemsEditor updated. Please open a PO create/edit page in staging, add a 'Tools & Assets' line, and confirm the cascading picker appears with SKU/Unit/Unit Price auto-filling from the picked variant."

Do NOT commit until the user confirms.

- [ ] **Step 8: Commit**

```bash
git add src/components/purchase/PoLineItemsEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(po): route Tools & Assets through CascadeInventorySelector

Tools line-items now use the same cascade picker as products/spare-parts/
consumables. useInventoryTree already handles type='tools', so this is
just a UI unification. SKU/unit/cost auto-fill from the picked variant
instead of staying blank.

ToolAssetLookup + handleToolSelect removed from the editor. The row
type still carries tool_asset_item_id for backward-compat with existing
PO records; Phase 3 will drop the column.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Simplify SoLineItemsEditor — same treatment

**Files:**
- Modify: `src/components/sales/SoLineItemsEditor.tsx`

**Interfaces:**
- Consumes: `CascadeInventorySelector` (already `lineType='tools'`-capable)
- Produces: unchanged public API. `SoLineItemRow` still carries `tool_asset_item_id: null` until Phase 3.

- [ ] **Step 1: Locate the picker branch**

Run: `grep -n "ToolAssetLookup\|isInventory\|tool_asset_item_id" src/components/sales/SoLineItemsEditor.tsx`
Expected: One or two `ToolAssetLookup` render sites and helper calls, mirroring the PO editor structure.

- [ ] **Step 2: Delete the ToolAssetLookup import**

Edit the import block at the top of the file. Remove:
```typescript
import { ToolAssetLookup } from '@/components/purchase/ToolAssetLookup'
```
(Path may vary — grep confirmed where it's imported from.)

- [ ] **Step 3: Delete the `handleToolSelect`/tool-select handler if present**

Search for a tool-select handler analogous to Task 1's. Remove it and any `tool_asset_item_id`-populating code.

- [ ] **Step 4: Replace the picker branch**

Same pattern as Task 1 Step 4. The SO editor's picker branch mirrors PO's — replace the `isInventory ? Cascade... : ToolAsset...` conditional with just the Cascade branch. Preserve the SO-specific `onChange` handler (`handleInventorySelect` or whatever it's called in this file) unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep "SoLineItemsEditor" | head -5`
Expected: no output.

- [ ] **Step 6: Ask the user to smoke-test SO create/edit**

Message the user:
> "SoLineItemsEditor updated. Please open an SO create/edit page in staging, add a 'Tools & Assets' line, and confirm the cascading picker works and pre-fills SKU/Unit/Unit Price."

- [ ] **Step 7: Commit after confirmation**

```bash
git add src/components/sales/SoLineItemsEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(so): route Tools & Assets through CascadeInventorySelector

Mirror of the PO editor change: SO tool line-items now use the same
cascade picker as products/spare-parts/consumables.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Clean tool_asset_item_id out of PO/SO create+edit page payloads

**Files:**
- Modify: `src/app/(dashboard)/purchase/create-po/page.tsx`
- Modify: `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx`
- Modify: `src/app/(dashboard)/sales/create-so/page.tsx`
- Modify: `src/app/(dashboard)/sales/edit-so/[id]/page.tsx`

**Interfaces:**
- Consumes: `LineItemRow` from PoLineItemsEditor (still exposes `tool_asset_item_id` field, always `null` after Task 1)
- Produces: PO/SO insert payloads no longer send `tool_asset_item_id` (or send `null`, which is equivalent since the column is nullable). `line_type` derivation switches from `li.tool_asset_item_id ? 'tools' : 'products'` to reading the category ancestry.

- [ ] **Step 1: Simplify create-po page filters**

At `src/app/(dashboard)/purchase/create-po/page.tsx:136` and `:178`, current code:
```typescript
const missingItems = lineItems.filter((li) => !li.brand_variant_id && !li.tool_asset_item_id)
const validCount = lineItems.filter((li) => li.brand_variant_id || li.tool_asset_item_id).length
```

Replace with:
```typescript
const missingItems = lineItems.filter((li) => !li.brand_variant_id)
const validCount = lineItems.filter((li) => li.brand_variant_id).length
```

At `src/app/(dashboard)/purchase/create-po/page.tsx:120-122`, current payload map:
```typescript
line_items: lineItems.map(({ item_name, sku, qty, unit, unit_price, total_price, brand_variant_id, tool_asset_item_id, free_qty }) => ({
  item_name, sku, qty, unit, unit_price, total_price, brand_variant_id, tool_asset_item_id, free_qty,
})),
```

Remove `tool_asset_item_id` from both the destructure and the object literal.

- [ ] **Step 2: Simplify edit-po page — line_type derivation**

At `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx:55`:
```typescript
line_type: (li.tool_asset_item_id ? 'tools' : 'products') as LineType,
```

Replace with a category-ancestry lookup. The full replacement depends on what data `li` carries in this page — check by running `sed -n '45,70p' src/app/(dashboard)/purchase/edit-po/[id]/page.tsx`. If `li` already has a joined `inventory_brand_variants.inventory_items.inventory_categories.type` field, use it:
```typescript
line_type: (li.inventory_brand_variants?.inventory_items?.inventory_categories?.type ?? 'products') as LineType,
```

If not, add the join to the SELECT query that loads PO lines (search for `.select(` and `po_line_items` in this file) so `inventory_categories.type` is available. Task 1's `LineType` union already includes `'tools'` so no type widening needed.

- [ ] **Step 3: Remove tool_asset_item_id from edit-po payloads**

At `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx:116`, `:159-161`, and `:225`, remove `tool_asset_item_id` from the destructure and from the object literal (same pattern as create-po step 1).

At `:129` and `:170`, simplify the filters (same pattern as create-po step 1).

- [ ] **Step 4: Repeat for create-so and edit-so**

`src/app/(dashboard)/sales/create-so/page.tsx:154`:
```typescript
const missingItems = lineItems.filter((li) => !li.brand_variant_id && !li.tool_asset_item_id)
```
→
```typescript
const missingItems = lineItems.filter((li) => !li.brand_variant_id)
```

`src/app/(dashboard)/sales/edit-so/[id]/page.tsx:77`: remove `tool_asset_item_id` from the mapped object.

- [ ] **Step 5: Typecheck the whole app**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(create-po|edit-po|create-so|edit-so)" | head -10`
Expected: no output from these four files.

- [ ] **Step 6: Ask the user to smoke-test full PO and SO create + edit flows**

Message the user:
> "PO/SO create + edit pages updated. Please:
> 1. Create a new PO with lines from Products, Spare Parts, Consumables, and Tools categories → save → verify all four save correctly and reload correctly.
> 2. Same for a new SO.
> 3. Open an existing PO with legacy tool_asset_item_id rows → verify it still displays.
> 
> Report any issues before we commit."

- [ ] **Step 7: Commit after confirmation**

```bash
git add src/app/\(dashboard\)/purchase/create-po/page.tsx \
        src/app/\(dashboard\)/purchase/edit-po/\[id\]/page.tsx \
        src/app/\(dashboard\)/sales/create-so/page.tsx \
        src/app/\(dashboard\)/sales/edit-so/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
refactor(po,so): stop populating tool_asset_item_id in create/edit flows

Editors no longer expose a tool-specific FK path — Tools & Assets rows
carry a brand_variant_id like every other line type. line_type on
existing records is derived from the joined category type instead of
the presence of tool_asset_item_id. The column stays in the DB for
existing data; Phase 3 drops it.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Data Migration

Goal: Every historical `tool_asset_item_id` reference across the purchase chain is repointed to a `brand_variant_id` of a matching `inventory_brand_variants` row. After Phase 2, no application data depends on the `tool_asset_items` table.

**IMPORTANT — prerequisite:** Prod must be unpaused before running Phase 2 there. Staging has zero rows in `tool_asset_items` (empty table from the 2026-07-22 restore), so Phase 2 is a no-op on staging. Test the migration on staging anyway to confirm it applies cleanly against an empty state.

---

### Task 4: Write the tool_asset → inventory migration

**Files:**
- Create: `supabase/migrations/20260723120000_migrate_tool_asset_items_to_inventory.sql`
- Create: `supabase/migrations-staging/20260723120000_migrate_tool_asset_items_to_inventory.sql`

**Interfaces:**
- Consumes: `tool_asset_items`, `inventory_categories` (with `type='tools'`), `inventory_items`, `inventory_brand_variants`, and the six purchase-chain tables (`po_line_items`, `po_version_lines`, `receival_items`, `return_lines`, `sale_order_lines`, `sale_delivery_lines`).
- Produces: For each `tool_asset_items.id` X, a matching `inventory_items` row and a `inventory_brand_variants` row exist; every `tool_asset_item_id = X` in the six purchase-chain tables becomes `brand_variant_id = <new_variant_id>` and `tool_asset_item_id = NULL`.

- [ ] **Step 1: Draft the migration**

Write to `supabase/migrations/20260723120000_migrate_tool_asset_items_to_inventory.sql`:

```sql
-- Phase 2 of the tools→inventory merge.
-- For every tool_asset_items row, ensure a matching inventory_items +
-- inventory_brand_variants exists, then repoint the purchase chain.
-- Idempotent: safe to run against an empty tool_asset_items (staging).

BEGIN;

-- 1. Ensure a "Tools & Assets" top-level category exists for the tools type.
INSERT INTO public.inventory_categories (name_en, type, sort_order)
SELECT 'Tools & Assets (Migrated)', 'tools', 999
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_categories
  WHERE type = 'tools' AND parent_id IS NULL
);

-- 2. For each tool_asset_items row, create matching inventory_items +
--    a single inventory_brand_variants (SKU derived from tool id).
--    Track mapping in a temp table so we can update purchase chain FKs.

CREATE TEMP TABLE _tool_variant_map (
  tool_asset_item_id uuid PRIMARY KEY,
  brand_variant_id   uuid NOT NULL
);

WITH root_cat AS (
  SELECT id AS cat_id
  FROM public.inventory_categories
  WHERE type = 'tools' AND parent_id IS NULL
  ORDER BY sort_order, name_en
  LIMIT 1
),
new_items AS (
  INSERT INTO public.inventory_items (category_id, name_en, name_ar)
  SELECT
    COALESCE(tai.category_id, (SELECT cat_id FROM root_cat)),
    tai.name_en,
    tai.name_ar
  FROM public.tool_asset_items tai
  WHERE NOT EXISTS (
    -- avoid re-inserting if we already migrated this row (idempotency)
    SELECT 1 FROM public.inventory_items ii
    WHERE ii.name_en = tai.name_en
      AND ii.category_id = COALESCE(tai.category_id, (SELECT cat_id FROM root_cat))
  )
  RETURNING id, name_en, category_id
),
new_variants AS (
  INSERT INTO public.inventory_brand_variants (item_id, brand, code, cost_price, selling_price)
  SELECT ni.id, 'Migrated', 'TOOL-' || SUBSTRING(ni.id::text, 1, 8), 0, 0
  FROM new_items ni
  RETURNING id, item_id
)
INSERT INTO _tool_variant_map (tool_asset_item_id, brand_variant_id)
SELECT
  tai.id,
  nv.id
FROM public.tool_asset_items tai
JOIN public.inventory_items ii
  ON ii.name_en = tai.name_en
 AND ii.category_id = COALESCE(tai.category_id, (SELECT cat_id FROM root_cat))
JOIN public.inventory_brand_variants nv ON nv.item_id = ii.id;

-- 3. Repoint the purchase chain — six tables.
UPDATE public.po_line_items       SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.po_line_items.tool_asset_item_id       = m.tool_asset_item_id;

UPDATE public.po_version_lines    SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.po_version_lines.tool_asset_item_id    = m.tool_asset_item_id;

UPDATE public.receival_items      SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.receival_items.tool_asset_item_id      = m.tool_asset_item_id;

UPDATE public.return_lines        SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.return_lines.tool_asset_item_id        = m.tool_asset_item_id;

UPDATE public.sale_order_lines    SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.sale_order_lines.tool_asset_item_id    = m.tool_asset_item_id;

UPDATE public.sale_delivery_lines SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.sale_delivery_lines.tool_asset_item_id = m.tool_asset_item_id;

-- 4. Sanity: after this migration, no tool_asset_item_id anywhere should
--    reference a tool_asset_items row (they've all been repointed).
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT 1 FROM public.po_line_items       WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.po_version_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.receival_items      WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.return_lines        WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_order_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_delivery_lines WHERE tool_asset_item_id IS NOT NULL
  ) x;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rows still have tool_asset_item_id set', v_remaining;
  END IF;
END $$;

DROP TABLE _tool_variant_map;

COMMIT;
```

- [ ] **Step 2: Mirror to migrations-staging/**

Run:
```bash
cp supabase/migrations/20260723120000_migrate_tool_asset_items_to_inventory.sql \
   supabase/migrations-staging/20260723120000_migrate_tool_asset_items_to_inventory.sql
```

- [ ] **Step 3: Dry-run against staging**

Run: `npx supabase db push --dry-run 2>&1 | tail -20`
Expected: The output shows the migration would be applied and lists it as the only pending migration. No errors.

- [ ] **Step 4: Apply to staging**

Run: `npx supabase db push`
Expected: `Applying migration 20260723120000_migrate_tool_asset_items_to_inventory.sql... Finished supabase db push.`

Staging has zero `tool_asset_items` rows, so the migration is effectively a no-op — but the sanity check block at the end still runs and confirms zero orphans.

- [ ] **Step 5: Verify with a query**

Run:
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { count } = await supa.from('inventory_items').select('*', { count: 'exact', head: true }).eq('category_id', /* tools root id */);
  console.log('inventory tool items:', count);
})();
" 2>&1 | head -3
```

Or via the Supabase dashboard SQL editor. Confirm no rows have `tool_asset_item_id` set anymore.

- [ ] **Step 6: Ask the user to confirm before committing**

Message the user:
> "Data migration applied to staging (no-op there). The same migration will run against prod when prod is unpaused. Confirm you want to commit."

- [ ] **Step 7: Commit after confirmation**

```bash
git add supabase/migrations/20260723120000_migrate_tool_asset_items_to_inventory.sql \
        supabase/migrations-staging/20260723120000_migrate_tool_asset_items_to_inventory.sql
git commit -m "$(cat <<'EOF'
feat(db): migrate tool_asset_items to inventory + repoint purchase chain

Phase 2 of the tools→inventory merge. For each tool_asset_items row,
creates a matching inventory_items + inventory_brand_variants; then
repoints every tool_asset_item_id in po_line_items, po_version_lines,
receival_items, return_lines, sale_order_lines, sale_delivery_lines
to the new brand_variant_id and nulls the old column.

Idempotent — the item-insert uses NOT EXISTS on (name_en, category_id).
Ends with a sanity check that fails the transaction if any row still
carries a tool_asset_item_id after the six UPDATEs.

Applied to staging (empty tool_asset_items, no-op). Prod runs when
unpaused.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Cleanup

Goal: Drop the `tool_asset_items` table, the six `tool_asset_item_id` FK columns, and the last remaining code that referenced them. Regen types.

---

### Task 5: Drop tool_asset_item_id columns + tool_asset_items table

**Files:**
- Create: `supabase/migrations/20260723130000_drop_tool_asset_items_and_columns.sql`
- Create: `supabase/migrations-staging/20260723130000_drop_tool_asset_items_and_columns.sql`

**Interfaces:**
- Consumes: Phase 2's migration must have run successfully (sanity check passed).
- Produces: `tool_asset_items` table is gone, six `tool_asset_item_id` columns are gone. `database.types.ts` needs regeneration after this task.

- [ ] **Step 1: Write the drop migration**

Write to `supabase/migrations/20260723130000_drop_tool_asset_items_and_columns.sql`:

```sql
-- Phase 3 of the tools→inventory merge.
-- All tool_asset_item_id data was repointed to brand_variant_id in Phase 2.
-- Drop the six columns and the shadow catalog table.

BEGIN;

-- Extra safety: refuse to drop if any tool_asset_item_id is still set.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT 1 FROM public.po_line_items       WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.po_version_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.receival_items      WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.return_lines        WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_order_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_delivery_lines WHERE tool_asset_item_id IS NOT NULL
  ) x;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Refusing to drop: % rows still have tool_asset_item_id set. Run the Phase 2 migration first.', v_remaining;
  END IF;
END $$;

ALTER TABLE public.po_line_items       DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.po_version_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.receival_items      DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.return_lines        DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.sale_order_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.sale_delivery_lines DROP COLUMN IF EXISTS tool_asset_item_id;

DROP TABLE IF EXISTS public.tool_asset_items CASCADE;

-- Note: tool_asset_units, tool_status, tool_condition are NOT dropped.
-- Those track individual physical units (serial numbers, condition) and
-- are a separate concept from the item catalog we're merging.

COMMIT;
```

- [ ] **Step 2: Mirror to staging folder**

```bash
cp supabase/migrations/20260723130000_drop_tool_asset_items_and_columns.sql \
   supabase/migrations-staging/20260723130000_drop_tool_asset_items_and_columns.sql
```

- [ ] **Step 3: Apply to staging**

Run: `npx supabase db push`
Expected: `Applying migration 20260723130000_drop_tool_asset_items_and_columns.sql... Finished supabase db push.`

- [ ] **Step 4: Regen database.types.ts**

Run:
```bash
npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts
```

Then re-append the four helper aliases (the CLI strips them):
```bash
node -e "
const fs=require('fs');
const path='src/types/database.types.ts';
let s=fs.readFileSync(path,'utf8');
const idx=s.indexOf('} as const');
s = s.slice(0, idx + '} as const'.length) + '\n\nexport type AllTables = Database[\"public\"][\"Tables\"]\nexport type DBTable<T extends keyof AllTables> = AllTables[T][\"Row\"]\nexport type DBInsert<T extends keyof AllTables> = AllTables[T][\"Insert\"]\nexport type DBUpdate<T extends keyof AllTables> = AllTables[T][\"Update\"]\n';
fs.writeFileSync(path, s);
"
```

Verify:
```bash
grep -c "tool_asset_items:" src/types/database.types.ts
```
Expected: `0`.

Verify:
```bash
tail -5 src/types/database.types.ts
```
Expected: The four `AllTables`/`DBTable`/`DBInsert`/`DBUpdate` alias lines are present.

- [ ] **Step 5: Typecheck the whole app**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -iE "tool_asset" | head -10`
Expected: no output. Any remaining references to `tool_asset_item_id` in TS code will now surface as compile errors.

If errors appear, they point to code that still references the dropped column — fix inline in this task (usually a leftover in a hook or a PDF template).

- [ ] **Step 6: Ask the user to smoke-test one last time**

Message the user:
> "DB schema now clean. Please:
> 1. Open a PO with tool line items in staging → confirm it loads.
> 2. Create a new PO with a Tools & Assets line → confirm save + reload.
> 3. Same for one SO.
> 
> Report any 404s or errors."

- [ ] **Step 7: Commit after confirmation**

```bash
git add supabase/migrations/20260723130000_drop_tool_asset_items_and_columns.sql \
        supabase/migrations-staging/20260723130000_drop_tool_asset_items_and_columns.sql \
        src/types/database.types.ts
git commit -m "$(cat <<'EOF'
chore(db): drop tool_asset_items + six tool_asset_item_id columns

Phase 3 of the tools→inventory merge. Safe now that Phase 2's data
migration nulled every tool_asset_item_id. Migration re-verifies
that with a DO $$ block before dropping.

tool_asset_units, tool_status, tool_condition remain — they track
individual physical unit lifecycles, not item catalog, and are outside
this merge's scope.

database.types.ts regenerated to reflect the dropped table + columns.
Helper aliases re-appended.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Delete ToolAssetLookup.tsx and mop up TS references

**Files:**
- Delete: `src/components/purchase/ToolAssetLookup.tsx`
- Modify: any file that still imports it (should be none after Tasks 1 & 2)
- Modify: `src/components/purchase/PoLineItemsEditor.tsx` — remove `tool_asset_item_id: null` from `makeRow` and from the `LineItemRow` type
- Modify: `src/components/sales/SoLineItemsEditor.tsx` — same

**Interfaces:**
- Consumes: nothing (this is pure cleanup)
- Produces: `LineItemRow` no longer has `tool_asset_item_id`. `ToolAssetLookup` no longer exists.

- [ ] **Step 1: Confirm no importers of ToolAssetLookup remain**

Run: `grep -rn "ToolAssetLookup" src/ 2>&1`
Expected: no output. If anything comes back (other than the file itself), fix in this task.

- [ ] **Step 2: Delete the file**

Run: `rm src/components/purchase/ToolAssetLookup.tsx`

- [ ] **Step 3: Remove tool_asset_item_id from LineItemRow in PoLineItemsEditor.tsx**

Locate the `LineItemRow` type definition near the top of the file. Remove the `tool_asset_item_id?: string | null` (or similar) field. Then remove it from `makeRow`'s return object.

- [ ] **Step 4: Same for SoLineItemsEditor.tsx**

Locate the `SoLineItemRow` type (or equivalent). Remove `tool_asset_item_id`. Then remove from the equivalent `makeRow`.

- [ ] **Step 5: Search for any straggler references**

Run: `grep -rn "tool_asset_item_id" src/ 2>&1 | head`
Expected: no output. If anything remains in a hook, RPC caller, or PDF template — remove it.

Common places to check:
- `src/hooks/usePurchaseOrders.ts`
- `src/hooks/useSaleOrders.ts`
- `src/hooks/useReceivals.ts`
- `src/lib/purchase/generate-po-pdf.ts`
- `src/lib/poVersionHelper.ts`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -iE "tool_asset" | head -10`
Expected: no output.

- [ ] **Step 7: Ask the user to run the app one final time**

Message the user:
> "Cleanup complete. Please do one final smoke test on PO and SO create+edit + view. Report any regressions before final commit."

- [ ] **Step 8: Commit after confirmation**

```bash
git add -A src/
git commit -m "$(cat <<'EOF'
chore(ui): remove ToolAssetLookup + tool_asset_item_id from types

Final cleanup pass for the tools→inventory merge. ToolAssetLookup.tsx
is deleted. LineItemRow / SoLineItemRow no longer carry the field.
Straggler references in hooks and PDF templates are removed.

The Tools & Assets flow now moves through inventory end-to-end.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Testing Strategy

No test infrastructure exists for these editors. Verification is a **manual smoke suite** run by the user in the staging browser after each task's commit-gate step:

**Phase 1 smoke (Tasks 1–3):**
1. PO create — add one line from each of the four categories (Products, Spare Parts, Consumables, Tools & Assets). Confirm SKU/Unit/Unit Price auto-fill on all four. Save. Reopen. Confirm all four rows persist.
2. SO create — same.
3. PO edit — open one existing PO that has tool lines (if any). Confirm rows still render.
4. SO edit — same.

**Phase 2 smoke (Task 4):**
1. Same suite as Phase 1 — no user-visible change on staging (empty tool_asset_items). Sanity check inside the migration will fail loudly if repoint left orphans.

**Phase 3 smoke (Tasks 5–6):**
1. Same suite as Phase 1 — no user-visible change; the columns are gone but every reference has been removed from code first.
2. `npx tsc --noEmit --skipLibCheck` — must return zero `tool_asset` errors.

**Prod verification (deferred until prod is unpaused):**
1. Before Phase 2 runs on prod, snapshot the mapping table for rollback: `SELECT id, name_en, category_id FROM tool_asset_items;` — save the CSV.
2. After Phase 2 runs on prod, spot-check five random PO/SO rows that used to have `tool_asset_item_id` set — confirm they now show the corresponding inventory item in the UI.
3. Only after that: apply Phase 3 to prod.

---

# Risks & Rollback

| Risk | Mitigation |
|---|---|
| Prod has `tool_asset_items` rows with no matching inventory record; the migration's LEFT JOIN skips them and leaves purchase rows orphaned. | The Phase 2 script's final `DO $$` block raises an exception if any purchase-chain row still has a non-null `tool_asset_item_id`. The transaction rolls back and nothing is dropped. Fix by manually inserting the missing inventory row and re-running. |
| The auto-created `inventory_items` rows have `cost_price=0, selling_price=0` — costs are lost. | Post-migration, the purchase-chain `unit_price` on each row is preserved; only the *default* on the variant is zero. Users can update the default from the master-data Tools & Assets tab after migration. |
| Phase 1 breaks existing PO/SO edit pages that expect `tool_asset_item_id` on the row. | Task 1's row type keeps the field (nullable) until Phase 3. Task 3 changes the derived `line_type` to use category ancestry — this is the only real behaviour change and it's guarded by the smoke suite. |
| Someone commits to `feature/purchase-warehouse-core` after Phase 1 but before Phase 3 and reintroduces a `tool_asset_item_id` write. | Phase 3's Task 5 typecheck step will fail loudly. Fix on discovery. |
| Prod stays paused indefinitely; migrations pile up in `supabase/migrations/`. | Migrations are idempotent and safe to accumulate. No action needed until prod resumes; then a single `db push` applies all pending migrations in order. |

**Rollback per phase:**
- Phase 1 only: `git revert` the three commits. No DB changes.
- Phase 2: `git revert` and re-null `brand_variant_id` where `tool_asset_item_id IS NULL AND brand_variant_id IN (<snapshot>)`. Restore rows from the pre-migration snapshot.
- Phase 3: cannot roll back easily — the `tool_asset_items` table is gone. If needed, recreate from the CSV snapshot taken during Phase 2 prep, then restore the columns (`ALTER TABLE ... ADD COLUMN tool_asset_item_id uuid`). Not recommended; verify Phase 2 thoroughly before running Phase 3 against prod.

---

# Self-Review Checklist

- ✅ **Spec coverage:** Every element of the sketch is covered (extend selector [handled by existing infra], simplify editors [Tasks 1–2], update pages [Task 3], data migration [Task 4], drop columns [Task 5], drop table + delete component [Tasks 5–6], regen types [Task 5]).
- ✅ **Placeholder scan:** No "TBD" / "similar to Task N" / "add appropriate error handling". Every step has concrete commands or code.
- ✅ **Type consistency:** `LineType`, `LineItemRow`, `tool_asset_item_id`, `brand_variant_id` naming is consistent across every task. Task 1 keeps the row field; Task 6 removes it after DB drop — order matters and is explicit.
- ✅ **No test infra fiction:** The plan explicitly acknowledges no test suite exists and uses manual smoke testing gated by the user. It does not invent tests.
- ✅ **Prod-paused handled:** Every task with a DB step calls out staging-only application and defers prod until it's unpaused.
