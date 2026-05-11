# Pre-CRM Patch — Design Spec

**Date:** 2026-05-11  
**Branch:** `feature/orders-module`  
**Status:** Approved — ready for implementation planning

---

## Overview

Four targeted patches to complete before starting the Contact Centre / CRM module:

1. Split service customers from SO customers into a dedicated table
2. Scope teams by Company → Division (replace hardcoded enum with FK)
3. Filter the Create Order division dropdown to the logged-in user's assigned divisions
4. Lock service selection in Create Order until a division is chosen

---

## Patch 1 — Service Customers Table Split

### Goal

The existing `customers` table is shared between Sales Orders (SO) and field-service Orders/Quotations. These are different customer populations with different data needs. This patch creates a clean, independent `service_customers` table for all field-service workflows.

### New Tables

#### `service_customers`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | default gen_random_uuid() |
| `name` | TEXT NOT NULL | Customer display name |
| `name_ar` | TEXT | Arabic name (optional) |
| `created_at` | TIMESTAMPTZ | default now() |
| `updated_at` | TIMESTAMPTZ | default now() |

#### `service_customer_phones`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_id` | UUID FK → service_customers(id) ON DELETE CASCADE | |
| `phone` | TEXT NOT NULL | |
| `label` | TEXT | e.g. 'mobile', 'work', 'home' |
| `is_primary` | BOOLEAN | default false |
| `created_at` | TIMESTAMPTZ | default now() |

Constraint: exactly one phone per customer can have `is_primary = true` (enforced in application logic).

#### `service_customer_addresses`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_id` | UUID FK → service_customers(id) ON DELETE CASCADE | |
| `address_type` | TEXT CHECK ('blue-plate', 'google-coords') | |
| `label` | TEXT | e.g. 'Home', 'Office', 'Site A' |
| `unit` | TEXT | Blue Plate: unit number |
| `building` | TEXT | Blue Plate: building |
| `street` | TEXT | Blue Plate: street |
| `zone` | TEXT | Blue Plate: zone |
| `lat` | NUMERIC | GPS latitude |
| `lng` | NUMERIC | GPS longitude |
| `is_primary` | BOOLEAN | default false |
| `tags` | TEXT[] | e.g. ['MEP', 'Contract'] |
| `created_at` | TIMESTAMPTZ | default now() |

### Orders Table Change

Rename FK column on `orders`:
- Remove: `customer_id UUID FK → customers(id)`
- Add: `service_customer_id UUID FK → service_customers(id)`

Migration backfills `service_customer_id` by:
1. Inserting one `service_customers` row per distinct `customer_id` currently referenced by `orders` (copying `name`, `name_ar` from `customers`)
2. Inserting into `service_customer_phones` using `customers.phone` as the primary phone
3. Setting `orders.service_customer_id` from the newly created `service_customers` rows
4. Dropping the old `customer_id` column from `orders`

### Quotations Table Change

Same pattern as orders:
- Remove: `customer_id UUID FK → customers(id)` from `quotations`
- Add: `service_customer_id UUID FK → service_customers(id)`
- Migration backfills identically to orders migration above

### SO Side — Unchanged

The existing `customers` table, `customer_addresses`, `credit_groups`, and all `sale_orders` FKs remain untouched.

### Customer Lookup — Both Workflows

The phone-number lookup modal used in **Create Order** and **Create Quotation** must query `service_customer_phones` joined to `service_customers`. The old lookup against `customers` is replaced entirely in both panels.

Search behaviour:
- User types a phone number fragment
- Query: `service_customer_phones WHERE phone ILIKE '%<input>%'` → join to `service_customers`
- Returns: customer name, primary phone, all phones for that customer
- If no match → offer "Create new customer" inline

### Frontend Files Affected

| File | Change |
|---|---|
| `src/components/orders/OrderFormPanel.tsx` | Customer picker queries `service_customers` + `service_customer_phones` |
| `src/components/quotations/QuotationFormPanel.tsx` | Same — replace `customers` lookup with `service_customers` |
| `src/hooks/useCreateOrder.ts` | Use `service_customer_id` field instead of `customer_id` |
| `src/hooks/useEditOrder.ts` | Same |
| `src/hooks/useCreateQuotation.ts` | Use `service_customer_id` field |

### RLS

- `service_customers`: internal users can SELECT; admins can INSERT/UPDATE
- `service_customer_phones`: same
- `service_customer_addresses`: same

---

## Patch 2 — Teams Scoped by Company → Division

### Goal

The `teams.division` column is a hardcoded enum (`alfaytri-maintenance`, `alfaytri-kitchen`, `rsh`). This is brittle — adding a new division requires a code + DB change. Replace it with a FK to the existing `divisions` table, which already carries `company_id`.

### DB Change

1. Add column: `division_id UUID FK → divisions(id)` (nullable during migration, NOT NULL after backfill)
2. Backfill: match each enum value to the correct `divisions.id`
   - `'alfaytri-maintenance'` → Alfaytri Maintenance division UUID
   - `'alfaytri-kitchen'` → Alfaytri Kitchen division UUID  
   - `'rsh'` → RSH Kitchen division UUID
3. Set `division_id` NOT NULL
4. Drop old `division` enum column
5. Drop `team_division` enum type if no longer referenced

### Create Team Form (Master Data UI)

Replace the current single division picker with a two-step cascade:

1. **Company** dropdown — lists all companies (from `companies` table)
2. **Division** dropdown — filtered to divisions where `company_id = selected company`

Both are required before the form can be submitted.

### Team List View

Group teams visually in the Master Data team list by Company → Division:

```
Alfaytri
  └─ Maintenance   Team A  ·  Team B  ·  Team C
  └─ Trading       Team D  ·  Team E

RSH Kitchen
  └─ Operations    Team F  ·  Team G
```

### Downstream Impact

Any component that currently filters teams by the old `division` enum value must switch to filtering by `division_id`:
- Calendar team rows
- Create Order team assignment picker
- Any report or list filtered by division

---

## Patch 3 — Division Dropdown Filtered by User Access

### Goal

The Create Order division dropdown currently calls `useDivisions()` which returns **all** active divisions. It should only show the divisions assigned to the logged-in user.

### Change

In `OrderFormPanel.tsx`, replace:
```ts
const { divisions } = useDivisions()
```
with:
```ts
const { divisions } = useUserCompanyDivisions()
```

`useUserCompanyDivisions()` already exists (`src/hooks/useUserCompanyDivisions.ts`) and:
- Returns only divisions assigned to the current user via `user_divisions`
- Falls back to all active divisions if the user has no `user_divisions` rows (admin)

No DB change. No migration. Single line swap.

---

## Patch 4 — Lock Services Until Division Selected

### Goal

In Create Order, the SERVICES section is currently interactive even before a division is selected. Services are division-specific — showing them before a division is chosen is misleading and can lead to invalid combinations.

### Change

In `OrderFormPanel.tsx`, wrap the SERVICES section with a disabled state:

- When `selectedDivisions.length === 0`:
  - Render services section with `opacity-50 pointer-events-none`
  - Show hint text: *"Select a division first"*
- When `selectedDivisions.length >= 1`:
  - Render normally — `divisionFilters` already flows into `ServiceSelector`

No DB change. No migration. UI-only guard.

---

## Implementation Order

These patches are largely independent but should be built in this sequence to avoid FK conflicts:

1. **Patch 1** (service customers) — DB migration first, then frontend
2. **Patch 2** (teams division FK) — DB migration, then UI update
3. **Patch 3** (division filter) — single hook swap, any order
4. **Patch 4** (service lock) — UI only, any order

Patches 3 and 4 can be done in the same commit since they're both single-file changes to `OrderFormPanel.tsx`.

---

## Out of Scope

- Customer management UI (create/edit service customers) — deferred to CRM module
- Address creation UI for service customers — deferred to CRM module
- Installed products, invoices on service customers — deferred
- Team Leader mobile app — separate workstream
