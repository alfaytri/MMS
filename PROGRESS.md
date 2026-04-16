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
| `docs/superpowers/plans/2026-04-16-mms-master-data.md` | **In Progress (Task 2 of 13)** | Companies, Warehouses, Inventory, Suppliers, Users, Audit |
| `docs/superpowers/plans/2026-04-16-mms-purchase.md` | Not written yet | Full Purchase module |
| `docs/superpowers/plans/2026-04-16-mms-sales.md` | Not written yet | Full Sales module |
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

## 🔄 In Progress

- Master Data Task 2: DataTable Shared Component (DataTableColumnHeader, DataTablePagination, DataTable)

## ⏳ Not Started

- Master Data Tasks 3–13 (Shared UI, Suppliers, Companies, Warehouses, Inventory, Users, Audit, Admin)
- Purchase module (full)
- Sales module (full)
- CSV Import tool

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
