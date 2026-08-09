# Phase 2 — SO / Quotation origin work — Design

**Date:** 2026-08-09 · **Branch:** `feature/inventory-origin-po-so-pickers`
**Parent:** [`phase-1-po-picker-design.md`](phase-1-po-picker-design.md) · state: [`execution-state.md`](execution-state.md)

## Already done by Phase 1 (no work needed)
- **SO picker shows origin:** Phase 1 Task 2 made the combined "Brand / Variant" popover rows show `Brand · Origin · code · avail` for **all** callers (incl. SO/quotation), and the breadcrumb shows origin. The sell picker also keeps per-division **availability**.
- **Origin-based selling price:** `SoLineItemsEditor.handleInventorySelect` sets `unit_price = item.selling_price` from the resolved leaf, and each (item, brand, origin) leaf carries its own `selling_price`. Picking a different origin already yields that origin's price.

## Locked decisions (user, 2026-08-09)
- **SO picker stays the combined list** (NOT the Brand→Origin cascade) — it shows origin + availability together, which selling needs.
- Prior: manual origin pick; quotations lock origin + price at quote; PDFs show origin per line.

## Remaining work (build order)

### Item 1 — Origin on delivery-note + invoice PDFs
**Split by data availability (live-confirmed):**
- **Delivery note — CLEAN.** `sale_delivery_lines` has `brand_variant_id`. Add a sibling helper `fetchOriginsByBrandVariant(client, ids): Map<id, countryName>` in [`src/lib/pdf/arabic-names.ts`](../../src/lib/pdf/arabic-names.ts) (mirror `fetchArabicNamesByBrandVariant`, traversing `inventory_item_brand_variants → country_codes(name)`). Wire it in [`generate-delivery-note-pdf.ts`](../../src/lib/sales/generate-delivery-note-pdf.ts) (add `origin` to `DeliveryNoteItem` + the map) and render it per line in [`delivery-note-pdf-html.ts`](../../src/lib/sales/delivery-note-pdf-html.ts). No migration. Same pattern extends to the receival/PO/quotation PDFs if wanted later.
- **Invoice — NEEDS A DATA CHANGE.** `invoice_line_items` has **no** `brand_variant_id`/origin (free-text `description, qty, unit_price, total`; source `so_invoices`). To show origin on the invoice PDF, origin must be **captured onto the invoice line at invoice-creation time** from the SO line's variant. Options: (a) add `brand_variant_id` (or a denormalized `origin` text) to `invoice_line_items` + populate it in the invoice-creation flow + backfill; then the PDF resolves origin like the delivery note. STAGING-only migration + mirror. Money-path-adjacent (invoice creation) — treat as its own task with care + operator smoke.

### Item 2 — Quotation locks origin + selling price at quote time (MONEY-PATH)
Freeze each quoted line's origin + `selling_price` when a quotation is issued, so later catalog/price edits don't move an already-quoted number. **Map the quotation flow first** (how quotations are stored/issued vs `sale_order_lines`; the quotation PDF is `generate-quotation-pdf.ts`, route `api/sales/so/[id]/quotation-pdf`). Likely: snapshot origin+price onto the quote line (or a quote snapshot) at issue; the quotation PDF + any re-open reads the frozen values. Needs its own spec once the flow is mapped. Money-path — careful design + operator smoke.

### Item 3 — Brand · Origin in SO detail + quotation line summaries (CLEAN)
`sale_order_lines` has `brand_variant_id`. Mirror the PO-side change (commit `0401f332`): join `brands(name)` + `country_codes(name)` on the SO line query, render `Brand · Origin` via `variantPickerLabel` in the SO detail dialog + quotation line summary. Display-only, no migration.

## Suggested sequencing
1. **Item 1a (delivery-note origin)** — clean, no migration, quick.
2. **Item 3 (SO/quote line displays)** — clean, no migration.
3. **Item 1b (invoice origin)** — schema + invoice-creation change; own task.
4. **Item 2 (quotation lock)** — money-path; map the flow, write its own spec, then implement.

Each item is independently shippable; do 1a + 3 first (low risk), then 1b + 2 with dedicated care.
