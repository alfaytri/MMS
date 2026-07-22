# Tools & Assets → Inventory Merge — Follow-up: Retire `tool_asset_items`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the tools→inventory merge started in [2026-07-22-tools-inventory-merge.md](./2026-07-22-tools-inventory-merge.md). Rewrite the four code paths that still read/write `tool_asset_items` so they use `inventory_items` (+ `inventory_brand_variants` where needed), then drop the shadow `tool_asset_items` table and the six `tool_asset_item_id` FK columns for good.

**Where we left off:**
The line-item picker + data migration (Phase 1 + 2 of the original plan) landed. Phase 3 (drop `tool_asset_items`) was attempted and rolled back because four features still depended on it:

1. **Master Data → Tools & Assets → Add Tool button** (`ToolAssetItemEditDialog` create/update mutation)
2. **Master Data → Tools & Assets → Edit pencil** (same dialog, `useUpdate*` path)
3. **Teams → Team Tools sheet** (`TeamToolsSheet` reads `useToolAssetItems()` for the type dropdown; `useAvailableToolUnits` joins `tool_asset_items` for item name)
4. **Audit log entity resolver** (`useAuditEntityNames`: `tool_asset → tool_asset_items`)

Today's remediation also seeded 139 tool items into `inventory_items` (already present pre-plan) and 1298 unit rows into `tool_asset_units` with `item_id` pointing at `inventory_items(id)` — and swapped the read path in `ToolCategoryRow` from `useToolAssetItemsByCategory` to `useInventoryItemsByCategory`. So today's state:

- **Reads:** all from `inventory_items` ✅
- **Writes (Add/Edit tool):** still to `tool_asset_items` ❌
- **Teams tool assignment:** reads `tool_asset_items` for the picker ❌
- **Audit log:** points at `tool_asset_items` ❌
- **`tool_asset_units`:** already migrated — `item_id` FKs to `inventory_items(id)` ✅

**Tech Stack:** unchanged from the parent plan.

## Global Constraints

- **Every commit** must include both authors:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **Migrations mirror to both folders** — `supabase/migrations/` AND `supabase/migrations-staging/`.
- **All CREATE/DROP/ALTER inside `IF EXISTS`/`IF NOT EXISTS` guards** — idempotent.
- **Regen types after every DB migration**: `npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts` then re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`).
- **No commits until the user confirms the change works.** Same rule as the parent plan.
- **Prod is paused.** All migrations apply to staging only. When prod unpauses, `supabase/migrations/` is picked up automatically in order.
- **No test infrastructure exists for these components.** Verification is manual browser smoke test + `tsc --noEmit --skipLibCheck`.
- **Feature stays behind normal code paths** — no feature flags.

---

## File Structure

**Modified (5 files):**
- `src/components/services/inventory/ToolAssetEditDialog.tsx` — `ToolAssetItemEditDialog` swaps to inventory hooks; `ToolAssetUnitEditDialog` unchanged
- `src/components/teams/dialogs/TeamToolsSheet.tsx` — swap type-dropdown data source
- `src/hooks/useTeams.ts` — `useAvailableToolUnits` join target changes from `tool_asset_items` → `inventory_items`
- `src/hooks/useAuditEntityNames.ts` — mapping entry `tool_asset` → `inventory_items`
- `src/components/services/inventory/ToolCategoryRow.tsx` — remove import of `ToolAssetItemEditDialog` unit-management flow if it changes API; and delete legacy hook imports

**Deleted (1 file):**
- `src/components/purchase/ToolAssetLookup.tsx` — already unused after Phase 1 of the parent plan

**Created (2 migration files, mirrored):**
- Phase 2: `supabase/migrations/YYYYMMDD100000_migrate_audit_log_tool_asset_ids.sql`
- Phase 2: `supabase/migrations/YYYYMMDD110000_drop_tool_asset_items_and_columns.sql`
- Plus the same two files under `supabase/migrations-staging/`

**Deleted from code (referenced in `useInventory.ts`):**
- `useToolAssetItems`, `useToolAssetItemsByCategory`, `useCreateToolAssetItem`, `useUpdateToolAssetItem`, and the `ToolAssetItem` type — no callers after Task 1+2.

**Untouched:**
- `useToolAssetUnits`, `useCreateToolAssetUnit`, `useUpdateToolAssetUnit`, `ToolAssetUnit` type — still needed; `tool_asset_units` table stays.
- `tool_asset_units` table + `tool_status` / `tool_condition` enums — unit tracking is the tools-only concept the plan intentionally preserves.

---

# Phase 1 — Code Migration

Goal: Every read AND write of tool catalog data goes through `inventory_items` / `inventory_brand_variants`. `tool_asset_items` still exists but no code touches it. Safe to drop in Phase 2.

---

### Task 1: Swap `ToolAssetItemEditDialog` to write to `inventory_items`

**Files:**
- Modify: `src/components/services/inventory/ToolAssetEditDialog.tsx`

**Interfaces:**
- Consumes: `useCreateInventoryItem`, `useUpdateInventoryItem` from `@/hooks/useInventory` (verify names — may already exist; if not, add them following the same pattern as `useCreateToolAssetItem`).
- Produces: When the Master Data `+ Add Tool` button is clicked, a row is inserted into `inventory_items` with `category_id` set and `name_en` / `name_ar` set. Also inserts a single default `inventory_brand_variants` row so the item is picker-selectable (pricing lives at the variant level in the merged model).

- [ ] **Step 1: Confirm `useCreateInventoryItem` / `useUpdateInventoryItem` exist**

  Run: `grep -n "export function useCreateInventoryItem\|export function useUpdateInventoryItem" src/hooks/useInventory.ts`

  If both hooks exist, proceed. If only one or neither exists, add the missing ones — same shape as `useCreateToolAssetItem` but writing to `inventory_items` and calling `logActivity` with `entity_type: 'inventory_item'`.

- [ ] **Step 2: Also create a default brand_variant on tool creation**

  Tools need at least one `inventory_brand_variants` row to appear in the cascade picker. Extend `useCreateInventoryItem` (or add `useCreateToolWithDefaultVariant`) so on create it also inserts a `inventory_brand_variants` row with `item_id=<new item id>`, `brand='Default'`, `code=null`, `cost_price=0`, `selling_price=0`. Wrap both inserts in the same mutation so failure of the second rolls back — use an RPC `create_inventory_item_with_default_variant(name_en, name_ar, category_id)` if simpler than client-side rollback logic.

  Suggested SQL for the RPC (write it as its own migration `YYYYMMDD090000_create_inventory_item_with_default_variant.sql`):

  ```sql
  CREATE OR REPLACE FUNCTION public.create_inventory_item_with_default_variant(
    p_name_en    text,
    p_name_ar    text,
    p_category_id uuid
  ) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE v_item_id uuid;
  BEGIN
    INSERT INTO public.inventory_items (name_en, name_ar, category_id)
    VALUES (p_name_en, p_name_ar, p_category_id)
    RETURNING id INTO v_item_id;

    INSERT INTO public.inventory_brand_variants (item_id, brand, cost_price, selling_price)
    VALUES (v_item_id, 'Default', 0, 0);

    RETURN v_item_id;
  END $$;
  ```

- [ ] **Step 3: Rewrite the imports + hook calls in `ToolAssetEditDialog.tsx`**

  Replace:
  ```typescript
  import {
    useCreateToolAssetItem, useUpdateToolAssetItem,
    useCreateToolAssetUnit, useUpdateToolAssetUnit,
    useStaffProfiles,
    type ToolAssetItem, type ToolAssetUnit,
  } from '@/hooks/useInventory'
  ```
  with:
  ```typescript
  import {
    useCreateInventoryItem, useUpdateInventoryItem,
    useCreateToolAssetUnit, useUpdateToolAssetUnit,
    useStaffProfiles,
    type InventoryItem, type ToolAssetUnit,
  } from '@/hooks/useInventory'
  ```

  In `ToolAssetItemEditDialog` change the `item?: ToolAssetItem | null` prop type to `item?: InventoryItem | null`. Change `useCreateToolAssetItem` → `useCreateInventoryItem` (which invokes the new RPC), `useUpdateToolAssetItem` → `useUpdateInventoryItem`.

  `ToolAssetUnitEditDialog` — no changes. It already writes to `tool_asset_units` (which is retained) with `item_id` = the `inventory_items.id` passed by the parent (already correct post-remap).

- [ ] **Step 4: Update `ToolCategoryRow.tsx` prop type**

  `ToolCategoryRow` passes `item={item}` where `item` came from `useInventoryItemsByCategory` (already returns `InventoryItem`). The dialog's prop type is now `InventoryItem` — matching. Confirm with:

  ```
  grep -n "ToolAssetItemEditDialog\|InventoryItem\|ToolAssetItem" src/components/services/inventory/ToolCategoryRow.tsx
  ```

  Also import `InventoryItem` instead of `ToolAssetItem` at the top.

- [ ] **Step 5: Typecheck the two files**

  ```
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(ToolAssetEditDialog|ToolCategoryRow)" | head -10
  ```

  Expected: empty.

- [ ] **Step 6: Ask the user to smoke-test**

  > "Master Data → Tools & Assets. Click `+` on any category → create a new tool → confirm it appears in the list. Then edit an existing tool → change the name → confirm it saves. Then expand a row and add a unit (serial number) → confirm the unit appears under the tool."

- [ ] **Step 7: Commit after user confirms**

  ```bash
  git add src/components/services/inventory/ToolAssetEditDialog.tsx \
          src/components/services/inventory/ToolCategoryRow.tsx \
          supabase/migrations/*_create_inventory_item_with_default_variant.sql \
          supabase/migrations-staging/*_create_inventory_item_with_default_variant.sql
  git commit -m "$(cat <<'EOF'
  refactor(inventory): rewrite ToolAssetItemEditDialog to write to inventory_items

  Add Tool / Edit Tool on the Master Data → Tools & Assets tab now writes to
  inventory_items (+ a default brand_variant via the new RPC
  create_inventory_item_with_default_variant) instead of the legacy
  tool_asset_items table. Unit-management dialog untouched — units still live
  in tool_asset_units with item_id → inventory_items(id).

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Point `TeamToolsSheet` + `useAvailableToolUnits` at inventory

**Files:**
- Modify: `src/components/teams/dialogs/TeamToolsSheet.tsx`
- Modify: `src/hooks/useTeams.ts`

**Interfaces:**
- Consumes: `useInventoryItems(categoryType='tools')` (existing hook in `useInventory.ts`) or `useInventoryItemsFlat()` filtered client-side. Pick whichever returns the flat list of tool items with names + ids.
- Produces: Team → Tool sheet shows the same tool list as the Master Data page. The unit dropdown now joins `tool_asset_units → inventory_items` instead of `tool_asset_units → tool_asset_items`.

- [ ] **Step 1: Swap the tool-type dropdown data source**

  In `TeamToolsSheet.tsx` at line 21, replace:
  ```typescript
  import { useToolAssetItems } from '@/hooks/useInventory'
  ```
  with:
  ```typescript
  import { useInventoryItems } from '@/hooks/useInventory'
  ```

  At line 40, replace:
  ```typescript
  const { data: toolItems = [] } = useToolAssetItems()
  ```
  with:
  ```typescript
  const { data: toolItems = [] } = useInventoryItems('tools')
  ```

  Check the shape returned by `useInventoryItems('tools')` — the dropdown uses `item.id` and `item.name_en`. Both fields exist on `inventory_items` so no other edits needed.

- [ ] **Step 2: Rewrite the join in `useAvailableToolUnits`**

  In `src/hooks/useTeams.ts` at line 288, replace:
  ```typescript
  .select('id, serial_number, brand, condition, status, item_id, item:tool_asset_items(id, name_en, name_ar)')
  ```
  with:
  ```typescript
  .select('id, serial_number, brand, condition, status, item_id, item:inventory_items(id, name_en, name_ar)')
  ```

  Also search for any other join into `tool_asset_items` inside `useTeams.ts` (look for `tool_assignments → tool_asset_units → tool_asset_items` chains — the `ToolAssignment` shape's `tool_unit.item` type will need the join swapped too). Update the TS type of `ToolAssignment['tool_unit']['item']` if it references a `tool_asset_items` shape.

- [ ] **Step 3: Typecheck**

  ```
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(TeamToolsSheet|useTeams)" | head -10
  ```

  Expected: empty. If the join-shape type is auto-inferred, this should just work.

- [ ] **Step 4: Ask the user to smoke-test**

  > "Master Data → Teams → open a team → Tools sheet on the right. Confirm the tool-type dropdown lists inventory tools (139 items). Pick a tool → confirm available units appear in the second dropdown. Assign a unit → confirm it appears in the assignments list at the top. Remove the assignment → confirm it disappears."

- [ ] **Step 5: Commit after user confirms**

  ```bash
  git add src/components/teams/dialogs/TeamToolsSheet.tsx src/hooks/useTeams.ts
  git commit -m "$(cat <<'EOF'
  refactor(teams): point Team Tools sheet at inventory_items

  Tool-type dropdown now reads from useInventoryItems('tools') instead of
  useToolAssetItems (which queried the legacy catalog). useAvailableToolUnits
  joins tool_asset_units → inventory_items for the item name — matches the
  post-remap FK.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: Update `useAuditEntityNames` to resolve tool audit entries against inventory

**Files:**
- Modify: `src/hooks/useAuditEntityNames.ts`
- Create: `supabase/migrations/YYYYMMDD120000_remap_audit_log_tool_asset_entity_ids.sql`

**Interfaces:**
- Consumes: nothing (this is a lookup mapping).
- Produces: Historical audit entries with `entity_type: 'tool_asset'` resolve to the correct current inventory item name. Existing `entity_id` values in audit rows point at old `tool_asset_items.id` — need to remap them to the corresponding `inventory_items.id` using the same ordinal-pair strategy used for `tool_asset_units` in `20260723220000_remap_tool_asset_units_to_inventory.sql`.

- [ ] **Step 1: Write the audit-log remap migration**

  Mirror the pattern from `20260723220000` (same base_name + row_number pairing). Write to `supabase/migrations/YYYYMMDD120000_remap_audit_log_tool_asset_entity_ids.sql`:

  ```sql
  -- Remap audit_log.entity_id for entity_type='tool_asset' from
  -- tool_asset_items(id) to the corresponding inventory_items(id).
  -- Uses the same (category_id, base_name, row_number) pairing as the
  -- tool_asset_units remap on 2026-07-23.

  BEGIN;

  WITH numbered_tai AS (
    SELECT id, category_id, name_en,
           ROW_NUMBER() OVER (PARTITION BY category_id, name_en ORDER BY id) AS rn
    FROM public.tool_asset_items
  ),
  numbered_inv AS (
    SELECT ii.id AS inv_id, ii.category_id,
           SPLIT_PART(ii.name_en, ' — ', 1) AS base_name,
           ROW_NUMBER() OVER (
             PARTITION BY ii.category_id, SPLIT_PART(ii.name_en, ' — ', 1)
             ORDER BY ii.id
           ) AS rn
    FROM public.inventory_items ii
    JOIN public.inventory_categories ic ON ic.id = ii.category_id
    WHERE ic.type = 'tools'
  ),
  mapping AS (
    SELECT n.id::text AS tai_id, i.inv_id::text AS inv_id
    FROM numbered_tai n
    JOIN numbered_inv i
      ON i.category_id = n.category_id
     AND i.base_name   = n.name_en
     AND i.rn          = n.rn
  )
  UPDATE public.audit_log a
  SET    entity_id = m.inv_id,
         entity_type = 'inventory_item'
  FROM   mapping m
  WHERE  a.entity_type = 'tool_asset'
    AND  a.entity_id   = m.tai_id;

  DO $$
  DECLARE v_orphans INT;
  BEGIN
    SELECT COUNT(*) INTO v_orphans FROM public.audit_log
      WHERE entity_type = 'tool_asset';
    IF v_orphans > 0 THEN
      RAISE NOTICE '% audit_log rows still tagged entity_type=tool_asset (unmapped); leaving in place', v_orphans;
    END IF;
  END $$;

  COMMIT;
  ```

  Mirror to `supabase/migrations-staging/`.

- [ ] **Step 2: Apply the migration**

  ```
  npx supabase db push
  ```

- [ ] **Step 3: Remove the `tool_asset` entry from `useAuditEntityNames.ts`**

  In `src/hooks/useAuditEntityNames.ts`, delete the line:
  ```typescript
  tool_asset: { table: 'tool_asset_items', nameCol: 'name' },
  ```

  Historical entries have already been retagged as `entity_type='inventory_item'` by the migration, so they'll resolve via the existing `item` entry (`{ table: 'inventory_items', nameCol: 'name_en' }`) — confirm that entry exists; if the existing key is different (`item` vs `inventory_item`), add whichever the migration wrote as `entity_type`.

- [ ] **Step 4: Verify audit log renders**

  Ask the user:
  > "Open Audit Log page. Filter for tool-related entries (or scroll to old ones). Confirm the entity name column shows an inventory-item name, not `—` or a raw UUID."

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useAuditEntityNames.ts \
          supabase/migrations/*_remap_audit_log_tool_asset_entity_ids.sql \
          supabase/migrations-staging/*_remap_audit_log_tool_asset_entity_ids.sql
  git commit -m "$(cat <<'EOF'
  refactor(audit): remap tool_asset audit entries to inventory_item

  Existing audit_log rows with entity_type='tool_asset' had entity_ids
  pointing at tool_asset_items which will be dropped in Phase 2.
  Migration remaps them to the corresponding inventory_items.id and
  retags entity_type='inventory_item' so they resolve via the existing
  inventory item name lookup.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 4: Delete the legacy hooks + types from `useInventory.ts`

**Files:**
- Modify: `src/hooks/useInventory.ts`

**Interfaces:**
- Consumes: nothing (verification step).
- Produces: `useToolAssetItems`, `useToolAssetItemsByCategory`, `useCreateToolAssetItem`, `useUpdateToolAssetItem`, and `ToolAssetItem` type are gone. All references have been removed by Tasks 1–3.

- [ ] **Step 1: Confirm no callers remain**

  ```
  grep -rn "useToolAssetItems\|useToolAssetItemsByCategory\|useCreateToolAssetItem\|useUpdateToolAssetItem\|ToolAssetItem\b" src/ 2>&1 | head
  ```

  Expected: only `src/hooks/useInventory.ts` (the definitions) and possibly re-exports.

- [ ] **Step 2: Delete the four hooks + the `ToolAssetItem` type**

  In `src/hooks/useInventory.ts`, remove:
  - `export type ToolAssetItem = ...`
  - `export function useToolAssetItems(...) { ... }`
  - `export function useToolAssetItemsByCategory(...) { ... }`
  - `export function useCreateToolAssetItem() { ... }`
  - `export function useUpdateToolAssetItem() { ... }`

  Keep: `useToolAssetUnits`, `useCreateToolAssetUnit`, `useUpdateToolAssetUnit`, `ToolAssetUnit` type — units stay.

- [ ] **Step 3: Typecheck**

  ```
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -iE "tool_asset_item|ToolAssetItem\b" | head
  ```

  Expected: empty.

- [ ] **Step 4: Commit**

  ```bash
  git add src/hooks/useInventory.ts
  git commit -m "$(cat <<'EOF'
  chore(inventory): remove dead tool_asset_items hooks

  useToolAssetItems / useToolAssetItemsByCategory / useCreateToolAssetItem /
  useUpdateToolAssetItem and the ToolAssetItem type are all unused after
  Tasks 1–3 of the tools-inventory follow-up. Removed.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

# Phase 2 — Drop `tool_asset_items` for real

Goal: Now that nothing reads or writes `tool_asset_items`, drop the table and the six `tool_asset_item_id` columns on the purchase chain that were restored during the 2026-07-22 rollback.

---

### Task 5: Drop the six `tool_asset_item_id` columns + `tool_asset_items` table

**Files:**
- Create: `supabase/migrations/YYYYMMDD130000_drop_tool_asset_items_and_columns.sql`

**Interfaces:**
- Consumes: nothing (nothing should still reference the columns after Tasks 1–4 + the parent plan's Task 3).
- Produces: `tool_asset_items` gone. Six `tool_asset_item_id` columns dropped. `tool_asset_units` unaffected — its `item_id` FK already points at `inventory_items`.

- [ ] **Step 1: Write the drop migration**

  Copy the body from the reverted `20260723180000_drop_tool_asset_items_and_columns.sql` (see `supabase/migrations/20260723200000_restore_tool_asset_items_and_units.sql` for the shape). The block that dropped the columns is still correct.

  ```sql
  BEGIN;

  DO $$
  DECLARE v_remaining INT;
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
      RAISE EXCEPTION 'Refusing to drop: % rows still have tool_asset_item_id set', v_remaining;
    END IF;
  END $$;

  ALTER TABLE public.po_line_items       DROP COLUMN IF EXISTS tool_asset_item_id;
  ALTER TABLE public.po_version_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
  ALTER TABLE public.receival_items      DROP COLUMN IF EXISTS tool_asset_item_id;
  ALTER TABLE public.return_lines        DROP COLUMN IF EXISTS tool_asset_item_id;
  ALTER TABLE public.sale_order_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
  ALTER TABLE public.sale_delivery_lines DROP COLUMN IF EXISTS tool_asset_item_id;

  DROP TABLE IF EXISTS public.tool_asset_items CASCADE;

  COMMIT;
  ```

  Mirror to staging.

- [ ] **Step 2: Apply to staging**

  ```
  npx supabase db push
  ```

- [ ] **Step 3: Regen types**

  ```
  npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts
  ```

  Then re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`) — the same script the parent plan used.

  Verify:
  ```
  grep -c "tool_asset_items:" src/types/database.types.ts   # → 0
  grep -c "tool_asset_units:" src/types/database.types.ts   # → 1
  ```

- [ ] **Step 4: Typecheck**

  ```
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -iE "tool_asset_item[^_]" | head
  ```

  Expected: empty. Any remaining error points at leftover `tool_asset_item_id` field on a Draft type or a caller — fix inline.

- [ ] **Step 5: Ask user to smoke-test**

  > "Open a PO with tool line items → confirm loads. Create a new PO with a Tools & Assets line → confirm save + reload. Same for an SO. Master Data Tools tab → confirm still lists items + units. Team tools sheet → confirm still works. Audit log tool entries → confirm still resolve."

- [ ] **Step 6: Commit**

  ```bash
  git add supabase/migrations/*_drop_tool_asset_items_and_columns.sql \
          supabase/migrations-staging/*_drop_tool_asset_items_and_columns.sql \
          src/types/database.types.ts
  git commit -m "$(cat <<'EOF'
  chore(db): drop tool_asset_items + six tool_asset_item_id columns

  Final step of the tools→inventory merge. All reads and writes now go
  through inventory_items; audit log entries are retagged; the table has
  been dead code for real. Safe to drop.

  tool_asset_units + related enums stay — they track individual physical
  unit lifecycles, which is the tools-only concept the merge intentionally
  preserves.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 6: Delete `ToolAssetLookup.tsx` and remove `tool_asset_item_id` from Draft types

**Files:**
- Delete: `src/components/purchase/ToolAssetLookup.tsx`
- Modify: `src/hooks/usePurchaseOrders.ts` — remove `tool_asset_item_id` from `POLineItem` + `POLineItemDraft`
- Modify: `src/hooks/useSaleOrders.ts` — remove `tool_asset_item_id` from `SOLineItem` + `SOLineItemDraft`
- Modify: `src/components/purchase/PoLineItemsEditor.tsx` — remove `tool_asset_item_id: null` from `makeRow` + `handleInventorySelect`
- Modify: `src/components/sales/SoLineItemsEditor.tsx` — same
- Modify: `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` — remove `tool_asset_item_id: li.tool_asset_item_id`
- Modify: `src/lib/poVersionHelper.ts` — same
- Modify: `src/lib/purchase/generate-po-pdf.ts` — remove field from `PoVersionLine` + snapshot mapper

**Interfaces:**
- Consumes: nothing.
- Produces: `LineItemRow` / `SoLineItemRow` no longer carry `tool_asset_item_id`. `ToolAssetLookup` component is gone.

- [ ] **Step 1: Confirm no live callers of ToolAssetLookup**

  ```
  grep -rn "ToolAssetLookup" src/ 2>&1
  ```

  Expected: only the file itself. If callers exist, fix them first — none should, since the parent plan's Task 1+2 already removed them.

- [ ] **Step 2: Delete the file**

  ```
  rm src/components/purchase/ToolAssetLookup.tsx
  ```

- [ ] **Step 3: Remove `tool_asset_item_id` field from every type + payload**

  Grep to find all sites:
  ```
  grep -rn "tool_asset_item_id" src/ 2>&1
  ```

  Delete every line that references the field. Places to check:
  - `src/hooks/usePurchaseOrders.ts` (`POLineItem`, `POLineItemDraft` — 2 occurrences)
  - `src/hooks/useSaleOrders.ts` (`SOLineItem`, `SOLineItemDraft` — 2 occurrences)
  - `src/components/purchase/PoLineItemsEditor.tsx` (`makeRow`, `handleInventorySelect` — 2 occurrences)
  - `src/components/sales/SoLineItemsEditor.tsx` (2 occurrences)
  - `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` (1 occurrence in the map)
  - `src/lib/poVersionHelper.ts` (1 occurrence in `savePoSnapshot`)
  - `src/lib/purchase/generate-po-pdf.ts` (2 occurrences: type + mapper)

- [ ] **Step 4: Typecheck**

  ```
  grep -rn "tool_asset_item_id" src/ 2>&1
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -iE "tool_asset_item" | head
  ```

  Both expected empty.

- [ ] **Step 5: Ask user to smoke-test one more time**

  > "PO + SO create / edit / view — final regression check. Report anything odd."

- [ ] **Step 6: Commit**

  ```bash
  git add -A src/
  git commit -m "$(cat <<'EOF'
  chore(ui): remove ToolAssetLookup + tool_asset_item_id from all types

  Final cleanup for the tools-inventory merge. ToolAssetLookup.tsx is
  deleted. LineItemRow / SoLineItemRow / POLineItem / SOLineItem no
  longer carry the field. Snapshot mappers + PDF generator stop copying
  it.

  The Tools & Assets flow now moves through inventory end-to-end. Only
  tool_asset_units remains — it tracks the physical unit layer that
  regular inventory doesn't need.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

# Testing Strategy

Manual smoke suite gated by the user after each task's commit-gate. Same shape as the parent plan.

**Phase 1 smoke (Tasks 1–4):**
1. Master Data → Tools & Assets → `+ Add Tool` → confirm new item saves + appears.
2. Master Data → Tools & Assets → edit pencil → change name → confirm saves.
3. Master Data → Tools & Assets → expand a row → `+ Add Unit` → confirm unit appears.
4. Master Data → Teams → open team → Tools sheet → confirm dropdown works, assignments work.
5. Audit log → find a tool-related entry → confirm name renders.
6. PO / SO create + edit with Tools & Assets lines → still works.

**Phase 2 smoke (Tasks 5–6):**
1. Repeat Phase 1 suite — no user-visible change.
2. `npx tsc --noEmit --skipLibCheck` → zero `tool_asset_item` errors.

**Prod verification (deferred until prod is unpaused):**
1. Before Task 5 runs on prod, snapshot: `SELECT COUNT(*) FROM tool_asset_items; SELECT COUNT(*) FROM audit_log WHERE entity_type='tool_asset';` — save the numbers.
2. Run the full migration set in order — the parent plan's Task 4 data migration runs first (creates inventory rows for any prod-only tools), then this plan's Tasks 3 + 5 + 6.
3. After application, spot-check five random inventory tool items → confirm units render, audit trail resolves.

---

# Risks & Rollback

| Risk | Mitigation |
|---|---|
| The ordinal-based mapping in Task 3's audit migration pairs an audit entry with the wrong HP/LP variant. | Same risk existed for the units remap on 2026-07-22. Accepted — historical audit lines still resolve to the right base name; the specific variant may be ambiguous. Not correctable without semantic info the seed doesn't carry. |
| Task 1's new RPC `create_inventory_item_with_default_variant` fails half-way (item created, variant not). | RPC runs in a single transaction so both inserts commit or both roll back. Client just calls the RPC — no partial states possible. |
| Task 5 rejects the drop because a row still carries `tool_asset_item_id`. | Migration includes a `DO $$` block that raises before dropping. Fix: check which table has a lingering value (`SELECT * FROM <table> WHERE tool_asset_item_id IS NOT NULL LIMIT 5`), figure out how it got written after Tasks 1–4, patch, rerun. |
| Someone commits to the branch between Task 4 and Task 6 and reintroduces a `tool_asset_item_id` write. | Task 6's typecheck step fails loudly. Fix on discovery. |
| Prod unpauses mid-plan and the migrations apply out of order with respect to the parent plan's Task 4 data migration. | Migration filenames sort by timestamp. As long as this plan's timestamps are >= parent plan's Task 4 (`20260723170000`), order is preserved. |

**Rollback per phase:**
- Phase 1: `git revert` the Task 1–4 commits. No DB changes to reverse except Task 3's audit remap — that one is reversed by a follow-up UPDATE using the inverse mapping (same CTE, swap directions). Or accept the retagged entity_type since it doesn't break the app.
- Phase 2: cannot easily roll back Task 5 without seed data — see the parent plan's `20260723200000_restore_tool_asset_items_and_units.sql` for the shape if needed. Verify Phase 1 thoroughly before Task 5.

---

# Self-Review Checklist

- ✅ **Spec coverage:** All four remaining `tool_asset_items` code paths are addressed (Add/Edit dialog, Teams sheet, audit resolver, dead hooks). Old columns + table are dropped. `tool_asset_units` layer is preserved intentionally.
- ✅ **No test infra fiction:** Manual smoke gates only — no invented RTL suites.
- ✅ **Prod-paused handled:** Every DB step applies to staging first; prod runs when unpaused.
- ✅ **Same author + commit conventions as parent plan.**
- ✅ **Migration filenames are chronologically after this session's existing tools-migration files** (`20260723170000` – `20260723220000`) so `db push` applies them in the right order once prod unpauses.
