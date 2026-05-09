# MMS — Development Progress & Session Resumption

> **HOW TO RESUME:** When context window is getting full (>70%), start a fresh conversation, paste this file, and say:
> *"I'm continuing MMS development. Read PROGRESS.md and resume from where we left off."*
> Claude will read the active plan and dispatch subagents task by task.

---

## Project Identity

| Field | Value |
|---|---|
| **Project** | MMS — Maintenance Management System |
| **Owner** | Mohamed Ismail |
| **Working dir** | `D:/MMS` |
| **Active branch** | `feature/purchase-module` — current working branch for bill rework |
| **Goal** | Web ERP for a Qatar maintenance company (Alfaytri Maintenance, RSH Cleaning and Pest Control) |

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
├── docs/superpowers/specs/       ← design docs
└── docs/superpowers/plans/       ← implementation plans
```

---

## Navigation (LOCKED)

```
Top Nav: Logo | Master Data▾ | Orders▾ | Contracts▾ | Purchase & Sales▾ | Teams▾ | [User▾]

Master Data▾:
  Inventory Items → /master-data/inventory
  Suppliers       → /master-data/suppliers
  Warehouses      → /purchase/warehouses      ← operational hub (route stays, nav entry here)
  Users & Roles   → /master-data/users
  Audit Trail     → /master-data/audit-trail
  Admin           → /master-data/admin
  ---
  Services → /master-data/services
  Team & Employee (Coming Soon)
  Subscription Packages (Coming Soon) | QuickBooks (Coming Soon) | Notification Trail (Coming Soon)

Purchase & Sales▾:
  PURCHASE: Purchase Orders | Receivals | Purchase Payments
  (separator): Approvals | Shipments | Landed Costs | Dead Stock Report
  SALES: Sale Orders | Deliveries | Invoices | Payments | Credit Notes | Returns
```

---

## Phase Plan

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Master Data (partial) + Purchase (full) + Sales (full) | **CURRENT** |
| **Phase 2** | Orders, Contracts, Invoices & Payments, Teams | Gated on Phase 1 cleanup |
| **Phase 3** | Contact Center (never outsource — too complex) | Future |

---

## Implementation Plans

| Plan file | Status | Description |
|---|---|---|
| `docs/superpowers/plans/2026-04-16-mms-foundation.md` | ✅ DONE | Scaffold, auth, design system, TopNav, dashboard |
| `docs/superpowers/plans/2026-04-16-mms-master-data.md` | ✅ DONE | Companies, Warehouses, Inventory, Suppliers, Users, Audit |
| `docs/superpowers/plans/2026-04-17-mms-purchase-core.md` | ✅ DONE | PO hooks, shared components, detail dialog, list page, create PO, approvals |
| `docs/superpowers/plans/2026-04-17-mms-sales-core.md` | ✅ DONE | SO hooks, shared components, detail dialog, list page, create SO, returns |
| `docs/superpowers/plans/2026-04-17-mms-purchase-operations.md` | ✅ DONE | Shipments, Landed Costs, Warehouses Hub (7 tabs), Dead Stock Report |
| `docs/superpowers/plans/2026-04-17-mms-csv-import.md` | ✅ DONE | CSV import tool (5 entity types) |
| `docs/superpowers/plans/2026-04-21-services-hub-shell-tree-tabs.md` | ✅ DONE | Services Hub — page shell, DivisionMultiSelect, Normal/Contract/Mobile tree tabs, ServiceEditDialog |
| `docs/superpowers/plans/2026-04-21-services-tree-dialog-redesign.md` | ✅ DONE | Services Hub — 7-column tree, sticky header, ServiceTreeRow, archive soft-delete, full ServiceEditDialog with image upload |
| `docs/superpowers/plans/2026-04-21-services-hub-notifications-instructions.md` | ✅ DONE | Services Hub — Notifications tab (fixed + reminders sub-tabs), Instructions tab (materials + links sub-tabs) |
| `docs/superpowers/plans/2026-04-21-services-hub-inventory-promotions.md` | ✅ DONE | Services Hub — Inventory tab (linked items tree), Promotions tab (campaigns + vouchers) |
| `docs/superpowers/plans/2026-04-18-mms-user-management.md` | ✅ DONE | Admin-driven user create/edit/reset, force-change gate, change-password page |
| `docs/superpowers/plans/2026-04-19-purchase-sales-expansion.md` | ✅ DONE | RFQ→PO→Bill→Payment + SO→Delivery→Invoice→Payment→Credit Note |
| `docs/superpowers/plans/2026-04-19-po-page-redesign.md` | ✅ DONE | PO list stat cards, rich filters, progress-bar table, PoDetailDialog redesign |
| `docs/superpowers/plans/2026-04-20-create-po-redesign.md` | ✅ DONE | Create PO full spec redesign — sticky header, grouped items, approval chain |
| `docs/superpowers/plans/2026-04-20-warehouses-hub-redesign.md` | ✅ DONE | Warehouses operational hub — 7-tab redesign, URL state, React.memo, unified receivals+deliveries |
| `docs/superpowers/plans/2026-04-22-po-approval-chain.md` | ✅ DONE | PO approval chain — configurable division-based chains, cumulative tiers, notifications, admin force-approve |
| `docs/superpowers/plans/2026-04-25-inventory-complete.md` | ✅ DONE | Inventory accounting — FIFO layers, atomic RPCs, reserved qty, COGS, stock movements, ledger hooks |
| `docs/superpowers/plans/2026-04-27-multi-company-division-isolation.md` | ✅ DONE | Division isolation — JWT hook, RLS, DivisionFilter, PO/SO create pickers, user division assignment |
| `docs/superpowers/plans/2026-04-30-po-returns.md` | ✅ DONE | PO returns — dispatch/cancel/supplier-confirm flow, inventory deduction on dispatch, cancel with RPC reversal, type toggle on Returns page |
| `docs/superpowers/plans/2026-05-03-teams-employee-page.md` | 🚀 ACTIVE | Teams & Employee page — full CRUD dialogs, drag-and-drop, activity logging, schedule management |

---

## 🔄 In Progress

🚀 Starting: **Orders Module Plan Task 2: DB schema validation & integration**

## ✅ Completed

- [2026-05-09] **Orders Module Plan Task 1: DB migration — customer_phones & customer_addresses** — `supabase/migrations/20260509120000_customer_phones_addresses.sql` — Created customer_phones table with phone + label + is_primary fields, unique constraint on phone; added phone_id FK to existing customer_addresses table linking to customer_phones; created indexes on (customer_id) and (phone) for query performance; migration applied successfully via `npx supabase db push`

- [2026-05-07] **Operations Calendar Plan Part 2 Task 14: CalendarPage shell + wire up page.tsx** — `src/components/calendar/CalendarPage.tsx`, `src/app/(dashboard)/calendar/page.tsx` — CalendarPage 'use client' shell wires all calendar hooks (useCalendarSchedule, useCalendarVisits, useWeekCapacity, useTeams, useTeamSkills, useUserDivisionScope) and all sub-components (CalendarToolbar, WeekCapacityStrip, TimelineGrid, TeamCardList, SwapTeamDialog); inline useCalendarPermissions hook reads user_custom_roles; correct string-based getWeekStart/buildWeekDates signatures used; placeholder page.tsx replaced with clean import; 41/41 tests pass; zero new TypeScript errors

- [2026-05-07] **Operations Calendar Plan Part 2 Task 13: SwapTeamDialog + useTeamSkills** — `src/hooks/useTeamSkills.ts`, `src/components/calendar/SwapTeamDialog.tsx`, `src/components/calendar/SwapTeamDialog.test.tsx` — useTeamSkills returns Map<teamId, serviceId[]> via employee_services → employees (direct team_id FK); filterEligibleTeams checks skill first then time conflict; SwapTeamDialog shows eligible/ineligible teams with reason badges and conflict peek; server-side RPC swap_visit_team confirms with atomic re-validation; 7/7 tests passing

- [2026-05-06] **Dibsy Payment Gateway Integration** — `src/lib/dibsy.ts`, `src/app/api/payments/dibsy/create/route.ts`, `src/app/api/payments/dibsy/webhook/route.ts`, `supabase/migrations/20260506090000_add_dibsy_payment_fields.sql`, `.env.local` — Dibsy (Qatar payment gateway) client with createDibsyPayment/getDibsyPayment helpers; POST /api/payments/dibsy/create creates a Dibsy payment session and stores dibsy_payment_id + checkout URL on customer_subscriptions; POST /api/payments/dibsy/webhook receives payment events (paid/failed/expired/refunded), maps to subscription status (active/pending_payment/cancelled), and activates start/end dates on first successful payment.

- [2026-05-06] **Subscription Module Tasks 1–8: Subscription Packages master-data page** — `supabase/migrations/20260506000004–6_*.sql`, `src/hooks/useSubscriptionPackages.ts`, `src/components/master-data/subscriptions/{ServicePickerTree,PackageEditDialog,SubscriptionPackageRow,SubscriptionsPage}.tsx`, `src/app/(dashboard)/master-data/subscriptions/page.tsx`, `src/components/layout/nav-config.ts` — Full catalog page for annual subscription tiers: atomic upsert RPC, DB aggregate view, searchable service picker tree with per-service discount overrides, SLA strict-mode validation, subscriber count pill, archive flow with AlertDialog, bilingual EN/AR names.

- [2026-05-05] **Stock Transfer Bug Fix** — `supabase/migrations/20260505000013_warehouse_manager_profile.sql`, `src/hooks/useWarehouses.ts`, `src/hooks/useWarehouseOperations.ts`, `src/components/purchase/wh/WhTransferDialog.tsx`, `src/components/purchase/wh/WhTransfersTab.tsx`, `src/components/master-data/WarehouseFormDialog.tsx` — Fixed 5 bugs: (1) canApprove always-false: warehouses.manager_id is employees FK, compared against profiles.id — added manager_profile_id (profiles FK) and fixed comparison; (2) notification banner was a lie — now inserts real in-app notification to destination manager on create, and back-notification to requester on approve/reject; (3) useWarehouseStock enabled guard: `undefined !== null` was true causing unfiltered all-stock fetch — changed to !!warehouseId; (4) useApproveTransfer missing warehouse_stock + warehouses cache invalidation; (5) WarehouseFormDialog: added System Manager (Approvals) profile dropdown

- [2026-05-05] **Warehouses Hotfix: fix UUID/TEXT cast error on reference_id** — `supabase/migrations/20260505000012_fix_reference_id_cast.sql` — Migrations 010 and 011 re-introduced `p_brand_variant_id::TEXT` in the `inventory_stock_movements` INSERT; since `reference_id` is UUID, this caused "column reference_id is of type uuid but expression is of type text" when adding/editing brand variants; migration 012 removes the `::TEXT` cast in both the increase and decrease movement log paths
- [2026-05-05] **Warehouses Hotfix: surface allocation errors + fresh cache** — `src/components/services/inventory/BrandVariantEditDialog.tsx`, `src/hooks/useInventory.ts`, `supabase/migrations/20260505000011_allocate_warehouse_stock_verify.sql` — applyAllocations re-throws RPC errors so success toast is blocked if allocation fails; useVariantWarehouseStock staleTime reduced to 0 so dialog always loads live DB state on reopen; migration 011 adds end-of-function verification that FIFO final qty equals target, raising exception on mismatch
- [2026-05-05] **Warehouses Hotfix: unassigned stock + stale zero-cost layers** — `supabase/migrations/20260505000010_fix_allocate_cost_on_all_delta_paths.sql` — Fixed two bugs in `allocate_warehouse_stock`: (1) after any qty increase/decrease, now also updates `unit_cost`/`total_unit_cost` on all existing opening-stock layers (`receival_id IS NULL`) for that warehouse, correcting historical zero-cost layers; (2) confirms gap-fill correctly reads DB stock_level set by the variant UPDATE before RPC fires; also fixed frontend `applyAllocations` to include all warehouses with existing stock so cost-only saves propagate
- [2026-05-05] **Warehouses Hotfix: avg_cost cost-only update** — `supabase/migrations/20260505000009_fix_allocate_warehouse_stock_cost_update.sql` — Fixed `allocate_warehouse_stock` RPC: when `v_delta = 0` and a positive unit cost is provided, now updates `unit_cost`/`total_unit_cost` on existing opening-stock FIFO layers (`receival_id IS NULL`) for the warehouse, then calls `recalc_average_cost`; previously returned early so cost edits never propagated to `warehouse_stock_view`
- [2026-05-05] **Warehouses Per-Warehouse Stock Task 1: Export `useVariantWarehouseStock` from `useInventory.ts`** — `src/hooks/useInventory.ts` — Added WarehouseStockRow and VariantWarehouseStock types; exported useVariantWarehouseStock hook that queries fifo_cost_layers directly, grouping remaining_qty by warehouse_id into perWarehouse array and summing null warehouse_ids into unassigned bucket; enabled parameter gates network request for lazy loading (tooltip hover use-case); staleTime 30s

- [2026-05-05] **Per-Warehouse Stock Visibility** — `supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql`, `src/hooks/useWarehouseOperations.ts`, `src/components/purchase/wh/WhWarehousesTab.tsx`, `src/components/purchase/wh/WhStockOverviewTab.tsx`, `src/components/purchase/wh/WhTransferDialog.tsx`, `src/app/(dashboard)/purchase/warehouses/page.tsx` — DB view (warehouse_stock_view) over fifo_cost_layers with double-join to inventory_items; trigger (trg_warehouse_stats) maintaining warehouses.item_count and total_value on INSERT/UPDATE/DELETE; generate_transfer_number() sequence function; useWarehouseStock queries view; useWarehouseStockSummary returns memoized Map for O(1) lookups; WhWarehousesTab adds 'View Stock →' button and proportional value comparison bar; WhStockOverviewTab adds warehouse filter Select + clear pill + URL param pre-selection; WhTransferDialog replaces free-text items with item picker from source warehouse stock, per-row available-qty validation with error borders, submit guard, and DB-sequence transfer numbers

- [2026-05-05] **Warehouses Master Data — Gap Completion** — `src/hooks/useWarehouses.ts`, `src/components/master-data/WarehouseFormDialog.tsx`, `src/app/(dashboard)/master-data/admin/warehouses/page.tsx`, `src/components/purchase/wh/WhWarehousesTab.tsx` — Employee join in useWarehouses so manager_name is resolved from employees table; Manager dropdown added to WarehouseFormDialog; useDeleteWarehouse mutation added; Delete action with AlertDialog confirmation added to admin/warehouses page; removed (wh as any) cast in WhWarehousesTab

- [2026-05-04] **Teams & Employee Page (Tasks 1-20)** — `supabase/migrations/20260503000001-5_*.sql`, `src/hooks/useTeams.ts`, `src/components/teams/**`, `src/app/(dashboard)/master-data/teams/page.tsx` — Full teams management page with drag-and-drop, CRUD dialogs, activity logging, and schedule management
- [2026-05-04] **Teams & Employee Page Task 18: ActivityLogPanel + EntityActivityLogDialog** — `src/components/teams/dialogs/ActivityLogPanel.tsx` (new), `src/components/teams/dialogs/EntityActivityLogDialog.tsx` (new) — ActivityLogPanel: right Sheet with 5 filter tabs (all/team/employee/vehicle/schedule); renders logs with action label, entity_type badge, actor name, relative time; null-safe on entity_type and created_at. EntityActivityLogDialog: standalone Dialog for per-entity log view with same log card layout; tsc clean
- [2026-05-04] **Teams & Employee Page Task 17: ScheduleDialog** — `src/components/teams/dialogs/ScheduleDialog.tsx` (new) — Dual-mode dialog: LIST mode (global schedule library CRUD with inline day-grid editor; Errata 13: Sun–Thu enabled by default for Saudi Arabia workweek); TEAM-ATTACHMENT mode (attach/detach schedule assignments with date range; `a.schedule.name` typed directly via joined `Schedule` object; status badges: active/upcoming/past); tsc clean
- [2026-05-04] **Teams & Employee Page Task 16: VehicleEditDialog** — `src/components/teams/dialogs/VehicleEditDialog.tsx` (new) — Dialog for create/edit/archive vehicles; Errata 5: Save button disabled during async plate uniqueness check (`isValidatingPlate` state); plate blur triggers Supabase count query excluding current vehicle id; `isMutating` guards both create and update paths; tsc clean
- [2026-05-04] **Teams & Employee Page Task 15: EmployeeEditDialog** — `src/components/teams/dialogs/EmployeeEditDialog.tsx` (new) — Dialog for create/edit/archive employees; Errata 7: `crypto.randomUUID()` avatar paths; Errata 11: `submitError` state + try/catch in `onSubmit`; Errata 2: edit path uses `save_employee` RPC (atomic employee+skills), create path uses `createEmployee` then `upsert_employee_services`; loads existing skill IDs from `employee_services` table on open; tsc clean
- [2026-05-03] **Teams & Employee Page Task 8: TeamsPageContext** — `src/components/teams/TeamsPageContext.tsx` (new) — Page-wide React Context with dialog state (team/employee/vehicle/schedule/log), search + division filter, density toggle; integrated `useToolCountMap` batch hooks to prevent N+1 queries; includes `TeamsPageProvider` component + `useTeamsPage` hook; tsc clean
- [2026-05-03] **Service Links Redesign — Code Review Fixes** — `InventoryColumnPicker.tsx` (new), `ServiceLeafPanel.tsx`, `ServiceLinksMasterList.tsx`, `ServiceLinksBulkPanel.tsx`, `ServiceLinksView.tsx`, deleted `ServiceLinksColumnBrowser.tsx` — Fixed O(n²) idxMap, Escape key, collapsible category headers with per-category linked count, filtered stat bar counts, Checkbox onCheckedChange, InventoryColumnPicker extracted to own file, ServiceLeafPanel accepts linkedVariantIds prop (removes internal hook call), unused cn import removed
- [2026-05-03] **Service Links Redesign Task 7: Responsive Behaviour** — `src/components/services/inventory/ServiceLinksView.tsx` — Made master-detail layout responsive: left panel full-width on mobile/tablet, 40% on desktop (lg+); right panel hidden below lg when nothing selected, shows when activeId/bulk mode active; added back button on mobile (lg:hidden) with `setActiveId(null)` + `setCheckedIds(new Set())`; imported Button component; tsc clean

## ✅ Completed

- [2026-05-03] **Service Links Redesign — Code Review Fixes** — `InventoryColumnPicker.tsx` (new), `ServiceLeafPanel.tsx`, `ServiceLinksMasterList.tsx`, `ServiceLinksBulkPanel.tsx`, `ServiceLinksView.tsx`, deleted `ServiceLinksColumnBrowser.tsx` — Fixed O(n²) idxMap, Escape key, collapsible category headers with per-category linked count, filtered stat bar counts, Checkbox onCheckedChange, InventoryColumnPicker extracted to own file, ServiceLeafPanel accepts linkedVariantIds prop (removes internal hook call), unused cn import removed
- [2026-05-03] **Service Links Redesign Task 7: Responsive Behaviour** — `src/components/services/inventory/ServiceLinksView.tsx` — Made master-detail layout responsive: left panel full-width on mobile/tablet, 40% on desktop (lg+); right panel hidden below lg when nothing selected, shows when activeId/bulk mode active; added back button on mobile (lg:hidden) with `setActiveId(null)` + `setCheckedIds(new Set())`; imported Button component; tsc clean

- [2026-05-03] **Service Links Redesign Task 2: Hook — useAddBulkServiceInventoryLinks** — `src/hooks/useInventory.ts` — Added bulk mutation hook calling RPC `service_inventory_bulk_upsert` with serviceIds array; invalidates `service-links-all` cache on success; defaults link_type to 'supply', quantity to 1, warrantyMonths to 0; TypeScript compiles cleanly

- [2026-05-02] **Service Links Redesign** — `ServiceLinksColumnBrowser.tsx` (new), `ServiceLeafPanel.tsx` (new), `ServiceLinksView.tsx`, `serviceInventoryHelpers.ts`, `useInventory.ts`, migration `20260502000001` — Replaced cramped tree-table with column browser + inline right panel; link types simplified to supply/consumable only; no more modal dialogs

- [2026-05-02] **Inventory seed from Inventory.xlsx** — `scripts/seed_inventory.py` — Cleared all existing test inventory data (cogs_entries, stock_movements, service_inventory, fifo_cost_layers, brand_variants, items, categories); parsed 224 Excel rows into 17 categories / 129 items / 199 brand variants across 4 types (products, spare-parts, consumables, tools); AC items grouped by spec with brand as variant; group items use IsGroup parent→item, children→brand_variants; standalone items parsed by en-dash brand separator

- [2026-05-02] **Normal Services UI Overhaul** — `supabase/migrations/20260502130000_services_photo_req_division_array.sql`, `src/types/database.types.ts`, `src/hooks/useServices.ts`, `src/app/(dashboard)/master-data/services/page.tsx`, `src/components/services/ServiceTableView.tsx`, `src/components/services/ContractTableView.tsx`, `src/components/services/ServiceTree.tsx`, `src/components/services/ServiceTreeRow.tsx`, `src/components/services/ServiceEditSections.tsx`, `src/components/services/ServiceEditDialog.tsx` — Added search box + linkage filter chips (Inventory/Reminders/Instructions/QC/Parts) to toolbar; added Division column and Linked icons column (📦🔔📋✅🔧) to tree table; fixed duration format (1h 30m), warranty format (6 mo); all rows now open Edit on click (chevron expands); migrated division to text[] with multi-select in dialog; added photo_requirement field; Legacy Service ID visible on all services; Configurable service type now shows component services selector (stored in components column); name_ar made optional; tsc clean

- [2026-05-01] **Inventory: fix reserved_qty stale counter via trigger** — `supabase/migrations/20260501000004_reserved_qty_trigger.sql`, `src/hooks/useSaleOrders.ts` — `fn_refresh_reserved_qty` recalculates from `sale_order_lines` on every SO status change and every SOL insert/update/delete; backfill corrected all stale counters; fixed 3 more wrong `inventory-brand-variants` cache keys in useSaleOrders; added `brand-variants-v2` + `reserved-order-lines` invalidation to create/cancel/approve/deliver mutations

- [2026-05-01] **Inventory: fix incoming cache + reserved orders drill-down** — `src/hooks/useReceivals.ts`, `src/hooks/usePOApprovals.ts`, `src/hooks/useInventory.ts`, `src/components/services/inventory/BrandVariantRow.tsx`, `src/components/services/inventory/ReservedOrdersDialog.tsx` (new) — Fixed wrong React Query cache key (`inventory-brand-variants` → `brand-variants-v2`) in receival and receival-edit mutations so INCOMING column refreshes after receivals; added `brand-variants-v2` invalidation to PO approve/force-approve so INCOMING updates when a PO is approved; added `useReservedOrderLines` hook (queries `sale_order_lines` joined to `sale_orders` for confirmed/partial_delivery statuses); built `ReservedOrdersDialog` showing SO number, customer, qty, expected delivery, status; reserved badge is now a clickable button opening the dialog

- [2026-05-01] **Fix FIFO depletion order (receival_number tiebreaker)** — `supabase/migrations/20260501000003_fix_fifo_order_by_receival.sql`, `src/hooks/useInventory.ts` — `deduct_fifo_layers` ORDER BY updated from `date, created_at, id` to `date, receival_number, created_at, id`; `useFifoLayers` display query updated to match; fixes same-date receivals being drained out of arrival sequence (e.g. RCV-00011 emptying before RCV-00010)

- [2026-05-01] **Delivery releases reserved_qty** — `supabase/migrations/20260501000002_delivery_release_reserved.sql` — `complete_delivery_inventory` now decrements `reserved_qty` per item on delivery completion, clamped at 0

- [2026-05-01] **Inventory INCOMING trigger + RESERVED column** — `supabase/migrations/20260501000001_incoming_qty_trigger.sql`, `src/components/services/inventory/BrandVariantRow.tsx`, `src/components/services/inventory/ItemRow.tsx` — `fn_refresh_incoming_qty` + triggers on `po_line_items` and `purchase_orders`; RESERVED column (orange badge) added to inventory variant table; colSpan updated to 8

- [2026-04-30] **PO Return Debit Note inline display + backfill** — `src/hooks/usePurchaseReturns.ts`, `src/components/purchase/PoDetailDialog.tsx` — `usePurchaseReturnsByPO` now joins `credit_notes(*)`; `POReturn` type gains `credit_note_id` and `debit_note`; return row in PO dialog shows DN number + PDF download when note exists; "Create Debit Note" button shown for returns at `supplier_confirmed`/`closed` with no note (backfills existing returns); `useCreateDebitNoteForReturn` exported mutation

- [2026-04-30] **Credit & Debit Notes Task 9: Central page with type switcher** — `src/app/(dashboard)/sales/credit-notes/page.tsx` — Replaced single-type credit-notes page with unified Credit & Debit Notes hub; `noteType` state drives `useCreditNotes`/`useDebitNotes` hook selection; separate `creditColumns`/`debitColumns` column definitions; Select dropdown switcher (`w-48`) below PageHeader; "Create Credit Note" button hidden when Debit Notes tab is active; PDF download via `CreditDebitNoteDownloadButton`; `ConfirmDialog` for apply flow unchanged; zero TypeScript errors

- [2026-04-30] **PO Returns: Full feature** — `supabase/migrations/20260430170000_po_returns.sql`, `src/hooks/usePurchaseReturns.ts`, `src/hooks/useSaleReturns.ts`, `src/components/purchase/PoDetailDialog.tsx`, `src/app/(dashboard)/sales/returns/page.tsx` — PO returns with `pending→dispatched→supplier_confirmed→closed` flow; inventory deducted on dispatch via `rpc_process_po_return_dispatch` (SECURITY DEFINER); cancel reverses inventory via `rpc_cancel_po_return_dispatch`; Returns page has Sale/PO toggle with URL persistence (`?type=sale|po`); cancel available for both return types at correct stages
- [2026-04-30] **Sale Return Inventory Integration** — `supabase/migrations/20260430140000_sale_return_restock.sql`, `src/hooks/useSaleReturns.ts`, `src/components/services/inventory/BrandVariantRow.tsx` — Added `damaged_qty` column to `inventory_brand_variants`; added `restocked_at` to `returns`; extended movement_type CHECK constraint with `sale_return` and `sale_return_damaged`; created `rpc_process_return_restock` RPC (idempotent via `restocked_at` stamp): good items restore `stock_level` + insert movement, damaged items increment `damaged_qty` + insert movement; `useUpdateReturnStatus` now calls RPC on `restocked` transition; `BrandVariantRow` shows red "X dmg" badge when `damaged_qty > 0`

- [2026-04-30] **Invoice Payments Task 11: Wire Payments Page — Link Invoice button** — `src/app/(dashboard)/purchase/payments/page.tsx`, `src/components/ui/tooltip.tsx` (new) — Added `SelectInvoiceDialog` import + three `linkInvoice*` state vars; updated `invoiceColumns` actions cell to show Paperclip button for unlinked CPAY rows that have a `customer_id`; mounted `SelectInvoiceDialog` conditionally; installed missing shadcn Tooltip component

- [2026-04-30] **Invoice Payments Task 10: Wire Invoice Detail Page + Dialog + SoDetailDialog** — `src/app/(dashboard)/sales/invoices/[id]/page.tsx`, `src/components/sales/InvoiceDetail.tsx`, `src/components/sales/SoDetailDialog.tsx` — Invoice detail page: Record Payment, Attach Payment (tooltip-guarded), Payment Plan buttons + `AttachInvoiceDialog`; InvoiceDetail dialog: same three buttons + Payment History with detach (AlertDialog); SoDetailDialog: import updated to `finance/PaymentPlanDialog` + `AR_LABELS` added

- [2026-04-30] **Invoice Payments Task 9: SelectInvoiceDialog component** — `src/components/sales/SelectInvoiceDialog.tsx` — Dialog for linking an unlinked incoming payment to an open AR invoice; lists unpaid/partially-paid invoices via `useUnlinkedArInvoices`; calls `useAttachPaymentToInvoice`; payment-status badge with color map; resets selection on close

- [2026-04-30] **Invoice Payments Task 8: AttachInvoiceDialog component** — `src/components/sales/AttachInvoiceDialog.tsx` — Dialog for attaching an unlinked payment to the current invoice; lists unlinked incoming payments via `useUnlinkedIncomingPayments`; calls `useAttachPaymentToInvoice`; guards against already-paid invoices; resets selection on close

- [2026-04-30] **Invoice Payments Task 7: Move PaymentPlanDialog to finance/ + add labels prop** — `src/components/finance/PaymentPlanDialog.tsx` (new), `src/components/purchase/PaymentPlanDialog.tsx` (re-export shim) — Canonical dialog now lives in finance/; added `PaymentPlanLabels` interface + `AP_LABELS`/`AR_LABELS` constants; `labels` prop defaults to AP_LABELS for backward compat; purchase file is a thin re-export

- [2026-04-30] **Invoice Payments & Payment Plans Task 1: Database Migration** — `supabase/migrations/20260430120000_invoice_payment_rpcs.sql` — Added `payments.customer_id` nullable FK column; backfilled existing incoming payments via linked invoice and source sale_order; created `recalculate_ar_invoice_payment_status` shared function; created `trg_recalc_ar_payment_status` trigger (AFTER INSERT/UPDATE/DELETE on payments); created `attach_payment_to_invoice` RPC with FOR UPDATE row lock and ownership guard; created `detach_payment_from_invoice` RPC with same guards

- [2026-04-30] **Invoice Detail Page Task 5: Rebuild with Bill-style sidebar layout** — `src/app/(dashboard)/sales/invoices/[id]/page.tsx` — Replaced flat toolbar-only layout with sidebar + content split; `InvoiceDetailSidebar` always visible on lg+, overlay on mobile; `usePathname`/`useSearchParams` for URL-persisted toggle state; `handleToggle` syncs URL params; toolbar moved inside main content area; `Printer` removed from lucide imports (sidebar handles print); `showNotes`/`showQR`/`showPaymentPlan` props now passed to `InvoiceDetailDocument`

- [2026-04-29] **Sale Module UX: SO row click + Invoice document page** — `src/app/(dashboard)/sales/orders/page.tsx`, `src/app/(dashboard)/sales/invoices/page.tsx`, `src/app/(dashboard)/sales/invoices/[id]/page.tsx` (new), `src/components/sales/InvoiceDetailDocument.tsx` (new) — SO list: eye button removed, entire row clickable via onRowClick; Invoice list: row navigates to full document page; new /sales/invoices/[id] route shows printable invoice with company header, "فاتورة مبيعات", customer, line items, totals, payment history, balance, QR code, watermark, plus Print/Send/Pay toolbar

- [2026-04-29] **Fix PO payment direction bug** — `src/hooks/usePurchaseOrders.ts`, `supabase/migrations/20260429150000_fix_po_payment_direction.sql` — `useCreatePOPayment` was missing `direction: 'outgoing'` and `payment_id`, causing PO payments to default to `incoming` and appear on Invoice Payments page; migration backfills all affected rows and assigns SPAY- IDs

- [2026-04-29] **Notification bell fix** — `src/hooks/useNotifications.ts` — Added `.is('read_at', null)` filter to `useRecentNotifications` so approved/read notifications are immediately removed from the bell dropdown

- [2026-04-29] **Bill Rework Task 7: Update bill VM and AttachBillDialog for multi-allocation** — `src/hooks/useSupplierBills.ts`, `src/hooks/useAttachPaymentToBill.ts`, `src/components/purchase/AttachBillDialog.tsx` — `useBillViewModel` now queries `payment_bill_allocations` joined with `payments`; hook calls `allocate_payment_to_bill` with required `amount`; link-payment dialog shows payment cards with remaining balance and partial allocation amount input; attach-bill mode preserved

- [2026-04-29] **Bill Rework Task 6: Multi-bill payment allocations migration** — `supabase/migrations/20260429140000_payment_bill_allocations.sql` — Created `payment_bill_allocations` table; backfilled existing 1:1 links; new `allocate_payment_to_bill` RPC with FOR UPDATE row lock and manually_paid guard; shim preserves `attach_payment_to_bill` for existing callers

- [2026-04-29] **Bill Rework Task 5: Replace create-bill page with CreateBillFromPODialog** — `src/components/purchase/CreateBillFromPODialog.tsx` (new), `src/app/(dashboard)/purchase/orders/page.tsx`, `src/components/purchase/PoDetailDialog.tsx`, deleted `src/app/(dashboard)/purchase/create-bill/page.tsx` — Inline dialog replaces full-page route; fetches PO conditionally; shows discount row; on success redirects to new bill detail page

- [2026-04-29] **Bill Rework Task 4: Manual Mark as Paid button** — `supabase/migrations/20260429130000_invoices_manually_paid.sql`, `src/hooks/useSupplierBills.ts`, `src/components/purchase/BillDetailDocument.tsx` — Added `manually_paid` column to invoices (prevents allocation RPC from overwriting manual status); `useMarkBillPaymentStatus` hook sets both `payment_status` and `manually_paid`; button toggles between Mark as Paid (default) / Mark as Unpaid (outline) with pending state

- [2026-04-29] **Bill Rework Task 3: Two-level Company + Division sidebar selectors** — `src/components/purchase/BillDetailSidebar.tsx`, `src/components/purchase/BillDetailDocument.tsx`, `src/app/(dashboard)/purchase/bills/[id]/page.tsx` — Added Company selector above Division in sidebar; Division disabled until company chosen; print header shows company name_en on line 1, division name on line 2, address below; footer updated to show company · division

- [2026-04-29] **Bill Rework Task 2: Remove approval-status-related code from bills UI** — `src/components/purchase/BillDetailDocument.tsx` — Deleted DOC_STATUS_COLORS constant; removed doc_status === 'draft' check from getWatermark function (keeping only paid/overdue watermarks); removed doc_status badge from meta section (kept only payment_status badge)

- [2026-04-29] **Bill Rework Task 1: Fix Grand Total duplicate currency and print date** — `src/components/purchase/BillDetailDocument.tsx` — Removed trailing `{currency}` from Grand Total, deleted redundant "Total (QAR):" row, changed print timestamps from `toLocaleString`/`toISOString` to `toLocaleDateString('en-GB')`

- [2026-04-29] **PO Status Auto-Progression (All Tasks)** — `supabase/migrations/20260429000002_po_auto_progress_status.sql`, `src/hooks/usePurchaseOrders.ts`, `src/app/(dashboard)/purchase/orders/page.tsx`, `src/components/purchase/PoDetailDialog.tsx`, `src/components/purchase/PoStatusBadge.tsx` — PO auto-advances from approved→partially_received→received→completed; new `refresh_po_status` DB function; backfill ran on all existing POs; teal badge for Completed status

- [2026-04-29] **Bill Discount Inheritance & PO Module Fixes (All Tasks)** — `supabase/migrations/20260429000001_bill_discount_columns.sql`, `src/types/invoice.ts`, `src/hooks/useSupplierBills.ts`, `src/components/purchase/BillFormDialog.tsx`, `src/app/(dashboard)/purchase/create-bill/page.tsx`, `src/components/purchase/BillDetailDocument.tsx` — Bills auto-inherit PO discount; bill IDs renamed to PO-XXXXX-Bn pattern; discount line shown in totals; Supplier Ref shown in meta row; ApInvoice type now exposes discount_amount, discount_label, source_label

- [2026-04-28] **Purchase Payments Enhancement (All Tasks)** — `src/hooks/useSupplierPayments.ts`, `src/hooks/useSupplierBills.ts`, `src/hooks/useAttachPaymentToBill.ts` (new), `src/components/purchase/AttachBillDialog.tsx` (new), `src/components/purchase/PoDetailDialog.tsx`, `src/components/purchase/BillDetailDocument.tsx`, `src/app/(dashboard)/purchase/payments/page.tsx`, `supabase/migrations/20260428200006_assign_missing_spay_ids.sql`, `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql` — Fixed supplier/PO resolution for PO-direct payments; PO # column + eye icon on Purchase Payments; one-time bill attachment via atomic RPC from both Payments page and Bill detail; backfilled null SPAY- IDs

- [2026-04-28] **Unified Payments Page (All Tasks)** — `src/app/(dashboard)/purchase/payments/page.tsx` (rewritten), `src/app/(dashboard)/sales/payments/page.tsx` (deleted), `src/components/layout/nav-config.ts` — Merged Purchase Payments and Customer Payments into single page with Purchase Payments / Invoice Payments dropdown selector; old sales payments page removed; nav consolidated to single Payments entry at /purchase/payments

- [2026-04-28] **Inventory Module Task 1: Add Avg Cost field to BrandVariantEditDialog** — `src/components/services/inventory/BrandVariantEditDialog.tsx` — New avgCost state; lock condition on stock_level > 0; editable input with helper text when unlocked, read-only with "Auto-calculated from PO receivals" note when locked; spread average_cost into payload only if not locked

- [2026-04-28] **Delivery Auto-Confirm + Cancel-Delivered: All Tasks** — `supabase/migrations/20260428000008_delivery_sequence_and_rpcs.sql`, `src/hooks/useSaleOrders.ts`, `src/hooks/useSaleDeliveries.ts`, `src/components/sales/SoDetailDialog.tsx`, `src/app/(dashboard)/sales/deliveries/page.tsx` — Deliveries auto-confirm on creation via atomic RPC; cancel reverses inventory for delivered deliveries; delivery numbers generated by DB sequence
- [2026-04-28] **[Multi-Company Division Isolation] Task 10: Expandability verification + TypeScript build** — zero TypeScript errors; `is_division_visible()`, `useUserDivisionScope()`, `<DivisionFilter />`, division picker pattern all generic; `fix: SO create form useEffect auto-seed` patched
- [2026-04-28] **[Multi-Company Division Isolation] Task 9: User Management — Division Assignment UI** — `src/components/master-data/EditUserDialog.tsx` — Division section with Badge+X removal, company-grouped Select picker, "Changes take effect on user's next login" toast; uses `useAllDivisions` + `useUserDivisions` + `useAssignDivision` + `useRemoveDivision`
- [2026-04-28] **[Multi-Company Division Isolation] Task 8: SO Create Form — Division Picker** — `src/hooks/useSaleOrders.ts`, `src/app/(dashboard)/sales/create-so/page.tsx` — `division_id` in CreateSOPayload + RPC call; division picker for multi-division users; useEffect auto-seed; validation guard
- [2026-04-28] **[Multi-Company Division Isolation] Task 7: PO Create Form — Division Picker** — `src/hooks/usePurchaseOrders.ts`, `src/app/(dashboard)/purchase/create-po/page.tsx`, `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` — `division_id` in CreatePOPayload + insert; division picker for multi-division users; useEffect auto-seed; validation guard
- [2026-04-28] **[Multi-Company Division Isolation] Tasks 5 & 6: Wire DivisionFilter into PO & SO list pages** — `src/hooks/usePurchaseOrders.ts`, `src/hooks/useSaleOrders.ts`, `src/app/(dashboard)/purchase/orders/page.tsx`, `src/app/(dashboard)/sales/orders/page.tsx` — divisionId/divisionIds filter fields; DivisionFilter component wired; clearFilters resets division state; useRef fix for SO debounce
- [2026-04-28] **[Multi-Company Division Isolation] Tasks 3 & 4: useUserDivisionScope + DivisionFilter** — `src/hooks/useUserDivisionScope.ts`, `src/components/shared/DivisionFilter.tsx`, `src/hooks/useDivisions.ts` — JWT claims hook (owner/accountant = super-viewer); DivisionFilter dropdowns (returns null for non-super-viewers); staleTime fix on useAllDivisions
- [2026-04-28] **[Multi-Company Division Isolation] Task 2: Update create_sale_order RPC** — `supabase/migrations/20260428200004_so_rpc_add_division_id.sql` — Added `p_division_id UUID DEFAULT NULL` param + `division_id` column to INSERT; added `SET search_path = public`
- [2026-04-28] **[Multi-Company Division Isolation] Task 1: DB Migration — Columns, JWT Hook, Helper, RLS** — `supabase/migrations/20260428200001_division_isolation.sql`, `20260428200002_fix_backfill_division_id.sql`, `20260428200003_division_isolation_hardening.sql` — Added division_id to PO/SO tables, backfilled from user_divisions, JWT auth hook reads approval_role_assignments for user_type claim, is_division_visible RLS helper, division_scope policies on both tables; also extended approval_role enum with 'employee'
- [2026-04-27] **[SO Invoice Cash/Credit Plan] ALL TASKS COMPLETE** — `supabase/migrations/20260428000005–00007`, `src/types/invoice.ts`, `src/hooks/useCustomerInvoices.ts`, `src/hooks/useSaleOrders.ts`, `src/components/sales/SoDetailDialog.tsx`, `src/components/sales/SoTermsSection.tsx`, `src/app/(dashboard)/sales/create-so/page.tsx` — Cash/credit customer type enforcement; atomic generate_invoice_from_so RPC; Invoice tab in SoDetailDialog with generate/send/pay/plan actions; cash UX on create-SO page
- [2026-04-27] **[SO Module Polish]** — `src/hooks/useSaleOrders.ts`, `src/hooks/useSaleDeliveries.ts`, `src/components/sales/SoDetailDialog.tsx`, `src/app/(dashboard)/sales/orders/page.tsx` — activity log on delivery create; useCancelDelivery mutation with activity log; SoDetailDialog payment status badge (Paid/Partially Paid/Unpaid) + cancel delivery button on pending deliveries; SO # column now clickable to open detail dialog
- [2026-04-26] **[Credit Groups Dialog] Tasks 1–4** — `supabase/migrations/20260428000001_credit_groups_payment_methods.sql`, `src/hooks/useCreditGroups.ts`, `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx`, `src/app/(dashboard)/master-data/credit-groups/page.tsx` — payment_methods + max_days migration; PAYMENT_METHODS constant; modal dialog with toggle grid; table shows Methods + Max Days columns
- [2026-04-26] **[SO Creation Rebuild] Task 9: Add Download PDF button to SoDetailDialog** — `src/components/sales/SoDetailDialog.tsx`, `src/hooks/useSaleOrders.ts` — dynamic PDFDownloadLink + QuotationDocument imports (SSR-safe); useSaleOrder select now fetches phone; Download PDF button shown for quotation/pending_approval status
- [2026-04-26] **[SO Creation Rebuild] Task 8: PDF Quotation component** — `src/components/sales/SoQuotationPdf.tsx` — QuotationDocument with Cairo font (Arabic/Latin), grouped line items by type, subtotal/discount/grand total, terms + validity, fixed footer
- [2026-04-26] **[SO Creation Rebuild] Task 7: Rewrite create-SO page** — `src/app/(dashboard)/sales/create-so/page.tsx` — rebuilt with Popover/Command customer selector, credit group display + no-credit-group blocking, intent-based quotation/confirm flow calling atomic RPC, isPriceLoading gate, validity_days from terms
- [2026-04-26] **[Service Links Redesign] Task 4: Rebuild ServiceLinksView** — `src/components/services/inventory/ServiceLinksView.tsx` — Full service-centric rebuild: counters (total/linked/unlinked), URL-synced filters (slSearch/slType/slStatus), collapsible a11y rows (role=button, aria-expanded, keyboard Enter/Space), inline link-type + warranty + qty editing with optimistic updates, AlertDialog delete confirmation, NewLinkDialog with 2-step service→variant flow; fixed Ark UI `onValueChange: string | null` signatures
- [2026-04-26] **[Service Links Redesign] Tasks 1–3: DB migration + helpers + hooks** — `supabase/migrations/20260426000002_service_inventory_link_type.sql`, `src/components/services/inventory/serviceInventoryHelpers.ts`, `src/hooks/useInventory.ts` — added quantity/link_type/warranty_months/group_label columns; helpers with LINK_TYPE_CONFIG, WARRANTY_OPTIONS, collectLeaves, buildBreadcrumbMap; new hooks useServicesForLinks, useAllServiceLinks, useAddServiceInventoryLink, useDeleteServiceInventoryLink, useUpdateServiceInventoryLink with optimistic updates
- [2026-04-26] **[Cascade Inline Creation Plan] Task 7: Editable Vendor SKU** — `src/components/purchase/PoLineItemsEditor.tsx` — replaced read-only SKU span with editable Input; pre-fill guard preserves user-typed SKU on cascade select
- [2026-04-26] **[Cascade Inline Creation Plan] Task 6: Stock pill display** — `src/components/purchase/CascadeInventorySelector.tsx` — shows "N in stock" (green) or "Out of stock" (muted) on both fresh-select and ancestry (DB-reload) paths; null-safe math guards against NaN on new variants
- [2026-04-26] **[Cascade Inline Creation Plan] Task 5: Wire inline forms** — `src/components/purchase/CascadeInventorySelector.tsx` — added isCatCreating/isItemCreating/isVarCreating states; "Add new…" buttons outside Command filter; auto-advance opens next popover on creation; loading skeletons in item/variant CommandGroups prevent empty-flash after inline creation
- [2026-04-26] **[Cascade Inline Creation Plan] Task 4: CascadeInlineForms** — `src/components/purchase/CascadeInlineForms.tsx` — three inline form components (Category, Item, Brand/Variant) with keyboard nav (Enter/Escape); brand autocomplete uses global useAllBrandNames hook across all variants
- [2026-04-26] **[Cascade Inline Creation Plan] Task 3: Full-object state refactor** — `src/components/purchase/CascadeInventorySelector.tsx` — stores InventoryCategory/InventoryItem objects directly to eliminate .find() race condition on TanStack Query refetch after inline creation
- [2026-04-26] **[Cascade Inline Creation Plan] Task 2: useBrandVariantAncestry stock fields** — `src/hooks/useBrandVariantAncestry.ts` — added stock_level + reserved_qty to type and query for ancestry (DB-reload) stock display path
- [2026-04-26] **[Cascade Inline Creation Plan] Task 1: Query invalidations** — `src/hooks/useInventory.ts` — added inventory-items-by-category invalidation to useCreateInventoryItem; brand-variants-v2 + all-brand-names invalidation to useCreateBrandVariant; broad inventory-categories invalidation to useCreateInventoryCategory; new useAllBrandNames hook

**[Cascade Inventory Selector Plan] — ALL TASKS COMPLETE ✅**

- [2026-04-26] **[Cascade Inventory Selector Plan] Task 6: ATP guard migration** — `supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql`, `20260426000004_fix_apply_receival_edit_atp_guard_v2.sql` — ATP guard on qty decrease in apply_receival_edit; v2 adds FOR UPDATE lock + COALESCE(stock_level,0) + variant ID in error message
- [2026-04-26] **[Cascade Inventory Selector Plan] Task 5: Disable submit while price is loading** — `src/app/(dashboard)/purchase/create-po/page.tsx` — added isPriceLoading state, wired onPriceLoading to PoLineItemsEditor, both submit buttons disabled + label feedback during price fetch
- [2026-04-26] **[Cascade Inventory Selector Plan] Task 4: Wire CascadeInventorySelector into PoLineItemsEditor + surface price-loading state** — `src/components/purchase/PoLineItemsEditor.tsx` — replaced InventoryItemLookup with CascadeInventorySelector; added onPriceLoading callback chain using useRef-backed Set to aggregate per-row loading state without extra re-renders

**LC Page Enhancements Plan (2026-04-25-lc-page-enhancements.md)** — COMPLETE ✅
- [x] Task 0: Setup — merge develop
- [x] Task 1: DB Migration — private `lc-bills` storage bucket
- [x] Task 2: DB Migration — `validate_lc_allocation` pre-flight RPC
- [x] Task 3: Install `decimal.js`
- [x] Task 4: Shared hooks — `useReceivalsForLcSelector` + `useReceivalItemsWithFifo`
- [x] Task 5: `useLandedCosts` — add `bill_path`, `useValidateLcAllocation`, `useBillSignedUrls`
- [x] Task 6: `CreateLcDialog` — bill upload, expandable items, decimal total, search
- [x] Task 7: `LcDetailDialog` — bill links, all_items_sold badge, receivals breakdown, POs, apply pre-flight
- [x] Task 8: Build verification + PROGRESS.md

---

### Shipment Tracking Integration (Plan: 2026-04-24-shipment-tracking.md) — IN PROGRESS

- [2026-04-24] **Task 3: Tracking Utilities** — `src/lib/tracking/normalize.ts`, `src/lib/tracking/normalize.test.ts` — TDD: `normalizeTimestamp()` converts UTC/offset strings to ISO-8601, handles unparseable input gracefully; `computeEventHash()` produces sha256 digest; 8 tests pass
- [2026-04-24] **Task 3: Status Map Utilities** — `src/lib/tracking/statusMap.ts`, `src/lib/tracking/statusMap.test.ts` — TDD: `map17trackTag()` maps 17track status tags (InTransit→in_transit, Delivered→delivered, Exception/Undelivered→delayed, Customs→customs, null for non-status tags); `STATUS_WEIGHTS` defines precedence (delivered>delayed>customs>in_transit>booked); 13 tests pass
- [2026-04-24] **Task 4: 17track API Client** — `src/lib/tracking/client17track.ts` — TypeScript interfaces (`Track17Event`, `Track17TrackInfo`, `Track17RegisterResult`, `Track17RegisterRejection`); functions: `registerTracking()`, `getTrackInfo()`, `stopTracking()`; error codes (ERR_QUOTA_EXCEEDED=4031, ERR_AMBIGUOUS_CARRIER=4013); `.env.local` updated with `SEVENTEEN_TRACK_API_KEY` and `SEVENTEEN_TRACK_WEBHOOK_SECRET` placeholders
- [2026-04-24] **Tasks 8–9: Page Frontend Wiring** — `src/app/(dashboard)/purchase/shipments/page.tsx` — (8.1) `currentShipment` derived reactively from `shipments` query so detail dialog updates live; (8.2) `onSuccess` in `CreateShipmentDialog` fire-and-forgets `POST /api/shipments/register-tracking` with `keepalive: true`; (8.3) archive `onSuccess` fire-and-forgets `POST /api/shipments/deregister-tracking`; (9.1) added `useMemo` + `useQueryClient` imports; (9.2) added `isSyncing`, `syncAmbiguous`, `selectedCarrierCode` state, `sortedEvents` memo (newest-first), `handleSyncNow` async function; (9.3) quota warning banner + sync controls (last-synced timestamp + Sync Now button) + carrier picker (shown on ambiguous result) added before Summary grid; (9.4) timeline replaced with `sortedEvents` using `normalizedTimestamp`-aware sort and `STATUS_LABELS` mapping; 74 tests pass

---

**Previous:** No active plan. All Phase 1 implementation plans are complete. Pending Phase 1 cleanup items below before Phase 2.

---

### Inventory Module — Complete (Plan: 2026-04-25-inventory-complete.md) — COMPLETE ✅

- [2026-04-25] **DB foundation** — `20260425000001_inventory_foundation.sql`: `inventory_stock_movements` (SELECT-only RLS), `cogs_entries` (SELECT-only RLS + composite index `idx_cogs_variant_date`), `service_inventory` (full CRUD RLS), `reserved_qty` on `inventory_brand_variants`, `warehouse_id` on `fifo_cost_layers`, `brand_variant_id` on `receival_items`
- [2026-04-25] **Core RPCs** — `recalc_average_cost`, `deduct_fifo_layers` (deadlock-safe `ORDER BY date, created_at, id ASC FOR UPDATE`, `p_is_transfer` flag, stock guard RAISE EXCEPTION), `update_reserved_qty` (GREATEST guard), `batch_increment_received_qty`, `batch_update_reserved_qty`
- [2026-04-25] **Atomic RPCs** — `approve_receival_inventory` (FOR UPDATE + status guard, FIFO layer + stock_level + movements), `complete_delivery_inventory` (FIFO deduction + COGS + movements; surfaces "Insufficient stock"), `approve_stock_adjustment_inventory` (increase: FIFO insert + recalc; decrease: weighted_unit_cost from deduct_fifo_layers), `approve_warehouse_transfer_inventory` (p_is_transfer=TRUE, global stock_level unchanged, two movements)
- [2026-04-25] **Hook wiring** — `useReceivals.ts`: atomic approve/reject via RPC, batch received_qty update; `useSaleDeliveries.ts`: `complete_delivery_inventory` RPC, surfaces stock errors; `useSaleOrders.ts`: `batch_update_reserved_qty` on create (+delta) and cancel (-delta); `useWarehouseOperations.ts`: approve RPCs for adjustments and transfers with fifo-layers cache invalidation
- [2026-04-25] **useInventoryLedger.ts** — new file: `useCogsEntries`, `useStockMovementsByVariant`, `useServiceInventoryLinks` query hooks (ready for LC allocation page)

---

### Bill Detail Page (Plan: 2026-04-24-bill-detail-page.md) — COMPLETE ✅

- [2026-04-24] **Bill Detail Page Task 1: Install qrcode.react** — `package.json`, `package-lock.json`
- [2026-04-24] **Bill Detail Page Task 2: Database Migration — divisions.address** — `supabase/migrations/20260424163555_divisions_address.sql`
- [2026-04-24] **Bill Detail Page Task 3: Add useBillViewModel Hook** — `src/hooks/useSupplierBills.ts` — added `BillPayment`, `BillReceival`, `BillViewModel` types and `useBillViewModel` hook with `Promise.all` parallel fetching
- [2026-04-24] **Bill Detail Page Task 4: Create BillDetailSection** — `src/components/purchase/BillDetailSection.tsx` — reusable section wrapper with `break-inside-avoid`
- [2026-04-24] **Bill Detail Page Task 5: Create BillDetailSidebar** — `src/components/purchase/BillDetailSidebar.tsx` — company selector, always-on section list, 4 toggle switches, print button
- [2026-04-24] **Bill Detail Page Task 6: Create BillDetailDocument** — `src/components/purchase/BillDetailDocument.tsx` — full A4 document with header, meta row, supplier block, line items, totals, payment history, receival info, payment plan, notes, QR code, footer; status watermark; SSR-safe QR origin
- [2026-04-24] **Bill Detail Page Task 7: Create Bill Detail Page** — `src/app/(dashboard)/purchase/bills/[id]/page.tsx` — two-column layout, URL-persisted toggle state, responsive mobile sidebar with overlay
- [2026-04-24] **Bill Detail Page Task 8: Print Styles** — `src/app/globals.css` — `print-color-adjust: exact`, hide `.bill-sidebar`, `page-break-inside: avoid` on `tr`
- [2026-04-24] **Bill Detail Page Task 9: Clickable Bills List** — `src/components/shared/DataTable.tsx` (add `onRowClick` prop), `src/app/(dashboard)/purchase/bills/page.tsx` (navigate to `/purchase/bills/[id]`)
- [2026-04-24] **Bill Detail Page Task 10: Fix PoDetailDialog View Bill URL** — `src/components/purchase/PoDetailDialog.tsx` — "View Bill" now navigates to `/purchase/bills/${existingBills[0].id}`

---

### Phase 1 Cleanup — Must Clear Before Phase 2

- [ ] **Manual smoke test** — in-app user management (all 17 tasks code-complete; browser smoke test pending before Phase 2)
- [ ] **Verify** self-provision banner flow (Create My Profile) on a fresh auth user with no profile row ← **LAST TEST — complete only when manually instructed**
- [ ] **LC: all_items_sold — QuickBooks guidance** (spec §12) — When `all_items_sold = TRUE`, surface a banner/note in the LC detail dialog instructing the user to record the LC total as a period expense in QuickBooks ("Landed Cost Expense | [month] | [amount]"). No integration, UI message only. ← **DEFERRED: last task of Phase 1**

### Bug Fixes & Features Applied [2026-04-24] (continued)

- [2026-04-24] **Create Bill full page + FK fix** — `supabase/migrations/20260424000003_invoices_customer_id_nullable.sql` (DROP NOT NULL on customer_id), `src/hooks/useSupplierBills.ts` (remove customer_id, add source_label), `src/app/(dashboard)/purchase/create-bill/page.tsx` (new full-page form), `src/components/purchase/PoDetailDialog.tsx` + `src/app/(dashboard)/purchase/orders/page.tsx` (navigate to full page instead of popup)

### Bug Fixes & Features Applied [2026-04-24]

- [2026-04-24] **UUID display in dropdowns** — `src/components/ui/select.tsx` rewritten with label registry mechanism: `SelectItemsRegistry` context (stable `Map<string,string>`), `Select` root provides `itemToStringLabel` callback, `SelectItem` populates registry via `useLayoutEffect`, `SelectValue` subscribes to `selectedIndex` store to re-render when items mount. Fixes UUIDs showing in all dropdowns app-wide.
- [2026-04-24] **Edit-mode select labels** — Added `SelectValue` render functions to `ReminderEditDialog` (category_id), `DivisionFormDialog` (company_id create mode), `ServiceEditSections` (DivisionSection) so the correct label shows on first render without requiring the user to open the dropdown.
- [2026-04-24] **Self-approval guard** — Removed self-approval restriction from `src/lib/approvalChainResolution.ts` and `src/hooks/usePOApprovals.ts` (approval chain was blocking PO creator from approving their own PO).
- [2026-04-24] **Approval settings fixes** — Fixed `created_by` UUID matching in self-approval guard; fixed `useAllProfiles` hook + `profileDisplayName` fallback; fixed Select UUID display; fixed upsert for approval role assignments; removed `isAdmin` gate from approval settings page.
- [2026-04-24] **Parallel approvals** — All `po_approvals` steps set `is_active:true` from creation. All approvers notified simultaneously. `approvals/page.tsx` picks step matching current user's role. `advance_po_approval_tier` already handles the "all approved → PO approved" check. — `src/lib/approvalChainResolution.ts`, `src/hooks/usePOApprovals.ts`, `src/hooks/usePurchaseOrders.ts`, `src/app/(dashboard)/purchase/approvals/page.tsx`
- [2026-04-24] **Receivals 400 fix + received_by_name + live Received count** — Fixed PostgREST join (supplier_name is a TEXT col on purchase_orders, not FK). `useCreateReceival` now resolves current user's profile full_name for `received_by_name` and updates `po_line_items.received_qty` for non-free items. PO caches invalidated on receival create/approve. — `src/hooks/useReceivals.ts`, `src/components/purchase/PoDetailDialog.tsx`
- [2026-04-24] **Supabase Realtime sync** — New `RealtimeSync` component subscribes to postgres_changes on purchase_orders, po_approvals, receivals, notifications. Mounted in dashboard layout for live cache invalidation across all tabs. Migration enables Realtime publication. — `src/components/shared/RealtimeSync.tsx`, `src/app/(dashboard)/layout.tsx`, `supabase/migrations/20260424000002_enable_realtime.sql`
- [2026-04-24] **PoReceiveTab redesign** — Table now shows Ordered/Free/Received/Remaining columns. Per-row 🎁 button sets free qty for same product. Top "+Free" button opens Category→Item→Brand picker for non-PO free goods. Free items use `is_free:true, unit_cost:0` and skip `received_qty` update. — `src/components/purchase/PoReceiveTab.tsx`
- [2026-04-24] **Dropdown UUID Guard rule** — Added mandatory checklist to `AGENTS.md` requiring all dropdowns to display human-readable labels, never raw UUIDs.
- [2026-04-24] **Receival rejection rollback** — `useApproveReceival` now decrements `po_line_items.received_qty` for each non-free item when a receival is rejected, so the Receive tab correctly reflects remaining quantities. — `src/hooks/useReceivals.ts`
- [2026-04-24] **useInventoryCategories 400 fix** — Removed `.eq('status', 'active')` filter; `inventory_categories` has no `status` column. Categories now load correctly and the "+ Free" dialog in PoReceiveTab works. — `src/hooks/useInventory.ts`
- [2026-04-24] **PO Activity Log** — New `poActivityLogger.ts` utility writes to `activity_log` for every PO lifecycle event: PO Created, Draft Saved, Submitted for Approval, PO Amended (version), PO Cancelled, Approval step approved/force-approved/rejected, PO Fully Approved, Receival Recorded/Approved/Rejected, Payment Recorded. Activity tab in PoDetailDialog shows color-coded timeline dots and severity badges. — `src/lib/poActivityLogger.ts`, `src/hooks/usePOApprovals.ts`, `src/hooks/usePurchaseOrders.ts`, `src/hooks/useReceivals.ts`, `src/components/purchase/PoDetailDialog.tsx`
- [2026-04-24] **Submit for Approval fix** — `PoDetailDialog` "Submit for Approval" button was calling `useSubmitPO` (status-change only) instead of `useSubmitPOForApproval` (creates approval steps + notifications). New POs now correctly generate `po_approvals` rows and notify all approvers. — `src/components/purchase/PoDetailDialog.tsx`
- [2026-04-24] **Multi-select status filter + Cancel PO** — Status filter on PO list is now a multi-select DropdownMenu with color-coded checkboxes; filtering moved client-side. "Delete PO" row action replaced with "Cancel PO" (sets `status=cancelled`, keeps record visible in list; hidden for already-cancelled POs). — `src/app/(dashboard)/purchase/orders/page.tsx`

---

## ✅ Completed

- [2026-04-26] **Cascade Inventory Selector Plan Task 4: Wire CascadeInventorySelector into PoLineItemsEditor** — `src/components/purchase/PoLineItemsEditor.tsx` — Replaced InventoryItemLookup with CascadeInventorySelector; added onPriceLoading prop to interface + signature; added priceLoadingKeys Set state + handleRowPriceLoading aggregator; tsc --noEmit clean
- [2026-04-26] **Cascade Inventory Selector Plan Task 2: Create useBrandVariantAncestry hook** — `src/hooks/useBrandVariantAncestry.ts` — TanStack Query reverse-lookup hook for brand variant ancestry (item + category) by variantId; nested FK select joins inventory_items and inventory_categories tables; 10-minute staleTime cache; tsc --noEmit clean
- [2026-04-25] **LC Revert & Price Review Tasks 1–5** — `supabase/migrations/20260425000300_lc_revert_and_margin.sql`, `src/hooks/useLandedCosts.ts`, `src/hooks/useInventory.ts`, `src/components/services/inventory/BrandVariantEditDialog.tsx`, `src/app/(dashboard)/purchase/landed-costs/page.tsx` — revert_snapshot on landed_costs, margin_percent on brand_variants, revert_landed_cost RPC, Revert Apply button with REVERT-to-confirm guard, post-apply PriceReviewDialog with per-row margin/fixed choice and batch selling price update
- [2026-04-25] **LC Page Enhancements Tasks 0–8** — `supabase/migrations/20260425000200_lc_bills_bucket.sql`, `supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql`, `src/hooks/useReceivals.ts`, `src/hooks/useLandedCosts.ts`, `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Private lc-bills bucket with role-based RLS, validate_lc_allocation pre-flight RPC, decimal.js totals, useRef-based bill upload with 5 MB guard + date-structured paths, expandable receival items (remaining FIFO qty) in Create dialog, all_items_sold badge + bill signed-URL links + attached receivals/PO breakdown + apply pre-flight table in Detail dialog
- [2026-04-25] **LC Page Enhancements Plan Task 2: DB Migration — `validate_lc_allocation` pre-flight RPC** — `supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql` — Read-only function checks LC applicability (via `attached_receival_ids`), returns JSONB array of per-variant summaries with qty_received, qty_remaining_in_layers, and warning if sold-out; guards: not-found, already-applied, voided states; GRANT EXECUTE to authenticated

### LC Multi-Currency + Receival Redesign (Plan: 2026-04-25-lc-multicurrency-receival-redesign.md) — COMPLETE ✅

- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 9: Receivals UI** — `src/app/(dashboard)/purchase/receivals/page.tsx` — Remove approve/reject, add Request Edit + AdminApproval + ReceivalEdit dialogs with expiry badge
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 8: LC CreateDialog** — `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Per-line exchange_rate input, live QAR preview, currency list expanded to 7
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 7: useLandedCosts** — `src/hooks/useLandedCosts.ts` — exchange_rate field on LandedCostLine; useCreateLandedCost calls create_landed_cost RPC
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 6: useReceivals** — `src/hooks/useReceivals.ts`, `src/components/purchase/PoReceiveTab.tsx`, `src/components/purchase/ReceivalFormDialog.tsx` — Atomic useCreateReceival via RPC; removed useApproveReceival; added useReceivalEditRequests, useRequestReceivalEdit, useApproveReceivalEdit, useSaveReceivalEdit
- [2026-04-25] **LC Multi-Currency + Receival Redesign Tasks 1–5: DB Migrations** — 5 migrations: receival_edit_requests table, receival_edit movement type, create_and_approve_receival RPC, apply_receival_edit RPC (10 guards), create_landed_cost RPC (NUMERIC precision)

---

### LC Inventory Apply (Plan: 2026-04-25-lc-inventory-apply.md) — COMPLETE ✅

- [2026-04-25] **LC Inventory Apply Task 4: Apply to Inventory UI** — `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Apply button + confirm dialog + Applied badge in LcDetailDialog; status column shows Applied/Voided/Active; null-guard + footer gap fix
- [2026-04-25] **LC Inventory Apply Task 3: useApplyLandedCost hook** — `src/hooks/useLandedCosts.ts` — applied_at type, qty_remaining_at_lc, lc_per_unit, allocated_lc_total, updated_unit_cost fields; useApplyLandedCost mutation calling allocate_landed_cost RPC
- [2026-04-25] **LC Inventory Apply Task 2: allocate_landed_cost RPC** — `supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql` — atomic FIFO layer landed_cost_per_unit update, recalc_average_cost, cost_adjustment stock movement insert, applied_at stamp
- [2026-04-25] **LC Inventory Apply Task 1: DB Migration** — `supabase/migrations/20260425000060_lc_columns.sql` — voided_at, voided_reason, applied_at columns on landed_costs; cost_adjustment added to inventory_stock_movements CHECK constraint

---

### Inventory Tab Rebuild (Plan: 2026-04-25-inventory-tab-complete.md) — COMPLETE ✅

- [2026-04-25] **Inventory Tab Rebuild Task 14: Integration Test** — `tsc --noEmit` 0 errors, 80/80 tests pass, build succeeds, `/master-data/services` route confirmed (368 kB), `/master-data/inventory` absent; also fixed pre-existing `select.tsx` generic type error that was blocking the build across all callers
- [2026-04-25] **Inventory Tab Rebuild Task 13: InventoryTab shell** — `src/components/services/InventoryTab.tsx` — Full rewrite: 5-tab shell (Products/Spare Parts/Consumables/Tools & Assets/Service Links) with `?subtab=` URL deep-link sync using `useRouter`/`useSearchParams`; blue active border; lazy content per tab
- [2026-04-25] **Inventory Tab Rebuild Task 12: ServiceLinksView** — `src/components/services/inventory/ServiceLinksView.tsx` — Brand-variant-level service linking: item → variant → ManageLinksDialog with Command/Combobox search, chips for linked services, diff-based upsert via `useUpdateServiceInventoryLinks`
- [2026-04-25] **Inventory Tab Rebuild Task 11: ToolsAssetsView + ToolAssetEditDialog** — `src/components/services/inventory/ToolAssetEditDialog.tsx`, `ToolsAssetsView.tsx` — Two-level list (tool items → units), ToolAssetItemEditDialog (create/edit name EN/AR), ToolAssetUnitEditDialog (serial, brand, condition, status, assigned-to staff lookup, expiry), expandable unit sub-table with status color badges
- [2026-04-25] **Inventory Tab Rebuild Task 10: ItemsListView** — `src/components/services/inventory/ItemsListView.tsx` — Tree shell for 3 product tabs: toolbar (search, show-archived switch, New Category button), plain `<table>` rendering CategoryRow per category; skeleton loader; empty state
- [2026-04-25] **Inventory Tab Rebuild Task 9: CategoryRow** — `src/components/services/inventory/CategoryRow.tsx` — Level-1 row: expand/collapse items lazy per row, Package icon, inline sort-up/sort-down, plus (add item), edit, archive with cascade; renders ItemRow list on expand
- [2026-04-25] **Inventory Tab Rebuild Task 8: ItemRow** — `src/components/services/inventory/ItemRow.tsx` — Level-2 row: expand/collapse brand variants, StockBadge (ATP = stock_level − reserved_qty), linked services badge, nested brand variants sub-table using shadcn Table + BrandVariantRow, Add Brand Variant inline button
- [2026-04-25] **Inventory Tab Rebuild Task 7: ItemEditDialog** — `src/components/services/inventory/ItemEditDialog.tsx` — Create/edit item with name EN/AR, SKU, unit (select from 9 options), item type (read-only), attribute chips with Enter-to-add; `useUpsertInventoryItemAttributes` on save
- [2026-04-25] **Inventory Tab Rebuild Task 5: BrandVariantRow** — `src/components/services/inventory/BrandVariantRow.tsx` — Level-3 row: ATP badge (green/amber/red) with native `title` tooltip showing On Hand + Reserved, FIFO expand/collapse, inline sort + edit + archive; renders FifoLayersTable on expand
- [2026-04-25] **Inventory Tab Rebuild Task 4: BrandVariantEditDialog** — `src/components/services/inventory/BrandVariantEditDialog.tsx` — Create/edit brand variant (brand text, SKU code, selling price, reorder point); uses `useCreateBrandVariant`/`useUpdateBrandVariant`
- [2026-04-25] **Inventory Tab Rebuild Task 6: CategoryEditDialog** — `src/components/services/inventory/CategoryEditDialog.tsx` — Create/edit category (name EN/AR, SKU prefix); uses `useCreateInventoryCategory`/`useUpdateInventoryCategory`
- [2026-04-25] **Inventory Tab Rebuild Task 3: FifoLayersTable** — `src/components/services/inventory/FifoLayersTable.tsx` — Read-only table with 7 columns (receival #, date, qty in, remaining, unit cost, landed cost, total/unit), 3-row skeleton loader using `useFifoLayers`, currency formatting via `formatCurrency`/`formatDate` utilities, empty state, responsive layout with border and slate-50 bg
- [2026-04-25] **Inventory Tab Plan Task 2: New hooks** — `src/hooks/useInventory.ts` — Appended: FifoLayer/ToolAssetItem/ToolAssetUnit/ServiceInventoryLink types; useInventoryCategoriesByType, useCreateInventoryCategory, useUpdateInventoryCategory, useInventoryItemsByCategory, useArchiveInventoryItem, useInventoryBrandVariants, useArchiveInventoryBrandVariant, useFifoLayers, useToolAssetItems, useToolAssetUnits, useCreateToolAssetItem, useUpdateToolAssetItem, useCreateToolAssetUnit, useUpdateToolAssetUnit, useServiceInventoryLinks, useUpdateServiceInventoryLinks, useAllServices, useInventoryItemsFlat, useArchiveInventoryCategory, useUpdateSortOrders, useUpsertInventoryItemAttributes, useStaffProfiles
- [2026-04-25] **Inventory Tab Plan Task 1: DB Migration** — `supabase/migrations/20260425000100_inventory_tab_columns.sql` — Adds status/sort_order to inventory_categories, inventory_items, inventory_brand_variants; reorder_point to inventory_brand_variants

---

### PO Approval Chain (Plan: 2026-04-22-po-approval-chain.md) — COMPLETE ✅

- [2026-04-22] **Task 12** — `src/components/purchase/PoApprovalChain.tsx`, `src/app/(dashboard)/purchase/approvals/page.tsx` — PoApprovalChain rewritten with tier grouping, cancelled state, active-pulse animation, force-approved badge; approvals page rewritten with force-approve button (admin-only), iteration history, force-approve dialog with mandatory comment, reject options (full rejection / send back to draft); tsc --noEmit clean
- [2026-04-22] **Task 11** — `src/components/purchase/ApprovalRoleAssignmentsTab.tsx`, `src/components/layout/nav-config.ts` — Role assignments tab (user+role select, soft-delete); Approval Settings added to Purchase & Sales nav
- [2026-04-22] **Task 10** — `src/components/purchase/ApprovalChainsTab.tsx`, `src/app/(dashboard)/purchase/approval-settings/page.tsx` — Chains tab with tier CRUD, role toggle buttons, missing-assignee warning; 2-tab settings page with admin gate
- [2026-04-22] **Task 9** — `src/components/layout/NotificationBell.tsx`, `src/components/layout/TopNav.tsx` — Bell icon with unread badge, dropdown with recent notifications, mark-read/mark-all-read, routes to approvals page on click
- [2026-04-22] **Task 8** — `src/hooks/usePOApprovals.ts` — role-filtering `usePendingApprovals`, `useCompletedApprovals`, `useApproveStep` (four-eyes, RPC state machine, tier-advance notifications, PO-approved notification), `useForceApproveStep` (admin bypass, mandatory comment), `useRejectPO` (sibling cancel, ghost cleanup, creator notification); tsc --noEmit clean
- [2026-04-22] **Task 7** — `src/hooks/usePurchaseOrders.ts` — `useSubmitPOForApproval` rewritten with chain-based logic (division→company fallback, `findApplicableTiers`, `validateRoles`, `buildApprovalSteps`, notifications to first-tier approvers)
- [2026-04-22] **Task 6** — `src/hooks/useNotifications.ts` — `NotificationRow` type, `getMyProfileId`, `useUnreadNotificationCount`, `useRecentNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`
- [2026-04-22] **Task 5** — `src/hooks/useApprovalRoleAssignments.ts` — `useApprovalRoleAssignments`, `useApprovalRoleAssignmentsForDivision`, `useCurrentUserApprovalRoles`, `useAddApprovalRoleAssignment`, `useSoftDeleteApprovalRoleAssignment`
- [2026-04-22] **Task 4** — `src/hooks/useApprovalChains.ts` — `useApprovalChains`, `useChainForDivision`, `useUpsertApprovalChain`, `useUpsertApprovalChainTier`, `useSoftDeleteApprovalChainTier`
- [2026-04-22] **Task 3** — `src/lib/permissions.ts` — added `purchase.approvals.chain.manage` and `purchase.approvals.bypass` permissions; tests pass
- [2026-04-22] **Task 2** — `src/lib/approvalChainResolution.ts`, `src/lib/approvalChainResolution.test.ts` — pure functions: `findApplicableTiers`, `validateRoles`, `buildApprovalSteps`, `getNotificationRecipients`; 18 tests pass
- [2026-04-22] **Task 1** — `supabase/migrations/20260422000001_approval_chains.sql` — `approval_chains`, `approval_chain_tiers`, `approval_role_assignments`, `notifications` tables; `advance_po_approval_tier` RPC; `po_approvals` columns: `tier_rank`, `is_active`, `iteration`, `force_approved`, `force_comment`

---

- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 9: Integration Test** — `tsc --noEmit` 0 errors, 33/33 tests pass, build succeeds, `/master-data/services` (14 kB) confirmed in route list; plan complete
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 8: ServicesPage Cleanup** — `src/app/(dashboard)/master-data/services/page.tsx` — Removed featureFilters state, FEATURE_FILTERS array, Badge/ClipboardCheck/Wrench imports; filter bar now only shows contract type buttons; tsc --noEmit clean
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 7: ServiceEditDialog Rewrite** — `src/components/services/ServiceEditDialog.tsx` — Rewired to use all 9 section components from ServiceEditSections; added Supabase Storage image upload, AlertDialog discard guard, duration/warranty/qc_items fields; tsc --noEmit clean
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 6: ServiceEditSections** — `src/components/services/ServiceEditSections.tsx` — New file: Zod schema, toDefaults, CoreSection, CatalogImageSection, StatusSection, DivisionSection, ContractSection, PricingSection, DurationWarrantySection, InvoiceTextSection, FeatureFieldsSection; tsc --noEmit clean
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 5: ServiceTableView + ContractTableView Cleanup** — `src/components/services/ServiceTableView.tsx`, `src/components/services/ContractTableView.tsx` — Removed featureFilters prop; both files matched target content (already applied in Task 4); tsc --noEmit clean
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 4: ServiceTree Rewrite** — `src/components/services/ServiceTree.tsx` — Rewritten with sticky 7-column header, delegates to ServiceTreeRow, exports ReorderArgs/buildTreeMap/collectDescendantIds, removes featureFilters
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 3: ServiceTreeRow Component** — `src/components/services/ServiceTreeRow.tsx` — 7-column row anatomy with level badges, pricing, details, reminders cells + archive AlertDialog
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 2: useServices Hook Updates** — `src/hooks/useServices.ts` — Added deleted_at filter to useServiceTree, added useArchiveService mutation
- [2026-04-21] **Services Hub Tree & Dialog Redesign — Task 1: DB Migration** — `supabase/migrations/20260421000001_services_additions.sql`, `src/types/database.types.ts` — Added deleted_at, catalog_image_url, legacy_service_id, qc_items columns + service-photos storage bucket

### Services Hub — Shell, Tree Tabs & Edit Dialog (Plan: 2026-04-21-services-hub-shell-tree-tabs.md) — COMPLETE ✅

- [2026-04-21] **Tasks 1–11** — `supabase/migrations/20260421000000_services_feature_flags.sql`, `src/hooks/useServices.ts`, `src/components/shared/DivisionMultiSelect.tsx`, `src/components/shared/PageWrapper.tsx`, `src/components/services/ServiceTree.tsx`, `src/components/services/ServiceTableView.tsx`, `src/components/services/ContractTableView.tsx`, `src/components/services/ServiceEditDialog.tsx`, `src/app/(dashboard)/master-data/services/page.tsx` — recursive tree renderer, 7-tab page shell, full-featured edit dialog with feature flags, layout refactor for hub pages; `tsc` clean, 33 tests pass, build succeeds, `/master-data/services` live in nav

---

### Foundation & Infrastructure

- [2026-04-16] Full brainstorming & design session
- [2026-04-16] Design spec: `docs/superpowers/specs/2026-04-16-mms-phase1-design.md`
- [2026-04-16] **Foundation (Tasks 1–18)** — scaffold, auth, design system, TopNav, dashboard; 87-table schema applied; login page, middleware, TanStack Query provider; full navigation
- [2026-04-16] **Bug fixes** — NavDropdown.tsx + UserMenu.tsx: wrapped groups in `<DropdownMenuGroup>` to fix context errors
- [2026-04-16] **Git setup** — remote connected to `https://github.com/alfaytri/MMS.git`; foundation pushed to `main`; development on `develop`

---

### Master Data (Plan: 2026-04-16-mms-master-data.md) — COMPLETE ✅

- [2026-04-16] **Task 1** — Dependencies + Formatters + Toaster (`formatters.ts` with 5 helpers + 17 tests)
- [2026-04-16] **Task 2** — DataTable shared component (sortable headers, pagination, skeleton, empty state)
- [2026-04-16] **Task 3** — Shared UI components (PageHeader, SearchInput, StatusBadge, ConfirmDialog)
- [2026-04-16] **Task 4** — Suppliers module (useSuppliers hook, SupplierFormDialog, Suppliers page)
- [2026-04-16] **Task 5** — Companies & Divisions (useCompanies, useDivisions, CompanyFormDialog, DivisionFormDialog)
- [2026-04-16] **Task 6** — Warehouses module (useWarehouses, WarehouseFormDialog, Warehouses page)
- [2026-04-16] **Tasks 7–8** — Inventory module (useInventory, 3 tabs: Products/Spare Parts/Consumables, brand variants panel)
- [2026-04-16] **Tasks 9–10** — Users & Roles (useRoles, useProfiles, permissions.ts, RoleFormDialog, UserRoleDialog, 3-tab page)
- [2026-04-17] **Task 11** — Audit Trail (useActivityLog with 30s refresh, AuditDetailDialog, filters + DataTable)
- [2026-04-17] **Task 12** — Admin Settings (AdminSidebar 4 sections, Brand Groups CRUD, Reason Lists CRUD)
- [2026-04-17] **Task 13** — Integration test: build clean (9 routes), 21/21 tests pass

---

### Purchase Core (Plan: 2026-04-17-mms-purchase-core.md) — COMPLETE ✅

- [2026-04-17] **Task 1** — Hooks (usePurchaseOrders, usePOApprovals, approval calc)
- [2026-04-17] **Task 2** — Shared components (PoStatusBadge, PoApprovalChain, InventoryItemLookup, PaymentDialog)
- [2026-04-17] **Task 3** — PoDetailDialog (4-tab: line items, receivals, payments, activity)
- [2026-04-17] **Task 4** — PO List Page (status chip filters, date range, debounced search, DataTable)
- [2026-04-17] **Task 5** — Create/Edit PO Page (PoLineItemsEditor, PoTermsSection, supplier quick-add, approval preview)
- [2026-04-17] **Task 6** — Approvals Page (pending queue, approve/reject dialog, full rejection vs send-back)
- [2026-04-17] **Task 7** — Integration test: build clean, all routes confirmed

---

### Sales Core (Plan: 2026-04-17-mms-sales-core.md) — COMPLETE ✅

- [2026-04-17] **Task 1** — Hooks (useSaleOrders, useSaleReturns, customer hooks, confirm + stock-reserve, delivery + deduct-stock)
- [2026-04-17] **Task 2** — Shared components (SoStatusBadge, SoPaymentDialog, SoDeliveryDialog)
- [2026-04-17] **Task 3** — SoDetailDialog (4-tab: items, deliveries, payments, activity)
- [2026-04-17] **Task 4** — Sale Orders List Page (8 status chips, debounced search, date range, DataTable)
- [2026-04-17] **Task 5** — Create/Edit SO Page (SoLineItemsEditor, negative margin warning, save-as-quotation + confirm)
- [2026-04-17] **Task 6** — Sale Returns Page (create return dialog, return detail, advance-status pipeline)
- [2026-04-17] **Task 7** — Integration test: build clean, all routes confirmed

---

### Purchase Operations (Plan: 2026-04-17-mms-purchase-operations.md) — COMPLETE ✅

- [2026-04-17] **Task 1** — Hooks (useShipments, useLandedCosts, useWarehouseOperations, useDeadStock)
- [2026-04-17] **Task 2** — Shipments Page (status chip filter, DataTable, CreateShipmentDialog, ShipmentDetailDialog with timeline)
- [2026-04-17] **Task 3** — Landed Costs Page (CreateLcDialog with cost lines, LcDetailDialog with allocations + void)
- [2026-04-17] **Task 4** — Warehouses Hub Shell (7-tab hub, Warehouses/Stock Overview/Movements tabs)
- [2026-04-17] **Task 5** — Transfers + Receivals Tabs (WhTransferDialog, approve/reject for pending_approval)
- [2026-04-17] **Task 6** — Adjustments + Inventory Checks Tabs (WhAdjustmentDialog, WhInventoryCheckDialog dual-mode)
- [2026-04-17] **Task 7** — Dead Stock Report (4-category cards, sort by idle days/value, ∞ for never-moved)
- [2026-04-17] **Task 8** — Integration test: build clean, all routes confirmed

---

### CSV Import (Plan: 2026-04-17-mms-csv-import.md) — COMPLETE ✅

- [2026-04-17] **Task 1** — Utilities + Hooks (ENTITY_CONFIGS, validateRows, 5 entity importers, template download)
- [2026-04-17] **Task 2** — Import Page (tabbed entity selector, drag-and-drop PapaParse, error highlighting, download error rows)
- [2026-04-17] **Task 3** — Integration test: TypeScript clean, tests pass, build succeeds

---

### User Management (Plan: 2026-04-18-mms-user-management.md) — COMPLETE ✅

- [2026-04-18] **Task 1** — Migration + `replace_user_custom_roles` RPC (ad94ed2)
- [2026-04-18] **Task 2** — Shared `passwordSchema` zod + 6 unit tests (c33730a)
- [2026-04-18] **Task 3** — `requireAdmin()` / `requireAuth()` gates with `ADMIN_BOOTSTRAP_EMAIL` fallback (ab7a744)
- [2026-04-18] **Task 4** — `isRateLimited()` + `logUserEvent()` helpers (7f9753c)
- [2026-04-18] **Tasks 5–8** — 4 API routes: POST /api/users/create, PATCH /api/users/[id], POST /api/users/reset-password, POST /api/users/me/change-password
- [2026-04-18] **Tasks 9–11** — Middleware force-change gate, 4 new useProfiles hooks, /change-password page
- [2026-04-18] **Tasks 12–15** — AddUserDialog, EditUserDialog, ResetPasswordDialog; wired into Users page
- [2026-04-18] **Task 16** — Deleted /api/users/invite, InviteUserDialog, useInviteUser; build clean
- [2026-04-18] **Task 17** — Automated checks pass; manual browser smoke test pending
- [2026-04-18] **Bug fixes** — requireAdmin bootstrap ordering, replace_user_custom_roles column name, useProfiles RLS bypass, PostgREST FK ambiguity, password min 8 chars
- [2026-04-18] **Admin role seed** — migration seeds is_system Admin role with all 53 permission keys; auto-assigns to m.ismail@alfaytri.com (26f6f1e)
- [2026-04-18] **Fix: warehouses RLS** — migration adds SELECT/INSERT/UPDATE/DELETE policies (887f575)

---

### Admin UI Restructure — COMPLETE ✅

- [2026-04-18] **Task 1** — DB migrations (divisions.name_ar, Storage bucket for division assets)
- [2026-04-18] **Task 2** — Route migration (Companies & Warehouses → /admin/companies, /admin/warehouses)
- [2026-04-18] **Task 3** — useDivisions: useAllDivisions + useDeleteDivision added
- [2026-04-18] **Task 4** — permissions.ts rewritten (icons/labels/descriptions per key, roleColor util, 5 tests)
- [2026-04-18] **Task 5** — DivisionFormDialog overhaul (company dropdown, color swatches, name_ar, logo/stamp upload)
- [2026-04-18] **Task 6** — Companies page (division card grid, colored left border, logo/address/stamp indicators)
- [2026-04-18] **Task 7** — RoleFormDialog (accordion permissions by module, indeterminate checkboxes, Select/Clear All)
- [2026-04-18] **Task 8** — Users & Roles page (Shield header, tab badges, Role cards grid, roleColor() coverage chips)
- [2026-04-18] **Task 9** — Integration: build clean (31 routes), 33 tests pass
- [2026-04-18] **Auth gate fix** — middleware redirects signed-in users off /login; unauthenticated users redirected to /login
- [2026-04-18] **Users & Roles UI polish** — tab row centered, active tab orange, count badges white-pill style
- [2026-04-18] **Session cookies** — stripped Max-Age/Expires so browser drops cookies on window close
- [2026-04-18] **Fix: brands/brand_groups tables** — migration for tables missing from migrations (b89c4cb)

---

### Purchase & Sales Expansion (Plan: 2026-04-19-purchase-sales-expansion.md) — COMPLETE ✅

- [2026-04-19] **Task 1** — DB Migration (invoices split status, match_status, credit_note_lines, payment_plans) (30b8718)
- [2026-04-19] **Task 2** — TypeScript Invoice Types + Invoice Sync (b7c806f)
- [2026-04-19] **Task 3** — Nav Config Update (d3f615c)
- [2026-04-19] **Task 4** — useRfqs + useReceivals hooks (a52c7dc)
- [2026-04-19] **Task 5** — useSupplierBills + useSupplierPayments + usePaymentPlans hooks (c110663)
- [2026-04-19] **Task 6** — Sales hooks (useSaleDeliveries, useCustomerInvoices, useCustomerPayments, useCreditNotes) (d69592c)
- [2026-04-19] **Task 7** — RFQ Components + Page (e869201)
- [2026-04-19] **Task 8** — Receivals Components + Page (657580b)
- [2026-04-19] **Task 9** — Bills Components + Page (87cd241)
- [2026-04-19] **Task 10** — Purchase Payments Components + Page (df15d44)
- [2026-04-19] **Task 11** — Sale Deliveries Component + Page (0b90fe4)
- [2026-04-19] **Task 12** — Customer Invoices Component + Page (b7a67b7)
- [2026-04-19] **Task 13** — Customer Payments + Credit Notes page (f0fe8e3)
- [2026-04-19] **Task 14** — Wire SO Confirm → stub delivery + draft AR invoice (7027539)
- [2026-04-19] **Task 15** — Integration test: tsc clean, 33 tests pass, next build all 8 routes confirmed

---

### Edit PO Versioning (Plan: 2026-04-20-edit-po-versioning.md) — COMPLETE ✅

- [2026-04-20] **Task 1** — Migration `20260420000001_po_versions.sql`: `version_number` column on `purchase_orders` + `po_versions` snapshot table with RLS (126f323)
- [2026-04-20] **Task 2** — `PoVersion` type + `usePoVersions`, `useSubmitPoVersion`, `useSavePoAsDraft` hooks in `usePurchaseOrders.ts` (c65a825)
- [2026-04-20] **Task 3** — `PoVersionTabs` component: tab strip showing past versions with dates + current version (pencil icon) (3318b6f)
- [2026-04-20] **Task 4** — `PoVersionBanner` component: amber read-only banner + "Restore to this version" button (74a9985)
- [2026-04-20] **Task 5** — Full rewrite of `edit-po/[id]/page.tsx`: pre-filled form, version tab navigation, old-version read-only view, restore handler; `readOnly` prop added to `PoLineItemsEditor` and `PoTermsSection` (114a81e)
- [2026-04-20] **Fix** — Edit action button in PO list now shows for all non-cancelled statuses (previously draft-only) (86eebb0)
- [2026-04-20] **Fix: RLS blanket fix** — Migration `20260420000002_fix_rls_all_tables.sql`: enabled RLS + permissive authenticated policy on 52 tables that were missing coverage (initial schema had 50 tables with no RLS at all); fixes `po_versions` insert error and prevents similar errors across inventory, payments, orders, and all other modules (a7f5914)
- [2026-04-20] **Fix: null id on po_line_items** — Migration `20260420000003_po_line_items_id_default.sql` adds `DEFAULT gen_random_uuid()` on `po_line_items.id`; edit-po page and create-po page both updated to explicitly pick only 9 `POLineItemDraft` fields (no DB-owned fields bleed through into INSERT payloads) (0b4c936)
- [2026-04-20] **Admin delete version** — `useIsAdmin()` hook added to `useProfiles.ts`; `useDeletePoVersion()` hook added to `usePurchaseOrders.ts`; `PoVersionBanner` extended with optional `onDelete` + `ConfirmDialog`; edit-po page wires `onDelete` (admin-only) and `isDeleting` prop (7f3dc78)
- [2026-04-20] **View dialog versioning** — `PoDetailDialog` updated: version tabs strip shown when past snapshots exist; old version tabs display snapshot line items (read-only); Receivals/Receive/Payments tabs hidden for snapshots; Cancel PO/Create Bill/Edit PO hidden for snapshots; Print always available on any version (adef737)

---

### Create PO Redesign (Plan: 2026-04-20-create-po-redesign.md) — COMPLETE ✅

- [2026-04-20] **Task 1** — `POLineItemDraft` — added `tool_asset_item_id: string | null`
- [2026-04-20] **Task 2** — `AddSupplierDialog` — standalone supplier creation with onCreated callback
- [2026-04-20] **Task 3** — `ToolAssetLookup` — searchable dropdown for tool_asset_items table (debounced 250ms)
- [2026-04-20] **Task 4** — `PoLineItemsEditor` rewrite — 4 grouped item types with colored headers, InventoryItemLookup + ToolAssetLookup
- [2026-04-20] **Task 5** — `PoTermsSection` rewrite — milestone payment pills, expected_delivery date, DEFAULT_TERMS export
- [2026-04-20] **Task 6** — `create-po/page.tsx` rewrite — sticky header, Popover/Command supplier combobox, discount section, vendor notes, approval chain preview

---

### Warehouses Hub Redesign (Plan: 2026-04-20-warehouses-hub-redesign.md) — COMPLETE ✅

- **Design spec:** `docs/superpowers/specs/2026-04-20-warehouses-redesign-design.md`
- **Scope:** Full 7-tab hub redesign — URL-based tab state (`?tab=`), React.memo tab isolation, compact density, semantic color tokens, unified Receivals & Deliveries tab (Tab 7 merges `receivals` + `sale_deliveries`). Nav entry moved from Purchase & Sales → Master Data dropdown (route stays `/purchase/warehouses`).
- **Architecture:** Page orchestrator owns shared data + dialog triggers. Tab components are pure props-driven React.memo. Dialogs gated with `enabled: open`.

**Completed tasks:**
- [2026-04-21] **Task 1** — nav-config.ts: Warehouses moved to Master Data; `WhReceivalsTab.tsx` deleted
- [2026-04-21] **Task 2** — `useWarehouseOperations.ts`: `ReceivalDelivery` type + `useReceivalsAndDeliveries()` hook (Promise.all merge of `receivals` + `sale_deliveries`, sorted by date desc)
- [2026-04-21] **Task 3** — `page.tsx` rewrite — Suspense + `useSearchParams` URL tab state, sticky header with 3 dialog trigger buttons, React.memo tab components, badge counts for pending transfers + pending receivals
- [2026-04-21] **Task 4** — `WhWarehousesTab` — React.memo, props-driven, responsive card grid (`grid-cols-1 md:2 lg:3`), typed DB fields, `(wh as any).manager_name` only cast
- [2026-04-21] **Task 5** — `WhStockOverviewTab` — React.memo, props-driven, 3 summary mini-cards, search + company/warehouse toggle, company total table with typed stock fields
- [2026-04-21] **Task 6** — `WhTransfersTab` — React.memo, props-driven, approve (`{ id, approvedByName }`) + reject (id only), amber highlight for pending_approval, `from_warehouse?.name` / `to_warehouse?.name`
- [2026-04-21] **Task 7** — `WhAdjustmentsTab` — React.memo, full table with type/status badges, photo preview inline Dialog, `useApproveStockAdjustment` + inline reject mutation
- [2026-04-21] **Task 8** — `WhInventoryChecksTab` — React.memo, clickable check list, detail Dialog with items variance table + reviewer panel (`status: 'approved'/'rejected'` inline mutations), audit footer

**All tasks complete.**

- [2026-04-21] **Task 9** — `WhMovementsTab` rewrite — React.memo, props-driven, 3 filters (search/warehouse/type), `StockMovement` typed, warehouse name resolution
- [2026-04-21] **Task 10** — `ReceivalsDeliveriesTab` + `WhReceivalDetailDialog` — unified inbound/outbound table, direction/warehouse/search filters, click-to-detail dialog
- [2026-04-21] **Task 11** — `WhAdjustmentDialog` rewrite — children trigger, `InventoryItemLookup` integration, photo upload to `adjustment-photos` bucket, `status: 'pending_approval'`
- [2026-04-21] **Task 12** — `WhInventoryCheckDialog` rewrite — `CheckItemsTable` sub-component (conditional hook), live variance badges, 3-step submit (create → insert items → set submitted)
- [2026-04-21] **Task 13** — `WhTransferDialog` rewrite — from/to warehouse selects, approval banner with manager name, free-text item rows, direct Supabase insert
- [2026-04-21] **Fix** — `page.tsx` null-coalesces `currentProfile ?? null` to satisfy tab component types; `tsc --noEmit` clean

---

### PO Page Redesign (Plan: 2026-04-19-po-page-redesign.md) — COMPLETE ✅

- [2026-04-19] **Task 1** — Install progress component + useSubmitPO + useCancelPO
- [2026-04-19] **Task 2** — Page header + stat cards (4 KPIs) + rich filters bar + progress-bar table
- [2026-04-19] **Task 3** — PoDetailDialog redesigned header + action buttons (Submit/Cancel/Print)
- [2026-04-19] **Task 4** — PoDetailDialog activity log as vertical timeline
- [2026-04-19] **Task 5** — PoReceiveTab (inline receival with warehouse selector + per-item qty) wired as 5th tab
- [2026-04-19] **Task 6** — PoShipmentDialog (mode, tracking, carrier, ETD/ETA)
- [2026-04-19] **Task 7** — Integration test + PROGRESS.md update
- [2026-04-19] **PO Restructure** — BillFormDialog initialPoId, PoDetailDialog "Create Bill" button, RFQ button + three-dot row actions

---

## ⏳ Not Started (Phase 2, gated on Phase 1 cleanup)

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
