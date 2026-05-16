# Service Customers Page — Design Spec

**Date:** 2026-05-16  
**Branch:** `fix/contact-centre-minor-issues` → target `develop`  
**Status:** Approved, ready for implementation planning

---

## Overview

A new Service Customers management page under Master Data. Replaces ad-hoc customer creation scattered across the Order form and Contact Centre panel with a proper CRUD interface. Uses the same visual pattern as the Suppliers page (DataTable + form dialog).

The page connects to the `service_customers` family of tables (separate from the `customers` table used by the Sales/Trading module).

---

## Database Changes

### Migration: `supabase/migrations/YYYYMMDDHHMMSS_service_customers_extra_fields.sql`

```sql
-- Add referral source to service_customers
ALTER TABLE public.service_customers
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

-- Link addresses to a specific phone number (nullable)
ALTER TABLE public.service_customer_addresses
  ADD COLUMN IF NOT EXISTS phone_id UUID
    REFERENCES public.service_customer_phones(id) ON DELETE SET NULL;
```

**Notes:**
- `is_blocked` and `customer_blocks` table already exist and are fully working — no migration needed for blacklist.
- `phone_id` on `service_customer_addresses` is nullable. An address with `phone_id = null` belongs to the customer globally (not tied to a specific number).
- RLS policies on existing tables already cover `ALL` for authenticated users — no new policies needed for the new columns.

---

## Existing Table Schema (reference)

### `service_customers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| name_ar | TEXT | |
| is_blocked | BOOLEAN | already exists |
| referral_source | TEXT | **new** |
| created_at / updated_at | TIMESTAMPTZ | |

### `service_customer_phones`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID FK | cascade delete |
| phone | TEXT NOT NULL | normalised to E.164 |
| label | TEXT | 'mobile' \| 'work' \| 'home' |
| is_primary | BOOLEAN | unique index enforces one per customer |
| created_at | TIMESTAMPTZ | |

### `service_customer_addresses`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_id | UUID FK | cascade delete |
| phone_id | UUID FK → `service_customer_phones` | **new**, nullable, SET NULL on delete |
| address_type | TEXT | `'blue-plate'` \| `'google-coords'` |
| label | TEXT | e.g. "Home", "Office" |
| unit / building / street / zone | TEXT | blue-plate fields |
| lat / lng | NUMERIC | GPS fields |
| is_primary | BOOLEAN | unique index enforces one per customer |
| is_geocoded | BOOLEAN | |
| waze_link | TEXT | auto-generated from lat/lng |
| tags | TEXT[] | |
| created_at | TIMESTAMPTZ | |

*Google Maps link is derived on the fly from lat/lng — no stored column needed: `https://maps.google.com/?q=lat,lng`*

---

## New Page: `/master-data/service-customers`

### File: `src/app/(dashboard)/master-data/service-customers/page.tsx`

**Pattern:** Identical to `src/app/(dashboard)/master-data/suppliers/page.tsx`

**Layout:**
- `PageHeader` — title "Service Customers", description "Manage customers for service orders", action button "Add Customer"
- `SearchInput` — filters by name or phone (server-side, debounced, paginated 50/page)
- `DataTable` with columns:

| Column | Source | Notes |
|---|---|---|
| Name | `service_customers.name` | Bold; red "Blocked" badge if `is_blocked` |
| Primary Phone | `service_customer_phones` where `is_primary = true` | `—` if none |
| Primary Address | `service_customer_addresses` where `is_primary = true` | Short formatted string; type badge (Blue Plate / GPS) |
| Referral Source | `service_customers.referral_source` | `—` if null |
| Actions | — | `...` dropdown → Edit |

- Pagination: 50 per page, same chevron pattern as existing customers page

---

## Dialog: `ServiceCustomerFormDialog`

### File: `src/components/master-data/ServiceCustomerFormDialog.tsx`

**Size:** `w-full sm:max-w-2xl`, full-screen on mobile  
**State:** controlled by `open` / `onOpenChange` / `customer` (null = create mode)  
**Validation:** `react-hook-form` + `zod`

### Section 1 — Basic Info
- **Name** (required, min 1 char)
- **Referral Source** (optional select): Walk-in · WhatsApp · Referral · Instagram · Other

### Section 2 — Phone Numbers
Dynamic list. At least one phone required on save.

Each row:
- Phone input (E.164, validated via `tryNormalisePhone`)
- Label select: Mobile / Work / Home
- "Primary" radio button (one selection enforced in UI, auto-selects first entry)
- Remove button (disabled if only one row)

"Add phone" link at bottom of section.

### Section 3 — Addresses
Dynamic list. Optional on create.

Each row is an expand-in-place form:
- Label (free text, e.g. "Home")
- Address type toggle: **Blue Plate** | **GPS Coordinates**
- **If Blue Plate**: Zone, Street, Building, Unit inputs
- **If GPS**: Lat + Lng inputs → auto-display clickable Google Maps link + auto-generated Waze link once both are filled
- **Linked phone** (optional select): shows the phone numbers entered in Section 2, "No specific phone" option
- "Primary" radio button
- Remove button

"Add address" link at bottom of section.

### Section 4 — Blacklist (edit mode only)
Displayed at bottom of dialog with a red border/background.

- Toggle: "Blacklist this customer" (maps to `is_blocked`)
- If toggled ON: reason textarea (required, posted to `customer_blocks` table)
- If toggled OFF (currently blocked): calls `unblockCustomer` pattern (sets `is_blocked = false`)

---

## Hook: `useServiceCustomers`

### File: `src/hooks/useServiceCustomers.ts`

```ts
// Query — paginated list with joined primary phone + primary address
useServiceCustomers(search: string, page: number)
// returns: { data: { customers: ServiceCustomerRow[], total: number }, isLoading }

// Mutation — create customer + phones + addresses
useCreateServiceCustomer()
// payload: { name, referral_source?, phones: PhoneInput[], addresses: AddressInput[] }
// strategy: create customer → insert phones (get IDs) → insert addresses with resolved phone_id

// Mutation — update
useUpdateServiceCustomer()
// payload: { id, name, referral_source?, is_blocked?, phones, addresses }
// strategy: update core fields → upsert phones (by id or insert new) → upsert addresses
//   delete removed phones/addresses by diffing original vs. submitted IDs
```

Types exported from the hook for use by the page and dialog.

---

## CRM Panel Updates (Contact Centre)

When a Wati conversation is opened for a phone number, the CRM panel should show the customer's saved addresses.

### `src/hooks/contact-center/useCustomerData.ts`
- Add addresses query: `service_customer_addresses` filtered by `customer_id`, ordered `is_primary DESC`
- Return `addresses` from hook

### `src/components/contact-center/CrmSection.tsx`
- In **view mode**, add an Addresses section below the phones list
- Each address row: label, formatted address string, type badge (Blue Plate / GPS), optional Google Maps + Waze link buttons
- Addresses linked to the active Wati phone (`phone_id` matching the current conversation's `wati_phone`) are shown first / highlighted
- If no addresses: show "No addresses saved" hint

---

## Navigation

### `src/components/layout/nav-config.ts`
Add to the Master Data `groups[1].items` (alongside Services, Teams, Subscriptions):

```ts
{ label: 'Service Customers', href: '/master-data/service-customers' }
```

---

## Data Flow Summary

```
User fills dialog
    → useCreateServiceCustomer()
        → INSERT service_customers (name, referral_source)
        → INSERT service_customer_phones[] (with is_primary)
        → INSERT service_customer_addresses[] (with phone_id resolved from phone row IDs)

Wati conversation opens for phone +974XXXXXXXX
    → chat_conversations joined with service_customers → customer_name shown in list
    → CRM panel: useCustomerData(customerId)
        → fetch service_customers (name, is_blocked, ...)
        → fetch service_customer_phones
        → fetch service_customer_addresses  ← NEW
    → CrmSection view mode renders name + phones + addresses
    → addresses with phone_id matching the Wati phone are highlighted
```

---

## Files To Create / Modify

| Action | File |
|---|---|
| CREATE | `supabase/migrations/YYYYMMDDHHMMSS_service_customers_extra_fields.sql` |
| CREATE | `src/app/(dashboard)/master-data/service-customers/page.tsx` |
| CREATE | `src/components/master-data/ServiceCustomerFormDialog.tsx` |
| CREATE | `src/hooks/useServiceCustomers.ts` |
| MODIFY | `src/components/layout/nav-config.ts` |
| MODIFY | `src/hooks/contact-center/useCustomerData.ts` |
| MODIFY | `src/components/contact-center/CrmSection.tsx` |

---

## Out of Scope

- Editing addresses from the CRM panel directly (addresses are managed from this new page)
- Bulk import of customers
- Customer merge / deduplication
- Arabic name (`name_ar`) field in the dialog (field exists in DB, can be added later)
