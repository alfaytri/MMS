# MMS — Maintenance Management System
## Phase 1 Design Specification
**Date:** 2026-04-16
**Author:** Mohamed Ismail + Claude
**Status:** Approved — ready for implementation planning

---

## 1. Project Overview

**What it is:** A web-based ERP/field-service management system for a Qatar-based maintenance company (Alfaytri Maintenance, RSH Cleaning and Pest Control, and related divisions).

**What it replaces:** A partial Lovable.ai prototype — the new build is a manually coded, fully maintainable codebase connecting to the same existing Supabase project.

**Timeline:** Phase 1 in 1–1.5 months. Full system in 3 months.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Best-in-class for React, App Router for layouts |
| UI | shadcn/ui + Tailwind CSS | Already in prototype, fully customisable |
| Database | Supabase (existing project) | 120-table schema already live, 400k rows of data |
| Auth | Supabase Auth (existing) | RLS policies already configured |
| Data fetching | TanStack Query (React Query) | Caching, background refetch, optimistic updates |
| Deployment | Vercel | Zero-config Next.js deployment, CI/CD from git |

---

## 2B. Design System — Colors

Primary palette: White + Orange + Blue

| Token | Color | Usage |
|---|---|---|
| Background | White `#FFFFFF` | Page background, cards |
| Primary | Orange `#F97316` (orange-500) | Primary buttons, active nav, CTAs |
| Secondary | Blue `#3B82F6` (blue-500) | Links, info badges, secondary actions |
| Surface | `#F8FAFC` (slate-50) | Table header bg, input backgrounds |
| Border | `#E2E8F0` (slate-200) | Card borders, dividers |
| Text primary | `#0F172A` (slate-900) | Headings, body text |
| Text muted | `#64748B` (slate-500) | Labels, secondary text |
| Success | `#22C55E` (green-500) | Paid, completed, approved states |
| Destructive | `#EF4444` (red-500) | Cancelled, overdue, errors |
| Warning | `#EAB308` (yellow-500) | Pending, review states |

- Top nav: white background, orange active underline
- Primary buttons: orange fill, white text
- Secondary buttons: blue outline or blue text
- shadcn/ui CSS variables mapped to this palette in `globals.css`

---

## 3. Folder Structure

```
mms/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/              ← Login page
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          ← Top nav + shell
│   │   │   ├── page.tsx            ← Dashboard
│   │   │   ├── master-data/
│   │   │   │   ├── companies/
│   │   │   │   ├── warehouses/
│   │   │   │   ├── inventory/
│   │   │   │   ├── suppliers/
│   │   │   │   ├── users/
│   │   │   │   ├── audit-trail/
│   │   │   │   └── admin/
│   │   │   │       └── import/     ← CSV import tool
│   │   │   ├── purchase/
│   │   │   │   ├── orders/
│   │   │   │   ├── approvals/
│   │   │   │   ├── shipments/
│   │   │   │   ├── landed-costs/
│   │   │   │   ├── warehouses/
│   │   │   │   ├── returns/
│   │   │   │   └── dead-stock/
│   │   │   └── sales/
│   │   │       ├── create/
│   │   │       ├── orders/
│   │   │       └── returns/
│   │   └── api/                    ← API routes (webhooks only)
│   ├── components/
│   │   ├── ui/                     ← shadcn/ui base components
│   │   ├── shared/                 ← Tables, dialogs, cards reused across modules
│   │   ├── layout/                 ← TopNav, NavDropdown, DivisionFilter
│   │   ├── master-data/
│   │   ├── purchase/
│   │   └── sales/
│   ├── hooks/
│   │   ├── usePurchaseOrders.ts
│   │   ├── useSaleOrders.ts
│   │   ├── useInventory.ts
│   │   ├── useSuppliers.ts
│   │   └── useWarehouses.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           ← Browser client
│   │   │   └── server.ts           ← Server client (Server Components)
│   │   └── utils/
│   │       ├── formatters.ts       ← Currency, date, number formatters
│   │       └── csv.ts              ← CSV parse + validation helpers
│   └── types/
│       └── database.types.ts       ← Auto-generated from Supabase schema
├── supabase/
│   ├── migrations/                 ← New schema changes (SQL)
│   └── functions/                  ← Edge functions (reused from Lovable)
├── docs/
│   └── superpowers/specs/          ← This file lives here
└── PROGRESS.md                     ← Session progress tracker
```

---

## 4. Navigation Design

### Top Nav Bar
Sticky, h-14. Items: Logo | Master Data▾ | Orders▾ | Contracts▾ | Invoices▾ | Purchase & Sales▾ | Teams▾ | [Division badges] | [User menu▾]

### Master Data Dropdown
```
Companies & Divisions
Warehouses
Inventory Items
Suppliers
Users & Roles
Audit Trail
Admin
─────────────────────
Service List          [Coming Soon]
Team & Employee       [Coming Soon]
Subscription Packages [Coming Soon]
QuickBooks            [Coming Soon]
Notification Trail    [Coming Soon]
```

### Orders, Contracts, Invoices, Teams
Each shows a single "Coming Soon" state when clicked. Not hidden — visible but locked.

### Purchase & Sales Dropdown
```
PURCHASE
  Purchase Orders
  Approvals
  Shipments
  Landed Costs
  Dead Stock Report
  Warehouses

SALES
  Create Sale Order
  Sale Orders
  Returns
```

### Coming Soon Treatment
- Nav items out of scope: clickable but renders a single dropdown row with lock icon + "Coming Soon" badge
- Master Data sub-items out of scope: shown greyed out with a small `Soon` pill on the right
- No 404 pages — all routes either work or show the Coming Soon state

### Division Filter Bar
Below top nav on dashboard and list pages. Clickable division badges filter data by division. Matches prototype exactly.

---

## 5. Phase 1 Module Scope

### 5A. Master Data (partial)

| Page | Path | Description |
|---|---|---|
| Companies & Divisions | `/master-data/companies` | Company + division CRUD, logo, stamp, color, currency |
| Warehouses | `/master-data/warehouses` | Warehouse CRUD, manager assignment (add/edit warehouses only) |
| Inventory Items | `/master-data/inventory` | Products, spare parts, consumables, tools + brand variants |
| Suppliers | `/master-data/suppliers` | Supplier list + CRUD |
| Users & Roles | `/master-data/users` | Profile management, custom roles, permission assignment |
| Audit Trail | `/master-data/audit-trail` | Real-time log, filters by module/severity, detail diff view |
| Admin | `/master-data/admin` | Basic org settings |
| CSV Import | `/master-data/admin/import` | Bulk data import tool (see Section 6) |

### 5B. Purchase Module (full)

| Page | Path | Description |
|---|---|---|
| Purchase Orders | `/purchase/orders` | PO list, create, edit, detail dialog (line items / receivals / payments / activity) |
| Approvals | `/purchase/approvals` | Pending + completed queue, approve/reject with comments |
| Shipments | `/purchase/shipments` | Tracking list, events timeline, archive |
| Landed Costs | `/purchase/landed-costs` | Cost lines, receival attachment, FIFO layer updates |
| Warehouses | `/purchase/warehouses` | Stock management hub: stock overview, movements, transfers, receivals, adjustments, inventory checks (7 tabs). Different from Master Data warehouses which is CRUD only. |
| Purchase Returns | `/purchase/returns` | Create return, receive, restock, close pipeline |
| Dead Stock Report | `/purchase/dead-stock` | Analytics: Active / Slow Moving / At Risk / Dead classification |

### 5C. Sales Module (full)

| Page | Path | Description |
|---|---|---|
| Create Sale Order | `/sales/create` | Full SO creation form with inventory lookup, discount, voucher |
| Sale Orders | `/sales/orders` | SO list, detail dialog (items / deliveries / payments / activity) |
| Sale Returns | `/sales/returns` | Create return, receive, restock, close pipeline |

### 5D. Shared Logic (critical, built once)

| Logic | Where used |
|---|---|
| FIFO cost layers | Every purchase receival creates layers; every sale delivery deducts them |
| Stock reservation | On SO confirmation — increments `reserved_qty` |
| Average cost recalculation | After every FIFO movement via `recalc_average_cost` RPC |
| Approval state machine | PO approval steps: Purchase Manager → Accountant → Owner |
| Audit logging | Every create/edit/delete writes to `activity_log` |

---

## 6. CSV Import Tool

**Location:** `/master-data/admin/import`

**Supported entity types:**

| Entity | Tables written | Use case |
|---|---|---|
| Suppliers | `suppliers` | Migrate existing supplier list |
| Inventory Items | `inventory_items`, `inventory_brand_variants` | Migrate product catalog |
| Purchase Orders | `purchase_orders`, `po_line_items` | Migrate PO history |
| Sale Orders | `sale_orders`, `sale_order_lines` | Migrate SO history |
| Payments | `payments` | Migrate payment records |

**Import flow:**
1. Select entity type
2. Upload CSV file (max 10MB)
3. Column mapper — map CSV headers to database fields
4. Validation pass — highlight rows with errors (missing required fields, invalid formats, unknown FK references)
5. Preview — first 20 rows shown in a table
6. Confirm → bulk insert via Supabase batch upsert
7. Result summary — X inserted, Y failed. Download error CSV for failed rows.

---

## 7. Database Strategy

- **Same Supabase project** as the Lovable prototype — no migration needed
- **No schema changes** for Phase 1 — all 120 tables and existing RPCs are used as-is
- **TypeScript types** generated via `supabase gen types typescript` — fully typed access to all tables
- **RLS policies** respected — all existing INSERT/SELECT/UPDATE policies remain unchanged
- **Existing edge functions** reused (FIFO deduction, stock reservation, process-receival)

---

## 8. Authentication & Permissions

- Supabase Auth (email/password) — existing setup unchanged
- `has_permission(user_id, permission_key)` RPC used for UI-level gating
- Role-based nav — menu items conditionally rendered based on user permissions
- Phase 1 uses existing 79 permission keys from the `profiles` / `custom_roles` / `user_custom_roles` tables

---

## 9. Timeline — Phase 1 (1–1.5 months)

### Week 1–2: Foundation + Master Data
- Project scaffold (Next.js, Supabase client, shadcn/ui, TanStack Query)
- Top nav + layout shell + Coming Soon states
- Dashboard with division filter
- Master Data: Companies/Divisions, Warehouses, Suppliers, Users & Roles
- Supabase type generation

### Week 3–4: Inventory + Purchase Core
- Master Data: Inventory Items + Brand Variants (full CRUD)
- Purchase Orders — list, create, edit
- Purchase Approvals
- Receival flow (links to warehouse stock)
- FIFO layer creation on receival

### Week 5–6: Purchase Complete + Sales + CSV Import
- Shipments, Landed Costs, Warehouses (all 7 tabs)
- Purchase Returns, Dead Stock Report
- Sale Orders — create, list, detail
- Sale delivery + FIFO deduction
- Sale Returns
- CSV Import tool (all 5 entity types)
- Audit Trail page

### Buffer (days 43–45)
- Bug fixes, polish, QA

---

## 10. Outsourcing Strategy

**Phase 1 — build yourself (nothing to outsource yet):**
Purchase & Sales is the core — it requires deep understanding of FIFO, state machines, and the schema. This cannot be safely outsourced.

**Phase 2 — outsource candidates (~10% of total project):**
These modules are self-contained with full specs in the Ideas folder:

| Module | Why safe to outsource |
|---|---|
| Orders module | Fully specced, no dependency on Phase 1 internals |
| Contracts module | Fully specced, standalone |
| Invoices & Payments | Clear schema, no complex state machines |
| Teams module | Standalone, spec is complete |

**Never outsource:**
- Contact Center (3CX + dual WhatsApp + real-time — requires full system knowledge)
- Core FIFO logic (already built in Phase 1)
- Auth / permissions system

---

## 11. Progress Tracking

See `PROGRESS.md` in the project root. Updated at the start of each session.
