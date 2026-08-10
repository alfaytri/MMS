# Warehouse Origin Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inventory *origin* visible (and searchable where a picker searches) on every in-scope warehouse-operation surface, and fix the one report that merges distinct origins — so operators never count/transfer/adjust/ship the wrong origin variant.

**Architecture:** The stock model is already correct (every table/hook/RPC keys on `brand_variant_id`, the `(item, brand, origin)` leaf). This is a display + one-rollup-key change built on four shared levers: (A) a `country_name` column on `warehouse_stock_view`; (B) an `origin?` prop on the shared `ItemTreeCell`; (C) `country_codes` joins on four direct-variant hooks; (D) origin on the shared `WhItemPicker`. All labels reuse the existing pure helper `variantPickerLabel` for visual parity with the PO/SO side.

**Tech Stack:** Next.js (App Router, breaking-changes fork), React 18 + TanStack Query, Supabase (Postgres + RLS + PostgREST views), Tailwind, Vitest.

## Global Constraints

- **Migrations → STAGING ONLY** (`mwvblpgbgxipvrevkeff`), applied via `npx supabase db push`, and **byte-identical mirrored** into `supabase/migrations-staging/` in the same commit. Do NOT push to the dev DB.
- **Test server — no old data.** Do not backfill or migrate historic rows. Only new records carry origin. For smoke, repair ONE example variant.
- **Null origin is the common case.** Every render MUST degrade to today's exact appearance when origin is null — no stray separators, no layout shift (project layout-stability rule).
- **Dropdown/label UUID guard:** origin renders `country_codes.name`, never an id.
- **Reuse `variantPickerLabel`** (`src/lib/inventory/variantPickerLabel.ts`) for all brand+origin labels — do not hand-roll the brand/origin/Generic logic.
- **Supabase budget:** any new/changed list `.select()` keeps its existing `.limit(...)`; adding a join column does not remove a limit.
- **Commit trailers on every commit** (HEREDOC):
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **Commit gate:** stage + run `tsc`/verify per task, but hold the actual `git commit` until the operator confirms the slice works (project "commit only when confirmed working" rule). Commit cadence is confirmed at execution handoff.
- **Post-task rituals:** update `PROGRESS.md` (start + completion, separate docs commit) and append to `EOD/EOD-2026-08-10.md`. No new business flow/RPC here, so `docs/flows-registry.md` is unaffected; the security checklist row is added in Task 13.

---

## File Structure

**New files**
- `supabase/migrations/20260819210000_warehouse_stock_view_origin.sql` (+ staging mirror) — origin on the stock view.
- `supabase/migrations/20260819220000_inventory_check_items_origin.sql` (+ staging mirror) — origin snapshot column on check items.

**Modified — data layer**
- `src/lib/... ` none new; reuse `src/lib/inventory/variantPickerLabel.ts` (unchanged).
- `src/hooks/useWarehouseOperations.ts` — row types + selects (Tasks 4, 9).
- `src/hooks/useInventory.ts` — `useAllBrandVariantsGrouped` join (Task 7).

**Modified — shared display**
- `src/components/purchase/wh/ItemTreeCell.tsx` — `origin?` prop (Task 3). Feeds 6 surfaces.
- `src/components/purchase/wh/WhItemPicker.tsx` — `countryName` on `PickerItem` (Task 7). Feeds 2 pick paths.

**Modified — surfaces (mechanical prop-wiring)**
- Stock: `WarehouseStockTree.tsx`, `WhStockOverviewTab.tsx`, `WhStockDetailDialog.tsx`, `WhStockValueTab.tsx` (Task 5).
- Transfers/Movements: `WhTransfersTab.tsx`, `WhTransferDialog.tsx`, `WhMovementsTab.tsx` (Task 6).
- Adjustments: `WhAdjustmentDialog.tsx`, `WhAdjustmentsTab.tsx`, `WhAdjustmentDetailDialog.tsx` (Tasks 7 picker + 8 display).
- Inventory check: `WhInventoryCheckStartDialog.tsx` (Task 9), `WhInventoryCheckDetail.tsx` (Task 10).
- Report: `src/app/api/warehouse/reports/route.ts`, `src/lib/warehouse/warehouse-report-html.ts` (Task 11).
- Delivery: `src/components/sales/SoDeliveryDialog.tsx` (Task 12).

**Testing reality (read before starting):** this repo unit-tests *pure lib logic* with Vitest (e.g. `variantPickerLabel.test.ts`), not React components. So UI tasks are verified by `npx tsc --noEmit` + a targeted `grep` that the origin field is wired, and the single consolidated **operator smoke** in Task 13 — do NOT invent brittle component render tests. DB tasks are verified by `db push` + a `db query` column check.

---

### Task 1: Migration — origin on `warehouse_stock_view` (Lever A)

**Files:**
- Create: `supabase/migrations/20260819210000_warehouse_stock_view_origin.sql`
- Create (mirror): `supabase/migrations-staging/20260819210000_warehouse_stock_view_origin.sql`

**Interfaces:**
- Produces: `warehouse_stock_view` now returns `country_id integer | null` and `country_name text | null` (appended after `image_url`). Consumed by every hook that reads the view.

- [ ] **Step 1: Confirm the timestamp still sorts last**

Run: `ls supabase/migrations/ | sort | tail -1`
Expected: a name < `20260819210000`. If not, bump both new files to sort after it.

- [ ] **Step 2: Write the migration (append two columns; keep the existing shape verbatim)**

```sql
-- Warehouse Origin Visibility — Task 1
-- Expose origin on warehouse_stock_view so every warehouse-stock-fed surface
-- (stock tree/overview/value, transfer picker + list + receive, movements feed,
-- reorder editor, printed report) can label the (item, brand, ORIGIN) leaf.
-- The variant `bv` is already joined; add its country_id + a country_codes name.
-- CREATE OR REPLACE VIEW cannot rename/reorder columns, so the two new columns
-- are appended at the end (same rule as 20260815001900). security_invoker kept.

CREATE OR REPLACE VIEW public.warehouse_stock_view AS
SELECT
  wss.warehouse_id,
  wss.sub_container_id,
  wss.brand_variant_id,
  wss.item_name,
  wss.brand,
  wss.sku,
  wss.unit,
  wss.qty,
  wss.avg_cost,
  wss.total_value,
  wss.category_name,
  wss.subcategory_name,
  wss.item_type,
  wss.allocated_qty,
  wss.available_qty,
  wsc.name AS sub_container_name,
  ii.image_url AS image_url,
  bv.country_id AS country_id,
  cc.name AS country_name
FROM public.warehouse_stock_summary wss
LEFT JOIN public.warehouse_sub_containers wsc
  ON wsc.id = wss.sub_container_id
LEFT JOIN public.inventory_item_brand_variants bv
  ON bv.id = wss.brand_variant_id
LEFT JOIN public.inventory_items ii
  ON ii.id = bv.item_id
LEFT JOIN public.country_codes cc
  ON cc.id = bv.country_id;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
```

- [ ] **Step 3: Copy the file byte-identically to the staging mirror**

Use the Read tool then Write tool (do NOT use PowerShell `Set-Content -Encoding utf8` — it writes a BOM that `db push` rejects). Confirm identical bytes.

- [ ] **Step 4: Apply to staging**

Run: `npx supabase db push`
Expected: applies `20260819210000_warehouse_stock_view_origin.sql`.

- [ ] **Step 5: Verify the columns exist and resolve**

Run (single line):
`npx supabase db query --linked "select column_name from information_schema.columns where table_name='warehouse_stock_view' and column_name in ('country_id','country_name') order by 1;"`
Expected: two rows — `country_id`, `country_name`.

- [ ] **Step 6: Confirm remote in sync**

Run: `npx supabase db push --dry-run`
Expected: "Remote database is up to date."

- [ ] **Step 7: Commit (gated on operator confirm)**

```bash
git add supabase/migrations/20260819210000_warehouse_stock_view_origin.sql supabase/migrations-staging/20260819210000_warehouse_stock_view_origin.sql
git commit -m "$(cat <<'EOF'
feat(db): expose origin (country_id, country_name) on warehouse_stock_view

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration — `inventory_check_items.country_name` (capture support)

**Files:**
- Create: `supabase/migrations/20260819220000_inventory_check_items_origin.sql`
- Create (mirror): `supabase/migrations-staging/20260819220000_inventory_check_items_origin.sql`

**Interfaces:**
- Produces: `inventory_check_items.country_name text | null` — the origin snapshot written at check start (Task 9), read on the count sheet (Task 10).

- [ ] **Step 1: Write the migration**

```sql
-- Warehouse Origin Visibility — Task 2
-- inventory_check_items rows are point-in-time snapshots (they already
-- denormalize item_name / brand / sku). Add a country_name snapshot so a
-- physical counter can tell two same-item+same-brand piles apart by origin.
-- Mirrors the existing `brand` text column exactly (no FK). Nullable; no
-- backfill (test server — historic checks are irrelevant).

ALTER TABLE public.inventory_check_items
  ADD COLUMN IF NOT EXISTS country_name text;
```

- [ ] **Step 2: Mirror byte-identically** (Read → Write; no BOM).

- [ ] **Step 3: Apply**

Run: `npx supabase db push`
Expected: applies `20260819220000_inventory_check_items_origin.sql`.

- [ ] **Step 4: Verify the column**

Run (single line):
`npx supabase db query --linked "select column_name, data_type from information_schema.columns where table_name='inventory_check_items' and column_name='country_name';"`
Expected: one row — `country_name | text`.

- [ ] **Step 5: Dry-run in sync + commit (gated)**

```bash
npx supabase db push --dry-run
git add supabase/migrations/20260819220000_inventory_check_items_origin.sql supabase/migrations-staging/20260819220000_inventory_check_items_origin.sql
git commit -m "$(cat <<'EOF'
feat(db): add country_name origin snapshot to inventory_check_items

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ItemTreeCell` gains an `origin` prop (Lever B)

**Files:**
- Modify: `src/components/purchase/wh/ItemTreeCell.tsx`

**Interfaces:**
- Consumes: `variantPickerLabel` from `src/lib/inventory/variantPickerLabel.ts`.
- Produces: `ItemTreeCell` accepts `origin?: string | null`. When origin is present it renders ` · <origin>` after the brand; an origin-only variant shows the origin as the primary variant label; a variant with neither brand nor origin renders exactly as today (nothing).

- [ ] **Step 1: Replace the component with the origin-aware version**

Replace the whole file body with:

```tsx
import React from 'react'
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'

const TYPE_SHORT_LABEL: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

interface ItemTreeCellProps {
  category?: string | null
  subcategory?: string | null
  itemType?: string | null
  itemName: string
  brand?: string | null
  /** country_codes.name for the variant's origin, or null. */
  origin?: string | null
  sku?: string | null
  showSku?: boolean
}

export function ItemTreeCell({ category, subcategory, itemType, itemName, brand, origin, sku, showSku }: ItemTreeCellProps) {
  const hasParent = !!(category || subcategory)
  const depth = subcategory ? 2 : category ? 1 : 0
  // Reuse the PO/SO label rules: brand wins as primary; origin-only leaf shows
  // origin as primary; neither → "Generic" (which we suppress below to keep the
  // no-brand/no-origin row visually identical to today).
  const label = variantPickerLabel({ brand, country_name: origin })
  const showVariantLine = !!brand || !!origin
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {category && (
        <span className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
          <span className="break-words">
            {category}
            {subcategory && <span className="text-muted-foreground/60"> / {subcategory}</span>}
          </span>
          {itemType && TYPE_SHORT_LABEL[itemType] && (
            <span className="text-[9px] font-normal text-muted-foreground border border-border rounded px-1 py-0 leading-tight whitespace-nowrap">
              {TYPE_SHORT_LABEL[itemType]}
            </span>
          )}
        </span>
      )}
      <span
        className="font-medium text-xs truncate"
        style={{ paddingLeft: hasParent ? 12 : 0 }}
      >
        {itemName}
      </span>
      {showVariantLine && (
        <span
          className="text-[10px] text-primary truncate"
          style={{ paddingLeft: depth >= 1 ? 24 : 12 }}
        >
          {label.primary}
          {label.origin && <span className="text-muted-foreground"> · {label.origin}</span>}
          {showSku && sku && <span className="text-muted-foreground ml-1">({sku})</span>}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the new prop is optional — existing call-sites still compile).

- [ ] **Step 3: Sanity-check the label helper is unchanged/green**

Run: `npm run test:run src/lib/inventory/variantPickerLabel.test.ts`
Expected: PASS (we only consume it).

- [ ] **Step 4: Commit (gated)** — `feat(wh): add origin line to ItemTreeCell (shared display atom)`.

---

### Task 4: Origin in the warehouse data layer (`useWarehouseOperations.ts`)

**Files:**
- Modify: `src/hooks/useWarehouseOperations.ts`

**Interfaces:**
- Consumes: `warehouse_stock_view.country_name` (Task 1).
- Produces: `WarehouseStockItem.country_name`, `InventoryCheckItem.country_name`, `StockMovement.country_name`, `StockAdjustment` join origin, `CheckGeneratedSA.country_name` — all `string | null`. Consumed by Tasks 5, 6, 8, 10.

- [ ] **Step 1: Add `country_name` to the affected row types**

In `WarehouseStockItem` (after `brand: string | null`) add `country_name: string | null`.
In `InventoryCheckItem` (after `brand: string`) add `country_name: string | null`.
In `StockMovement` (after `item_name`) add `country_name: string | null`.
In `CheckGeneratedSA` (after `brand`) add `country_name: string | null`.
`StockAdjustment` carries origin only through its embedded variant join (Step 4) — no top-level field needed unless a consumer reads it flat; if `WhAdjustmentsTab`/`DetailDialog` read a flat field, add `country_name: string | null` here too and map it in Step 4.

- [ ] **Step 2: `useWarehouseStock` — select + map the new view column**

In the `.select('warehouse_id, sub_container_id, sub_container_name, brand_variant_id, item_name, brand, sku, unit, qty, avg_cost, total_value, category_name, subcategory_name, item_type, allocated_qty, available_qty, image_url')` string, append `, country_id, country_name`. The row already casts to `WarehouseStockItem`; `country_name` now flows through.

- [ ] **Step 3: `useStockMovements` — add origin via the variant join on BOTH streams**

Good side: extend the `.from('inventory_stock_movements').select('...')` embed to fetch origin via the variant FK — append `, inventory_item_brand_variants:brand_variant_id(country_codes(name))` to the select string. Confirm the relationship name resolves (there is a FK `inventory_stock_movements.brand_variant_id → inventory_item_brand_variants.id`); if PostgREST needs the explicit constraint alias, use it. In the `good` row map, set `country_name: (r as any).inventory_item_brand_variants?.country_codes?.name ?? null` and strip the embed from `...rest` so it doesn't leak into the typed row.

Damaged side: in the embed `inventory_item_brand_variants ( brand, code, inventory_items ( name_en, sku ) )`, add `country_codes ( name )` → `inventory_item_brand_variants ( brand, code, country_codes ( name ), inventory_items ( name_en, sku ) )`. In `DamagedMovementJoinRow`, add `country_codes: { name: string | null } | null` under the variant. In the `damaged` row map, set `country_name: bv?.country_codes?.name ?? null`.

- [ ] **Step 4: `useStockAdjustments` — add origin to the variant embed**

Change the embed `inventory_item_brand_variants(brand, inventory_items(name_en, sku, inventory_categories(id, name_en, type)))` to `inventory_item_brand_variants(brand, country_codes(name), inventory_items(name_en, sku, inventory_categories(id, name_en, type)))`. If Step 1 added a flat `StockAdjustment.country_name`, map it in the row `.map(...)` as `country_name: (r as any).inventory_item_brand_variants?.country_codes?.name ?? null`; otherwise consumers read it from the embed directly.

- [ ] **Step 5: `useInventoryCheckGeneratedSAs` — add origin to the embed + output**

Change the embed `inventory_item_brand_variants(brand, inventory_items(name_en, sku))` to `inventory_item_brand_variants(brand, country_codes(name), inventory_items(name_en, sku))`, extend the local result type with `country_codes: { name: string | null } | null` under the variant, and add `country_name: r.inventory_item_brand_variants?.country_codes?.name ?? null` to the returned `CheckGeneratedSA`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify a join returns origin (targeted)**

Run (single line):
`npx supabase db query --linked "select bv.id, cc.name as origin from inventory_item_brand_variants bv left join country_codes cc on cc.id=bv.country_id where bv.country_id is not null limit 3;"`
Expected: rows with a non-null `origin` if any origin variant exists yet (0 rows is fine before the smoke variant is repaired).

- [ ] **Step 8: Commit (gated)** — `feat(wh): plumb origin through warehouse data-layer hooks`.

---

### Task 5: Stock read surfaces render origin (Lever A + B)

**Files:**
- Modify: `src/components/purchase/wh/WarehouseStockTree.tsx`
- Modify: `src/components/purchase/wh/WhStockOverviewTab.tsx`
- Modify: `src/components/purchase/wh/WhStockDetailDialog.tsx`
- Modify: `src/components/purchase/wh/WhStockValueTab.tsx`

**Interfaces:**
- Consumes: `WarehouseStockItem.country_name` (Task 4), `ItemTreeCell origin` (Task 3).

**The wiring pattern (identical everywhere):** wherever a variant/brand row already renders a label or an `<ItemTreeCell .../>`, pass the origin from the row. For `ItemTreeCell`, add one prop: `origin={row.country_name}`. For inline brand spans (e.g. the tree's brand leaf), replace the bare `brand ?? '—'` with `variantPickerLabel({ brand, country_name })` output: `primary` then, if `origin`, a muted ` · origin`.

- [ ] **Step 1: `WhStockDetailDialog.tsx`** — the per-warehouse `ItemTreeCell` (~L48–56) gets `origin={item.country_name}` (thread `country_name` through the props/rows the dialog receives from its caller; the caller row is a `WarehouseStockItem`).

- [ ] **Step 2: `WhStockValueTab.tsx`** — origins are already split into separate `MergedRow`s (keyed on `brand_variant_id`); carry `country_name` onto `MergedRow` when building it (~L375–433) and render it beside brand/sku (~L801–806, mobile L686–689). Add `country_name` to the search haystack (~L358–368) so origin is searchable.

- [ ] **Step 3: `WhStockOverviewTab.tsx`** — desktop brand label (~L392–393), single-brand item (~L429–434), tooltip label (~L441), mobile (~L645, L680): render origin via `variantPickerLabel`. Ensure the "N brands" count (~L431) counts distinct `brand_variant_id`, not brand strings, so two origins aren't mislabeled as "2 brands" (if it currently counts brand strings, switch to counting variant rows). Add `country_name` to search (~L282–293).

- [ ] **Step 4: `WarehouseStockTree.tsx`** — brand leaf (~L260–261), single-brand item (~L315–320), multi-brand tooltip (~L330): render origin via `variantPickerLabel`. The reorder popover (~L264–289) inherits the label. Keep grouping keyed on `brand_variant_id` (~L141/L151).

- [ ] **Step 5: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "country_name\|variantPickerLabel" src/components/purchase/wh/WarehouseStockTree.tsx src/components/purchase/wh/WhStockOverviewTab.tsx src/components/purchase/wh/WhStockDetailDialog.tsx src/components/purchase/wh/WhStockValueTab.tsx`
Expected: tsc clean; grep shows origin wired in all four.

- [ ] **Step 6: Commit (gated)** — `feat(wh): show origin on stock tree / overview / detail / value`.

---

### Task 6: Transfers + Movements surfaces render origin (Lever A + B)

**Files:**
- Modify: `src/components/purchase/wh/WhTransfersTab.tsx`
- Modify: `src/components/purchase/wh/WhTransferDialog.tsx`
- Modify: `src/components/purchase/wh/WhMovementsTab.tsx`

**Interfaces:**
- Consumes: `warehouse_stock_view.country_name` (via the tab's own view read), `WarehouseStockItem.country_name`, `StockMovement.country_name`, `ItemTreeCell origin`.

- [ ] **Step 1: `WhTransfersTab.tsx`** — its `variantMeta` map is built from the view (~L93–108); add `country_name` to that map's value, then pass `origin={meta?.country_name}` to the list `ItemTreeCell` (~L476–484) and the receive-subform `ItemTreeCell` (~L602–609).

- [ ] **Step 2: `WhMovementsTab.tsx`** — same shape: add `country_name` to `variantMeta` (~L145–153), pass `origin` to `ItemTreeCell` (mobile ~L276–284, desktop ~L353–361), add to search (~L174–176).

- [ ] **Step 3: `WhTransferDialog.tsx`** — the selected-item summary row (~L479–488) renders origin next to brand via `variantPickerLabel` (the picker chip itself is handled in Task 7). The picker items built at ~L155–168 come from the view, which now carries `country_name` — pass it into the `PickerItem.countryName` field (Task 7 adds that field).

- [ ] **Step 4: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "country_name\|variantPickerLabel" src/components/purchase/wh/WhTransfersTab.tsx src/components/purchase/wh/WhTransferDialog.tsx src/components/purchase/wh/WhMovementsTab.tsx`
Expected: tsc clean; origin wired in all three.

- [ ] **Step 5: Commit (gated)** — `feat(wh): show origin on transfers list/receive/create + movements feed`.

---

### Task 7: `WhItemPicker` shows + searches origin (Lever D) + adjustment source join

**Files:**
- Modify: `src/components/purchase/wh/WhItemPicker.tsx`
- Modify: `src/hooks/useInventory.ts` (`useAllBrandVariantsGrouped`)
- Modify: `src/components/purchase/wh/WhAdjustmentDialog.tsx` (build `PickerItem.countryName`)
- Modify: `src/components/purchase/wh/WhTransferDialog.tsx` (build `PickerItem.countryName` — same edit referenced in Task 6 Step 3)

**Interfaces:**
- Consumes: `variantPickerLabel`; `country_codes.name` from `useAllBrandVariantsGrouped` and `warehouse_stock_view`.
- Produces: `PickerItem.countryName: string | null`. Both pick paths (transfer, adjustment) now disambiguate by origin.

- [ ] **Step 1: Add `countryName` to `PickerItem` and render it on the chip + title + search**

In `WhItemPicker.tsx`:
- Add to `PickerItem` (after `brand`): `/** country_codes.name; null = no origin. */ countryName?: string | null`.
- Import the helper at the top: `import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'`.
- Search haystack (L90): change `[s.name, s.brand, s.sku, s.category]` to `[s.name, s.brand, s.countryName, s.sku, s.category]`.
- Chip (L221–223): compute per-variant label and render origin. Replace the button `title` and the brand `<span>`:

```tsx
                        const vlabel = variantPickerLabel({ brand: v.brand, country_name: v.countryName })
                        // ...inside the <button>:
                        title={`${vlabel.primary}${vlabel.origin ? ` · ${vlabel.origin}` : ''}${v.sku ? ` (${v.sku})` : ''}${qty !== undefined ? ` — ${qty} available` : ''}${showDestBadge && v.destQty !== undefined ? ` · dest has ${v.destQty}` : ''}`}
```

```tsx
                            <span className="px-2 py-1 font-medium">
                              {vlabel.primary}
                              {vlabel.origin && <span className="font-normal opacity-70"> · {vlabel.origin}</span>}
                            </span>
```

(Move the `const vlabel = ...` line up beside the existing `const isSelected = ...` block so it's in scope for both `title` and the span.)

- [ ] **Step 2: `useAllBrandVariantsGrouped` — add the origin join + field**

In `src/hooks/useInventory.ts` (~L278–330), add `country_codes ( name )` to the variant `.select(...)` embed and expose `country_name: <row>.country_codes?.name ?? null` on each grouped variant's shape (mirror how `brand` is exposed). Keep the existing `.limit(...)`.

- [ ] **Step 3: Wire `countryName` at both call-sites**

- `WhAdjustmentDialog.tsx` (~L64–74): when mapping grouped variants → `PickerItem`, add `countryName: v.country_name ?? null`.
- `WhTransferDialog.tsx` (~L155–168): when mapping view stock → `PickerItem`, add `countryName: s.country_name ?? null`.

- [ ] **Step 4: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "countryName\|country_name" src/components/purchase/wh/WhItemPicker.tsx src/hooks/useInventory.ts src/components/purchase/wh/WhAdjustmentDialog.tsx src/components/purchase/wh/WhTransferDialog.tsx`
Expected: tsc clean; `countryName` set at both call-sites, join present in the hook.

- [ ] **Step 5: Commit (gated)** — `feat(wh): disambiguate origin in the shared item picker (transfer + adjustment)`.

---

### Task 8: Adjustment display surfaces render origin (Lever B + C)

**Files:**
- Modify: `src/components/purchase/wh/WhAdjustmentDialog.tsx` (selected-item display, ~L260–267)
- Modify: `src/components/purchase/wh/WhAdjustmentsTab.tsx` (list, ~L182–187 mobile / ~L267–272 desktop; row type ~L38–45)
- Modify: `src/components/purchase/wh/WhAdjustmentDetailDialog.tsx` (approval, ~L172; row type ~L38–45)

**Interfaces:**
- Consumes: the `useStockAdjustments` origin embed (Task 4 Step 4), `ItemTreeCell origin` (Task 3).

- [ ] **Step 1: `WhAdjustmentDialog.tsx`** — the selected-item summary (~L260–267) renders origin via `variantPickerLabel` next to brand (the picker chip is already done in Task 7).

- [ ] **Step 2: `WhAdjustmentsTab.tsx`** — add `country_name: string | null` to the local row type (~L38–45), read it from the `inventory_item_brand_variants.country_codes.name` embed, and pass `origin={row.country_name}` to both `ItemTreeCell`s (~L182–187, ~L267–272).

- [ ] **Step 3: `WhAdjustmentDetailDialog.tsx`** — same: extend the row type (~L38–45), read the embed, pass `origin=` to the `ItemTreeCell` (~L172) so the approver sees which origin is being adjusted.

- [ ] **Step 4: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "country_name\|origin=" src/components/purchase/wh/WhAdjustmentDialog.tsx src/components/purchase/wh/WhAdjustmentsTab.tsx src/components/purchase/wh/WhAdjustmentDetailDialog.tsx`
Expected: tsc clean; origin wired at create/list/approval.

- [ ] **Step 5: Commit (gated)** — `feat(wh): show origin on adjustment create/list/approval`.

---

### Task 9: Inventory-check capture — snapshot origin at start

**Files:**
- Modify: `src/components/purchase/wh/WhInventoryCheckStartDialog.tsx` (snapshot build, ~L150–157)
- Modify: `src/hooks/useWarehouseOperations.ts` (`StartCheckPayload.assignments[].items` type + `useStartInventoryCheck` insert, ~L1182–1249)

**Interfaces:**
- Consumes: `warehouse_stock_view.country_name` (the start dialog reads the view for the snapshot); `inventory_check_items.country_name` (Task 2).
- Produces: new `inventory_check_items` rows carry `country_name`. Consumed by Task 10.

- [ ] **Step 1: Extend the payload item shape**

In `useWarehouseOperations.ts`, in `StartCheckPayload` → `assignments[].items[]`, add `country_name: string | null` after `sku`.

- [ ] **Step 2: Write origin into the inserted rows**

In `useStartInventoryCheck`, in the `itemRows` map (~L1238–1248) add `country_name: item.country_name ?? null` to each inserted row.

- [ ] **Step 3: Carry origin from the snapshot in the start dialog**

In `WhInventoryCheckStartDialog.tsx`, where the snapshot items are built (~L150–157) from the warehouse stock (`WarehouseStockItem`, which now has `country_name`), add `country_name: s.country_name ?? null` to each item pushed into the assignment.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify a fresh check stores origin (after the smoke variant exists)**

Deferred to Task 13 smoke: start a check on a warehouse holding the 2-origin example, then
`npx supabase db query --linked "select item_name, brand, country_name from inventory_check_items order by created_at desc limit 4;"`
Expected: the two example rows show distinct `country_name`.

- [ ] **Step 6: Commit (gated)** — `feat(wh): capture origin snapshot into inventory_check_items at start`.

---

### Task 10: Inventory-check display renders origin

**Files:**
- Modify: `src/components/purchase/wh/WhInventoryCheckDetail.tsx` (count rows desktop ~L139–144 / mobile ~L189–194; reconciliation ~L1066–1071; generated-SAs ~L945–948; post-count ~L992–997)

**Interfaces:**
- Consumes: `InventoryCheckItem.country_name` (stored, Task 2/9), `CheckGeneratedSA.country_name` (Task 4 Step 5), `ItemTreeCell origin` (Task 3).

- [ ] **Step 1: Count sheet rows** — pass `origin={item.country_name}` to the count-row `ItemTreeCell` (desktop ~L139–144, mobile ~L189–194). The counter can now tell the two piles apart.

- [ ] **Step 2: Reconciliation + generated-SAs + post-count** — pass origin to each `ItemTreeCell` (~L1066–1071, ~L945–948, ~L992–997). Generated-SAs read `CheckGeneratedSA.country_name`; post-count movements may lack origin (good-side) — pass `null`, which degrades cleanly.

- [ ] **Step 3: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "country_name\|origin=" src/components/purchase/wh/WhInventoryCheckDetail.tsx`
Expected: tsc clean; origin wired on count + review.

- [ ] **Step 4: Commit (gated)** — `feat(wh): show origin on inventory-check count sheet + review`.

---

### Task 11: Printed warehouse report — stop merging origins + label

**Files:**
- Modify: `src/app/api/warehouse/reports/route.ts` (`fetchStockOverview` ~L83–L127; `fetchStockValue` ~L220–L245)
- Modify: `src/lib/warehouse/warehouse-report-html.ts` (`StockOverviewRow` ~L206–216 + render ~L238–249; `StockValueReportRow` ~L501–512 + render ~L529–540)

**Interfaces:**
- Consumes: `warehouse_stock_view.brand_variant_id` + `.country_name` (Task 1).
- Produces: report rows that never merge two origins; each shows an `origin` column/label.

- [ ] **Step 1: `fetchStockOverview` — select + rollup key**

Add `brand_variant_id, country_name` to the `.select(...)` (~L86). Change the rollup key (~L105) from
`` `${r.warehouse_id ?? ''}|${r.item_name ?? ''}|${r.brand ?? ''}|${r.sku ?? ''}` ``
to
`` `${r.warehouse_id ?? ''}|${r.brand_variant_id ?? ''}` ``
so sub-container rows of the *same variant* still roll up, but two distinct origin variants never merge. Add `origin: (r.country_name as string | null) ?? null` to the row object created at ~L111–123.

- [ ] **Step 2: `fetchStockValue` — same treatment**

Add `brand_variant_id, country_name` to its `.select(...)` (~L225); change its rollup key (~L240) to `` `${r.warehouse_id ?? ''}|${r.brand_variant_id ?? ''}` ``; add `origin` to its row object.

- [ ] **Step 3: `warehouse-report-html.ts` — row types + column**

Add `origin: string | null` to `StockOverviewRow` (~L206–216) and `StockValueReportRow` (~L501–512). In each table's row render (~L238–249, ~L529–540), show origin — either an extra small column or appended to the brand cell as ` · {origin}` when non-null (match the table's existing column layout; prefer appending to the brand cell to avoid reflowing the print columns).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify the merge is gone (after smoke variant exists)** — deferred to Task 13: generate the report for the warehouse holding the 2-origin example and confirm two separate lines with correct quantities.

- [ ] **Step 6: Commit (gated)** — `fix(wh-report): key stock rollup on brand_variant_id so origins never merge + show origin`.

---

### Task 12: Create-Delivery line shows origin

**Files:**
- Modify: `src/components/sales/SoDeliveryDialog.tsx` (line label ~L254–257)

**Interfaces:**
- Consumes: `SOLineItem.inventory_item_brand_variants.country_codes.name` — already selected in `useSaleOrders.ts` (L36/L561). No query change.

- [ ] **Step 1: Render origin on the delivery line**

At ~L254–257 the line renders `line.item_name` + `{bv?.brand && … — {bv.brand}}`. Extend it to show origin using `variantPickerLabel({ brand: bv?.brand, brand_name: bv?.brands?.name, country_name: bv?.country_codes?.name })` — render `primary` and, when present, ` · origin`. Confirm the exact `bv` field path against `SOLineItem` in `useSaleOrders.ts` (it exposes `country_codes.name`).

- [ ] **Step 2: Type-check + grep**

Run: `npx tsc --noEmit`
Run: `grep -n "country_codes\|variantPickerLabel" src/components/sales/SoDeliveryDialog.tsx`
Expected: tsc clean; origin wired.

- [ ] **Step 3: Commit (gated)** — `feat(sales): show origin on Create-Delivery lines`.

---

### Task 13: Verification, docs, trackers, operator smoke

**Files:**
- Modify: `PROGRESS.md`, `EOD/EOD-2026-08-10.md`
- Modify: `docs/future-plans.md` (Tier 3 deferred tracker) and/or a new `docs/plans/2026-08-10-warehouse-origin-visibility/deferred-and-warranty-readiness.md`

- [ ] **Step 1: Full type-check + migration sync**

Run: `npx tsc --noEmit` → clean.
Run: `npx supabase db push --dry-run` → "Remote database is up to date."

- [ ] **Step 2: Repair ONE example variant (smoke seed)**

Pick an existing item; ensure it has two variants under the SAME brand with DISTINCT `country_id` (Qatar vs UAE). If needed, set `country_id` on one existing variant via the catalog UI (preferred) or a single targeted update. Confirm both appear with origin on the stock overview.

- [ ] **Step 3: Operator smoke (hand to operator — sign-off gate)**

Walk the checklist in `spec.md` §7: stock overview/tree/value (two labeled rows), transfer create (picker shows/searches origin; correct leaf recorded), adjustment create + approval (origin visible both steps), inventory check (count sheet distinguishes the two; review + generated SAs show origin; `inventory_check_items.country_name` populated), printed report (two lines, not summed), Create-Delivery (two same-brand lines distinguishable), and layout stability (no shift when origin absent).

- [ ] **Step 4: Record deferred Tier 3 + warranty readiness**

Add/confirm a tracker entry (in `docs/future-plans.md` under a new "Warehouse origin — Tier 3 cosmetics" heading, and the warranty-readiness note from `spec.md` §9) so the deferred items and the 3 warranty requirements aren't lost.

- [ ] **Step 5: Security checklist row + PROGRESS + EOD**

Add a `## 🔒 Security Audit Log` row to `PROGRESS.md`: Secrets ✅ (none touched), RLS ✅ (no new tables; view stays `security_invoker`), Auth gate ✅ (no new routes), Error handling ✅ (no new external calls), Layout stability ✅ (null-origin degrade verified in smoke). Update `## ✅ Completed` + `## 🔄 In Progress`. Append the task to `EOD/EOD-2026-08-10.md`.

- [ ] **Step 6: Final docs commit (gated)** — `docs: warehouse origin visibility complete — deferred tracker + security log`.

---

## Self-Review (against spec)

- **Spec §4 levers** → Task 1 (A), Task 3 (B), Task 4 + Task 7 Step 2 (C), Task 7 (D). ✅
- **Spec §5 Tier 1** → inventory-count capture (Task 9) + display (Task 10); shared picker (Task 7); adjustment approval (Task 8). ✅
- **Spec §5 Tier 2** → report merge fix (Task 11); central read surfaces (Tasks 5, 6); Create-Delivery (Task 12). ✅
- **Spec §6 migrations** → Task 1, Task 2 (both mirrored). ✅
- **Spec §7 verification** → per-task tsc/grep/db + Task 13 operator smoke. ✅
- **Spec §8 deferred / §9 warranty** → Task 13 Step 4 tracker (not built). ✅
- **Spec §10 null-origin degrade** → Task 3 suppresses the variant line when brand+origin both null; every wiring passes `?? null`; verified in Task 13 smoke. ✅
- **Type consistency:** `country_name` used everywhere (view column, row types, `PickerItem.countryName`, `inventory_check_items.country_name`); `variantPickerLabel({ brand, country_name })` signature matches the helper. ✅
