# MMS — Inventory & Operations ERP

A web-based back-office ERP for **inventory, purchasing, sales, warehouse
operations, and financial reporting**, built for [Alfaytri
Maintenance](https://alfaytri.com) and RSH Cleaning & Pest Control (Qatar).

It manages the full **procure-to-stock-to-sell** cycle: purchase orders and
supplier bills, goods receival with FIFO landed-cost accounting, multi-warehouse
stock with division scoping, sale orders / invoices / deliveries, custody &
consumption, and a suite of stock and financial reports.

> **Scope of this branch (`deploy/warehouse-shipping`).** This is the pruned
> **back-office** build that ships to production. Field Work Orders, the
> Team-Leader mobile app, standalone Quotations, the Contact Centre (WhatsApp),
> the Dibsy payment gateway, and the public payment portal live in the fuller
> internal build and are **not part of this deployment** — quotations are handled
> inside Sale Orders. Ignore any older references to those here.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database | Supabase (PostgreSQL), RLS-secured with division-scoped policies |
| Auth | Supabase Auth + a JWT hook that scopes data to a user's divisions |
| Data fetching | TanStack Query v5 |
| Drag & drop | dnd-kit |
| PDF generation | Puppeteer + `@sparticuz/chromium` (server-side render) |
| Error tracking | Sentry |
| Shipment tracking | 17track |
| Deployment | Vercel (from `deploy/warehouse-shipping`) |

---

## Modules

### Master Data
- **Inventory** — hierarchical category tree; items with brand/origin variants;
  FIFO cost layers; per-division stock; dead-stock reporting
- **Warehouses** — physical warehouses & division sub-containers; stock,
  receivals, deliveries, transfers, adjustments, movements
- **Users & Roles** — admin-managed accounts, custom roles, permission tree
  (NAV_TREE-driven), force-change-password gate, no-division login gate
- **Audit Trail** — timestamped activity log across modules
- **Admin** — companies, brands, credit groups, reason lists, approval
  workflows, payment methods, currencies, country codes, warranty policies,
  repair vendors, custody

### Purchase
- **Suppliers**, **Purchase Orders** (RFQ/Draft/Confirmed with configurable
  approval chains + version snapshots), **Receivals** (goods receipt →
  inventory, with edit-request workflow), **Bills & Payments** (bill from PO,
  payment allocation), **Returns / Debit Notes**, **Landed Costs** (cost
  allocation across receivals), **Shipments** (17track), **Aging**, **Dead Stock**

### Sales
- **Customers**, **Sale Orders** (division-isolated, credit-group enforced,
  approval chains), **Invoices**, **Deliveries** (with reserved-stock release),
  **Returns / Credit Notes**, **Customer Statement**, **Aging**

### Operations
- **Custody** (team/van/project stock hand-out), **Consumption** (issue stock to
  internal/custody with project discipline/milestone tagging), **Damaged Stock**
  (repair lifecycle), **Tools & Assets**, **Picture Transfer**

### Reports
- Nine stock & financial reports (P&L / COGS, revenue vs. COGS, stock value,
  accounts receivable/payable aging, project consumption, and more)

---

## Project Structure

```
src/
  app/
    (auth)/login/          — Login page
    (dashboard)/           — Protected routes (TopNav layout)
      master-data/         — Inventory, warehouses, users, audit, admin
      purchase/            — Suppliers, POs, receivals, bills, landed costs, returns
      sales/               — Customers, SOs, invoices, deliveries, returns, statements
      warehouse/           — Stock, transfers, adjustments, custody, damaged, tools
      consumption/         — Stock consumption (internal / custody / project)
      reports/             — Stock & financial reports
      profile/             — User profile
    api/                   — Route handlers (purchase, sales, warehouse, reports,
                             returns, shipments, users, webhooks, cron)
  components/
    ui/                    — shadcn/ui primitives
    shared/                — Reusable tables, dialogs, PhoneInputWithCode, ReasonSelect
    layout/                — TopNav, nav-config, division filter
    [module]/              — Module-specific components
  hooks/                   — One file per module (TanStack Query hooks)
  lib/
    supabase/              — Browser & server clients
    queryKeys.ts, queryInvalidation.ts — cache keys + invalidation helpers
    money.ts               — currency rounding & discount helpers
    workflow-conditions.ts — approval-workflow condition catalog
supabase/
  migrations/              — SQL migrations (applied via the Supabase CLI)
  migrations-staging/      — staging mirror of each migration
  config.toml              — linked project ref
docs/                      — architecture, flows registry, runbooks, usage manual
```

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase CLI (`npx supabase`) + access to the Supabase project

### Install
```bash
git clone <repository-url>
cd MMS
npm install
```

### Environment (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

ADMIN_BOOTSTRAP_EMAIL=<admin email used to bootstrap the first account>
NEXT_PUBLIC_SENTRY_DSN=<sentry dsn>          # error tracking (optional in dev)
CRON_SECRET=<shared secret for /api/cron/*>  # daily notification checks

# Shipment tracking (Purchase → Shipments)
SEVENTEEN_TRACK_API_KEY=<17track api key>
SEVENTEEN_TRACK_WEBHOOK_SECRET=<17track webhook secret>
```

### Database
The project ref is committed in `supabase/config.toml`, so linking needs no ref:
```bash
npx supabase login        # once
npx supabase link         # reads supabase/config.toml
npx supabase db push      # apply pending migrations
```
> Every new migration is written to **both** `supabase/migrations/` and
> `supabase/migrations-staging/`. See `AGENTS.md` for the migration policy.

### Develop / test / build
```bash
npm run dev        # http://localhost:3000 (Turbopack)
npm run test:run   # vitest, single run
npm run build      # production build
```

---

## Database notes

- **Row Level Security** on all tables. Real access control is enforced by
  ~110 **RESTRICTIVE division-scope policies** (a JWT hook stamps the user's
  divisions); permissive `USING(true)` policies alone do not grant access.
- **FIFO inventory costing** via atomic RPCs — cost is stored as per-batch cost
  layers and consumed oldest-first, with reserved quantities and COGS tracked
  per layer. See [`docs/inventory/inventory-cost-accounting.md`](docs/inventory/inventory-cost-accounting.md).
- **Approval chains** are configurable per division with cumulative tier
  thresholds (PO, SO, stock adjustment, inventory check, credit group, …).
- Schema changes go through the Supabase CLI; the baseline schema and generated
  types can drift — the live database is the source of truth.

---

## Deployment

Production deploys to **Vercel** from the `deploy/warehouse-shipping` branch —
each push triggers a build. Verify locally with `npm run build` first, and batch
changes so one push equals one production build.

---

## Documentation

Key references live in [`docs/`](docs/):

| Doc | What it covers |
|---|---|
| [`docs/flows-registry.md`](docs/flows-registry.md) | The authoritative catalog of every business flow (module → RPCs → ledger writes) |
| [`docs/inventory/inventory-cost-accounting.md`](docs/inventory/inventory-cost-accounting.md) | How inventory cost is stored & protected (FIFO layers, transfers, COGS, landed cost) |
| [`docs/usage-manual/`](docs/usage-manual/) | Staff usage manual (source Markdown + PDF/Word build pipeline) |
| [`docs/supabase-budget.md`](docs/supabase-budget.md) | Realtime / polling / query budget rules |
| [`docs/go-live-readiness-2026-08-21.md`](docs/go-live-readiness-2026-08-21.md) | Pre-launch readiness audit |
| [`AGENTS.md`](AGENTS.md) | Project conventions, migration policy, mandatory rules |

---

## Design System

| Token | Value |
|---|---|
| Primary | Orange `#F97316` |
| Background | White `#FFFFFF` |
| Surface | Slate-50 `#F8FAFC` |
| Border | Slate-200 `#E2E8F0` |
| Text | Slate-900 `#0F172A` |
| Text muted | Slate-500 `#64748B` |
| Success | Green-500 `#22C55E` |
| Destructive | Red-500 `#EF4444` |
| Warning | Yellow-500 `#EAB308` |

Fully responsive across mobile (<640px), tablet (640–1024px), desktop
(1024–1920px), and large screens (>1920px).

---

## License

Proprietary. All rights reserved.
