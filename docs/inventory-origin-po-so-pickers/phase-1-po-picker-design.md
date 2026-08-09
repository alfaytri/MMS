# Phase 1 — Origin-aware PO picker — Design Spec

**Date:** 2026-08-09
**Branch:** `feature/inventory-origin-po-so-pickers` (off `deploy/warehouse-shipping` @ d17fa503, which already has the merged Inventory Brands & Origin catalog + permissions cleanup)
**DB target:** STAGING (`mwvblpgbgxipvrevkeff`) only; any migration mirrored to `supabase/migrations-staging/`
**Parent tracker:** [`docs/inventory-brands-origin-po-so-followup.md`](../inventory-brands-origin-po-so-followup.md)
**Phase 2 (separate spec, later):** SO / quotation picker + origin-based selling price + origin on delivery/invoice PDFs.

## Scope decisions (locked with user 2026-08-09)

1. **Two phases — PO first** (this spec), SO slice second.
2. **Manual origin pick** — the operator chooses the origin on the line; no auto-select.
3. **(Phase 2)** Quotations **lock origin + price at quote time**.
4. **(Phase 2)** Delivery/invoice PDFs **show origin per line**.

## Key finding (shrinks Phase 1)

The PO pickers **already resolve to a specific `brand_variant_id` and default the line's cost from that leaf**:
- `CascadeInventorySelector.handleVariantSelect` (`src/components/purchase/CascadeInventorySelector.tsx:306-361`) sets `cost_price` from the variant's `cost_price`, falling back to `fetchLastFifoCost(variant.id)` (last `fifo_cost_layers.total_unit_cost`).
- `InventoryItemLookup` (`src/components/purchase/InventoryItemLookup.tsx`) searches `inventory_item_brand_variants` and returns `brand_variant_id` + `cost_price`.
- So PO lines **already store the exact (item, brand, origin) variant**, and PO-driven receival books FIFO against `po_line_items.brand_variant_id`.

Therefore origin correctness on the buying side is **mostly a display/selection problem**, not a money-path rewrite: today the "Brand / Variant" list shows `brand` + `code` but **not origin (country)**, so multiple origins of one brand look like duplicates the operator can't tell apart. The catalog branch already added the `country_codes(name, flag, iso)` join to `useInventoryBrandVariants`, so the data is present — it just isn't shown.

## Approach (recommended)

**Show origin in the existing variant popover, grouped by brand.** No extra per-line selects (the line editor is compact and multi-row).

- In `CascadeInventorySelector`'s "Brand / Variant" popover, render each leaf row as **Brand · Origin · code · avail** using the variant's joined `country_codes.name` (fall back to no origin segment when `country_id` is null). Optionally group rows under a brand sub-header (mirrors the catalog tree the user approved). Selecting a row resolves that exact leaf — the existing `handleVariantSelect` cost-default path is unchanged.
- In `InventoryItemLookup` search rows, append brand + origin so duplicate item names are distinguishable; the query must select the brand/country join.
- **Mixed cases:** brand-only, origin-only, and generic (neither) must all remain selectable — never force an origin segment when the item has none.

*Alternatives considered:* (B) a separate two-step Brand→Origin select per line — cleaner separation but heavy in a multi-line editor; (C) origin select only when a brand has >1 origin — least clutter, more conditional logic. Chosen the single-popover display for minimal money-path disturbance + consistency.

## Components to change

| File | Change |
|---|---|
| `src/components/purchase/CascadeInventorySelector.tsx` | Show origin (country name) in the "Brand / Variant" rows; optional group-by-brand. Resolution + cost-default already correct. |
| `src/components/purchase/InventoryItemLookup.tsx` | Add brand + origin to search-result rows; select the `country_codes(name)` join in the query. |
| `src/components/purchase/CascadeInlineForms.tsx` | Inline "add brand/variant" (`CascadeNewVariantForm`) must create origin-aware leaves — carry `brand_id` + `country_id` (reuse the catalog's `BrandCombobox`/`OriginCombobox` pattern), not free-text. |
| `src/components/purchase/PoReceiveTab.tsx` | **Verify** receival books against the PO line's `brand_variant_id` (expected already correct, like the manual receival was). Fix only if not. |

No DB migration expected (data + display only). If one proves necessary, STAGING-only + mirror.

## Data flow (spine unchanged)

pick leaf → `brand_variant_id` on PO line → cost defaults from leaf (`cost_price` / last FIFO) → receival books FIFO on that `brand_variant_id`. Phase 1 adds **origin visibility to the pick**; it does not rewire the money path.

## Cross-cutting constraints

- **Dropdown UUID guard:** brand + origin render names (`brands.name`, `country_codes.name`), never ids.
- **Layout stability:** adding the origin text/segment must not shift the compact line-editor rows.
- **Cache keys:** picker variant reads must use the same keys the catalog branch established so a catalog price/origin edit reflects in the picker.
- **Permissions:** viewing prices in the picker needs no new permission; only catalog price *edits* are gated (`inventory.pricing.manage`).

## Acceptance criteria

- [ ] On a PO line, operator resolves item → brand → **origin** and the unit cost defaults from that exact leaf.
- [ ] Items with no brand / no origin are still selectable with no dead-end selects.
- [ ] The "Brand / Variant" list visibly distinguishes origins (no more identical-looking duplicate rows).
- [ ] Inline "add brand/variant" creates a leaf with `brand_id` + `country_id`.
- [ ] PO-driven receival lands FIFO on the chosen (brand, origin) leaf.
- [ ] No raw UUIDs in any brand/origin dropdown.
- [ ] `tsc --noEmit` clean; ⏸ operator smoke on one branded+origin item, one origin-only item, one generic item.

## Testing

Unit where pure (helpers, if any extracted); tsc clean; operator smoke (⏸ user) across the three item shapes above, confirming cost defaults per origin and receival lands on the right leaf.
