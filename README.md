# MMS -- Maintenance Management System

A web-based ERP system built for field maintenance operations in Qatar. MMS handles the full lifecycle of maintenance work -- from customer intake and quotation through order scheduling, team dispatch, field execution, invoicing, and payment collection.

Built for [Alfaytri Maintenance](https://alfaytri.com) and RSH Cleaning and Pest Control.

---

## Tech Stack

| Layer            | Technology                                      |
|------------------|--------------------------------------------------|
| Framework        | Next.js 15 (App Router) + TypeScript             |
| UI               | shadcn/ui + Tailwind CSS                         |
| Database         | Supabase (PostgreSQL) -- 120+ tables, RLS-secured |
| Auth             | Supabase Auth with role-based access control      |
| Data Fetching    | TanStack Query v5                                |
| Drag and Drop    | dnd-kit                                          |
| PDF Generation   | @react-pdf/renderer, html2canvas, jsPDF          |
| Payment Gateway  | Dibsy (Qatar)                                    |
| WhatsApp         | WATI + WHAPI (dual-provider with live toggle)    |
| Deployment       | Vercel                                           |

---

## Modules

### Master Data
- **Inventory** -- Hierarchical category tree, FIFO costing layers, stock movements, reserved quantities, dead stock reporting
- **Suppliers** -- Full CRUD with contact details and payment terms
- **Services** -- Three-tab service catalog (Normal, Contract, Mobile) with tree navigation, notifications, instructions, inventory links, and promotions
- **Users and Roles** -- Admin-managed user creation, role assignment, permission groups, force-change password gate
- **Warehouses** -- 7-tab operational hub (stock, receivals, deliveries, transfers, adjustments, movements, settings)
- **Audit Trail** -- Timestamped activity log across all modules
- **Admin** -- Companies, brand groups, credit groups, reason lists, approval settings, payment methods

### Purchase
- **Purchase Orders** -- RFQ/Draft/Confirmed lifecycle with configurable approval chains, version snapshots, and stat cards
- **Receivals** -- Goods receipt with edit-request workflow and inventory integration
- **Shipments** -- 17track integration for shipment tracking
- **Landed Costs** -- Cost allocation across receivals with bill attachment
- **Bills and Payments** -- Bill generation from POs, payment recording with allocation
- **Returns** -- Dispatch/cancel/supplier-confirm flow with automatic inventory reversal

### Sales
- **Sale Orders** -- Division-isolated SO creation with credit group enforcement
- **Deliveries** -- Delivery scheduling with reserved stock release
- **Invoices** -- Invoice generation from SOs with manual-paid and void support
- **Payments** -- Payment recording with invoice allocation
- **Credit/Debit Notes** -- Post-invoice adjustments
- **Returns** -- Customer returns with automatic restock

### Orders (Field Operations)
- **Work Orders** -- Customer phone lookup, service selection with time windows, team calendar drag-and-drop scheduling, Blue Plate address integration
- **Order Detail** -- 4-tab sheet (services, invoice, follow-up, logs) with confirm/rollback/cancel actions
- **Create/Edit** -- Three-panel layout with form, team calendar, and customer history

### Quotations
- **Quotation Builder** -- Service tree browser, line-item pricing, flat/percentage discounts, PDF preview with company letterhead
- **WhatsApp Delivery** -- Send quotations via WATI or WHAPI with automatic provider fallback

### Invoices and Payments (Finance)
- **View Invoices** -- Card-based infinite scroll with QB sync flags, void and credit-note actions
- **View Payments** -- Payment history with filtering
- **Pending Payments** -- Server-aggregated customer balances

### Team Leader (Mobile Field App)
- **Mobile-first Interface** -- Stripped layout for field technicians with GPS tracking
- **7 Order Dialogs** -- Normal, Backwork, Follow-up, Site Visit (Single/Contract), Contract Visit, QC
- **Field Execution** -- Service status toggles, damage reports, photo capture, signature pad with IndexedDB crash recovery
- **Invoice Flow** -- On-site invoicing with cash/payment-link branching via Dibsy

### Payment Portal
- **Customer-facing Portal** -- Public payment page linked from WhatsApp messages
- **Multi-invoice Support** -- Groups invoices by phone number, batch payment via Dibsy checkout
- **Idempotent Webhooks** -- Prevents double-payment on retry

### Contact Centre
- **WhatsApp Sidebar** -- Real-time chat with WATI/WHAPI dual-provider support
- **CRM Panel** -- Customer data, installed products with warranty tracking, order history
- **Address Management** -- Blue Plate and GPS coordinate support with drag-to-order
- **Templates** -- Named-parameter template sending with header media support

### Teams and Employees
- **Team Management** -- Company/division hierarchy, drag-and-drop member assignment
- **Employee Profiles** -- Skills, schedules, tool assignments, activity logging

---

## Project Structure

```
src/
  app/
    (auth)/login/              -- Login page
    (dashboard)/               -- All protected routes (TopNav layout)
      master-data/             -- Inventory, suppliers, services, users, admin
      purchase/                -- POs, receivals, shipments, landed costs, bills
      sales/                   -- SOs, deliveries, invoices, payments, returns
      orders/                  -- Work orders (create, edit, list)
      quotations/              -- Quotation builder
      invoices/                -- Finance views (invoices, payments, pending)
      team-leader/             -- Mobile field app
      calendar/                -- Team scheduling calendar
    pay/[invoiceId]/           -- Public payment portal (no auth)
    api/                       -- API routes (Dibsy, WATI, WHAPI, users)
  components/
    ui/                        -- shadcn/ui primitives
    shared/                    -- Reusable tables, dialogs, phone input
    layout/                    -- TopNav, navigation, division filter
    [module]/                  -- Module-specific components
  hooks/                       -- One file per module (TanStack Query hooks)
  lib/
    supabase/                  -- Client (browser) and server (async cookies)
    contact-center/            -- Phone normalization, utilities
    quotations/                -- PDF capture
    permissions.ts             -- Permission groups and constants
    money.ts                   -- Currency rounding and discount helpers
  types/                       -- TypeScript interfaces per module
supabase/
  migrations/                  -- 130+ SQL migrations (applied via CLI)
  functions/                   -- Supabase Edge Functions
  config.toml                  -- Project configuration
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase CLI (`npx supabase`)
- Access to the Supabase project

### Installation

```bash
git clone <repository-url>
cd MMS
npm install
```

### Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Payment gateway
DIBSY_SECRET_KEY=<dibsy-secret-key>
NEXT_PUBLIC_DIBSY_PUBLIC_KEY=<dibsy-public-key>

# WhatsApp providers
WATI_API_URL=<wati-api-url>
WATI_API_TOKEN=<wati-api-token>
WHAPI_TOKEN=<whapi-token>
```

### Database

Link the Supabase project (first time only):

```bash
npx supabase link --project-ref wkmvjxxmzstsvahuiwsz
```

Apply pending migrations:

```bash
npx supabase db push
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses Turbopack for fast refresh.

### Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

### Build

```bash
npm run build
```

---

## Database

MMS uses a single Supabase project with 120+ tables. Key design decisions:

- **Row Level Security** is enabled on all tables with permissive policies for authenticated users (internal ERP -- all employees can access all data)
- **Division isolation** uses a JWT hook to scope data by the user's assigned divisions
- **FIFO inventory costing** with atomic RPCs for stock movements, reserved quantities, and COGS calculations
- **Approval chains** are configurable per division with cumulative tier thresholds

Migrations are managed via the Supabase CLI. All schema changes go through `supabase/migrations/` and are applied with `npx supabase db push`.

---

## Deployment

The application deploys to Vercel. Push to the main branch triggers a production deployment.

```bash
npm run build    # Verify the build succeeds locally
```

---

## Design System

| Token            | Value                         |
|------------------|-------------------------------|
| Primary          | Orange `#F97316`              |
| Secondary        | Blue `#3B82F6`                |
| Background       | White `#FFFFFF`               |
| Surface          | Slate-50 `#F8FAFC`           |
| Border           | Slate-200 `#E2E8F0`          |
| Text             | Slate-900 `#0F172A`          |
| Text Muted       | Slate-500 `#64748B`          |
| Success          | Green-500 `#22C55E`          |
| Destructive      | Red-500 `#EF4444`            |
| Warning          | Yellow-500 `#EAB308`         |

All UI is fully responsive across four breakpoints: mobile (<640px), tablet (640-1024px), desktop (1024-1920px), and large screen (>1920px).

---

## License

Proprietary. All rights reserved.
