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
| `docs/superpowers/plans/2026-04-17-mms-csv-import.md` | **DONE** | CSV import tool (5 entity types) |

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

- [2026-04-17] **CSV Import plan written** — `docs/superpowers/plans/2026-04-17-mms-csv-import.md` (3 tasks: utilities+hooks, import page UI, integration test)
- [2026-04-17] **CSV Import Task 1: Utilities + Hooks** — ENTITY_CONFIGS (5 entity column defs + example rows + template download), validateRows (per-type validation, number coercion, required checks), useImportSuppliers/InventoryItems/Customers/PurchaseOrders/SaleOrders (batch insert, grouping by PO/SO number for multi-line entities)
- [2026-04-17] **CSV Import Task 2: Import Page** — Tabbed entity selector, drag-and-drop CSV upload (PapaParse), column legend with required/optional badges, preview DataTable with per-cell error highlighting, show-errors-only toggle, download error rows, import valid rows with progress, ResultSummary with success/fail counts
- [2026-04-17] **CSV Import Task 3: Integration Test** — TypeScript clean, all tests pass, build succeeds, route /master-data/import confirmed
- [2026-04-17] **CSV Import plan: COMPLETE** — All 3 tasks done. 1 page, 3 utility/hook files, 5 entity importers, full workflow (template → upload → validate → import → results).

- [2026-04-18] **User Management Task 5: POST /api/users/create** — admin-driven user creation with rate limit + dual-write profile + atomic role assignment + audit log
- [2026-04-18] **User Management Tasks 6-8: remaining API routes** — PATCH /api/users/[id] (profile update + self-deactivation guard), POST /api/users/reset-password (JWT+DB dual-write), POST /api/users/me/change-password (self-change clears flag + session refresh)
- [2026-04-18] **User Management Tasks 9-11: infrastructure** — middleware force-change-password gate (JWT→DB fallback + explicit allowlist), 4 new useProfiles hooks, /change-password page
- [2026-04-18] **User Management Tasks 12-15: dialogs + wiring** — AddUserDialog, EditUserDialog, ResetPasswordDialog; wired into Users page; "Invite User" renamed to "Add User"; "Manage Roles" replaced with Edit/Reset actions
- [2026-04-18] **User Management Task 16: cleanup** — deleted /api/users/invite, InviteUserDialog, useInviteUser; full build confirmed clean; all 5 new routes present
- [2026-04-18] **Bug fixes (smoke test)** — fixed requireAdmin bootstrap-first ordering (403 on Add User), fixed replace_user_custom_roles RPC column name (user_id→profile_id), fixed useProfiles to route through GET /api/users bypassing RLS, fixed PostgREST FK ambiguity (user_custom_roles + user_divisions dual-FK hints), reduced password min to 8 chars
- [2026-04-18] **Built-in Admin role** — migration `20260418150000_seed_admin_role.sql` seeds is_system Admin role with all 53 permission keys; auto-assigns to m.ismail@alfaytri.com; pushed + committed (26f6f1e)
- [2026-04-18] **Fix: warehouses RLS** — migration `20260418160000_fix_warehouses_rls.sql` adds SELECT/INSERT/UPDATE/DELETE policies; warehouses table had RLS enabled with zero policies (every write was blocked) (887f575)
- [2026-04-18] **Admin Settings redesign** — AdminSidebar restructured into 4 sections (ORGANIZATION: Divisions/Warehouses/Work Schedule; CATALOG & PRICING: Brand Groups/Pricing Factors/Credit Categories; OPERATIONS: Reason Lists/Document T&C; INTEGRATIONS: Call Center/Traccar Devices/Agent Resources); title moved into sidebar; layout heading removed (b093dd4)
- [2026-04-18] **Brand Groups: card layout** — page replaced DataTable with responsive card grid; scope filter dropdown; coloured scope badges; brand chips per card; Manage Brands dialog (checkbox list to add/remove brands from group); inline edit + soft-delete (b093dd4)
- [2026-04-18] **Fix: create brands/brand_groups/brand_group_members tables** — migration `20260418170000_create_brands_and_brand_groups.sql`; tables existed in old DB but were missing from migrations causing schema cache errors (b89c4cb)
- [2026-04-18] **Admin UI Restructure Task 1: DB Migrations** — divisions.name_ar column migration, division-assets Storage bucket migration created; database.types.ts updated with name_ar on divisions Row/Insert/Update
- [2026-04-18] **Admin UI Restructure Task 2: Route Migration** — Companies & Warehouses pages moved to admin/companies and admin/warehouses; nav-config.ts + AdminSidebar.tsx links updated
- [2026-04-18] **Admin UI Restructure Task 3: useDivisions** — useAllDivisions (fetches all including inactive) + useDeleteDivision mutation added
- [2026-04-18] **Admin UI Restructure Task 4: permissions.ts** — PERMISSION_GROUPS rewritten with icons/labels/descriptions per key; roleColor util added; ALL_PERMISSIONS derived from new structure; 5 vitest tests pass
- [2026-04-18] **Admin UI Restructure Task 5: DivisionFormDialog Overhaul** — redesigned form with company dropdown, color swatches, name_ar field, logo/stamp upload to Supabase Storage
- [2026-04-18] **Admin UI Restructure Task 6: Companies page** — division card grid with colored left border, logo/address/stamp indicators, edit/delete actions, per-company sections (0539df5)
- [2026-04-18] **Admin UI Restructure Task 7: RoleFormDialog** — accordion permissions by module with indeterminate checkboxes, Select/Clear All, live count, Base UI indeterminate prop adapted (0447262)
- [2026-04-18] **Admin UI Restructure Task 8: Users & Roles page** — Shield header + dynamic counts, tab badges, Permissions accordion with Expand/Collapse All, Role cards grid (3-col) with coverage chips via `roleColor()`, Users DataTable with row actions, `useDeleteRole` hook added (972299d)
- [2026-04-18] **Admin UI Restructure Task 9: Integration** — full `next build` passes (31 routes), all 33 vitest tests pass, old `master-data/companies` and `master-data/warehouses` routes confirmed removed
- [2026-04-18] **Auth gate fix** — `middleware.ts` now redirects signed-in users off `/login` to `/`, removed leftover debug `console.log`, dropped dead `!startsWith('/auth')` check (the `(auth)` route group is stripped from URLs so the clause never fired). Unauthenticated users hitting `/` are correctly redirected to `/login`; authenticated users hitting `/login` are redirected to the dashboard.
- [2026-04-18] **Users & Roles tabs UI polish** — tab row (Permissions/Roles/Users) moved to the top and centered via `justify-center`, Tabs root forced to `flex-col` so TabsList and TabsContent stack (the base component's `data-horizontal:flex-col` variant wasn't firing). Active tab now highlights with `data-active:bg-primary` (orange) + `text-primary-foreground` (white). Count badges rewritten as compact `<span>` — `h-4 min-w-5 rounded-full bg-white border text-[10px] text-foreground tabular-nums`, giving the white-pill / rounded / black-text look requested. Removed redundant `mt-4` from each TabsContent inner div since the Tabs root now owns the vertical gap.
- [2026-04-18] **Session cookies are now session-scoped** — stripped `Max-Age`/`Expires` from all three places Supabase auth cookies get written (`middleware.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`). Browser now drops `sb-*-auth-token*` cookies on window/process close instead of persisting them for days, so closing the browser forces the next visit through `/login`. Caveat: Chrome's "Continue where you left off" setting and keeping other tabs on the same origin open will preserve session cookies until the browser process actually exits.
- [2026-04-19] **Purchase & Sales Expansion Task 12: Customer Invoices page** — InvoiceDetail.tsx (read-only dialog with needs_refresh banner, line items table, payment summary, send/pay/payment-plan actions), Customer Invoices list page with doc_status chip filter, search, DataTable, InvoiceDetail integration (`src/components/sales/InvoiceDetail.tsx`, `src/app/(dashboard)/sales/invoices/page.tsx`)

## 🔄 In Progress

### Purchase & Sales Expansion (Sub-project C)

- Design spec: `docs/superpowers/specs/2026-04-18-purchase-sales-expansion-design.md` ✅ approved
- Implementation plan: `docs/superpowers/plans/2026-04-19-purchase-sales-expansion.md` ✅ **fully written** (15 tasks, 67 steps)
- Scope: DB migrations (invoices split status, match_status, credit_note_lines, payment_plans), Purchase flow (RFQ→PO→Receival→Bill→Payment), Sales flow (SO→Delivery→Invoice→Payment→Credit Note)
- Status: **12 of 15 tasks + Task 13 COMPLETED** (62/67 steps done)

**Completed Tasks:**
  - [x] Task 1: DB Migration (30b8718)
  - [x] Task 2: TypeScript Invoice Types + Invoice Sync (b7c806f)
  - [x] Task 3: Nav Config Update (d3f615c)
  - [x] Task 4: useRfqs + useReceivals hooks (a52c7dc)
  - [x] Task 5: useSupplierBills + useSupplierPayments + usePaymentPlans hooks (c110663)
  - [x] Task 6: Sales hooks (useSaleDeliveries, useCustomerInvoices, useCustomerPayments, useCreditNotes) (d69592c)
  - [x] Task 7: RFQ Components + Page (e869201)
  - [x] Task 8: Receivals Components + Page (657580b)
  - [x] Task 9: Bills Components + Page (87cd241)
  - [x] Task 10: Purchase Payments Components + Page (df15d44)
  - [x] Task 11: Sale Deliveries Component + Page (0b90fe4)
  - [x] Task 12: Customer Invoices Component + Page (b7a67b7)
  - [x] Task 13: Customer Payments + Credit Notes page (f0fe8e3)

**Pending Tasks:**
  - [ ] Task 14: Wire SO Confirm to Create Delivery + Invoice
  - [ ] Task 15: Integration Test

---

### Phase 1 Cleanup — MUST CLEAR BEFORE PHASE 2

All Phase 1 modules are feature-complete, but these loose ends must be closed before starting Phase 2 work.

- [ ] **[2026-04-18] In-app user management rework** — replace invite-email flow with admin-driven create / edit / reset password.
  - Design spec: `docs/superpowers/specs/2026-04-18-in-app-user-management-design.md`
  - Implementation plan: `docs/superpowers/plans/2026-04-18-mms-user-management.md` (17 tasks)
  - Scope: migration for `profiles.must_change_password`, 4 new API routes, delete `/api/users/invite`, middleware force-change gate, `/change-password` page, `AddUserDialog` + `EditUserDialog` + `ResetPasswordDialog`, row actions dropdown on Users page, hook updates.
  - Status: **code complete** — all automated checks pass. Manual browser smoke test pending before Phase 2.
    - [x] Task 1 — migration + `replace_user_custom_roles` RPC applied (ad94ed2)
    - [x] Task 2 — shared `passwordSchema` zod + 6 unit tests (c33730a)
    - [x] Task 3 — `requireAdmin()` / `requireAuth()` gates with `ADMIN_BOOTSTRAP_EMAIL` fallback (ab7a744)
    - [x] Task 4 — `isRateLimited()` + `logUserEvent()` helpers over `activity_log` (7f9753c)
    - [x] Task 5 — `POST /api/users/create` — admin-driven user creation with rate limit + roles + audit
    - [x] Task 6 — `PATCH /api/users/[id]` — update profile + optional role replace + self-deactivation guard (ef16d2d)
    - [x] Task 7 — `POST /api/users/reset-password` — admin reset with JWT+DB dual-write (4540ac4)
    - [x] Task 8 — `POST /api/users/me/change-password` — self-change clears flag (e7fdbdf)
    - [x] Task 9 — middleware force-change-password gate (explicit allowlist + JWT→DB fallback) (69a5369)
    - [x] Task 10 — `useCreateUser` / `useUpdateUser` / `useResetUserPassword` / `useCompleteMyPasswordChange` hooks (2945735)
    - [x] Task 11 — `/change-password` page (035a271)
    - [x] Task 12 — `AddUserDialog` component (7ac00dc)
    - [x] Task 13 — `EditUserDialog` component (d1a59b8)
    - [x] Task 14 — `ResetPasswordDialog` component (4670c2f)
    - [x] Task 15 — wire dialogs into Users page; renamed Invite → Add; swapped Manage Roles for Edit User + Reset Password (41e3a9d)
    - [x] Task 16 — deleted `/api/users/invite`, `InviteUserDialog`, `useInviteUser`; build clean (d6565ef)
    - [x] Task 17 — automated: build clean, all routes verified, all tests pass. Manual browser smoke test pending.

- [x] **[2026-04-18] Create Role dialog UI polish** — permissions grid was overlapping; fixed via flex-wrap + module-prefix stripping + per-group Select all toggle. Width raised to `max-w-5xl`, inner permissions box caps at `55vh` with internal scroll.

- [ ] **Verify** self-provision banner flow (Create My Profile) on a fresh auth user with no profile row — unverified by user since it was added.

## ⏳ Not Started (Phase 2, gated on cleanup above)

- Phase 2: Invoices & Payments module
- Phase 2: Orders module
- Phase 2: Contracts module
- Phase 2: Teams module

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
