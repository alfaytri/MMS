# Accounting & Inventory Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Verification model:** This project does NOT use pytest-style TDD. "Tests" here mean the project's real verification: `tsc --noEmit` + `eslint`, live-DB introspection via `npx supabase db query --linked`, rolled-back `DO`-block write-path proofs for money paths, and an operator smoke checklist. Every SQL body MUST be authored against the **live** schema and verified with `db query` before commit — never copy this plan's SQL sketches verbatim (baseline schema + `database.types.ts` are stale; only the linked DB is authoritative).

**Goal:** Ship the 6 reports from `MMS Report Requirements.pdf` (1.1 Product Cost PO-wise, 1.2 Revenue/COGS/Gross Profit, 2.1 Accounts Receivable, 2.2 Accounts Payable, 2.3 Cash & Cash Equivalents, 2.4 Profit & Loss) as pages under the existing `/reports` section, each **division-wise** (and **warehouse-wise** where stock applies), with per-FIFO-layer COGS, filter + grouping-with-subtotals, and Excel + PDF export.

**Architecture:** Data layer = one Postgres RPC per report (extend existing where one already exists), each taking a uniform filter argument set (date range + `p_division_ids uuid[]` + `p_warehouse_ids uuid[]` + per-report extras) and **scoping every row to `public.is_division_visible(division_id)`** so a `SECURITY DEFINER` RPC never leaks cross-division data. UI layer = a page per report under `src/app/(dashboard)/reports/`, reusing `PageWrapper`/`PageHeader`/`DateRangePicker`, a new shared `ReportFilterBar` (division + warehouse + per-report filters), and a shared grouping-table renderer. Export = Excel client-side via the existing `exportToExcel`/`exportSheetsToExcel`; PDF server-side via a new `/api/reports/[slug]/pdf` route that builds self-contained HTML (pattern: `src/lib/warehouse/warehouse-report-html.ts`) and pipes it through the existing `htmlToPdfBuffer`.

**Tech Stack:** Next.js 15 App Router + TypeScript · Supabase Postgres (SECURITY DEFINER RPCs) · TanStack Query v5 · shadcn/ui + Tailwind · `xlsx` + `exceljs` (Excel) · `puppeteer-core` (PDF).

## Global Constraints

- **Migration target:** staging `mwvblpgbgxipvrevkeff` only. Every migration written to BOTH `supabase/migrations/` AND `supabase/migrations-staging/`, timestamp **> `20260819270000`** (the custody fix), applied via `npx supabase db push`.
- **Co-authorship trailer** on every commit (Mohamed Ismail + Claude).
- **PROGRESS.md** updated on task start and completion (separate docs commits); **EOD** file appended per task.
- **Commit only after the user confirms working** (operator smoke) — automated checks (tsc/eslint/db-verify) are prerequisites, not the green light.
- **Currency:** all money columns render in **QAR base** (`amount_qar`, `total_qar`, `ce.total_cost`); foreign-currency source values shown **alongside** base, never instead of (PDF general rule 5). Never blend FIFO cost layers into an average unless a column explicitly says "average" (PDF general rule 4).
- **Dropdown UUID guard, PhoneInput, layout-stability, responsive-at-4-breakpoints** rules from AGENTS.md apply to all UI.
- **Flow Registry:** each report is a read-only flow — add a row to `docs/flows-registry.md` in the shipping commit.
- **Division/Warehouse scope decision (locked with the user):** Division filter on **all 6** reports; Warehouse filter on the **stock-sourced** reports only (**1.1, 1.2, 2.4**). Dimension behaviour: **filter + grouping with per-group subtotals + grand total.**

---

## Report Inventory — reuse vs. new

| Ref | Report | Existing asset | Verdict |
|---|---|---|---|
| 1.1 | Product Cost (PO-wise) | `get_stock_value_cogs_summary`, `get_cogs_breakdown` (helpers) | **New** RPC: FIFO layers grouped PO-wise |
| 1.2 | Revenue / COGS / Gross | `rpc_product_profitability`, `rpc_profitability_drilldown` (both **aggregate layers**) | **New** per-layer RPC; reuse KPI + drilldown UI patterns |
| 2.1 | Accounts Receivable | `rpc_sales_aging_report` (customer-level buckets) | **New** invoice-level RPC; keep aging RPC as an optional summary panel |
| 2.2 | Accounts Payable | `rpc_purchase_aging_report` (supplier-level buckets) | **New** bill-level RPC (+ PO currency); keep aging as summary |
| 2.3 | Cash & Cash Equivalents | `rpc_financial_dashboard` (cash in/out patterns) | **New** RPC over `payments` with running balance |
| 2.4 | Profit & Loss | `rpc_financial_dashboard` (AR/AP/cash patterns) | **New** RPC: revenue/COGS by stream + FX + scrap, accrual/cash |

**Data sources confirmed live (staging):**
- **COGS ledger:** `cogs_entries` — one row **per FIFO layer**, `source_type ∈ {sale, sale_return, consumption, landed_cost, landed_cost_reversal}`, `source_id → fifo_cost_layers.id`, `division_id`, `consumer_division_id`, `consumption_id`, `sale_order_id`, `qty`, `unit_cost`, `total_cost`, `date`.
- **Warehouse of a COGS row:** `cogs_entries.source_id → fifo_cost_layers.warehouse_id / sub_container_id` (the warehouse the cost was drawn from). Landed-cost rows have no `source_id` (adjustment).
- **AR:** `so_invoices` (`invoice_id`, `customer_id`, `sale_order_id`, `issued_date`, `due_date`, `status`, `payment_status`, `total_amount`, `paid_amount`, `division_id`). Due = `total_amount - paid_amount`.
- **AP:** `bills` (`bill_number`, `supplier_id`, `purchase_order_id`, `receival_id`, `division_id`, `issued_date`, `due_date`, `total_amount`, `paid_amount`, `payment_status`) → join `purchase_orders` for `po_number`, `currency`, `exchange_rate` (PO-currency amount).
- **Cash:** `payments` (`direction` = `'incoming'`|`'outgoing'`, `amount_qar`, `amount`, `currency`, `method`/`method_id`→`payment_methods`, `date`, `status`, `deleted_at`, `invoice_id`/`bill_id`/`customer_id`/`supplier_id`, `exchange_gain`, `exchange_loss`). Receipt (incoming)=Debit, payment (outgoing)=Credit.
- **FX gain/loss:** `payments.exchange_gain/exchange_loss` + `sale_orders`/`purchase_orders.exchange_gain/exchange_loss/exchange_net`.
- **Dimensions:** `company_divisions`, `warehouses`, `warehouse_sub_containers.division_id`, `inventory_categories(type, parent_id, name_en)`, `inventory_items(category_id, unit)`, `inventory_item_brand_variants(code AS barcode, brand_id, country_id AS origin, average_cost)`.

---

## Cross-cutting design decisions

1. **Division RLS is not optional.** Existing report RPCs are `SECURITY DEFINER` and therefore bypass the `division_scope` RLS. Every new/extended report RPC MUST filter each candidate row through `public.is_division_visible(row_division_id)` (helper confirmed present) so a limited-division user cannot pull another division's data via the report endpoint — regardless of what `p_division_ids` they pass. `p_division_ids` **narrows within** the visible set; it never widens it.
2. **Uniform RPC signature.** `rpc_report_<name>(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL, p_warehouse_ids uuid[] DEFAULT NULL, …extras)`. `NULL`/empty array = "all visible". Date args required where the PDF says "date + period both required" (1.2, 2.3, 2.4); optional filters elsewhere (1.1, 2.1, 2.2 use month/date filters).
3. **Per-layer, never blended (1.1, 1.2).** Select `cogs_entries` / `fifo_cost_layers` rows directly — do NOT `GROUP BY` away `unit_cost`. Two layers of the same product/PO/SO stay two lines. (The custody transfer-in fix `20260819270000` guarantees layers survive into virtual warehouses, so consumption/sale COGS is genuinely per-layer end-to-end.)
4. **Grouping with subtotals.** Client renders grouped rows (by division, then warehouse where applicable) with a subtotal row per group and a grand-total row. Excel export uses `exportSheetsToExcel`'s `total` column flag; a group can be one sheet or subtotal bands within a sheet.
5. **Consumption in the division view.** The user's "Maintenance AR/AP + consumption" = the division's activity. Consumption is COGS attributed to the source sub-container's division (`cogs_entries.source_type='consumption'`, `division_id`). It appears in **1.2/2.4 COGS** (grouped by `source_type`) and is surfaced as its own COGS stream line in the P&L. No AR/AP row is created for a consumption (no invoice/bill) — documented in the P&L notes.
6. **Export contract.** Every report page has an **Export ▾** menu → Excel (client, immediate download) + PDF (calls `/api/reports/<slug>/pdf` with the active filter payload; the applied filters are printed in the report header per PDF general rule 2).
7. **Roles.** Reuse `reports.access` (section) + `reports.view`. Add per-report view sub-permissions if finer gating is needed per the PDF's role matrix (Owners/Accounts Manager = all; Accountant = accounting + inventory; Inventory Manager = inventory only): gate inventory reports on `reports.inventory.view`, accounting reports on `reports.accounting.view`, wired into the existing permission tree.
8. **Drill-down (PDF general rule 6).** PO/SO/Invoice/Bill numbers render as links to the existing detail dialogs/pages (`PoDetailDialog`, `SoDetailDialog`, `/invoices`, bill detail).

---

## File Structure

**Shared (Phase 0):**
- Create `src/components/reports/ReportFilterBar.tsx` — date range + division multiselect + (optional) warehouse multiselect + slot for per-report filters.
- Create `src/components/reports/ReportGroupedTable.tsx` — grouped rows + subtotal + grand-total renderer, driven by a column spec compatible with `ExcelColumn<T>`.
- Create `src/components/reports/useReportExport.ts` — wires Excel (`exportToExcel`) + PDF (fetch `/api/reports/<slug>/pdf`).
- Create `src/lib/reports/report-html.ts` — self-contained HTML builder (title, applied-filters header, grouped table) for the PDF pipeline (pattern: `src/lib/warehouse/warehouse-report-html.ts`).
- Create `src/app/api/reports/[slug]/pdf/route.ts` — server route: auth-gated, calls the report RPC server-side, builds HTML, returns `htmlToPdfBuffer`.
- Modify `src/components/layout/nav-config.ts` — add the 6 report links under the existing **Reports** group.
- Modify permission tree / `src/lib/route-permissions.ts` — add `reports.inventory.view` + `reports.accounting.view`.

**Per report:** one migration (`supabase/migrations[-staging]/<ts>_rpc_report_<name>.sql`), one hook (`src/hooks/reports/use<Name>Report.ts`), one page (`src/app/(dashboard)/reports/<slug>/page.tsx`), optional bespoke table/columns file.

---

## Phase 0 — Shared report infrastructure

### Task 0.1: Division + warehouse filter primitives

**Files:**
- Create: `src/components/reports/ReportFilterBar.tsx`
- Reuse: `src/components/reports/DateRangePicker.tsx` (presets already exist), `src/hooks/useWarehouses.ts`, a divisions hook (confirm: `useDivisions` or query `company_divisions`).

**Interfaces:**
- Produces: `type ReportFilters = { start: string; end: string; divisionIds: string[]; warehouseIds: string[]; extra?: Record<string, unknown> }` and `<ReportFilterBar value onChange showWarehouse={boolean}>`.

- [ ] Confirm the divisions hook name/shape (`db query` or grep `company_divisions`); the division multiselect MUST display `short_name`/`name`, never the UUID (Dropdown UUID guard).
- [ ] Build `ReportFilterBar`: `DateRangePicker` + division multiselect (chips) + warehouse multiselect (rendered only when `showWarehouse`) + a children slot for per-report filters. Reserve height so toggling filters doesn't shift the layout (layout-stability rule).
- [ ] Multiselect defaults to "All visible"; selecting narrows. Responsive: stacks on `<md`, inline on `md:+`.
- [ ] `tsc --noEmit` + `eslint` clean.

### Task 0.2: Grouped table with subtotals + grand total

**Files:**
- Create: `src/components/reports/ReportGroupedTable.tsx`

**Interfaces:**
- Consumes: `ExcelColumn<T>` shape from `src/lib/utils/exportToExcel.ts` (`header`, `accessor`, `format`, `total`).
- Produces: `<ReportGroupedTable columns groupBy rows renderSubtotalLabel>` — groups by `groupBy: (row)=>string`, emits a subtotal row (sum over `total`-flagged columns) per group and a grand total.

- [ ] Render grouped `<table>` with a group header band, data rows, a subtotal band per group, and a sticky grand-total footer. Horizontal scroll wrapper (`overflow-x-auto`) for wide tables; hide low-priority columns `< md` (responsive table rule).
- [ ] Money columns right-aligned, `tabular-nums`, QAR-formatted via `formatCurrency`.
- [ ] `tsc` + `eslint` clean.

### Task 0.3: Excel + PDF export plumbing

**Files:**
- Create: `src/components/reports/useReportExport.ts`, `src/lib/reports/report-html.ts`, `src/app/api/reports/[slug]/pdf/route.ts`

**Interfaces:**
- Produces: `useReportExport({ slug, filters, columns, rows, title })` → `{ exportExcel(), exportPdf(), pdfPending }`.

- [ ] `exportExcel()` maps the grouped rows (with subtotal/grand-total rows) into `exportSheetsToExcel` (styled workbook, filters in the title/subtitle band).
- [ ] `report-html.ts`: `buildReportHtml({ title, appliedFilters, columns, groups })` → self-contained HTML string (inline CSS, no network), applied-filter chips in the header (PDF general rule 2).
- [ ] `/api/reports/[slug]/pdf/route.ts`: authenticated (middleware covers it; assert a session), reads the filter payload, calls the report's RPC **server-side** with the caller's auth (so `is_division_visible` applies), builds HTML, returns `htmlToPdfBuffer(html)` as `application/pdf`. Wrap the RPC + Puppeteer calls in try/catch → non-200 + `{ ok:false, error }` on failure (module security checklist point 4).
- [ ] Verify one round-trip end-to-end with a stub report before building real reports.
- [ ] `tsc` + `eslint` clean.

### Task 0.4: Nav + permissions

**Files:**
- Modify: `src/components/layout/nav-config.ts`, permission tree + `src/lib/route-permissions.ts`

- [ ] Add 6 links under the existing **Reports** nav group, each with the right permission (`reports.inventory.view` for 1.1/1.2; `reports.accounting.view` for 2.1–2.4).
- [ ] Add the two permissions to the tree + role grants (Owners/Accounts Manager → both; Accountant → both; Inventory Manager → inventory only), via an idempotent data migration; live-verify grants preserved.
- [ ] `tsc` + `eslint` clean.

---

## Phase 1 — Inventory reports

### Task 1.1: Product Cost Report (PO-wise)

**Purpose:** current stock holdings valued at FIFO purchase cost, **one line per cost layer** so per-PO unit costs stay visible (never blended).

**Files:**
- Create: `supabase/migrations[-staging]/<ts>_rpc_report_product_cost.sql`
- Create: `src/hooks/reports/useProductCostReport.ts`, `src/app/(dashboard)/reports/product-cost/page.tsx`

**Data source & column map** (author against live schema, verify with `db query`):
- Rows = `fifo_cost_layers` with `remaining_qty > 0` (current on-hand). One row = one line (no `GROUP BY unit_cost`).
- `PO No` ← `fifo_cost_layers.receival_id → receivals.purchase_order_id → purchase_orders.po_number` (layers with `source_type <> 'receival'` show the source label, e.g. `Adjustment`/`Opening`, not a PO).
- Product hierarchy ← `brand_variant → inventory_items.category_id → inventory_categories` tree via `parent_id`: **Product Type** = `inventory_categories.type`; **Category** = category `name_en`; **Sub-category** = child category `name_en`. **Product Name** = `inventory_items.name_en`. **Barcode** = `inventory_item_brand_variants.code`.
- `QTY` = `remaining_qty` · `Unit Cost` = `total_unit_cost` · `Total Cost` = `remaining_qty * total_unit_cost` · `Sales Price` = `inventory_item_brand_variants.selling_price`.
- **Division** = `fifo_cost_layers.sub_container_id → warehouse_sub_containers.division_id`; **Warehouse** = `fifo_cost_layers.warehouse_id`.

**RPC:** `rpc_report_product_cost(p_division_ids uuid[] DEFAULT NULL, p_warehouse_ids uuid[] DEFAULT NULL, p_po_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_brand_variant_id uuid DEFAULT NULL)` — no date range (snapshot). RETURNS TABLE of the columns above + `division_id`, `warehouse_id`, `po_id` (for links/grouping). Scope every row through `is_division_visible(division_id)`.

- [ ] Author + apply RPC via `db query`; verify per-layer output with a `db query` that shows a variant with 2 layers returning 2 rows with distinct `unit_cost`.
- [ ] Confirm the category→(type/category/subcategory) mapping against a real item; adjust the tree walk if `inventory_categories.type` doesn't cleanly yield the 3 PDF levels (**verification-required** — see Open Questions).
- [ ] Hook `useProductCostReport(filters)` (TanStack Query; `.limit()` not needed — RPC bounds itself). Page: `ReportFilterBar` (`showWarehouse`) + PO/category/barcode filters + `ReportGroupedTable` grouped by division→warehouse, subtotal on `Total Cost`. PO No links to `PoDetailDialog`.
- [ ] Export ▾ (Excel + PDF) via `useReportExport({ slug: 'product-cost' })`.
- [ ] `tsc` + `eslint` clean.
- [ ] **Operator smoke:** the two-PO worked example from the PDF (same product+barcode, two POs, two unit costs) shows as two lines; division/warehouse filters + subtotals correct; Excel + PDF match the on-screen filtered set.

### Task 1.2: Revenue, COGS & Gross Profit Report (per-layer, SO + line)

**Purpose:** sales value vs COGS + gross profit/margin at SO + **per-cost-layer** line level.

**Files:**
- Create: `supabase/migrations[-staging]/<ts>_rpc_report_revenue_cogs.sql`
- Create: `src/hooks/reports/useRevenueCogsReport.ts`, `src/app/(dashboard)/reports/revenue-cogs/page.tsx`

**Data source & column map:**
- Rows = `cogs_entries` where `source_type IN ('sale','sale_return')`, `date` within range. One row = one layer line (no aggregation).
- `Customer` ← `sale_orders.customer_id → customers.name` (via `ce.sale_order_id`). `SO No` ← `sale_orders.so_number`.
- Product hierarchy + Barcode ← same mapping as 1.1.
- `QTY` = `ce.qty` · `Unit Cost` = `ce.unit_cost` · `Total Cost` = `ce.total_cost` (negative for `sale_return`).
- `Sales Price` ← `sale_order_lines.unit_price` (join on `ce.sale_order_id` + `ce.brand_variant_id`). **Total Sales** = `ce.qty * Sales Price`. **Gross Profit** = Total Sales − Total Cost. **Margin %** = GP ÷ Total Sales (NULL when Total Sales = 0).
- **Division** = `ce.consumer_division_id` (the selling division; falls back to `division_id`). **Warehouse** = `ce.source_id → fifo_cost_layers.warehouse_id`.

**RPC:** `rpc_report_revenue_cogs(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL, p_warehouse_ids uuid[] DEFAULT NULL, p_customer_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_brand_variant_id uuid DEFAULT NULL)`, dates **required**. RETURNS TABLE of the columns + a `summary` (revenue/cogs/gross/margin + prev-period, mirroring `rpc_product_profitability`). Scope via `is_division_visible`.

- [ ] **Verify Sales Price currency:** confirm `sale_order_lines.unit_price` is QAR; if it is order-currency, convert using `sale_orders.exchange_rate`/`total_qar` (the existing `rpc_product_profitability` uses raw `unit_price` — do NOT inherit that if it's a currency bug). Document the finding.
- [ ] Author + apply RPC; `db query` proof: an SO line fulfilled from 2 layers returns 2 rows with distinct `unit_cost` and a shared `SO No` (the PDF's core requirement).
- [ ] Hook + page: reuse the KPI-card row (Revenue/COGS/Gross/Margin) from `product-profitability/page.tsx`; `ReportFilterBar` (`showWarehouse`) + customer + product-hierarchy filters (both dates required — disable submit until set); `ReportGroupedTable` grouped division→warehouse with subtotals on Total Sales / Total Cost / Gross Profit. SO No links to `SoDetailDialog`.
- [ ] Export ▾ (Excel + PDF).
- [ ] `tsc` + `eslint` clean.
- [ ] **Operator smoke:** PDF worked example (one SO, two layers, two Margin % lines) reproduced; date presets + division/warehouse filters + subtotals correct; export parity.

---

## Phase 2 — Accounting reports

### Task 2.1: Accounts Receivable Report (invoice-level)

**Purpose:** outstanding customer balances **per invoice**, with ageing status. (Existing `rpc_sales_aging_report` is a customer-level bucket summary — reuse it only as an optional summary panel; the main grid is invoice-level.)

**Files:** `…_rpc_report_accounts_receivable.sql`; `src/hooks/reports/useReceivablesReport.ts`; `src/app/(dashboard)/reports/receivables/page.tsx`

**Column map:** rows = `so_invoices`. `Customer` ← `customers.name`; `SO No` ← `sale_orders.so_number` (via `sale_order_id`); `Invoice No` ← `invoice_id`; `Invoice Date` ← `issued_date`; `Due Date` ← `due_date`; `Amount` ← `total_amount`; `Paid` ← `paid_amount`; `Due` = `total_amount - paid_amount`; **Status** = `Paid` if `payment_status='paid'` or Due≤0, else `Over Due` if `due_date < CURRENT_DATE`, else `Due`. **Division** = `so_invoices.division_id`.

**RPC:** `rpc_report_accounts_receivable(p_division_ids uuid[] DEFAULT NULL, p_customer_id uuid DEFAULT NULL, p_month text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_status text DEFAULT NULL)`. Scope `is_division_visible(division_id)`.

- [ ] Author + apply RPC; `db query` sanity (a known overdue + a paid invoice bucket correctly).
- [ ] Hook + page: `ReportFilterBar` (no warehouse) + customer + month + invoice-date + status filters; `ReportGroupedTable` grouped by division, subtotal `Due`. Invoice No links to `/invoices`; SO No to `SoDetailDialog`. Optional collapsible ageing panel from `rpc_sales_aging_report`.
- [ ] Export ▾. `tsc` + `eslint` clean.
- [ ] **Operator smoke:** the PDF sample (a `Due` + an `Over Due` row) reproduces; status/ageing correct; division filter + export parity.

### Task 2.2: Accounts Payable Report (bill-level, + PO currency)

**Purpose:** outstanding supplier balances **per bill**, with ageing status and the **original PO currency amount alongside base**.

**Files:** `…_rpc_report_accounts_payable.sql`; `src/hooks/reports/usePayablesReport.ts`; `src/app/(dashboard)/reports/payables/page.tsx`

**Column map:** rows = `bills`. `Supplier` ← `suppliers.name`; `PO No` ← `purchase_orders.po_number` (via `purchase_order_id`); `Bill No` ← `bill_number`; `Invoice Date` ← `issued_date`; `Due Date` ← `due_date`; `Amount` (base QAR) ← `total_amount`; `Paid` ← `paid_amount`; `Due` = `total_amount - paid_amount`; `Status` derived as in 2.1. `PO Currency Amount` ← `purchase_orders.currency` + the bill value in that currency. **Division** = `bills.division_id`.

**RPC:** `rpc_report_accounts_payable(p_division_ids uuid[] DEFAULT NULL, p_supplier_id uuid DEFAULT NULL, p_month text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_status text DEFAULT NULL)`. Scope `is_division_visible(division_id)`.

- [ ] **Verify PO-currency mapping (verification-required):** determine how a bill's original-currency amount is obtained — `bills` has no currency column, so it must come from `purchase_orders.currency` + `exchange_rate` (e.g. `total_amount / po.exchange_rate`) or a bill-line source. Confirm with `db query` against a known foreign-currency PO (the PDF sample shows `USD $3,287` beside `QR 12,000`). Do not ship a guessed conversion.
- [ ] Author + apply RPC; hook + page (`ReportFilterBar` no warehouse + supplier/month/date/status); grouped by division, subtotal `Due`; PO No → `PoDetailDialog`, Bill No → bill detail. Export ▾. `tsc` + `eslint` clean.
- [ ] **Operator smoke:** foreign-currency bill shows PO currency + base side by side; ageing/status/division correct; export parity.

### Task 2.3: Cash & Cash Equivalents Report (running balance)

**Purpose:** cash movements + running balance across payment channels. Receipts = Debit, payments = Credit.

**Files:** `…_rpc_report_cash.sql`; `src/hooks/reports/useCashReport.ts`; `src/app/(dashboard)/reports/cash/page.tsx`

**Column map:** rows = `payments` where `deleted_at IS NULL` and `status IN ('completed','pending','processing')`. `Date` ← `date`; `Payment Method` ← `payment_methods.name` (via `method_id`/`method`); `Bill / Invoice No` ← `so_invoices.invoice_id` (via `invoice_id`) or `bills.bill_number` (via `bill_id`); `Customer / Supplier` ← `customers.name` / `suppliers.name`; **Debit** = `amount_qar` when `direction='incoming'`; **Credit** = `amount_qar` when `direction='outgoing'`; **Balance** = opening balance (net of all payments before `p_start`) + running `SUM(debit - credit) OVER (ORDER BY date, created_at)`.

**RPC:** `rpc_report_cash(p_start date, p_end date, p_method_ids uuid[] DEFAULT NULL, p_division_ids uuid[] DEFAULT NULL)`, dates **required**. Division scoping is **derived** — `payments` has no `division_id`; resolve via `COALESCE(so_invoices.division_id, bills.division_id)` for the linked doc and apply `is_division_visible`. Returns an opening-balance row + movement rows.

- [ ] **Verify division derivation + opening balance (verification-required):** confirm the invoice/bill link is reliable for direct (non-doc) payments; payments with no linked doc are visible to all divisions or excluded — decide with the accountant. Prove the running balance carries down correctly across the `p_start` boundary.
- [ ] Author + apply RPC; hook + page (`ReportFilterBar` no warehouse + payment-method multiselect; dates required); flat table (no grouping) with the Balance column; Debit/Credit right-aligned. Export ▾. `tsc` + `eslint` clean.
- [ ] **Operator smoke:** PDF sample (a Cash receipt debit + a USD payment credit with carried-down balance) reproduces; method filter + date presets + export parity.

### Task 2.4: Profit & Loss Report (streams + FX + scrap, accrual/cash)

**Purpose:** revenue, COGS and gross profit for a period; revenue **and** COGS each broken down by stream (**Product / Spare Parts / Consumables**), with Exchange Gain/Loss and Scrap & Defective as separate lines before Gross Profit; selectable **accrual or cash** basis; division- and warehouse-wise.

**Files:** `…_rpc_report_pnl.sql`; `src/hooks/reports/usePnlReport.ts`; `src/app/(dashboard)/reports/profit-loss/page.tsx`

**Statement structure (Description | Amount):** Revenue (Product/Spare Parts/Consumables) → COGS (Product/Spare Parts/Consumables) → Exchange Gain/Loss → Scrap & Defective → **Gross Profit**.

**Data map:**
- **COGS by stream** ← `cogs_entries` in period, grouped by the item's stream (`inventory_categories.type`), split so `source_type='consumption'` is visible within its stream. Warehouse filter via `source_id → fifo_cost_layers.warehouse_id`; division via `consumer_division_id`.
- **Revenue by stream** ← accrual: sold-line revenue (`sale_order_lines.unit_price × ce.qty` for `source_type='sale'`, QAR-normalized) grouped by stream; cash: `payments` incoming allocated to streams (**verification-required** — cash-basis revenue-by-stream needs an allocation rule).
- **Exchange Gain/Loss** ← `SUM(payments.exchange_gain - payments.exchange_loss)` in period (+ realized order FX if the accountant wants it).
- **Scrap & Defective** ← damaged write-offs (`inventory_damaged_movements` type `damaged_write_off`, `qty × unit_cost`) in period.

**RPC:** `rpc_report_pnl(p_start date, p_end date, p_basis text DEFAULT 'accrual', p_division_ids uuid[] DEFAULT NULL, p_warehouse_ids uuid[] DEFAULT NULL)` RETURNS jsonb statement. Scope via `is_division_visible`.

- [ ] **Verify (verification-required, with accountant):** (a) the exact **accrual vs cash** definitions (esp. cash-basis COGS + revenue-by-stream allocation); (b) the **stream mapping** — confirm `inventory_categories.type` values map to Product / Spare Parts / Consumables (else find the right dimension). Do not hard-code a guessed mapping.
- [ ] Author + apply RPC; hook + page: basis toggle (Accrual/Cash), `ReportFilterBar` (`showWarehouse`), statement rendered as an indented Description|Amount table; division-wise = one statement column per selected division (or a division selector). Export ▾. `tsc` + `eslint` clean.
- [ ] **Operator smoke:** the PDF sample statement (Revenue 100,000 → COGS 55,000 → FX 100 → Scrap 200 → Gross Profit 44,700) reconciles on real data; basis toggle + division/warehouse filters change the numbers coherently; export parity.

---

## Global Requirements Coverage (PDF §3)

| PDF general rule | Where satisfied |
|---|---|
| 1 — Date + period presets everywhere | `DateRangePicker`/`presetRange` in `ReportFilterBar` (Task 0.1); required on 1.2/2.3/2.4 |
| 2 — Export to Excel + PDF, filters in header | Task 0.3 (`useReportExport`, `report-html.ts` applied-filter header) |
| 3 — Role-based access | Task 0.4 (`reports.inventory.view` / `reports.accounting.view` + role grants) |
| 4 — FIFO throughout, no blending | Per-layer rows in 1.1/1.2 + custody fix `20260819270000`; cross-cutting decision 3 |
| 5 — Foreign currency original + base | 2.2 PO currency column, 2.3 `amount`/`currency` beside `amount_qar`, 2.4 FX line |
| 6 — Drill-down links | PO/SO/Invoice/Bill links in every grid (cross-cutting decision 8) |

## Open Questions — verification-required before/while building (need live-DB confirmation or accountant input)

> **Resolution log (2026-08-11):** Q1, Q2, Q3, Q6 resolved against live staging (below). Q4, Q5,
> and a new Q7 (the `tools` stream) need the accountant — build is **paused** on these; see
> `accountant-questions.md`. Re-verify every finding against the live DB at build time anyway
> (baseline + `database.types.ts` are stale — only `db query --linked` is authoritative).

1. ✅ **Revenue-stream mapping** (2.4): `inventory_categories.type` = `products` (55) / `spare-parts` (96) / `consumables` (46) / **`tools` (20)**. First three map 1:1 to the PDF streams; `tools` has no PDF home → **Q7 (accountant)**.
2. ✅ **PO-currency amount on a bill** (2.2): `bills` has no currency/rate columns. Foreign amount = **`bills.total_amount / purchase_orders.exchange_rate`**, currency = `purchase_orders.currency`. Rate is **QAR-per-foreign** (verified: USD PO `subtotal 53,677.9 × rate 3.65 = total_qar 195,924`; so `12,000 QAR ÷ 3.65 = $3,287`, matching the PDF sample). Guard `exchange_rate` NULL/1 → treat as QAR.
3. ✅ **Sales-price currency** (1.2): `sale_order_lines.unit_price` is **order-currency, NOT QAR** (`sale_orders` carries `currency`/`exchange_rate`/`total_qar`; `total_qar = subtotal × exchange_rate`). Convert to QAR via `unit_price × sale_orders.exchange_rate`. Do **not** inherit `rpc_product_profitability`'s raw `unit_price` (FX bug for non-QAR orders).
4. ✅ **Accrual vs cash** (2.4): operator decision 2026-08-11. **Accrual** = default: Revenue = invoiced sales by stream (`sale_order_lines` × qty, QAR-normalized via `sale_orders.exchange_rate`); COGS = `cogs_entries` in period by stream. **Cash** toggle = **pure money-in/out**: Revenue = incoming customer payments (`payments` `direction='incoming'`, `amount_qar`) in the period; Cost = outgoing supplier payments (`direction='outgoing'`) in the period; both dated by `payments.date`. Cash-basis **stream split**: allocate each receipt/payment across streams by its linked invoice/bill line mix (best-effort; falls back to an "Unallocated" total when a payment has no line-level link — e.g. an on-account receipt). FX + Scrap lines apply to the accrual view; on cash basis FX is already realized in the payment amounts.
5. ✅ **Cash "what counts as cash"** (2.3): **BUILT** (migration `20260819340000`). `payment_methods.is_cash_equivalent` flag + a **Cash / Active** toggle pair in Master Data → Admin → Payment Methods; `Cash` seeded on. The Cash report counts only payments whose `method_id` is flagged (no name/heuristic). Verified end-to-end on staging (UI toggle persists to DB).
6. ✅ **Cash division derivation** (2.3): `payments` has no `division_id`, but **every payment reaches one via `source_type`/`source_id`** → `sale_order`/`purchase_order`/`invoice`(/`bill`)`.division_id`. Verified on staging: **40/40 payments resolve, 0 orphans** (20 sale_order, 10 purchase_order, 7 invoice, 3 direct invoice/bill); payments are always created from a SO/PO/invoice/bill dialog, so future ones link too. Derive via a `COALESCE` chain; a hypothetical null → "Unassigned", shown to super-viewers only (safety net). **Opening balance:** show opening (net cash before `p_start`) + running balance — operator to confirm (recommended yes).
7. ✅ **Invoice table of record**: **`so_invoices` is canonical** for AR (24 cols incl. `division_id`, `sale_order_id`, `paid_amount`, `due_date`, `pdf_url`). `customer_invoices` is a near-identical legacy twin; `tl_invoices` no longer exists (renamed).
8. ✅ **`tools` stream** (2.4): gets its **own "Tools" row** in both Revenue and COGS (operator decision 2026-08-11) — Products / Spare Parts / Consumables / **Tools**, nothing folded or hidden.

## Self-Review

- **Spec coverage:** all 6 PDF reports → Tasks 1.1, 1.2, 2.1–2.4; all 6 general rules → coverage table above; user additions (division on all, warehouse on 1.1/1.2/2.4, per-layer COGS, division activity incl. consumption, filter+grouping+subtotals, Excel+PDF) → cross-cutting decisions 1–8. No PDF requirement is unmapped.
- **Known gaps** are the 6 verification-required items above — genuine data/accounting unknowns, flagged per task rather than guessed (per the project's "verify against live DB / never copy SQL verbatim" rule). They are discovery steps inside their tasks, not missing tasks.
- **Type consistency:** uniform RPC arg names (`p_start`, `p_end`, `p_division_ids`, `p_warehouse_ids`) and the shared `ReportFilters` / `ExcelColumn<T>` / `ReportGroupedTable` contracts are reused across all tasks.

## Execution Handoff

Suggested order: **Phase 0 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4.** Phase 0 is the dependency for every report. 1.1/1.2 validate the per-layer + warehouse path end-to-end (highest value, builds on the just-landed custody fix); 2.1/2.2 are quick invoice/bill lists; 2.3/2.4 carry the most verification-required items — resolve those with the accountant before starting them.

