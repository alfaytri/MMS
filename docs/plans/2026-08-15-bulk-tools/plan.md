# Bulk Tools — Implementation Plan

> **For agentic workers:** Execute task-by-task. Each task ends with an independently verifiable deliverable. Steps use checkbox (`- [ ]`) syntax for tracking. Source of truth: [design.md](./design.md) (decisions locked 2026-08-15).

**Goal:** Add a per-category `inventory_categories.tool_tracking_mode` enum (`serialized` | `bulk`, default `serialized`, meaningful only when `type='tools'`). **Bulk** tool categories run the full CONSUMABLES machinery (`inventory_items` + `inventory_item_brand_variants` + `fifo_cost_layers` + per-division sub-container stock + PO / receiving / consumption / transfers) and join the shipped Phase-1 item→division **assignment** model (Assigned-divisions checklist + per-division pools + transfer-only). **Serialized** tool categories stay asset-tracked (`tool_asset_units`) and gain a `division_id` + a unit-level transfer.

**Architecture:** Mode is one enum column on the category row. The picker gate (`useCascadeAccessibleItems`) and the receival unit-spawning trigger (`create_tool_units_on_receival_layer`) become **mode-aware** so bulk tools flow through the qty path while serialized tools keep spawning `tool_asset_units`. The tools UI (`ToolsAssetsView` → `ToolCategoryRow`) branches per node: serialized → unit rows (current); bulk → qty item rows + the qty `ItemEditDialog` (which already writes `inventory_item_divisions`). Bulk tools reuse the existing transfer engine (`create_transfer_v2`) for free. P2b adds `tool_asset_units.division_id` (NULL backfill) + a unit-transfer RPC.

**Tech Stack:** Next.js 15 + TypeScript, TanStack Query v5, Supabase Postgres (RLS + SECURITY DEFINER RPCs + triggers), cmdk pickers.

## Scope boundary (read before starting)

- **The Phase-1 per-division CATEGORY OVERLAY is NOT built.** It was Phase-1's deferred Phase 2 (see [item-division-assignment/plan.md](../2026-08-15-item-division-assignment/plan.md) `# PHASE 2`). The `inventory_item_divisions.category_id` column exists and is backfilled to the canonical category, but no reader resolves category per active division yet. **Bulk tools therefore join the ASSIGNMENT (Assigned-divisions rows) + per-division pools + transfers — NOT the overlay.** Any "extend the overlay allowed set to include bulk tools" work (design §6.2 bullet 3, §7 last row) is explicitly **out of scope here** and belongs to whoever ships the Phase-1 overlay; that work simply must not re-exclude bulk tools when it lands. This is noted again in Task 2a.7.
- **Bulk tools are internal.** They flow through PO / receival / consumption / transfer, exactly like consumables. Selling a tool to a customer (SO) stays **excluded** (design §3, and `SoLineItemsEditor` already omits tools) — see the decision in Task 2a.7.

## Global Constraints

- **Migrations:** author in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, apply with `npx supabase db push` to **staging** (`mwvblpgbgxipvrevkeff`) only during this window, and **mirror the identical file** into `supabase/migrations-staging/` in the same commit. Apply to **new-prod** (`optishfnnctrhffpoywg`) only at ship time.
- **Fetch live function/trigger bodies with `pg_get_functiondef` before any `CREATE OR REPLACE`** (baseline SQL + `database.types.ts` are both stale — only `db query --linked` is authoritative). **Verify every write path** with a rolled-back `DO $$ … $$` probe before claiming done.
- **SECURITY DEFINER RPCs:** `revoke all on function … from public;` (not just `anon`).
- **Every Supabase `.select(...)` carries `.limit(N)`** and prefers explicit columns over `select('*')` for list reads.
- **`tsc --noEmit` + `eslint` clean** after every code task. **Never `next build`** unless asked.
- After `supabase gen types … > src/types/database.types.ts`, **re-append the four `DBTable/DBInsert/DBUpdate/AllTables` helper aliases** (the CLI wipes them).
- **Dropdown/Select rules:** human-readable labels only (never raw UUIDs); side-by-side selects for hierarchy; fixed heights (layout stability); when one option exists show it pre-selected/disabled.
- **Commits:** one logical change each; **commit only after the operator confirms the golden-path smoke works** (project commit policy). HEREDOC message with both trailers:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Flow registry:** register/adjust affected flows in `docs/flows-registry.md` in the same commit as the code.
- **PROGRESS.md + EOD** updated per the mandatory protocols after each task.

## Current-state findings (verified against the repo, 2026-08-15)

| Fact | Location |
|---|---|
| Picker gate excludes ALL tools | `src/hooks/useCascadeAccessibleItems.ts:58` — `const isFilterable = type !== 'tools'` |
| Buy-side assignment read already live (Phase-1) | `useCascadeAccessibleItems.ts:138-152` reads `inventory_item_divisions` |
| **Receival auto-creates `tool_asset_units` for ANY `type='tools'` item** | trigger `create_tool_units_on_receival_layer()` in `supabase/migrations/20260724250000_tool_serial_tracking_schema_and_trigger.sql:47-142`; gate at `:82` (`v_category <> 'tools'`). Fires on `fifo_cost_layers` INSERT. |
| Tools tab renders `ToolsAssetsView` → `ToolCategoryRow` | `src/components/services/InventoryTab.tsx:56`; `ToolsAssetsView.tsx:21` (`useInventoryTree('tools', …)`); serialized unit rows in `ToolCategoryRow.tsx:19-120,262-264` |
| Tool item create = name-only, calls `create_tool_item_with_default_variant` | `ToolAssetEditDialog.tsx:26-85`; `useCreateToolItem` at `useInventory.ts:156-182` (already makes a default brand-variant) |
| Qty item dialog with Assigned-divisions (reuse for bulk) | `src/components/services/inventory/ItemEditDialog.tsx` — props `{ categoryId, categoryType, item? }` at `:30-38`; assigned-divisions section `:401-457`; create→assign write `:222-247` (guarded against pre-load wipe) |
| Assignment hooks (shipped) | `src/hooks/useItemDivisions.ts` — `useItemDivisions(itemId)` + `useSetItemDivisions()` → RPC `rpc_set_item_divisions` |
| `tool_asset_units` has NO `division_id`; keeps `assigned_to` | type `useInventory.ts:357-370`; unit CRUD `:749-803`; unit dialog `ToolAssetEditDialog.tsx:97-236` |
| Importer already writes qty items + brand-variants + `inventory_item_divisions` for ALL types incl. tools (no serialized branch) | `src/hooks/useInventoryImport.ts:313-460,493-576` |
| Qty transfer engine (bulk tools reuse as-is) | `create_transfer_v2` via `useCreateTransfer` (`useWarehouseOperations.ts`), dialog `WhTransferDialog` — see `docs/flows-registry.md` "Create Warehouse Transfer" |

## File Structure

**New migrations** (each also mirrored into `supabase/migrations-staging/`):
- `supabase/migrations/20260826000000_inventory_categories_tool_tracking_mode.sql` — enum type + column + default (Task 2a.1).
- `supabase/migrations/20260826000100_receival_tool_units_serialized_only.sql` — mode-aware receival trigger (Task 2a.2).
- `supabase/migrations/20260826000200_guard_tool_tracking_mode_switch.sql` — populated-guard trigger (Task 2a.4).
- `supabase/migrations/20260827000000_tool_asset_units_division_id.sql` — `division_id` column (Task 2b.1).
- `supabase/migrations/20260827000100_rpc_transfer_tool_unit.sql` — unit-transfer RPC (Task 2b.3).

**New client:**
- `src/components/services/inventory/BulkToolItemRow.tsx` — qty item row for bulk tool categories (Task 2a.5).
- `src/components/services/inventory/ToolUnitTransferDialog.tsx` — serialized unit → division transfer (Task 2b.3).
- `src/hooks/useCategoryHasStockOrUnits.ts` — populated check for the mode-toggle guard (Task 2a.4).

**Modified:** `useCascadeAccessibleItems.ts` (2a.3), `CategoryEditDialog.tsx` + `useInventory.ts` category hooks (2a.4), `ToolsAssetsView.tsx` / `ToolCategoryRow.tsx` (2a.5, 2a.6), `ToolAssetEditDialog.tsx` + `useInventory.ts` unit hooks + `ToolAssetUnit` type (2b.2, 2b.4), `src/types/database.types.ts` (regen in 2a.1 + 2b.1).

---

# PHASE 2a — Bulk-tool qty path

*Delivers the headline "bulk tools" value: a tool category flipped to Bulk behaves exactly like a Consumable (brand/origin/qty/FIFO/pools + Assigned divisions + transfer), while every existing (serialized) tool category is untouched because the default is `serialized`.*

## Task 2a.1 — Add `inventory_categories.tool_tracking_mode`

**Files:** Create `supabase/migrations/20260826000000_inventory_categories_tool_tracking_mode.sql` (+ mirror). Regen `src/types/database.types.ts`.

**Interfaces — Produces:** enum `public.tool_tracking_mode`; column `inventory_categories.tool_tracking_mode tool_tracking_mode NOT NULL DEFAULT 'serialized'`.

- [ ] **Step 1 — Write the migration**

```sql
-- 20260826000000_inventory_categories_tool_tracking_mode.sql
-- Per-category tool tracking mode. Meaningful ONLY when type='tools':
--   serialized = one tool_asset_units row per physical unit (current behavior)
--   bulk       = full qty machinery (variants/FIFO/pools) like a consumable
-- Default 'serialized' => zero behavior change for every existing tool category.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_tracking_mode') THEN
    CREATE TYPE public.tool_tracking_mode AS ENUM ('serialized', 'bulk');
  END IF;
END $$;

ALTER TABLE public.inventory_categories
  ADD COLUMN IF NOT EXISTS tool_tracking_mode public.tool_tracking_mode NOT NULL DEFAULT 'serialized';

COMMENT ON COLUMN public.inventory_categories.tool_tracking_mode IS
  'Meaningful only when type=''tools''. serialized => tool_asset_units per unit; bulk => qty/FIFO/pools like consumables. Ignored for products/spare-parts/consumables.';

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 2 — Apply + mirror:** `npx supabase db push`; copy the file verbatim into `supabase/migrations-staging/`.
- [ ] **Step 3 — Verify:** `select distinct tool_tracking_mode, count(*) from inventory_categories group by 1;` → expect every row `serialized`. Confirm the enum has exactly two labels: `select enumlabel from pg_enum join pg_type t on t.oid=enumtypid where typname='tool_tracking_mode' order by enumsortorder;`.
- [ ] **Step 4 — Regen types:** `npx supabase gen types typescript --linked > src/types/database.types.ts`; re-append the four helper aliases; `tsc --noEmit` clean. (`InventoryCategory = DBTable<'inventory_categories'>` at `useInventory.ts:7` now carries `tool_tracking_mode`.)
- [ ] **Step 5 — Commit** (migration + mirror + regenerated types).

## Task 2a.2 — Make the receival unit-spawning trigger serialized-only

**Files:** Create `supabase/migrations/20260826000100_receival_tool_units_serialized_only.sql` (+ mirror).

**Why:** `create_tool_units_on_receival_layer()` fires on every `fifo_cost_layers` INSERT and inserts placeholder `tool_asset_units` whenever the item's category `type='tools'` (`20260724250000_…:82`). A **bulk** tool must NOT spawn units — it is pure qty/FIFO. This is the single most important backend change in P2a and lives in a DB trigger, not TS.

- [ ] **Step 1 — Confirm the live body first:** `select pg_get_functiondef('public.create_tool_units_on_receival_layer'::regproc);` and diff against `20260724250000_…`. If it drifted, rebase the rewrite on the live body.
- [ ] **Step 2 — Write the migration** (only the category lookup + gate change; serial-numbering block unchanged):

```sql
-- 20260826000100_receival_tool_units_serialized_only.sql
-- Bulk tool categories run the qty/FIFO path (no asset units). Only SERIALIZED
-- tool categories spawn placeholder tool_asset_units on receival.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id     uuid;
  v_item_sku    text;
  v_category    text;
  v_mode        text;
  v_ri_id       uuid;
  v_next_ord    int;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  i             int;
  v_serial      text;
BEGIN
  IF NEW.source_type <> 'receival' THEN
    RETURN NEW;
  END IF;
  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT ii.id, ii.sku, ic.type::text, ic.tool_tracking_mode::text
    INTO v_item_id, v_item_sku, v_category, v_mode
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  -- Only serialized tool categories create asset units. Non-tools and BULK
  -- tools fall through to the qty machinery with no unit rows.
  IF v_category IS NULL OR v_category <> 'tools' OR v_mode <> 'serialized' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || v_item_id::text));

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = NEW.receival_id
    AND ri.brand_variant_id = NEW.brand_variant_id
  LIMIT 1;

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_item_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = v_item_id
    AND serial_number ~ ('^' || v_item_sku || '-\d+$');

  FOR i IN 1..v_qty LOOP
    v_serial := v_item_sku || '-' || LPAD((v_next_ord + i)::text, 3, '0');
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder, status, condition, brand
    ) VALUES (
      v_item_id, v_ri_id, v_serial, true, 'available', 'Good', 'Default'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

> The symmetric `remove_tool_placeholders_on_layer_delete()` needs **no change** — it only deletes `is_placeholder=true` rows, and bulk tools never create any (Step 4 proves this).

- [ ] **Step 3 — Apply + mirror.** Confirm single overload + `prosecdef=true`: `select count(*), bool_and(prosecdef) from pg_proc where proname='create_tool_units_on_receival_layer';`.
- [ ] **Step 4 — Probe both branches (rolled back).** Pick one serialized-tool variant and one bulk-tool variant (flip a scratch category to bulk inside the txn), insert a `source_type='receival'` FIFO layer for each, assert unit counts, then `ROLLBACK`:

```sql
DO $$
DECLARE
  v_ser_variant uuid;  v_bulk_variant uuid;  v_bulk_cat uuid;
  v_ser_before int;    v_ser_after int;      v_bulk_after int;
BEGIN
  -- a serialized tool variant (default mode)
  SELECT bv.id INTO v_ser_variant
  FROM inventory_item_brand_variants bv
  JOIN inventory_items ii ON ii.id = bv.item_id
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ic.type='tools' AND ic.tool_tracking_mode='serialized' LIMIT 1;

  -- a tool variant we temporarily flip to bulk
  SELECT bv.id, ic.id INTO v_bulk_variant, v_bulk_cat
  FROM inventory_item_brand_variants bv
  JOIN inventory_items ii ON ii.id = bv.item_id
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ic.type='tools' AND bv.id <> v_ser_variant LIMIT 1;
  UPDATE inventory_categories SET tool_tracking_mode='bulk' WHERE id=v_bulk_cat;

  SELECT count(*) INTO v_ser_before FROM tool_asset_units
    WHERE item_id=(SELECT item_id FROM inventory_item_brand_variants WHERE id=v_ser_variant);

  INSERT INTO fifo_cost_layers (brand_variant_id, source_type, qty, remaining_qty, receival_id, total_unit_cost, date)
  VALUES (v_ser_variant,'receival',3,3,NULL,10,now());
  INSERT INTO fifo_cost_layers (brand_variant_id, source_type, qty, remaining_qty, receival_id, total_unit_cost, date)
  VALUES (v_bulk_variant,'receival',5,5,NULL,10,now());

  SELECT count(*) INTO v_ser_after FROM tool_asset_units
    WHERE item_id=(SELECT item_id FROM inventory_item_brand_variants WHERE id=v_ser_variant);
  SELECT count(*) INTO v_bulk_after FROM tool_asset_units
    WHERE item_id=(SELECT item_id FROM inventory_item_brand_variants WHERE id=v_bulk_variant);

  RAISE NOTICE 'serialized added=% (want 3), bulk added=% (want 0)',
    v_ser_after - v_ser_before, v_bulk_after;
  IF (v_ser_after - v_ser_before) <> 3 OR v_bulk_after <> 0 THEN
    RAISE EXCEPTION 'trigger mode-gate wrong';
  END IF;
  RAISE EXCEPTION 'rollback probe';  -- always unwind
END $$;
```

> Confirm the FIFO-layer column names (`qty`, `remaining_qty`, `source_type`, `receival_id`, `total_unit_cost`, `date`) against the live table first — the trigger reads `NEW.qty` / `NEW.source_type` / `NEW.receival_id`, but verify the rest before the probe (per mutation-path-verification rule).

- [ ] **Step 5 — Commit** (migration + mirror).

## Task 2a.3 — Make the picker gate mode-aware (`useCascadeAccessibleItems`)

**Files:** Modify `src/hooks/useCascadeAccessibleItems.ts`.

**Behavior:** tools stop being blanket-excluded. For `type==='tools'` the items query includes **only bulk** categories, so bulk tool items enter the qty picker (buy-side = assigned to active division; consume-side = owns stock) while serialized tool items stay out. All other logic (assignment query `:138-152`, stock query `:84-132`, `useMemo` classification `:154-190`) is unchanged.

- [ ] **Step 1 — Drop the blanket exclusion.** Replace `:58`:
  ```ts
  const isFilterable = type !== 'tools'
  ```
  with:
  ```ts
  // Tools are no longer blanket-excluded: BULK tool categories are qty (they
  // flow through this filter). SERIALIZED tool categories are pruned by the
  // tool_tracking_mode='bulk' filter on the items query below.
  const isFilterable = true
  ```
- [ ] **Step 2 — Restrict the items query for tools.** In `itemsQuery.queryFn` (`:61-79`) select the mode and filter it for tools. Add `type` to the query key so the two tool modes don't collide with other types' cache:
  ```ts
  const itemsQuery = useQuery({
    queryKey: ['cascade-accessible', 'items', type],
    enabled: effectiveEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_items')
        .select('id, category_id, inventory_categories!inner(type, tool_tracking_mode)')
        .neq('status', 'archived')
        .eq('inventory_categories.type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
        .limit(5000)
      // Only bulk tool categories are qty. Serialized tools stay asset-tracked
      // and must never appear in the cascade (PO/receival/consume) picker.
      if (type === 'tools') q = q.eq('inventory_categories.tool_tracking_mode', 'bulk')
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Array<{ id: string; category_id: string }>
    },
  })
  ```
- [ ] **Step 3 — Confirm downstream pruning.** `CascadeInventorySelector` builds `visibleCategoryIds` from `accessibility.accessibleItemIds` (`CascadeInventorySelector.tsx:316-345`); serialized tool items are absent, so serialized tool categories prune out automatically. No change needed there.
- [ ] **Step 4 — `tsc` + `eslint` clean.**
- [ ] **Step 5 — Commit.** (Do not smoke-test in isolation — the UI payoff lands with Task 2a.6; smoke together in 2a.8.)

## Task 2a.4 — Category dialog: Serialized/Bulk toggle (tools only) + populated guard

**Files:** Create `supabase/migrations/20260826000200_guard_tool_tracking_mode_switch.sql` (+ mirror); create `src/hooks/useCategoryHasStockOrUnits.ts`; modify `src/components/services/inventory/CategoryEditDialog.tsx`; extend the category payloads in `src/hooks/useInventory.ts` (`useCreateInventoryCategory:394-420`, `useUpdateInventoryCategory:422-454`).

**Guard rule (design §6.1, §11 Q2):** an empty category switches freely; a category holding asset units OR qty stock is blocked from switching. Enforce **server-side** (a trigger, so it can't be bypassed) AND disable the control in the dialog for good UX.

- [ ] **Step 1 — Guard trigger migration:**

```sql
-- 20260826000200_guard_tool_tracking_mode_switch.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tool_tracking_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_units int;
  v_qty   numeric;
BEGIN
  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM OLD.tool_tracking_mode THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  JOIN inventory_items ii ON ii.id = tau.item_id
  WHERE ii.category_id = NEW.id;

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_items ii
  JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  WHERE ii.category_id = NEW.id;

  IF v_units > 0 OR v_qty > 0 THEN
    RAISE EXCEPTION
      'Cannot switch tracking mode while the category holds stock: % asset unit(s), % qty on hand. Empty the category first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tool_tracking_mode_switch ON public.inventory_categories;
CREATE TRIGGER trg_guard_tool_tracking_mode_switch
  BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_tool_tracking_mode_switch();

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 2 — Apply + mirror. Probe (rolled back):** for a bulk-or-serialized tool category that has units/stock, `update inventory_categories set tool_tracking_mode = <other> where id=…` must raise; an empty scratch tools category must succeed. Roll back.
- [ ] **Step 3 — Populated-check hook** `src/hooks/useCategoryHasStockOrUnits.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** True when a category's items hold any tool_asset_units or any remaining FIFO
 *  qty — i.e. its tool_tracking_mode is locked (can't switch). */
export function useCategoryHasStockOrUnits(categoryId: string | null) {
  return useQuery({
    queryKey: ['category-has-stock-or-units', categoryId],
    enabled: !!categoryId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: items, error: e1 } = await supabase
        .from('inventory_items').select('id').eq('category_id', categoryId as string).limit(1000)
      if (e1) throw e1
      const ids = (items ?? []).map((r) => r.id as string)
      if (ids.length === 0) return false
      const { count: unitCount, error: e2 } = await supabase
        .from('tool_asset_units').select('id', { count: 'exact', head: true }).in('item_id', ids)
      if (e2) throw e2
      if ((unitCount ?? 0) > 0) return true
      const { data: bvs, error: e3 } = await supabase
        .from('inventory_item_brand_variants').select('id').in('item_id', ids).limit(1000)
      if (e3) throw e3
      const bvIds = (bvs ?? []).map((r) => r.id as string)
      if (bvIds.length === 0) return false
      const { count: layerCount, error: e4 } = await supabase
        .from('fifo_cost_layers').select('id', { count: 'exact', head: true })
        .in('brand_variant_id', bvIds).gt('remaining_qty', 0)
      if (e4) throw e4
      return (layerCount ?? 0) > 0
    },
  })
}
```

- [ ] **Step 4 — Dialog toggle.** In `CategoryEditDialog.tsx` add `trackingMode` state (default `category?.tool_tracking_mode ?? 'serialized'`), include it in the `Snapshot`/`isDirty` set, and render a **Select** (Serialized / Bulk) **only when `categoryType === 'tools'`** — place it in the SKU + Type grid row (`:363-373`). Disable it (with a helper line "Locked — category holds stock/units") when `useCategoryHasStockOrUnits(category?.id)` is true on edit. Add `tool_tracking_mode: trackingMode` to the `payload` (`:163-170`) so both create + update carry it. Fixed `h-10` trigger; readable labels.
- [ ] **Step 5 — Widen the category payload types** in `useInventory.ts` — add `tool_tracking_mode?: string` to the `useCreateInventoryCategory` mutation input (`:396`) and `useUpdateInventoryCategory` input (`:425`). Surface the raw DB error on the guard raise (per surface-raw-db-errors rule) so the operator sees the real "holds stock" message.
- [ ] **Step 6 — `tsc` + `eslint` clean. Commit** (migration + mirror + hook + dialog + payloads).

## Task 2a.5 — `ToolCategoryRow`: render BULK categories as qty item rows

**Files:** Create `src/components/services/inventory/BulkToolItemRow.tsx`; modify `src/components/services/inventory/ToolCategoryRow.tsx`.

**Behavior:** the tools tree stays one renderer, but a node whose `tool_tracking_mode === 'bulk'` renders its items as **qty rows** (item → brand/origin → qty on hand) instead of the serialized `ToolItemRow` (unit rows). Serialized nodes are unchanged.

- [ ] **Step 1 — `BulkToolItemRow`** — one row per bulk-tool item: name (+ Arabic), a qty/variant summary, and an Edit button. Reuse `useInventoryBrandVariants(item.id)` for the brand/origin count and `useVariantStockByDivision(item.id)` (or the aggregate used by `ItemsListView`/`useCategoryStockAggregates`) for on-hand totals — mirror the label style of `CascadeInventorySelector`'s variant rows (brand · origin · qty). No expandable unit sub-table. Fixed row height; `truncate` on names; `min-h-11` touch targets on the Edit control.
- [ ] **Step 2 — Branch in `ToolCategoryRow`.** Where items render (`:262-264`), switch on `node.tool_tracking_mode`:
  ```tsx
  {expanded && node.tool_tracking_mode === 'bulk'
    ? toolItems.map((item) => <BulkToolItemRow key={item.id} item={item} depth={depth} />)
    : toolItems.map((item) => <ToolItemRow key={item.id} item={item} depth={depth} />)}
  ```
  Keep the empty-state row (`:266-272`) for both modes (adjust copy to "No tools in this category yet.").
- [ ] **Step 3 — Header hint (optional, layout-stable).** In the category row INFO cell (`:220-224`) show a small `Bulk` / `Serialized` badge so the operator can tell modes apart; reserve height so it doesn't shift siblings.
- [ ] **Step 4 — `tsc` + `eslint` clean. Commit** (component + row branch). Golden-path smoke deferred to 2a.8.

## Task 2a.6 — BULK tool item create/edit routes to the qty `ItemEditDialog`

**Files:** Modify `src/components/services/inventory/ToolCategoryRow.tsx` (and `BulkToolItemRow.tsx` from 2a.5 for the edit trigger).

**Behavior:** for bulk categories, "Add Tool/Asset" and "Edit" open the full qty `ItemEditDialog` (`{ open, onOpenChange, categoryId, categoryType:'tools', item? }`) — the same dialog products/spare-parts/consumables use, which manages SKU/unit/warranty/spec/brand-variants **and writes `inventory_item_divisions`** via its Assigned-divisions section (`ItemEditDialog.tsx:401-457`, create→assign at `:222-247`). Serialized categories keep `ToolAssetItemEditDialog`. **This is where bulk tools join the assignment model** — no new assignment code is needed.

- [ ] **Step 1 — Import** `ItemEditDialog` into `ToolCategoryRow`.
- [ ] **Step 2 — Route the add-item dialog** (`:276`): when `node.tool_tracking_mode === 'bulk'` render
  ```tsx
  <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} categoryType="tools" />
  ```
  else keep `<ToolAssetItemEditDialog … categoryId={node.id} />`.
- [ ] **Step 3 — Route edit** from `BulkToolItemRow` to `<ItemEditDialog … categoryId={item.category_id} categoryType="tools" item={item} />`. (Serialized `ToolItemRow` keeps `ToolAssetItemEditDialog` at `ToolCategoryRow.tsx:148`.)
- [ ] **Step 4 — Verify create path.** `ItemEditDialog` create uses `useCreateInventoryItem` (the qty item path) — a bulk tool item gets a real SKU + variants + assignments, NOT `create_tool_item_with_default_variant`. Confirm the created item appears under the bulk category as a qty row and in that division's PO picker.
- [ ] **Step 5 — `tsc` + `eslint` clean. Commit.**

## Task 2a.7 — `type === 'tools'` branch audit + confirmations + SO decision

**Files:** read-only sweep + one documented decision. No behavioral change beyond what 2a.1–2a.6 already did; this task proves nothing else silently excludes or mis-handles bulk tools.

- [ ] **Step 1 — Re-run the sweep:** `grep -rn "tools" src/ --include=*.ts --include=*.tsx`. Classify every hit against this table (verified 2026-08-15):

  | File(s) | Role | Action |
  |---|---|---|
  | `useCascadeAccessibleItems.ts:58` | picker gate | **DONE (2a.3)** |
  | `create_tool_units_on_receival_layer` trigger | receival unit spawn | **DONE (2a.2)** |
  | `ToolsAssetsView.tsx` / `ToolCategoryRow.tsx` | tools UI | **DONE (2a.5/2a.6)** |
  | `CategoryEditDialog.tsx:28` | mode toggle | **DONE (2a.4)** |
  | `PoLineItemsEditor.tsx:16,50,58` | `tools` already a PO `LineType` | CONFIRM: bulk tools now populate the picker; serialized excluded by 2a.3. No code change. |
  | `edit-po/[id]/page.tsx:136-140` | maps a tool PO line back to `line_type` | CONFIRM harmless. |
  | `ReceivalFormDialog.tsx:288` (free-item), main receival cascade | receiving | CONFIRM bulk-tool lines flow as qty; serialized unaffected. |
  | `PoReceiveTab.tsx:514` | receive type select | CONFIRM. |
  | `WhItemPicker.tsx:21,58,60`, `WhStockValueTab.tsx:74`, `WhStockOverviewTab.tsx:67,74`, `WhInventoryCheckDetail.tsx:464`, `WarehouseStockTree.tsx:69`, `ItemTreeCell.tsx:8` | warehouse stock pickers/reports (consumption source + valuation) | CONFIRM bulk tools appear via **stock** (no type gate excludes them); serialized units are not stock so they don't. No code change. |
  | `useInventoryImport.ts:313-460,493-576` / `inventory-import.ts:74,261` | importer | CONFIRM: already creates qty items + brand-variants + `inventory_item_divisions` for tools; bulk tools import correctly with **no change**. New tool categories import as `serialized` (default) — operator flips to bulk in the dialog. |
  | `useItemDivisionsByStock.ts` + `rpc_item_divisions_by_stock` | inventory-list division filter | CONFIRM: unions assignment ∪ stock joined on `type` — bulk tools get division filtering for free. No change. |
  | `PoDetailDialog.tsx:66`, `SoDetailDialog.tsx:64`, `SoDeliveryDialog.tsx:28`, `warehouse-report-html.ts:233`, `InventoryTab.tsx:7,13,56`, `useInventoryTree.ts:109`, `useInventory.ts:65,382`, `database.types.ts` | labels / type-casts / tab shell / regen | KEEP — no change. |

- [ ] **Step 2 — SO decision (design §3).** `SoLineItemsEditor.tsx:54-56` excludes tools from customer SO. **Keep bulk tools excluded from SO** for this phase (bulk tools are internal — consume/transfer only). Add a one-line comment at `:54` noting bulk tools are intentionally still excluded, and record the decision in PROGRESS. *(Flag to operator — see uncertainties.)*
- [ ] **Step 3 — Overlay boundary note.** Add a comment near the 2a.3 items query and in PROGRESS that the Phase-1 per-division **category overlay** is not built; bulk tools join assignment + pools + transfers only, and whoever ships the overlay must add bulk tools to its allowed set (do not re-exclude). No code here.
- [ ] **Step 4 — Commit** (comments + PROGRESS note only; no logic).

## Task 2a.8 — P2a verification, security checklist, operator smoke, flow registry

- [ ] **Security checklist** (Secrets / RLS / Auth gate / Error handling / Layout stability) recorded in `PROGRESS.md` `## 🔒 Security Audit Log`. Focus: guard trigger + mode-aware receival trigger are `SECURITY DEFINER SET search_path`; no new anon-writable surface; layout-stable mode badge + toggle.
- [ ] **Flow registry:** add/adjust entries — "Bulk tool receival (qty/FIFO, no units)", "Set category tracking mode (guarded)", and cross-link `[[Create Warehouse Transfer]]` (bulk tools reuse it). Same commit as the code that shipped each.
- [ ] **Operator smoke (needs login):**
  (a) Create a tools category → flip to **Bulk** in the dialog → "Add Tool/Asset" opens the qty `ItemEditDialog`; create an item with a brand/origin variant + assign to Maintenance → it appears as a **qty row** under the bulk category and in Maintenance's **PO picker** (hidden in Trading).
  (b) Raise a PO for that bulk tool → receive it → **no `tool_asset_units` created**, FIFO qty lands in Maintenance's pool; consume it from consumption dialog.
  (c) Transfer some qty Maintenance→Trading → Trading can consume what it now owns.
  (d) A **serialized** tools category still shows unit rows and still auto-creates placeholder units on receival (regression check).
  (e) Try to flip a populated category's mode → blocked with the real "holds stock" message.
- [ ] On operator "working": ship migrations to new-prod, push frontend, update PROGRESS + EOD.

---

# PHASE 2b — Serialized-unit division-scoping

*Serialized tools remain asset-tracked but gain a division owner and a unit-level transfer. Keeps `assigned_to` (person holds) alongside `division_id` (division owns) — design §11 Q3.*

## Task 2b.1 — Add `tool_asset_units.division_id` (NULL, no backfill)

**Files:** Create `supabase/migrations/20260827000000_tool_asset_units_division_id.sql` (+ mirror); regen `src/types/database.types.ts`; extend the `ToolAssetUnit` TS type (`useInventory.ts:357-370`).

- [ ] **Step 1 — Confirm RLS + absence of the column first:** `select column_name from information_schema.columns where table_name='tool_asset_units';` (assert no `division_id`); `select polname, cmd, qual, with_check from pg_policies where tablename='tool_asset_units';` (record current SELECT/write policies so the add doesn't regress them).
- [ ] **Step 2 — Migration:**

```sql
-- 20260827000000_tool_asset_units_division_id.sql
-- Division that OWNS a serialized unit. NULL for all existing units — the
-- operator sets each (design §11 Q1: no inference from stock/assignment).
-- assigned_to (the person holding it) is unchanged.
BEGIN;

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);

CREATE INDEX IF NOT EXISTS idx_tool_asset_units_division
  ON public.tool_asset_units(division_id);

COMMENT ON COLUMN public.tool_asset_units.division_id IS
  'Owning division (nullable; operator sets it). Distinct from assigned_to (person holding the unit).';

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 3 — Apply + mirror.** Verify: `select count(*) filter (where division_id is null) as unset, count(*) total from tool_asset_units;` → `unset = total`.
- [ ] **Step 4 — Regen types + re-append helper aliases.** Add `division_id: string | null` to the `ToolAssetUnit` type (`useInventory.ts:357-370`). `tsc` clean.
- [ ] **Step 5 — Commit.**

## Task 2b.2 — Unit edit dialog: Division select (keep `assigned_to`)

**Files:** Modify `src/components/services/inventory/ToolAssetEditDialog.tsx` (`ToolAssetUnitEditDialog`, `:97-236`); extend `useCreateToolAssetUnit` / `useUpdateToolAssetUnit` payloads (`useInventory.ts:749-803`).

- [ ] **Step 1 — Division state + control.** Add `divisionId` state seeded from `unit?.division_id ?? ''`; render a **Division** `Select` (from `useDivisions()`, human-readable `name` — never UUID) beside Condition/Status (`:180-200`), side-by-side, fixed `h-10`. Keep the existing Status/Assigned-To block untouched — division and person coexist. Include `divisionId` in `isDirty` (`:132-138`).
- [ ] **Step 2 — Payload.** Add `division_id: divisionId || null` to the create/update payload (`:145-152`). Extend both mutation input types (`:751`, `:777`) with `division_id?: string | null` and pass it through the insert/update objects.
- [ ] **Step 3 — Layout stability + Dropdown-UUID guard** (trigger shows the division name via `.find()`, placeholder "Select division…" when unset — never the raw id).
- [ ] **Step 4 — `tsc` + `eslint` clean. Commit.**

## Task 2b.3 — Unit-level transfer (RPC + dialog)

**Files:** Create `supabase/migrations/20260827000100_rpc_transfer_tool_unit.sql` (+ mirror); create `src/components/services/inventory/ToolUnitTransferDialog.tsx`; add a "Transfer" action to the serialized unit row (`ToolCategoryRow.tsx` `ToolUnitRows`, `:88-105`); add a `useTransferToolUnit` mutation (`useInventory.ts`).

- [ ] **Step 1 — RPC migration** (perm-gated; `revoke … from public`; keeps `assigned_to`):

```sql
-- 20260827000100_rpc_transfer_tool_unit.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_transfer_tool_unit(
  p_unit_id uuid,
  p_to_division_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from uuid;
BEGIN
  IF NOT _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_to_division_id IS NULL THEN
    RAISE EXCEPTION 'target division required';
  END IF;

  SELECT division_id INTO v_from FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit % not found', p_unit_id;
  END IF;

  -- Division owns, person holds: division_id moves, assigned_to is preserved.
  UPDATE public.tool_asset_units
     SET division_id = p_to_division_id
   WHERE id = p_unit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_transfer_tool_unit(uuid, uuid, text) FROM public;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 2 — Apply + mirror. Probe (rolled back):** move a unit A→B, assert `division_id=B` and `assigned_to` unchanged; call as a non-manager JWT → expect `not authorized`. Confirm single overload + `prosecdef=true` + no `public` EXECUTE grant (`select proacl from pg_proc where proname='rpc_transfer_tool_unit';`).
- [ ] **Step 3 — `useTransferToolUnit`** mutation calling `rpc_transfer_tool_unit`; invalidate `queryKeys.inventory.toolAssetUnits(item_id)` on success.
- [ ] **Step 4 — `ToolUnitTransferDialog`** — a small dialog with a Division `Select` (readable names) + optional notes; confirm irreversibility copy is neutral. Wire a "Transfer" button into the confirmed-unit row (`ToolCategoryRow.tsx:99-103`).
- [ ] **Step 5 — `tsc` + `eslint` clean. Commit** (migration + mirror + hook + dialog + row action).

## Task 2b.4 — Show the owning division on serialized unit rows

**Files:** Modify `src/components/services/inventory/ToolCategoryRow.tsx` (`ToolUnitRows` header + confirmed rows, `:70-105`); check `src/hooks/useAuditEntityNames.ts` (surfaces `tool_asset_units` — add division to any unit label if present).

- [ ] **Step 1 — Add a DIVISION column** to the serialized unit table (`:70-105`), resolving `unit.division_id` → division name via `useDivisions()` (`.find()`, human-readable; "—" when NULL). Keep the STATUS/assigned-person columns.
- [ ] **Step 2 — Audit names:** if `useAuditEntityNames` renders unit identifiers, include the division where useful (readable name, never UUID). No change if it doesn't touch units.
- [ ] **Step 3 — `tsc` + `eslint` clean. Commit.**

## Task 2b.5 — P2b verification, security, smoke, flow registry

- [ ] **Security checklist** row in `PROGRESS.md` `## 🔒 Security Audit Log`: `rpc_transfer_tool_unit` is `SECURITY DEFINER SET search_path`, perm-gated, `revoke … from public`; `tool_asset_units` RLS unchanged and still gated; layout stability on the new Division column/select.
- [ ] **Flow registry:** add "Transfer serialized tool unit (division owner)"; cross-link `[[Create Warehouse Transfer]]` (distinct path — this moves a unit's `division_id`, not qty).
- [ ] **Operator smoke (needs login):** set a unit's division in the edit dialog; Transfer it to another division → `division_id` changes, `assigned_to` (person) preserved, non-manager can't transfer; the unit row shows the new division.
- [ ] On operator "working": ship migrations to new-prod, push frontend, update PROGRESS + EOD.

---

## Self-Review

- **Spec coverage (design §6–§9):** `tool_tracking_mode` column + default (2a.1); bulk = qty machinery via mode-aware receival trigger (2a.2) + picker gate (2a.3); category toggle + switch guard (2a.4, §6.1/§11 Q2); `ToolsAssetsView` bulk qty rows vs serialized unit rows (2a.5); PO/receiving/consumption acceptance (2a.3 gate + 2a.7 confirmations); bulk tools in the ASSIGNMENT model (2a.6 routes to the dialog that writes `inventory_item_divisions`); serialized `division_id` NULL-backfill (2b.1, §11 Q1) + unit transfer keeping `assigned_to` (2b.3, §11 Q3) — all mapped.
- **Overlay boundary honored:** no task touches the unbuilt Phase-1 per-division category overlay; bulk tools join assignment + pools + transfers only (stated in Scope boundary + 2a.7 Step 3).
- **`type==='tools'` audit:** every one of the ~23 `'tools'` sites is classified in 2a.7 (4 mode-aware/done, ~11 confirm-only, 1 decision, the rest labels/casts) — plus the DB trigger that a `grep` over `src/` would miss.
- **No placeholders:** every migration, the guard/receival triggers, the transfer RPC, the picker-gate diff, and the populated-check hook are complete real SQL/TS; both rolled-back probes are written out.
- **Type consistency:** `tool_tracking_mode` enum + `inventory_item_divisions` + `rpc_set_item_divisions` / `rpc_transfer_tool_unit` / `create_tool_units_on_receival_layer` named identically across tasks; `ItemEditDialog` invoked with its real `{ categoryId, categoryType, item? }` signature.
- **Constraints baked in:** staging-only + mirror, `pg_get_functiondef` before `CREATE OR REPLACE`, rolled-back DO-block probes, `revoke … from public`, `.limit(N)` on every `.select`, `tsc`+`eslint` per task, no `next build`, co-author trailers, commit-after-operator-confirms.

## Open confirmations (flagged to operator — see the investigator's summary)

1. **Picker-gate mechanism** — filtering the items query by `inventory_categories.tool_tracking_mode='bulk'` for `type='tools'` (vs. a separate per-category mode map). Assumes the embedded `!inner` filter prunes serialized categories cleanly.
2. **Receival trigger is the make-or-break backend change** — bulk tools must NOT spawn `tool_asset_units`. It's a DB trigger, easy to miss.
3. **Mode is per category ROW** — subcategories do not inherit a parent's mode (each defaults `serialized`). Confirm no cascade is wanted.
4. **Bulk tools stay excluded from customer SO** (internal consume/transfer only). Confirm they should never be sellable.
5. **On cross-division unit transfer, `assigned_to` is preserved** even if that person belongs to the old division; and `ToolsAssetsView` remains division-agnostic (shows all categories/units regardless of active division). Confirm both.
