# Alfaytri System — System Requirements Specification

**Document Version:** 1.0  
**Date:** May 2026  
**Status:** Living Document  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Stakeholders & User Roles](#3-user-roles)
4. [Business Divisions](#4-business-divisions)
5. [Functional Requirements](#5-functional-requirements)
   - 5.1 Authentication & Authorization
   - 5.2 Master Data — Teams & Employees
   - 5.3 Master Data — Services
   - 5.4 Master Data — Suppliers & Customers
   - 5.5 Master Data — Inventory & Tools
   - 5.6 Purchase Module
   - 5.7 Sales Module
   - 5.8 Contracts Module
   - 5.9 Notifications
   - 5.10 Audit Trail & Activity Logging
   - 5.11 Administration
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [Data Architecture](#8-data-architecture)
9. [Integrations](#9-integrations)
10. [Design System](#10-design-system)
11. [Deployment](#11-deployment)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for the **Alfaytri System** (internally codenamed MMS — Maintenance Management System). It serves as the authoritative reference for development, testing, and stakeholder alignment.

### 1.2 Scope

The Alfaytri System is a multi-division enterprise web application for managing field operations, procurement, sales, and workforce across Alfaytri's companies in the Gulf Cooperation Council (GCC) region. The system centralises team scheduling, asset tracking, purchase and sales order flows, inventory accounting, and service management.

### 1.3 Companies in Scope

| Company | Division Slug | Primary Activity |
|---|---|---|
| Alfaytri Maintenance | `alfaytri-maintenance` | HVAC, Plumbing, Electrical Maintenance |
| Alfaytri Kitchen | `alfaytri-kitchen` | Commercial Kitchen Equipment Services |
| RSH | `rsh` | Cleaning & Pest Control Services |

### 1.4 Operating Countries

Qatar (primary), Saudi Arabia, UAE, Kuwait, Bahrain, Oman, Egypt, Pakistan, India, Bangladesh.

---

## 2. System Overview

### 2.1 High-Level Description

The Alfaytri System is a single-page web application (SPA) built on Next.js 15 (App Router), backed by a managed PostgreSQL database via Supabase. It exposes a dashboard-style interface organised into the following top-level modules:

- **Master Data** — foundational reference data (teams, services, suppliers, customers, users)
- **Purchase & Sales** — procurement and revenue order flows with approval chains
- **Contracts** — long-term service agreements
- **Teams** — field workforce and vehicle management

### 2.2 Key Capabilities Summary

| Capability | Description |
|---|---|
| Multi-company, multi-division | Data is scoped per division; users are assigned to one or more divisions |
| Role-based access control | Four user roles with granular permission flags |
| Real-time drag-and-drop team builder | Assign employees and vehicles to teams via DnD |
| Purchase approval chain | Configurable multi-step PO approval workflow |
| Inventory & FIFO costing | Warehouse-level stock tracking with FIFO cost accounting |
| Activity audit trail | Every entity change logged with actor, timestamp, before/after data |
| QR code support | Asset and inventory items generate scannable QR codes |
| CSV import | Bulk data import for inventory and master data |
| Responsive design | Full support from mobile (320 px) to 4K displays |

---

## 3. User Roles

### 3.1 User Roles

| Role | Code | Description |
|---|---|---|
| Owner | `owner` | Full access to all modules and companies; bypasses division scoping |
| Accountant | `accountant` | Financial view access (invoices, payments, credit notes); global viewer |
| Purchase Manager | `purchase_manager` | Manages purchase orders, approvals, shipments, receivals |
| Employee | `employee` | Scoped to their assigned division; limited read/write based on granted permissions |

### 3.2 Permission Flags

Beyond roles, individual feature flags can be granted per user via **Custom Roles**. Examples include:

- `master_data.teams.view` / `manage`
- `master_data.services.view` / `manage`
- `master_data.suppliers.view` / `manage`
- `master_data.customers.view` / `manage`
- `master_data.users.view` / `manage`
- `master_data.divisions.view` / `manage`
- `purchase.orders.view` / `manage` / `approve`
- `sales.orders.view` / `manage`

### 3.3 Division Scoping

Non-owner/accountant users see only records belonging to their assigned division(s). Division membership is stored in the `user_divisions` junction table and encoded into the Supabase JWT at login time via a custom claims hook.

---

## 4. Business Divisions

### 4.1 Division Taxonomy

The system uses two parallel concepts:

| Concept | Purpose | Examples |
|---|---|---|
| `team_division` enum | Identifies which company a **team** belongs to | `alfaytri-maintenance`, `alfaytri-kitchen`, `rsh` |
| `divisions` table | UUID-based division records used for procurement, sales, and user scoping | Maintenance, Kitchen, Cleaning, Pest Control |

### 4.2 Division Isolation Rules

- Purchase Orders and Sale Orders carry a `division_id` (UUID) FK.
- RLS policies on PO/SO tables use a PostgreSQL function `is_division_visible(division_id)` that checks the JWT claims.
- Owners and Accountants bypass division filtering (super-viewer).
- All other roles see only rows where `division_id = ANY(jwt.division_ids)`.

---

## 5. Functional Requirements

---

### 5.1 Authentication & Authorization

| ID | Requirement |
|---|---|
| AUTH-01 | The system MUST authenticate users via Supabase Auth (email + password). |
| AUTH-02 | Session tokens MUST be stored in HTTP-only cookies managed by `@supabase/ssr`. |
| AUTH-03 | The system MUST inject division_ids and user_type into the Supabase JWT via a custom `handle_new_user` trigger / claims hook. |
| AUTH-04 | All database tables with user-facing data MUST have Row Level Security (RLS) enabled. |
| AUTH-05 | Unauthenticated requests to any dashboard route MUST redirect to `/login`. |
| AUTH-06 | The system MUST support role-based navigation — menu items invisible to unauthorised users are hidden, not just disabled. |
| AUTH-07 | Admin users MUST be bootstrapped via the `ADMIN_BOOTSTRAP_EMAIL` environment variable. |

---

### 5.2 Master Data — Teams & Employees

#### 5.2.1 Teams

| ID | Requirement |
|---|---|
| TEAM-01 | Each team belongs to exactly one company division (`alfaytri-maintenance`, `alfaytri-kitchen`, or `rsh`). |
| TEAM-02 | A team has: English name, Arabic name (optional), phone number, type (Normal / QC / Emergency), site-visit flags (Orders, Contracts), Traccar GPS device ID (optional). |
| TEAM-03 | Teams can be soft-deleted (archived) via `deleted_at`. Archived teams do not appear in active lists. |
| TEAM-04 | The team grid view supports two density modes: **Card** and **List**. |
| TEAM-05 | The team grid MUST be filterable by division and searchable by team name. |
| TEAM-06 | All changes to a team MUST be written to the `team_activity_log` with actor, timestamp, before/after data. |

#### 5.2.2 Employees

| ID | Requirement |
|---|---|
| EMP-01 | An employee record contains: full name, Arabic name, phone (with country-code selector), nationality, join date, avatar/photo, status, assigned team. |
| EMP-02 | Employee statuses: `active`, `unassigned`, `vacation`, `on-task`, `archived`. |
| EMP-03 | Employees can be assigned a set of skills via a hierarchical **Service Tree** (category → service → sub-service). |
| EMP-04 | Employees can be assigned to a team via drag-and-drop from the Pool Sidebar, or via the Employee Edit Dialog. |
| EMP-05 | One employee per team can be designated as **Leader** (shown with a crown icon). |
| EMP-06 | Employees can be **Disabled** (status → archived with log entry) or **Re-enabled** without losing history. |
| EMP-07 | An employee can be **Removed** from their current team (team_id set to null). |
| EMP-08 | Employee photos MUST be stored in a Supabase Storage bucket. |
| EMP-09 | The employee pool sidebar MUST filter by status tab (All, Active, Unassigned, Vacation, On Task). |
| EMP-10 | All employee changes MUST be logged to `team_activity_log`. |

#### 5.2.3 Vehicles

| ID | Requirement |
|---|---|
| VEH-01 | A vehicle record contains: licence plate, type, Traccar GPS device ID (optional). |
| VEH-02 | Vehicles can be assigned to teams via drag-and-drop from the Pool Sidebar. |
| VEH-03 | Each team can have at most one vehicle assigned at a time. |
| VEH-04 | Vehicles support soft-delete. A soft-deleted vehicle's plate may be re-used. |
| VEH-05 | Duplicate plate validation MUST exclude soft-deleted records. |
| VEH-06 | All vehicle changes MUST be logged to `team_activity_log`. |

#### 5.2.4 Schedules

| ID | Requirement |
|---|---|
| SCH-01 | Schedules define working days (Sun–Sat), shift start/end times, and break time (start + duration in minutes). |
| SCH-02 | A schedule can be assigned to one or more teams. |
| SCH-03 | Schedules support a **View** (read-only) mode in addition to Edit mode. |
| SCH-04 | Schedules support soft-delete. |

#### 5.2.5 Tool Assignment (Teams)

| ID | Requirement |
|---|---|
| TOOL-01 | Tool units (from the Tools & Assets catalogue) can be assigned to teams via the Team Tools Sheet. |
| TOOL-02 | The Tools Sheet shows assigned units with: tool name, serial number, brand, condition badge. |
| TOOL-03 | Adding a tool requires: select tool type → select available unit → confirm. Only units with `status = 'available'` are shown. |
| TOOL-04 | Removing a tool unit from a team deletes the `tool_assignments` record. |
| TOOL-05 | Team cards display a wrench icon with a count of assigned tool units. |

#### 5.2.6 Activity Log

| ID | Requirement |
|---|---|
| LOG-01 | The Activity Log Panel is a right-side sheet accessible from any team, employee, or vehicle. |
| LOG-02 | Log entries display: human-readable action label, entity type badge, actor full name, clickable timestamp. |
| LOG-03 | Clicking the timestamp toggles between relative time ("8 minutes ago") and exact time ("May 4, 2026 · 10:30 AM"). |
| LOG-04 | Data summaries MUST NOT display raw UUIDs or `_id` fields. |
| LOG-05 | Logs are filterable by entity type (All, Team, Employee, Vehicle, Schedule). |
| LOG-06 | Every `logActivity` call MUST capture the authenticated user's ID as `actor_id`. |

---

### 5.3 Master Data — Services

| ID | Requirement |
|---|---|
| SVC-01 | Services are organised in a tree: **Category → Service → Sub-service** (unlimited depth). |
| SVC-02 | Each service node has: English name, Arabic name, division(s), photo requirement flag, description. |
| SVC-03 | Services support four display tabs: **Normal**, **Contract**, **Mobile**, **Notifications**, **Instructions**, **Inventory**, **Promotions**. |
| SVC-04 | The **Tools & Assets** tab manages the tool catalogue: items (name, category) and units (serial number, brand, condition, status, expiry). |
| SVC-05 | The **Service Links** tab manages relationships between services and external resources. |
| SVC-06 | Services support soft-delete and restore. |
| SVC-07 | Service trees support bulk selection with "Select all" / "Deselect all" at each level. |

---

### 5.4 Master Data — Suppliers & Customers

| ID | Requirement |
|---|---|
| SUP-01 | Supplier records: name, country, VAT number, credit terms, contact details. |
| CUS-01 | Customer records: name, type, credit group, contact details, billing address. |
| CUS-02 | Customers can be assigned to **Credit Groups** with shared credit limits and payment terms. |
| SUP-02 | Both suppliers and customers support CSV bulk import. |

---

### 5.5 Master Data — Inventory & Tools

| ID | Requirement |
|---|---|
| INV-01 | Inventory items are categorised and tracked per warehouse with FIFO cost accounting. |
| INV-02 | Each inventory item has: SKU, brand variants, unit of measure, reorder level. |
| INV-03 | Stock moves are recorded on every receival, delivery, and return. |
| INV-04 | Dead stock reports show items with no movement within a configurable period. |
| INV-05 | The system maintains a running FIFO cost ledger per item per warehouse. |
| WAR-01 | Warehouses are scoped to divisions. |
| WAR-02 | Inter-warehouse transfers are supported with approval. |

---

### 5.6 Purchase Module

#### 5.6.1 Purchase Orders

| ID | Requirement |
|---|---|
| PO-01 | Purchase Orders have: supplier, division, line items (product/quantity/price), currency, delivery terms, notes. |
| PO-02 | POs go through a configurable **Approval Chain** before they can be actioned. |
| PO-03 | The approval chain is configurable per division; a global fallback chain can be defined. |
| PO-04 | PO statuses: Draft → Pending Approval → Approved → Received (partial/full) → Closed. |
| PO-05 | Approved POs generate **Receivals** (Goods Receipt Notes). |
| PO-06 | Partial receivals are supported; a PO remains open until fully received or manually closed. |
| PO-07 | POs support **Returns** (reverse GRN with restocking). |
| PO-08 | POs support **RFQ** (Request for Quotation) as an optional pre-PO step. |
| PO-09 | Landed costs (freight, customs, duties) can be allocated to PO lines post-receival. |
| PO-10 | Shipment tracking records can be attached to POs with status progression (Pending → In Transit → Customs → Delivered). |

#### 5.6.2 Supplier Bills & Payments

| ID | Requirement |
|---|---|
| BILL-01 | Supplier bills are generated from receivals; manual bills are also supported. |
| BILL-02 | Bills support line-item discounts and tax (VAT). |
| PAY-01 | Payments can be attached to multiple bills; partial payment is supported. |
| PAY-02 | Credit notes from suppliers reduce outstanding balance. |

---

### 5.7 Sales Module

#### 5.7.1 Sale Orders

| ID | Requirement |
|---|---|
| SO-01 | Sale Orders (Service Orders) have: customer, division, service lines, pricing, payment terms. |
| SO-02 | SO statuses: Draft → Confirmed → Delivered (partial/full) → Invoiced → Closed. |
| SO-03 | Deliveries record service fulfilment against SO lines. |
| SO-04 | Invoices are generated from confirmed/delivered SOs. |
| SO-05 | SO returns generate credit notes. |

#### 5.7.2 Customer Invoices & Payments

| ID | Requirement |
|---|---|
| INV-01 | Invoices are auto-numbered and include tax (VAT). |
| PAY-01 | Customer payments (cash and credit) attach to invoices. |
| PAY-02 | Debit notes record additional charges post-invoice. |
| PAY-03 | Credit notes record discounts or return credits. |

---

### 5.8 Contracts Module

| ID | Requirement |
|---|---|
| CON-01 | Contracts represent long-term service agreements with customers. |
| CON-02 | Contracts have: customer, services, start/end dates, billing schedule, assigned team. |
| CON-03 | Contract status tracks active, expired, and cancelled states. |

---

### 5.9 Notifications

| ID | Requirement |
|---|---|
| NOTIF-01 | The system supports configurable notification templates per service and event trigger. |
| NOTIF-02 | Notification channels include: in-app, and (future) email/SMS. |
| NOTIF-03 | A Notification Trail page shows all sent notifications with status. |
| NOTIF-04 | Reminders can be scheduled per service or customer with category-based grouping. |

---

### 5.10 Audit Trail & Activity Logging

| ID | Requirement |
|---|---|
| AUDIT-01 | A global Audit Trail page shows all system activity across all modules. |
| AUDIT-02 | The `team_activity_log` table records team-module actions with: `entity_id`, `entity_type`, `action`, `before_data`, `after_data`, `actor_id`, `created_at`. |
| AUDIT-03 | Logs are immutable — no update or delete is permitted on log entries. |
| AUDIT-04 | `actor_id` MUST be the authenticated Supabase user ID at the time of the action. |
| AUDIT-05 | Activity log entries are retained indefinitely. |

---

### 5.11 Administration

| ID | Requirement |
|---|---|
| ADM-01 | **User Management:** Admins can invite users, assign roles, and assign division memberships. |
| ADM-02 | **Custom Roles:** Granular permission flags can be bundled into named roles and assigned to users. |
| ADM-03 | **Approval Settings:** Approval chains are configurable via the Admin UI (per division or global). |
| ADM-04 | **Brand Groups:** Product brand hierarchies are manageable via the Admin UI. |
| ADM-05 | **Credit Groups:** Shared credit limits for customer segments. |
| ADM-06 | **Reason Lists:** Configurable drop-down reasons for returns, rejections, etc. |
| ADM-07 | **Companies:** Multi-company configuration with division mappings. |
| ADM-08 | **Warehouses:** Admin can create and configure warehouses per division. |
| ADM-09 | **QuickBooks Integration:** Division-level accounting mappings (planned). |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement |
|---|---|
| PERF-01 | Initial page load (LCP) MUST be < 3 seconds on a 10 Mbps connection. |
| PERF-02 | API queries for list views MUST return results within 1 second for datasets up to 400,000 rows. |
| PERF-03 | TanStack Query cache stale times MUST be tuned per entity (10 s for activity logs, 30 s for master data, 5 min for static lookups). |
| PERF-04 | Tool count and employee count per team MUST use a single aggregated query (no N+1 per card). |

### 6.2 Responsiveness

| Breakpoint | Target Device | Requirement |
|---|---|---|
| < 640 px | Mobile phone | Full functionality; drawers replace modals; tables collapse to card layout |
| 640 – 1024 px | Tablet | Two-column layouts; sidebars collapse |
| 1024 – 1920 px | Laptop / Desktop | Full layout with sidebars |
| > 1920 px | TV / Large Monitor | Typography and spacing scale up; no fixed-pixel containers |

| ID | Requirement |
|---|---|
| RESP-01 | All touch targets MUST be ≥ 44 px tall on mobile (`min-h-11`). |
| RESP-02 | Dialogs and modals MUST be full-screen on mobile and centered cards on tablet+. |
| RESP-03 | Drag-and-drop interactions MUST have a touch-friendly fallback (`touch-none` on handles). |

### 6.3 Accessibility

| ID | Requirement |
|---|---|
| ACC-01 | All interactive elements MUST be keyboard-navigable. |
| ACC-02 | ARIA labels MUST be present on icon-only buttons. |
| ACC-03 | Colour contrast for text MUST meet WCAG 2.1 AA (4.5:1 minimum). |
| ACC-04 | Form fields MUST have visible labels and validation messages. |

### 6.4 Security

| ID | Requirement |
|---|---|
| SEC-01 | All database tables with user data MUST have RLS enabled. |
| SEC-02 | Service role key MUST never be exposed to the browser; only the anon key is used client-side. |
| SEC-03 | File uploads MUST be validated for type and size before storage. |
| SEC-04 | SQL injection is prevented by using parameterised Supabase queries exclusively (no raw SQL in client code). |
| SEC-05 | Division isolation MUST be enforced at the database layer via RLS, not only in the UI. |

### 6.5 Reliability

| ID | Requirement |
|---|---|
| REL-01 | The system MUST have 99.5% uptime (excluding Supabase platform maintenance). |
| REL-02 | All mutations MUST display a user-visible error if they fail; no silent failures. |
| REL-03 | Optimistic UI updates MUST be rolled back if the server mutation fails. |

### 6.6 Internationalisation

| ID | Requirement |
|---|---|
| I18N-01 | Arabic name fields MUST render RTL (`dir="rtl"`) wherever displayed. |
| I18N-02 | Phone number inputs MUST include a country-code selector covering GCC + South Asia (QA, SA, AE, KW, BH, OM, EG, PK, IN, BD). |
| I18N-03 | Dates and times MUST display in the user's locale (future: configurable per-user timezone). |

---

## 7. Technical Architecture

### 7.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router, Turbopack) | 15.x |
| Language | TypeScript | 5.x |
| UI Components | shadcn/ui + Radix UI primitives | Latest |
| Styling | Tailwind CSS | 3.4.x |
| State / Cache | TanStack React Query | 5.x |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| Drag & Drop | dnd-kit | 6.x |
| Backend / DB | Supabase (PostgreSQL 15) | 2.x client |
| Auth | Supabase Auth (SSR cookies) | — |
| Storage | Supabase Storage | — |
| Date handling | date-fns | 4.x |
| Testing | Vitest + Testing Library | 4.x / 16.x |

### 7.2 Application Layers

```
Browser
  └── Next.js App Router (RSC + Client Components)
        ├── Route Handlers (API layer where needed)
        ├── TanStack Query (client-side cache)
        │     └── Supabase JS Client (anon key)
        └── Supabase Auth (session via SSR cookies)

Supabase Platform
  ├── PostgreSQL 15 (RLS on all tables)
  ├── Auth (JWT with custom claims)
  ├── Storage (avatars, division assets, attachments)
  └── PostgREST (auto-generated REST API)
```

### 7.3 Key Architectural Patterns

| Pattern | Usage |
|---|---|
| Server Components | Page-level data pre-fetch (auth guard, initial data) |
| Client Components | Interactive widgets (forms, DnD, dialogs, tables) |
| Context + Hooks | Per-module state (TeamsPageContext, etc.) |
| Optimistic updates | Mutations update the cache before server confirms |
| Soft-delete | `deleted_at TIMESTAMPTZ` on all mutable entity tables |
| FIFO accounting | Inventory cost is computed in PostgreSQL functions |
| Approval chain | Multi-step PO approvals via `approval_chains` + `approval_role_assignments` |

---

## 8. Data Architecture

### 8.1 Core Entity Tables

| Table | Description |
|---|---|
| `profiles` | One row per auth user; stores name, role, division membership |
| `divisions` | Company division registry (UUID-based) |
| `user_divisions` | Many-to-many: users ↔ divisions |
| `teams` | Field teams per company |
| `employees` | Field workforce; FK to team |
| `vehicles` | Fleet; FK to team |
| `schedules` | Work shift definitions |
| `team_schedule_assignments` | Team ↔ schedule history |
| `services` | Hierarchical service catalogue |
| `tool_asset_items` | Tool type catalogue |
| `tool_asset_units` | Individual tool instances (serial numbers) |
| `tool_assignments` | Team/employee ↔ tool unit assignments |
| `team_activity_log` | Immutable audit log for team-module actions |

### 8.2 Procurement Tables

| Table | Description |
|---|---|
| `purchase_orders` | PO header |
| `purchase_order_lines` | PO line items |
| `receivals` | Goods receipt notes |
| `receival_lines` | Individual receival line items |
| `supplier_bills` | AP invoices from suppliers |
| `supplier_payments` | Payments against bills |
| `shipments` | Logistics tracking per PO |
| `landed_costs` | Freight/duty allocation post-receival |

### 8.3 Sales Tables

| Table | Description |
|---|---|
| `sale_orders` | SO header |
| `sale_order_lines` | SO line items |
| `deliveries` | Fulfilment records |
| `customer_invoices` | AR invoices |
| `customer_payments` | Payments against invoices |
| `credit_notes` | Customer credits |
| `debit_notes` | Additional charges post-invoice |

### 8.4 Row Level Security Summary

Every table enforces RLS. The general pattern:

- **Owners & Accountants:** `USING (true)` — see everything
- **Division-scoped users:** `USING (is_division_visible(division_id))` — see only their division's rows
- **Employees:** read-only or no access depending on permission flags

---

## 9. Integrations

### 9.1 Traccar GPS

- Vehicles and teams can be linked to a Traccar device by storing `traccar_device_id`.
- Live tracking integration is a future phase item.

### 9.2 QuickBooks

- Division-level accounting mappings (`qb_division_mappings` table) link internal categories to QuickBooks chart of accounts.
- Transaction import and financial sync are planned features.

### 9.3 Supabase Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `employee-avatars` | Employee profile photos | Authenticated upload; public read |
| `division-assets` | Division logos and branding | Authenticated upload; public read |
| `attachments` | PO/SO document attachments | Authenticated only |

---

## 10. Design System

### 10.1 Colour Palette

| Role | Hex | Tailwind Class |
|---|---|---|
| Primary (Orange) | `#F97316` | `orange-500` |
| Secondary (Blue) | `#3B82F6` | `blue-500` |
| Success | `#22C55E` | `green-500` |
| Destructive | `#EF4444` | `red-500` |
| Warning | `#EAB308` | `yellow-500` |
| Background | `#FFFFFF` / `#09090B` | `background` |

### 10.2 Component Library

All UI components come from **shadcn/ui** (Radix UI primitives + Tailwind). Custom components extend this library and follow the same naming and styling conventions.

### 10.3 Typography & Spacing

- Base font: System sans-serif stack
- Minimum touch target height: `min-h-11` (44 px)
- Dialog max width: `max-w-lg` (desktop), full-screen (mobile)
- Sheet width: `sm:w-96` or `sm:w-[420px]` depending on content density

---

## 11. Deployment

### 11.1 Environments

| Environment | URL Pattern | Database |
|---|---|---|
| Development | `localhost:3000` | Local Supabase or remote dev project |
| Staging | TBD | Supabase staging project |
| Production | TBD | Supabase project `wkmvjxxmzstsvahuiwsz` |

### 11.2 Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `ADMIN_BOOTSTRAP_EMAIL` | Email address auto-promoted to admin on first login |

### 11.3 Database Migrations

- Migration files are stored in `supabase/migrations/` and tracked by Supabase CLI.
- All migrations MUST be applied via `npx supabase db push` — never via manual SQL execution.
- Migration filenames follow the pattern `YYYYMMDDHHMMSS_description.sql`.
- Editing a migration file after it has been pushed to the remote is forbidden; create a new migration instead.

### 11.4 CI/CD (Planned)

- GitHub Actions pipeline: lint → type-check → test → build → deploy.
- Database migrations run automatically on merge to `main`.

---

*End of Alfaytri System Requirements Specification v1.0*
