# MMS — Performance Audit (2026-08-19)

Scope: full app (`src/**`, `next.config.ts`, `package.json`). Three parallel passes —
data-fetching, dialogs/rendering, bundle/assets — every finding verified against the
real code. This report ranks issues by user-facing impact and pairs each with a fix
and a rough effort (S/M/L).

## TL;DR — where the time goes

1. **The Inventory list is a request storm.** Expanding a category fires **~3 queries per item row** (variants + division stock) *and* eagerly mounts a per-row edit dialog whose own hooks run while closed. A 50-item category ≈ **100–150 requests at once**. This is the single biggest win. → **P0**
2. **Several `<Command>` (cmdk) pickers render their full list uncapped** and re-score every row on each keystroke — the exact jank we already fixed on the PO picker, just never applied elsewhere (customer picker ≤500 rows, brand picker ~299). → **P1**
3. **The inventory importer still ships ~1.4 MB of Excel libraries to the browser** (`xlsx` + `exceljs`), plus `xlsx` leaks into two more report/warehouse routes. The server-side pattern to fix this already exists (`/api/reports/excel`). → **P1**
4. **Over-fetch on list reads** — `activity_log` pulls 500 rows *with both JSONB blobs* every 60 s; SO/PO lists pull deeply-nested `(*)`; a scatter of reads miss `.limit()`. → **P2**
5. Cleanups: eager/ungated global queries, un-paginated hand-rolled tables, no `next/image`, dead dependencies, a server-component waterfall in `TopNav`. → **P2/P3**

**What's already good** (verified, not problems): page/detail dialogs gate their queries on `open`; Base UI tab panels unmount when inactive; the shared `DataTable` paginates; the PO item picker is capped; the reports Excel + PDF paths are correctly server-side; the 60 s polls pause when the tab is hidden (budget-compliant). The discipline is mostly there — these findings are the gaps.

---

## P0 — Inventory list request storm (biggest win)

One hotspot, several compounding causes. Files: `src/components/services/inventory/{CategoryRow,ItemRow,BulkToolItemRow}.tsx`.

| # | File:line | Problem | Cost | Fix | Effort |
|---|---|---|---|---|---|
| 0.1 | `ItemRow.tsx:237` | `<ItemEditDialog … item={item} />` is mounted for **every** row (not gated by `editOpen`). Its hooks (`useItemDivisions`, `useEffectiveWarranty`, `useItemTeamItemContext`) are enabled on `!!itemId`, so they run **while the dialog is closed**. | 2–3 wasted queries **per item row** on expand. | Lazy-mount: `{editOpen && <ItemEditDialog … />}` (mirror `CategoryRow`'s own `{open && <AttributesTab/>}` at `CategoryAttributesDialog.tsx:21`). | **S** |
| 0.2 | `CategoryRow.tsx:369` | `<CategoryEditDialog … category={node} />` is mounted **outside** the `{expanded}` block → runs on initial page render for every visible category. Its `useCategoryHasStockOrUnits` (enabled on id) fires a multi-table probe (`inventory_items` + `tool_asset_units` + `brand_variants` + fifo) **per category, closed**. | ~25 multi-table probes on first paint (25 categories/page). | Lazy-mount `{editOpen && …}` / `{addSubcategoryOpen && …}`, or gate the hook on `open`. | **S** |
| 0.3 | `ItemRow.tsx:59` | `useInventoryBrandVariants(item.id, …)` runs **per row** — used only to compute the collapsed-row stock badge. | N variant queries per expanded category (N+1). | Batch: one `inventory_item_brand_variants` read `.in('item_id', itemIds)` at `CategoryRow`/page level, distributed via context — the **same pattern already used** for attributes (`ItemAttributesProvider`, `CategoryRow.tsx:345`). Fetch full variants only on item-expand. | **M** |
| 0.4 | `ItemRow.tsx:69` | `useItemVariantDivisionStock(item.id, divisionIds)` runs **per row** when a division filter is active, and itself does 2 sequential queries. | Up to **2N more** round-trips per expanded category under a division filter. | Batch one `warehouse_stock_summary` read for all visible item ids into the same context map as 0.3. | **M** |
| 0.5 | `BulkToolItemRow.tsx:53` | `useVariantStockByDivision(item.id)` (2 sequential queries) runs **per bulk-tool row**. | 2N round-trips per expanded tool category. | Same batch fix as 0.3/0.4. | **M** |
| 0.6 | `ItemRow.tsx:87` | `groups = groupVariants(...)` recomputed every render (siblings at `:71`/`:104` are memoized). | Minor CPU per render. | Wrap in `useMemo`. | **S** |

**Recommended order:** 0.1 + 0.2 first (tiny diffs, delete dozens of wasted queries immediately), then the 0.3–0.5 batch (the real N+1 kill).

---

## P1 — Uncapped cmdk pickers (on-open jank + keystroke lag)

The reference fix already exists: `CascadeInventorySelector.tsx:103,111` (`MAX_OPTIONS=100`, `ITEM_INITIAL_CAP=30`, `shouldFilter={false}`). Apply the same shape to:

| # | File:line | List size | Problem | Effort |
|---|---|---|---|---|
| 1.1 | `sales/customer-statement/page.tsx:153-158` | ≤500 | `<Command>` with **default filter on** — all rows mount + re-score per keystroke. Worst offender. | **S** |
| 1.2 | `services/inventory/BrandCombobox.tsx:111` | ~299 | Uncapped render on open (code comment already flags it "unusable with ~299 brands"). Reachable from every item's variant dialog + the importer. | **S** |
| 1.3 | `purchase/aging-report/page.tsx:194` | suppliers | `<Command>` default filter, uncapped supplier map. | **S** |
| 1.4 | `services/inventory/OriginCombobox.tsx:96` | countries | Uncapped country render on open. | **S** |
| 1.5 | `sales/create-so/page.tsx:334` | customers | Server-filtered while typing (good), but the **empty-search first open** renders the full list. | **S** |

---

## P1 — Excel libraries in the client bundle (~1.4 MB)

The correct server-side pattern already exists: `reportExcel.ts` POSTs to `/api/reports/excel`, and `reportExcelServer.ts` (exceljs) is imported **only** by the server route. Replicate it for the remaining callers.

| # | File | Problem | Cost | Fix | Effort |
|---|---|---|---|---|---|
| 1.6 | `lib/inventory-import.ts:30-31` → `InventoryImportDialog.tsx` (client) → `ItemsListView.tsx:12` (static) | `import * as XLSX from 'xlsx'` **and** `import ExcelJS from 'exceljs'` at module top, pulled into the `/master-data/inventory` route. (`serverExternalPackages:['exceljs']` does **not** affect client bundles.) | ~450 KB (`xlsx`) + ~1 MB (`exceljs`) on the inventory route. | Move template-write + parse to a server route (mirror `/api/reports/excel`); at minimum `await import()` the libs inside the handlers + `next/dynamic` the dialog. | **M–L** |
| 1.7 | `lib/utils/exportToExcel.ts:1` → `ProductProfitabilityTable.tsx`, `ProfitabilityDrilldownDialog.tsx`, `WarehouseStockExportButton.tsx` (all client) | `import * as XLSX from 'xlsx'` lands in the profitability report + Warehouses tab bundles. | ~450 KB × 2 routes. | Route through a server writer, or `await import('xlsx')` inside the click handler only. | **M** |
| 1.8 | `package.json:91` | `xlsx` is under **devDependencies** but imported by shipped client code. | A production `--omit=dev` install would fail to resolve it (works today only because Vercel installs all deps). | Move to `dependencies` (or drop once 1.6/1.7 go server-side). | **S** |
| 1.9 | whole `src/` | `next/dynamic` appears **nowhere** — no code-splitting of any heavy leaf. | Root cause behind 1.6/1.7. | Adopt `next/dynamic` for modal-only/heavy leaves (importer, profitability drilldown, PDF document components). | **M** |

---

## P2 — Over-fetch on list reads

| # | File:line | Problem | Fix | Effort |
|---|---|---|---|---|
| 2.1 | `hooks/useActivityLog.ts:39` (+`:71` 60 s poll) | `.select('*')` on `activity_log` — wide `old_data`/`new_data` **JSONB blobs** — up to 500 full rows **every 60 s** while focused. | Select display columns only; load the JSONB blobs lazily on row-expand; consider dropping the poll (log is human-paced). | **S** |
| 2.2 | `hooks/useSaleOrders.ts:496` | `.select('*, sale_order_lines(*), sale_deliveries(*, sale_delivery_lines(*)), …)` for 200 orders, plus a second `sale_order_lines_summary.select('*')` (redundant with the nested lines). | Replace nested `(*)` with the columns the list renders; drop `sale_order_lines(*)` if the summary covers line totals. | **M** |
| 2.3 | `hooks/usePurchaseOrders.ts:284` (+`:301` 60 s poll) | `.select('*, po_approvals(*), po_line_items(*)')` for 50 POs re-fetched every 60 s. | Select list columns only; move `po_line_items`/`po_approvals` to the detail view. | **M** |
| 2.4 | `hooks/useInventory.ts:53` (`useInventoryItems`) | Full active catalog, **no `.limit()`** (grows unbounded). | `.limit(2000)` or paginate. | **S** |
| 2.5 | `hooks/useInventory.ts:42` (`useInventoryCategories`) | `.select('*')` + no `.limit()`. | Explicit columns + `.limit(2000)`. | **S** |
| 2.6 | `hooks/useSaleReturns.ts:53` | `.select('*, return_lines(*)')` for the list. | Columns only; load `return_lines` in the detail dialog. | **S** |
| 2.7 | `useProfiles.ts:284`, `useCompanies.ts:18`, `useDivisions.ts:36/52`, `useWarehouseOperations.ts:1090/1108/1126` | `select('*')` and/or missing `.limit()` (small/scoped tables — low real cost, but budget-rule violations). | Explicit columns + `.limit(500)`. | **S** |

---

## P2 — Eager / ungated queries & un-paginated tables

| # | File:line | Problem | Fix | Effort |
|---|---|---|---|---|
| 2.8 | `NotificationBell.tsx:135` → `useNotifications.ts:67/89` | Pending list (30 rows, 60 s poll) + completed list (30 rows) fetch on **every** dashboard page though hidden until the popover opens. Only the count badge is visible. | Gate both list queries on `enabled: open` (completed also on `tab==='completed'`); keep the `head:true` count always-on. | **S** |
| 2.9 | `master-data/warehouses/page.tsx:89-91` | Three full list queries (`useWarehouseTransfers`, `useReceivalsAndDeliveries`, `useStockAdjustments`) run on every visit just to compute pending-count badges, regardless of active tab. | Use `count:'exact', head:true` for the badges, or fetch lazily per tab. | **S** |
| 2.10 | `purchase/orders/page.tsx:449`; `warehouse/damaged-stock/page.tsx:207…` | Hand-rolled tables render the **entire** result set (PO rows are heavy: Progress + DropdownMenu + badges); no pagination/virtualization anywhere in `src`. | Route through the shared paginated `DataTable.tsx` (as `sales/orders` does), or add windowing. | **M** |

---

## P3 — Cleanups (low risk, small wins / hygiene)

| # | File:line | Problem | Fix | Effort |
|---|---|---|---|---|
| 3.1 | `TopNav.tsx:16,26` | `companies` query runs **after** the `user_data` query despite no dependency — one needless serialized round-trip on every dashboard page. | `Promise.all([profileQuery, companyQuery])`. | **S** |
| 3.2 | `QueryProvider.tsx:15` | Global `retry: 3` — during a Supabase hiccup every failed query makes 4 attempts, amplifying load exactly when the backend is struggling. | `retry: 1` globally (or disable for list/count reads). | **S** |
| 3.3 | no `next/image` in `src/`; `next.config.ts` has no `images` block | Storage item photos served full-res to 48 px thumbnails; no WebP/AVIF. | Add `images.remotePatterns` for the Supabase host + `formats:['image/avif','image/webp']`; migrate list thumbnails (`ItemPhoto`) to `next/image`. | **M** |
| 3.4 | `package.json:46-48,43,45,53,41` | Dead heavy deps never imported: `leaflet`(+draw/markercluster), `jspdf`, `html2canvas`, `papaparse`, `dompurify` (PDF is puppeteer-based; no map exists). | Remove them + their `@types`. | **S** |
| 3.5 | `next.config.ts:27` | `optimizePackageImports: [… 'recharts']` — `recharts` isn't installed (no-op / config drift). | Drop `'recharts'`. | **S** |

---

## Recommended first batch (high impact / low effort)

Do these five together — all **S** effort, they remove the bulk of the wasted requests and on-open jank with tiny, low-risk diffs:

1. **0.1 + 0.2** — lazy-mount the per-row Inventory dialogs (`{open && <Dialog/>}`). Kills dozens of closed-dialog queries per page load/expand.
2. **1.1–1.5** — cap the cmdk pickers (copy the `CascadeInventorySelector` pattern).
3. **2.1** — trim `activity_log` columns + drop/gate its poll.
4. **2.8** — gate the notification lists on `open`.
5. **3.2** — global `retry: 3 → 1`.

Then the **P0 batch (0.3–0.5)** — the real N+1 kill via one batched variant + stock read per category (reusing the existing `ItemAttributesProvider` pattern). That's the largest single data-load reduction and is the main **M**-effort item worth doing next.

The **Excel-bundle** work (1.6–1.9) is the biggest *bundle* win but is more involved (server route or dynamic import); schedule it as its own change.
