# MMS — Session Resumption File

> **HOW TO USE THIS FILE:**
> When context window is getting full (>70%), start a fresh conversation and paste this file.
> Say: "Continue MMS development from PROGRESS.md" and paste the contents.
> Claude will resume exactly where you left off.

---

## Project Identity

**Project:** MMS — Maintenance Management System
**Owner:** Mohamed Ismail
**Working dir:** `D:/MMS`
**Goal:** Web ERP for a Qatar maintenance company (Alfaytri Maintenance, RSH Cleaning and Pest Control)

---

## Confirmed Tech Stack (DO NOT CHANGE)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database | Supabase — **same existing project**, 120 tables, 400k rows |
| Auth | Supabase Auth (existing, RLS already configured) |
| Data fetching | TanStack Query v5 |
| Deployment | Vercel |

**Critical DB facts:**
- `profiles` links to auth via `auth_user_id` (NOT `id`)
- `divisions` has: `id`, `name`, `short_name`, `color`, `is_active`, `sort_order`
- Schema reference: `Old Schema/` folder (16 .md files + `schema (1).sql`)
- Index of all 120 tables: `Old Schema/00_index.md`

---

## Design System (DO NOT CHANGE)

| Token | Value |
|---|---|
| Primary (buttons, active nav) | Orange `#F97316` → HSL `25 95% 53%` |
| Secondary (links, badges) | Blue `#3B82F6` → HSL `217 91% 60%` |
| Background | White `#FFFFFF` |
| Surface | `#F8FAFC` (slate-50) |
| Border | `#E2E8F0` (slate-200) |
| Text primary | `#0F172A` (slate-900) |
| Text muted | `#64748B` (slate-500) |
| Success | `#22C55E` (green-500) |
| Destructive | `#EF4444` (red-500) |
| Warning | `#EAB308` (yellow-500) |

Top nav: white bg, orange active underline. Primary buttons: orange fill, white text.

---

## Folder Structure

```
D:/MMS/
├── src/
│   ├── app/
│   │   ├── (auth)/login/         ← Login page
│   │   └── (dashboard)/          ← All protected pages (layout has TopNav)
│   │       ├── layout.tsx
│   │       ├── page.tsx          ← Dashboard
│   │       ├── master-data/      ← Phase 1 partial
│   │       ├── purchase/         ← Phase 1 full
│   │       └── sales/            ← Phase 1 full
│   ├── components/
│   │   ├── ui/                   ← shadcn/ui
│   │   ├── shared/               ← reusable tables/dialogs
│   │   ├── layout/               ← TopNav, NavDropdown, DivisionFilter, UserMenu
│   │   ├── master-data/
│   │   ├── purchase/
│   │   └── sales/
│   ├── hooks/                    ← one file per module (useDivisions, usePurchaseOrders, etc.)
│   ├── lib/supabase/             ← client.ts (browser) + server.ts (async cookies)
│   ├── lib/utils.ts              ← cn() helper
│   └── types/database.types.ts  ← generated from Supabase
├── supabase/migrations/          ← new schema changes only
├── middleware.ts                 ← session refresh + route protection
├── Old Schema/                   ← reference only, DO NOT modify
├── Ideas/                        ← UI specs, DO NOT modify
├── docs/superpowers/specs/       ← design doc
└── docs/superpowers/plans/       ← implementation plans
```

---

## Navigation (LOCKED)

```
Top Nav: Logo | Master Data▾ | Orders▾ | Contracts▾ | Invoices▾ | Purchase & Sales▾ | Teams▾ | [User▾]

Master Data▾ (active items):
  Companies & Divisions → /master-data/companies
  Warehouses            → /master-data/warehouses
  Inventory Items       → /master-data/inventory
  Suppliers             → /master-data/suppliers
  Users & Roles         → /master-data/users
  Audit Trail           → /master-data/audit-trail
  Admin                 → /master-data/admin
  --- separator ---
  Service List          [Coming Soon]
  Team & Employee       [Coming Soon]
  Subscription Packages [Coming Soon]
  QuickBooks            [Coming Soon]
  Notification Trail    [Coming Soon]

Orders / Contracts / Invoices / Teams → single "Coming Soon" row, no sub-items

Purchase & Sales▾:
  PURCHASE: Purchase Orders | Approvals | Shipments | Landed Costs | Dead Stock Report | Warehouses
  SALES:    Create Sale Order | Sale Orders | Returns
```

---

## Phase Plan

### Phase 1 — Target: 1–1.5 months (CURRENT)
**Modules:** Master Data (partial) + Purchase (full) + Sales (full)
**Everything else:** Coming Soon

### Phase 2 — after Phase 1
Orders, Contracts, Invoices & Payments, Teams
(Outsource candidates: Orders, Contracts, Invoices, Teams — all fully specced in `Ideas/`)

### Phase 3
Contact Center (never outsource — too complex)

---

## Implementation Plans

| Plan file | Status | Description |
|---|---|---|
| `docs/superpowers/plans/2026-04-16-mms-foundation.md` | **DONE** | Scaffold, auth, design system, TopNav, dashboard |
| `docs/superpowers/plans/2026-04-16-mms-master-data.md` | **DONE** | Companies, Warehouses, Inventory, Suppliers, Users, Audit |
| `docs/superpowers/plans/2026-04-17-mms-purchase-core.md` | **DONE** | PO hooks, shared components, detail dialog, list page, create PO, approvals |
| `docs/superpowers/plans/2026-04-17-mms-sales-core.md` | **DONE** | SO hooks, shared components, detail dialog, list page, create SO, returns |
| `docs/superpowers/plans/2026-04-17-mms-purchase-operations.md` | **DONE** | Shipments, Landed Costs, Warehouses Hub (7 tabs), Dead Stock Report |
| `docs/superpowers/plans/2026-04-16-mms-csv-import.md` | Not written yet | CSV import tool (5 entity types) |

---

## ✅ Completed

- [2026-04-16] Full brainstorming & design session
- [2026-04-16] Design spec: `docs/superpowers/specs/2026-04-16-mms-phase1-design.md`
- [2026-04-16] Foundation plan written: `docs/superpowers/plans/2026-04-16-mms-foundation.md` (18 tasks)
- [2026-04-16] **Foundation complete** — scaffold, auth, design system, TopNav, dashboard (Tasks 1–18)
  - 87-table schema applied to Supabase + TypeScript types generated
  - Login page, middleware, TanStack Query provider
  - Full navigation: Master Data + Purchase & Sales dropdowns, Coming Soon for Orders/Contracts/Invoices/Teams
  - Dashboard with DivisionFilter + 4 stat cards
- [2026-04-16] **Bug fixes** — Base UI dropdown context errors resolved
  - `NavDropdown.tsx`: wrapped each group in `<DropdownMenuGroup>` so `DropdownMenuLabel` has required `MenuGroupRootContext`
  - `UserMenu.tsx`: same fix — label and menu items wrapped in `<DropdownMenuGroup>`
  - All nav dropdowns (Purchase & Sales, Master Data) and avatar menu now work correctly
- [2026-04-16] **Git setup** — remote connected to `https://github.com/alfaytri/MMS.git`, foundation pushed to `main`, active development on branch `develop`
- [2026-04-16] **Master Data plan written** — `docs/superpowers/plans/2026-04-16-mms-master-data.md` (13 tasks)
- [2026-04-16] **Master Data Task 1: Dependencies + Formatters + Toaster** — installed @tanstack/react-table, sonner; created formatters.ts with 5 formatting helpers + 17 tests; added Toaster to root layout
- [2026-04-16] **Master Data Task 2: DataTable Shared Component** — created DataTableColumnHeader (sortable headers with aria), DataTablePagination (responsive mobile-first with aria-labels), DataTable (sorting, filtering, pagination, loading skeleton, empty state)
- [2026-04-16] **Master Data Task 3: Shared UI Components** — PageHeader (customizable icon), SearchInput (debounced with aria-labels), StatusBadge (6 semantic variants), ConfirmDialog (with pending state)
- [2026-04-16] **Master Data Task 4: Suppliers Module** — useSuppliers hook (query + create/update mutations), SupplierFormDialog (7-field form with zod validation), Suppliers page with DataTable. Key findings: Base UI uses `render` prop not `asChild`, zod v4 needs `.optional()` not `.default('')` with zodResolver.
- [2026-04-16] **Master Data Task 5: Companies & Divisions** — useCompanies hook, expanded useDivisions (full type + mutations + useDivisionsByCompany), CompanyFormDialog (8 fields), DivisionFormDialog (14 fields, scrollable), Card-per-company page with nested division table
- [2026-04-16] **Master Data Task 6: Warehouses Module** — useWarehouses hook (query + create/update), WarehouseFormDialog (name/location/type), Warehouses page with DataTable + type badge + item count

- [2026-04-16] **Master Data Tasks 7–8: Inventory Module** — useInventory hook (categories, items, brand variants, all CRUD), InventoryItemFormDialog (9 fields, bilingual), BrandVariantFormDialog (code + prices), Inventory page with 3 tabs (Products/Spare Parts/Consumables), expandable brand variants panel
- [2026-04-16] **Master Data Tasks 9–10: Users & Roles** — useRoles hook (custom_roles CRUD), useProfiles hook (profiles + nested user_custom_roles + user_divisions), lib/permissions.ts (8 modules, ~48 permission keys), RoleFormDialog (scrollable permission checkboxes by group), UserRoleDialog (toggle-based roles + divisions), Users & Roles page (3 tabs: Permissions/Roles/Users)
- [2026-04-17] **Master Data Task 11: Audit Trail** — useActivityLog hook (30s auto-refresh, module/severity/search filters, debounced search, escaped PostgREST queries), AuditDetailDialog (JSON diff view for old/new data), Audit Trail page with filters + DataTable
- [2026-04-17] **Master Data Task 12: Admin Settings** — AdminSidebar (3 sections, active state, "Soon" badges), Admin layout (responsive sidebar + content), Admin landing page (redirects to brand-groups), Brand Groups page (CRUD), Reason Lists page (CRUD)
- [2026-04-17] **Master Data Task 13: Integration Test** — Build passes cleanly (all 9 routes), 21/21 tests pass, resolved stale database.types.ts cast issues (brand_variants, inventory_categories, inventory_items)
- [2026-04-17] **Master Data plan: COMPLETE** — All 13 tasks done. 9 pages, 7+ hooks, 10+ form dialogs, all responsive.

- [2026-04-17] **Purchase Core Task 1: Hooks** — usePurchaseOrders (PO CRUD, filters, approval calc, payment methods), usePOApprovals (approval workflow hooks)
- [2026-04-17] **Purchase Core Task 2: Shared Components** — PoStatusBadge (color-coded), PoApprovalChain (compact icon row), InventoryItemLookup (typeahead search), PaymentDialog (record payments)
- [2026-04-17] **Purchase Core Task 3: PO Detail Dialog** — 4-tab dialog (line items, receivals, payments, activity), entity_id filter, staleTime, currency format
- [2026-04-17] **Purchase Core Task 4: PO List Page** — Status chip filters, date range, debounced search, DataTable with 9 columns, PoDetailDialog integration
- [2026-04-17] **Purchase Core Task 5: Create/Edit PO Page** — PoLineItemsEditor (line type tabs, inventory lookup per row, qty/price/total calc, add/remove rows), PoTermsSection (payment/delivery term presets, vendor notes), Create PO page (supplier search+quick-add, currency/exchange rate, line items, terms, discount, approval level preview, save draft/submit), Edit PO stub page
- [2026-04-17] **Purchase Core Task 6: Approvals Page** — Pending approvals queue (card per PO, click to approve/reject), completed approvals table, approve/reject dialog with line items preview + approval chain + comment, full rejection vs send-back-to-draft modes, real Supabase auth user recorded
- [2026-04-17] **Purchase Core plan: COMPLETE** — All 7 tasks done. 4 pages, 9 hooks, 7+ components, full PO lifecycle (create → approve → receive → pay).
- [2026-04-17] **Sales Core Task 1: Sale Hooks** — useSaleOrders (types, customer hooks, SO CRUD, confirm with reserve-stock, delivery with deduct-sale-stock, payments), useSaleReturns (CRUD + status transitions)
- [2026-04-17] **Sales Core Task 2: Shared Components** — SoStatusBadge (8 status colors), SoPaymentDialog (record payment form), SoDeliveryDialog (warehouse + per-item qty, calls deduct-sale-stock edge function)
- [2026-04-17] **Sales Core Task 3: SO Detail Dialog** — 4-tab dialog (items with subtotal/discount/total, deliveries with item breakdown, payments with progress bar, activity log); action buttons for confirm/deliver/edit per status
- [2026-04-17] **Sales Core Task 4: Sale Orders List Page** — status chip filters (8 statuses with counts), debounced search, date range, DataTable with 7 columns, SoDetailDialog integration with confirm/edit actions
- [2026-04-17] **Sales Core Task 5: Create/Edit SO Page** — SoLineItemsEditor (inventory lookup per row, qty/price/total calc, negative margin warning icon), Create SO page (customer search+quick-add, line items, fixed/percentage discount, notes, save-as-quotation + confirm-order), Edit SO stub page
- [2026-04-17] **Sales Core Task 6: Sale Returns Page** — returns list with status chips, create return dialog (SO selector, per-item qty + condition toggle, restock warehouse), return detail dialog, advance-status pipeline (pending → received → restocked → closed)
- [2026-04-17] **Sales Core plan: COMPLETE** — All 7 tasks done. 4 pages, 3 hooks, 5+ components, full SO lifecycle (quotation → confirm → deliver → pay → return).
- [2026-04-17] **Purchase Operations plan written** — `docs/superpowers/plans/2026-04-17-mms-purchase-operations.md` (8 tasks: hooks, Shipments, Landed Costs, Warehouses Hub 7-tab, Dead Stock Report, integration test)

- [2026-04-17] **Purchase Operations Task 1: Hooks** — useShipments (CRUD + event tracking + archive), useLandedCosts (CRUD + void), useWarehouseOperations (stock movements, transfers, adjustments, inventory checks), useDeadStock (2-query classify + filter)
- [2026-04-17] **Purchase Operations Task 2: Shipments Page** — Shipments tracking page with status chip filter (Active/Archived), DataTable (9 columns), CreateShipmentDialog (PO/mode/carrier/dates), ShipmentDetailDialog (timeline events + add event form + update status dropdown + archive)
- [2026-04-17] **Purchase Operations Task 3: Landed Costs Page** — LC list with DataTable, CreateLcDialog (description/date/cost lines/receival checkboxes), LcDetailDialog (cost lines + item allocations + void action with reason)
- [2026-04-17] **Purchase Operations Task 4: Warehouses Hub Shell** — 7-tab hub page, WhWarehousesTab (card grid with type badge/item count/value), WhStockOverviewTab (warehouse selector + stock table), WhMovementsTab (movement log with type badges + qty colors)
- [2026-04-17] **Purchase Operations Task 5: Transfers + Receivals Tabs** — WhTransfersTab (list with approve/reject for pending_approval), WhTransferDialog (from/to warehouse, date, dynamic item rows), WhReceivalsTab (all-warehouse receival list with PO context)
- [2026-04-17] **Purchase Operations Task 6: Adjustments + Inventory Checks Tabs** — WhAdjustmentsTab (list with approve action), WhAdjustmentDialog (warehouse/variant/type/qty/reason), WhInventoryChecksTab (list with Create+View), WhInventoryCheckDialog (dual-mode: create or count items with variance display + submit/review)

- [2026-04-17] **Purchase Operations Task 7: Dead Stock Report** — 4-category summary cards (Active/Slow/At-Risk/Dead) with click-to-filter, sort by days idle or value, full table with last movement date and ∞ for never-moved items
- [2026-04-17] **Purchase Operations plan: COMPLETE** — All 8 tasks done. 4 pages, 4 hooks, 11 warehouse tab/dialog components, full operations coverage (shipments, landed costs, stock overview, movements, transfers, receivals, adjustments, inventory checks, dead stock).

## 🔄 In Progress

- Writing CSV Import plan (bulk import for suppliers, inventory items, customers, purchase orders, sale orders)

## ⏳ Not Started

- CSV Import tool (5 entity types)

---

## Key Reference Files

| File | What it contains |
|---|---|
| `Old Schema/00_index.md` | All 120 tables listed |
| `Old Schema/01_core_configuration.md` | companies, divisions tables |
| `Old Schema/02_users_rbac.md` | profiles, custom_roles tables |
| `Old Schema/11_purchase.md` | purchase_orders, suppliers, receivals, shipments, landed_costs |
| `Old Schema/09_invoices_payments.md` | invoices, payments, credit_notes |
| `Old Schema/10_sales.md` | sale_orders, sale_order_lines, deliveries, returns |
| `Old Schema/07_inventory_items.md` | inventory_items, brand_variants |
| `Old Schema/13_warehouse_management.md` | warehouses, transfers, adjustments |
| `Ideas/PURCHASE & Sales MODULE.txt` | Full UI spec for Purchase & Sales |
| `Ideas/Master Data.txt` | Full UI spec for Master Data |
| `Ideas/INVOICES MODULE.txt` | Full UI spec for Invoices |
| `Ideas/Teams Module.txt` | Full UI spec for Teams |
| `Ideas/Contact Center Module.txt` | Full UI spec for Contact Center |

---

## HOW TO RESUME IN A NEW SESSION

Paste this file and say:
> "I'm continuing MMS development. Read PROGRESS.md and resume from where we left off."

Claude will read the plan file for the current In Progress item and dispatch subagents task by task.

**Active branch:** `develop` (all Phase 1 feature work goes here — never commit directly to `main`)
