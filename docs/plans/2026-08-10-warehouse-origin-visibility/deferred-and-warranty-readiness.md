# Deferred (Tier 3) + Warranty Readiness — Warehouse Origin Visibility

Companion to [spec.md](spec.md) / [plan.md](plan.md). These were **explicitly out of
scope** for the `feature/warehouse-origin-visibility` branch (which shipped Tier 1 hazards +
Tier 2 correctness/central displays). Do NOT delete until picked up.

---

## Tier 3 — cosmetic origin labels (deferred)

All of these are **safe grain** (keyed on `brand_variant_id`) — pure label gaps, no
data-merge risk. Low priority.

1. **Low-stock / reorder alert text.** The DB trigger `check_low_stock_and_notify()`
   (`supabase/migrations/20260803001400_warehouse_model_v2_phase_c3_hotfix3.sql:112,124-127`)
   builds the alert body from `item_name` only — two variants of the same item (different
   brand *or* origin) produce indistinguishable alert text. Fix: fold brand + origin into
   `v_item_label`. DB migration; needs a live `pg_get_functiondef` rewrite (do not copy the
   stale baseline).

2. **Printed report — adjustment & movement sections.** `warehouse-report-html.ts` renders a
   brand cell for `AdjustmentReportRow` (~L398) and `MovementReportRow` too; these were left
   origin-less (only the stock-overview + stock-value tables were fixed, as those had the
   real merge bug). Adding origin needs a `country_codes` join in `route.ts`
   `fetchAdjustments` / `fetchMovements` + an `origin` field on those two row types.

3. **Dead-stock / damaged-stock report labels.** `useDeadStock` (RPC `get_dead_stock_report`),
   `useDamagedStockOverview` (`itemLabelFromJoin`) — display gaps only. The dead-stock RPC
   would need a `country_codes` join; the damaged hooks need `country_codes(name)` folded
   into `itemLabelFromJoin`.

4. **`ReplacementDeliveryDialog`** (`src/components/sales/ReplacementDeliveryDialog.tsx:416`) —
   shows `item_name` + `sku` only. Origin needs plumbing into the `return_line_progress` view
   (or a client-side join on `brand_variant_id`) first, then a label. (The standard
   `SoDeliveryDialog` line WAS done in this branch.)

---

## Warranty readiness — bake into the warranty build (NOT built here)

`warranty_records.brand_variant_id` already exists (origin-traceable), but there is **no
origin snapshot** and the certificate does not show origin. When building/finishing the
warranty module, bake in:

1. **Certificate display.** Add an origin field to `WarrantyCertificateItem`
   (`src/lib/sales/warranty-certificate-pdf-html.ts:10-22`), populate it via a
   `country_codes` join on `brand_variant_id` (mirror the existing Arabic-name fetch in
   `src/lib/sales/generate-warranty-certificate-pdf.ts:98-101`), and render it in the item
   cell.

2. **Durable record.** Add `country_id` / `origin_name_snapshot` to `warranty_records`,
   snapshotted at insert (parity with the existing `item_name` / `sku` snapshot) so origin
   survives a later variant edit/delete — matters for legal immutability of the certificate.

3. **Claim lookup.** `brand_variant_id` already supports per-origin-variant lookup; surface
   the origin label on any claims surface. No extra schema beyond (2) for display durability.

---

## Smoke example seeded on staging (test data)

For the Tier 1/2 operator smoke, origins were set on the four `PP (Sediment)` variants
(`INC-PPS-001` → Qatar, `-005` → UAE, `-007` → China, `-009` → Egypt) so the item shows
multiple distinct origin rows. Also pre-existing: `Split AC 12000BTU` (DAIKIN) had origins.
To revert the seed: `update inventory_item_brand_variants set country_id = null where code in
('INC-PPS-001','INC-PPS-005','INC-PPS-007','INC-PPS-009')`.
