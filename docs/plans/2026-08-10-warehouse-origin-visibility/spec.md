# Spec — Warehouse Origin Visibility

**Date:** 2026-08-10
**Branch:** `feature/warehouse-origin-visibility` (off `deploy/warehouse-shipping`)
**Status:** Draft for review
**Scope decision:** Tier 1 (operational hazards) + Tier 2 (correctness + central displays).
Tier 3 cosmetics and warranty work are **deferred** (tracked at the bottom of this file).

---

## 1. Background — the change that triggered this

The Inventory Brands & Origin feature (shipped 2026-08-08) made **origin a dimension of
the stocked/priced leaf**. A "variant" (`public.inventory_item_brand_variants`) is now
identified by `(item, brand, origin)` instead of `(item, brand)`:

- `brand_id uuid` (nullable) — FK to `brands`
- `country_id integer` (nullable) — FK to `country_codes(id)`; display name via `country_codes.name`
- The free-text `brand` column is retained as a synced mirror.

The catalog, PO pickers, SO/quotation pickers, and the delivery-note / invoice PDFs were
already made origin-aware (see `docs/inventory-origin-po-so-pickers/`). A pure, unit-tested
label helper exists and is the reuse vehicle:

`src/lib/inventory/variantPickerLabel.ts` →
`variantPickerLabel({ brand_name?, brand?, country_name? }) => { primary, origin }`
(brand wins as primary; origin-only leaf shows origin as primary; neither → "Generic").

## 2. Core finding

**The data model is correct and was not corrupted.** Every warehouse stock table, hook, and
RPC keys on `brand_variant_id` — the exact `(item, brand, origin)` leaf — so balances,
FIFO layers, transfers, adjustments, checks, and reorder points all already track stock at
the right grain.

**The gap is display/disambiguation.** Origin is invisible on every warehouse screen. Because
the same item+brand can now be two variants that differ *only* by origin, those variants
render as identical rows. In read-only surfaces that is cosmetic; in a few write/count
surfaces an operator can act on the **wrong origin**, moving/destroying/miscounting real
stock. There is exactly **one true correctness bug**: the printed warehouse report merges
distinct origins into one summed line.

## 3. Goals / Non-goals

**Goals**
- Make origin visible (and searchable where a picker searches) on every in-scope warehouse
  surface, using the existing `variantPickerLabel` convention for visual consistency with
  PO/SO.
- Close the count/pick/approve hazards where a hidden origin can cause a wrong-stock action.
- Fix the printed-report merge so two origins are never summed into one line.
- Do it with shared levers (one view column, one shared display prop, one shared picker
  field) rather than per-file bespoke code.

**Non-goals (this branch)**
- Tier 3 cosmetic labels (low-stock alert text, dead/damaged/stock-value **report** labels,
  `ReplacementDeliveryDialog`). Tracked below.
- The warranty module itself. Origin-readiness requirements for it are documented below.
- Any change to stock math, FIFO, reorder grain, or RLS. Display + one report rollup key only.

## 4. Design — the shared levers

Most surfaces collapse into four reusable changes:

### 4.1 Lever A — `warehouse_stock_view` gains origin (one migration)
The view already `LEFT JOIN`s the variant (`bv`). Add `bv.country_id` and a
`LEFT JOIN country_codes cc ON cc.id = bv.country_id`, selecting `cc.name AS country_name`.
`CREATE OR REPLACE VIEW` cannot rename columns, so the two new columns are **appended** after
`image_url` (same pattern as migration `20260815001900`). Keep `security_invoker = true`.

This single column centrally feeds: stock tree, stock overview, stock value, transfer
create-picker + list + receive, movements feed, and the reorder editor — all of which read
the view.

### 4.2 Lever B — `ItemTreeCell` gains an `origin?` prop (one shared component)
`src/components/purchase/wh/ItemTreeCell.tsx` (L20–52) is the shared display atom used by the
stock detail dialog, transfers list/receive, adjustments list, adjustment approval, inventory
check count/review, and movements. Adding one optional `origin?: string | null` line (rendered
as a muted ` · <origin>` after the brand, or omitted when null) makes six surfaces
origin-aware at once. Callers pass the origin from the view column (Lever A) or the hook join
(Lever C).

### 4.3 Lever C — hook joins for the direct-variant reads
Four hooks read the variant directly (not through the view) and need a
`country_codes ( name )` join added to their existing `inventory_item_brand_variants` embed,
plus a `country_name` field on their row type:
- `useStockAdjustments` (feeds adjustments list + approval) — `useWarehouseOperations.ts` L690–699
- `useAllBrandVariantsGrouped` (feeds `WhItemPicker` via the adjustment dialog) — `useInventory.ts` ~L278–330
- `useInventoryCheckGeneratedSAs` (check review) — `useWarehouseOperations.ts` L1096–1100
- `useStockMovements` damaged side (movements feed) — `useWarehouseOperations.ts` L303–306

### 4.4 Lever D — `WhItemPicker` shows + searches origin (one shared picker)
`src/components/purchase/wh/WhItemPicker.tsx` is the shared picker for **transfer-create and
adjustment-create**. Add `countryName` to its `PickerItem` type (L11–24), render the chip via
`variantPickerLabel`, and add origin to the search haystack (L90) so a user can type an origin
to disambiguate. This closes the single most dangerous pick-time hazard.

### 4.5 Display convention
Follow the shipped SO-detail pattern: the item name stays the primary line; brand and origin
render together as the muted secondary meta, `Brand · Origin` (middot separator). When there
is no brand, origin becomes the primary label (via `variantPickerLabel`). When origin is null,
nothing extra renders (generic/brand-only variant looks exactly as it does today — no visual
regression for the common case).

## 5. Work breakdown (in scope)

### Tier 1 — Operational hazards
1. **Inventory physical count** — the only surface that needs a *stored* origin, because
   `inventory_check_items` rows are point-in-time snapshots (they already denormalize
   `item_name`/`brand`/`sku`).
   - **Migration:** add `country_name text` (nullable snapshot) to `inventory_check_items`,
     mirroring exactly how `brand` is already stored there as denormalized text. No
     `country_id` FK — the snapshot text is the display-critical field and matches the table's
     existing convention.
   - **Capture at start:** `useStartInventoryCheck` (`useWarehouseOperations.ts` L1238–1248)
     and the start dialog `WhInventoryCheckStartDialog.tsx` (snapshot L150–157) must carry
     origin from the stock snapshot into the inserted rows.
   - **Display:** count sheet + review in `WhInventoryCheckDetail.tsx` (count rows L139–144 /
     L189–194, reconciliation L1066–1071, generated-SAs L945–948, post-count L992–997) show
     origin via `ItemTreeCell` (Lever B).
   - **Type:** add `country_name` to `InventoryCheckItem` (L185–200).
   - **Old data:** staging is a test server — existing/historic check rows are irrelevant and
     are **not** backfilled. Only new checks (created after the migration) capture origin. No
     migration-of-old-data logic anywhere in this branch.
2. **Shared item picker** — Lever D (`WhItemPicker`). Fixes transfer-create + adjustment-create
   pick-time disambiguation.
3. **Adjustment approval visibility** — `WhAdjustmentDetailDialog.tsx` (L172) shows origin via
   `ItemTreeCell`, fed by the `useStockAdjustments` join (Lever C). Approver can now see which
   origin is being adjusted.

### Tier 2 — Correctness + central displays
4. **Printed warehouse report — correctness fix.**
   - `src/app/api/warehouse/reports/route.ts`: add `brand_variant_id` (and `country_name` via
     Lever A) to the `fetchStockOverview` select (L86) and `fetchStockValue` select (L225), and
     **add `brand_variant_id` to the rollup keys** (L105, L240) so sub-containers of the *same*
     variant still roll up but two distinct origins never merge.
   - `src/lib/warehouse/warehouse-report-html.ts`: add `origin` to `StockOverviewRow` (L206–216)
     and `StockValueReportRow` (L501–512) and render it as a column/label in those two tables.
5. **Central read surfaces** — Lever A view column + Lever B `ItemTreeCell` origin:
   - Stock tree `WarehouseStockTree.tsx` (brand leaf L260–261, single-brand item L315–320,
     multi-brand tooltip L330); the "N brands" grouping label must not count distinct origins
     as distinct brands.
   - Stock overview `WhStockOverviewTab.tsx` (L392–393 / L429–434 / tooltip L441; mobile L645,
     L680; search L282–293).
   - Stock detail dialog `WhStockDetailDialog.tsx` `ItemTreeCell` (L48–56).
   - Stock value `WhStockValueTab.tsx` (L801–806; mobile L686–689; already splits origins into
     separate `MergedRow`s — just unlabeled).
   - Transfers list + receive `WhTransfersTab.tsx` (`variantMeta` L93–108; `ItemTreeCell`
     L476–484 / L602–609).
   - Transfer create summary `WhTransferDialog.tsx` selected-row display (L479–488).
   - Movements feed `WhMovementsTab.tsx` (`variantMeta` L145–153; `ItemTreeCell` L276–284 /
     L353–361; search L174–176).
6. **Create-Delivery line** — `src/components/sales/SoDeliveryDialog.tsx` (L254–257) renders
   origin. Data is already loaded (`SOLineItem.inventory_item_brand_variants.country_codes.name`,
   `useSaleOrders.ts` L36/L561) — pure display change, no query change.

### Supporting types
Add a `country_name` (and where relevant `country_id`) field to the affected row types in
`useWarehouseOperations.ts`: `WarehouseStockItem` (L55–73), `TransferItem` (L78–90) *(via the
view/transfer_items join where available)*, `StockMovement` (L32–53), `StockAdjustment`
(L133–151), `InventoryCheckItem` (L185–200), `CheckGeneratedSA` (L1072–1085).

## 6. Data model changes (2 migrations, staging-only + mirrored)

Both go to staging (`mwvblpgbgxipvrevkeff`) only, byte-mirrored into
`supabase/migrations-staging/`, per project rules. Neither touches stock math or RLS.

1. `..._warehouse_stock_view_origin.sql` — `CREATE OR REPLACE VIEW warehouse_stock_view`
   appending `country_id`, `country_name` (LEFT JOIN `country_codes`), keep
   `security_invoker = true`.
2. `..._inventory_check_items_origin.sql` — `ALTER TABLE inventory_check_items ADD COLUMN
   country_name text` (nullable snapshot, mirrors the existing `brand` text column). No
   backfill (test server — existing rows irrelevant).

The exact 14-digit timestamps sort after the latest existing migration and are chosen at
implementation time (verify with a `db push --dry-run`).

## 7. Verification

**Silent (I verify):** `tsc --noEmit` clean; `npx supabase db push` applies both migrations;
`db push --dry-run` then reports up to date; the view compiles and returns the new columns;
grep confirms every in-scope surface renders origin; `variantPickerLabel` unit test still green.

**Operator smoke (you sign off):** repair **one** existing item so it carries **two origins
under the same brand** (e.g. same brand, Qatar vs UAE) — that single example is enough to
exercise every surface. Then confirm on staging:
- Stock overview / tree / value: the two origins show as two labeled rows, not one.
- Transfer create: the picker shows/searches origin; the transfer line records the right leaf.
- Adjustment create + approval: origin visible at both steps.
- Inventory check: start a check → the count sheet shows origin per row; a counter can tell
  the two piles apart; review + generated SAs show origin.
- Printed warehouse report: the two origins are two lines with correct quantities (not summed).
- Create-Delivery: two same-brand/different-origin SO lines are distinguishable.
- Layout stability: no row shift when origin is present vs absent.

## 8. Deferred — Tier 3 (tracked, not this branch)
- Low-stock alert **text** — DB trigger `check_low_stock_and_notify()` body omits brand+origin
  (`20260803001400_...hotfix3.sql` L112/L124–127). Safe grain; ambiguous alert text.
- Dead-stock / damaged-stock / stock-value **report** label gaps (`useDeadStock`,
  `useDamagedStockOverview`, stock-value report) — all keyed on `brand_variant_id`, pure label
  gaps, no merge.
- `ReplacementDeliveryDialog.tsx` (L416–419) — needs origin plumbed into the
  `return_line_progress` view first.

## 9. Warranty readiness (for the NEXT build — documented, not built here)
`warranty_records.brand_variant_id` already exists (origin-traceable), but there is no origin
snapshot and the certificate does not show origin. Bake into the warranty build:
1. **Certificate display:** add an origin field to `WarrantyCertificateItem`
   (`warranty-certificate-pdf-html.ts` L10–22), populate via a `country_codes` join on
   `brand_variant_id` (mirror the existing Arabic-name fetch in
   `generate-warranty-certificate-pdf.ts` L98–101), render in the item cell.
2. **Durable record:** add `country_id` / `origin_name_snapshot` to `warranty_records`,
   snapshotted at insert (parity with `item_name`/`sku`) so origin survives variant edits —
   matters for legal immutability.
3. **Claim lookup:** `brand_variant_id` already supports per-origin lookup; surface the origin
   label. No extra schema beyond (2) for display durability.

## 10. Risks / edge cases
- **Null origin is the common case** — most variants have no origin yet. Every render must
  degrade to today's exact appearance when `country_name` is null (no stray separators, no
  layout shift). This is the main correctness constraint on the display work.
- **View column order** — `CREATE OR REPLACE VIEW` requires appending, not inserting, columns.
- **Report rollup** — adding `brand_variant_id` to the key must still collapse sub-container
  rows of the same variant (only origin/variant splits, not sub-containers).
