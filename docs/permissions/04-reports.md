# 04 · Reports

Top nav: **Reports** — dropdown gated by `reports.access`.

> **Cost-gate scope:** Reports are **out** of the operational Show-costs scope —
> a report *is* its numbers, so there's no "view without money". Access is gated
> per report. The gap here is not cost-splitting but **two pages with no gate at
> all**. Legend as in [README](README.md).

Every report is read-only. **Manage** on this section means **Export**
(`reports.manage`) — reports can be exported to CSV/PDF; there is no edit.

| Report → node | View | Export | Notes / money | Gap |
|---|---|---|---|---|
| **Financial Dashboard** — `/reports/dashboard` | `reports.view` OR `reports.dashboard.view` (route) | `reports.manage` | Receivables/payables/cash KPIs, trend, overdue tables. | ⚠️ **Page component has NO `useHasPermission`** — money renders for anyone who reaches it. Also `reports.dashboard_finance` gates the HOME-dashboard finance widgets (separate surface). |
| **Product Profitability** — `/reports/product-profitability` | `reports.view` OR `reports.product_profitability.view` (route) | in-table export | Revenue/COGS/GP/Margin KPIs + per-product table + drill dialog. | ⚠️ **Page component has NO gate** — the same broad-key hole as Dashboard. |
| **Product Cost** — `/reports/product-cost` | `reports.product_cost.view` | `ReportExportMenu` | On-hand FIFO unit/total cost, sales price. | ✅ single key gates render + data hook. |
| **Revenue & COGS** — `/reports/revenue-cogs` | `reports.revenue_cogs.view` | `ReportExportMenu` | Revenue/COGS/GP/Margin; per-line cost + sales. | ✅ gated. |
| **Accounts Receivable** — `/reports/receivables` | `reports.receivables.view` | `ReportExportMenu` | Outstanding/overdue; per-invoice amount/paid/due. | ✅ gated. |
| **Accounts Payable** — `/reports/payables` | `reports.payables.view` | `ReportExportMenu` | Outstanding/overdue; per-bill amounts + PO currency. | ✅ gated. |
| **Cash & Cash Equivalents** — `/reports/cash` | `reports.cash.view` | `ReportExportMenu` | Cash in/out/closing; debit/credit/balance ledger. | ✅ gated. |
| **Profit & Loss** — `/reports/profit-loss` | `reports.profit_loss.view` | `ReportExportMenu` | **In-page sub-nav:** accrual / cash basis toggle; collapsible Revenue + COGS breakdowns; FX + COGS-source drill dialogs. | ✅ gated (single key; COGS not split). |
| **Consumption** — `/reports/project-consumption` | any-of `reports.view` · `reports.project_consumption.view` · `consumption.cost.view` | 2× `ReportExportMenu` (Teams sheet, Projects sheet) | Sections: 👷 Teams / 🏗️ Projects (each own filter + export); Total Spend / Total Cost. | ⚠️ `consumption.cost.view` is only ONE OR-branch — holding `reports.view` alone still shows the cost. Not a true cost split. |

---

## Section gaps & proposed keys

- ⚠️ **Ungated pages** — `/reports/dashboard` and `/reports/product-profitability`
  render financials with **no page-level permission check**. They rely on the
  broad `reports.view` in the route map, so anyone holding *any* report key (or
  the broad key) can reach them. **Fix:** gate each on its own
  `reports.dashboard.view` / `reports.product_profitability.view` in the page,
  and tighten the route entries (drop the broad `reports.view` fallback for
  these two).
- The other 7 reports follow one clean pattern: per-report `reports.<name>.view`
  drives both the empty-state lock and the data-hook `enabled` flag.
- `reports.view` is a broad legacy key that unlocks Dashboard, Product
  Profitability, and Consumption + acts as the export gate — worth narrowing
  later, but not part of the operational cost work.
