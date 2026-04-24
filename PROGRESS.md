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
| **Active branch** | `develop` — all Phase 1 feature work here, never commit directly to `main` |
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

---

## 🔄 In Progress

### Shipment Tracking Integration (Plan: 2026-04-24-shipment-tracking.md) — IN PROGRESS

- [2026-04-24] **Task 3: Tracking Utilities** — `src/lib/tracking/normalize.ts`, `src/lib/tracking/normalize.test.ts` — TDD: `normalizeTimestamp()` converts UTC/offset strings to ISO-8601, handles unparseable input gracefully; `computeEventHash()` produces sha256 digest; 8 tests pass
- [2026-04-24] **Task 3: Status Map Utilities** — `src/lib/tracking/statusMap.ts`, `src/lib/tracking/statusMap.test.ts` — TDD: `map17trackTag()` maps 17track status tags (InTransit→in_transit, Delivered→delivered, Exception/Undelivered→delayed, Customs→customs, null for non-status tags); `STATUS_WEIGHTS` defines precedence (delivered>delayed>customs>in_transit>booked); 13 tests pass
- [2026-04-24] **Task 4: 17track API Client** — `src/lib/tracking/client17track.ts` — TypeScript interfaces (`Track17Event`, `Track17TrackInfo`, `Track17RegisterResult`, `Track17RegisterRejection`); functions: `registerTracking()`, `getTrackInfo()`, `stopTracking()`; error codes (ERR_QUOTA_EXCEEDED=4031, ERR_AMBIGUOUS_CARRIER=4013); `.env.local` updated with `SEVENTEEN_TRACK_API_KEY` and `SEVENTEEN_TRACK_WEBHOOK_SECRET` placeholders

---

**Previous:** No active plan. All Phase 1 implementation plans are complete. Pending Phase 1 cleanup items below before Phase 2.

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
