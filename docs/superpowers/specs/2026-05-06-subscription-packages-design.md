# Subscription Packages — Design Spec

**Date:** 2026-05-06  
**Branch:** `feature/subscription-module`  
**Route:** `/master-data/subscriptions`  
**Color theme:** Orange + white (primary accent throughout)

> **Rev 2 — 2026-05-06:** Incorporates code-review findings: atomic RPC for service updates, DB view for subscriber counts, financial snapshotting, per-service discount overrides, RESTRICT on service FK, SLA strict-mode validation, and service tree search.

---

## Overview

Admin-side master data page for defining annual customer loyalty tiers (e.g. Bronze / Silver / Gold). Each package gives subscribing customers a percentage discount on selected services and a priority SLA for 12 months. This page only manages the package catalog — customer subscription sign-ups, payments, and usage are handled downstream.

---

## 1. Database Schema

### `subscription_packages`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `name` | `text` NOT NULL | English label |
| `name_ar` | `text` | Arabic, RTL display |
| `description` | `text` | |
| `discount_percent` | `numeric(5,2)` NOT NULL DEFAULT 0 | Package-level default 0–100; per-service override lives on junction |
| `initial_fee` | `numeric(10,2)` NOT NULL DEFAULT 0 | QAR yearly upfront (display only — actual charged amount snapshotted on customer_subscriptions) |
| `duration_months` | `int` NOT NULL DEFAULT 12 | |
| `priority_response` | `text` NOT NULL DEFAULT 'none' | CHECK IN ('none','24_48hr','under_24hr') |
| `response_hours` | `int` | NULL when priority = 'none'. Validated per-band: none→NULL, 24_48hr→25–48, under_24hr→1–24 |
| `auto_renew_default` | `bool` NOT NULL DEFAULT true | |
| `is_active` | `bool` NOT NULL DEFAULT true | soft-archive flag |
| `created_by_name` | `text` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `subscription_package_services` (junction)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `package_id` | `uuid` NOT NULL FK → `subscription_packages(id)` ON DELETE CASCADE | |
| `service_id` | `uuid` NOT NULL FK → `services(id)` **ON DELETE RESTRICT** | Prevents silent removal — service must be removed from all packages before deletion |
| `discount_override` | `numeric(5,2)` | NULL = use package default; set to override for this specific service (e.g. Gold gives 20% off labor but 5% off parts) |
| UNIQUE | `(package_id, service_id)` | |

**Effective discount rule (at order time):** `COALESCE(sps.discount_override, sp.discount_percent)`

### `customer_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `customer_id` | `uuid` NOT NULL | FK → customers |
| `package_id` | `uuid` NOT NULL FK → `subscription_packages(id)` | |
| `price_paid` | `numeric(10,2)` NOT NULL | **Financial snapshot** — `initial_fee` at time of purchase; never changes even if package price is updated |
| `discount_percent_snapshot` | `numeric(5,2)` NOT NULL | Snapshot of package default discount at signup |
| `start_date` | `date` NOT NULL | |
| `end_date` | `date` NOT NULL | |
| `auto_renew` | `bool` NOT NULL DEFAULT true | |
| `status` | `text` NOT NULL DEFAULT 'active' | CHECK IN ('active','expired','cancelled') |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `subscription_usage_log` (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `subscription_id` | `uuid` NOT NULL FK → `customer_subscriptions(id)` | |
| `order_id` | `uuid` NOT NULL | |
| `service_id` | `uuid` NOT NULL | |
| `discount_applied` | `numeric(5,2)` NOT NULL | % actually applied at order time |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `subscription_packages_with_counts` (DB view)

Replaces the client-side `Map` approach. Created in migration:

```sql
CREATE OR REPLACE VIEW subscription_packages_with_counts AS
SELECT
  sp.*,
  COALESCE(counts.active_subscribers, 0) AS subscriber_count
FROM subscription_packages sp
LEFT JOIN (
  SELECT package_id, COUNT(*) AS active_subscribers
  FROM customer_subscriptions
  WHERE status = 'active'
  GROUP BY package_id
) counts ON counts.package_id = sp.id;
```

`useSubscriptionPackages` queries this view directly — one round-trip, no client-side aggregation, performant at any scale.

### Postgres RPC — `upsert_package_with_services`

Handles the atomic create/update to prevent service list corruption:

```sql
CREATE OR REPLACE FUNCTION upsert_package_with_services(
  p_package    jsonb,   -- subscription_packages fields
  p_services   jsonb    -- array of {service_id, discount_override}
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Upsert package
  INSERT INTO subscription_packages ...
  ON CONFLICT (id) DO UPDATE SET ...
  RETURNING id INTO v_id;

  -- Replace services atomically
  DELETE FROM subscription_package_services WHERE package_id = v_id;
  INSERT INTO subscription_package_services (package_id, service_id, discount_override)
  SELECT v_id, (svc->>'service_id')::uuid, (svc->>'discount_override')::numeric
  FROM jsonb_array_elements(p_services) svc;

  RETURN v_id;
END;
$$;
```

Both `useCreatePackage` and `useUpdatePackage` call this single RPC. No partial failure possible.

---

## 2. File Structure

```
src/app/(dashboard)/master-data/subscriptions/
  page.tsx                             ← server component, loads current profile

src/components/master-data/subscriptions/
  SubscriptionsPage.tsx                ← client shell: state, filter bar, table
  SubscriptionPackageRow.tsx           ← single table row with subscriber pill
  PackageEditDialog.tsx                ← create/edit modal
  ServicePickerTree.tsx                ← searchable checkbox tree for service selection

src/hooks/
  useSubscriptionPackages.ts           ← all React Query hooks
```

---

## 3. Hooks — `useSubscriptionPackages.ts`

### `useSubscriptionPackages({ includeArchived?: boolean })`
- Query key: `['subscription_packages', { includeArchived }]`
- Queries `subscription_packages_with_counts` view directly
- When `includeArchived = false` (default): adds `.eq('is_active', true)`
- Returns `SubscriptionPackageWithCount[]` — each item includes `subscriber_count: number`
- `staleTime`: 5 minutes

### `usePackageServices(packageId: string | null)`
- Query key: `['subscription_package_services', packageId]`
- Fetches `subscription_package_services` for a given package
- Returns `{ service_id: string; discount_override: number | null }[]`
- `enabled`: `!!packageId`

### `useCreatePackage()` / `useUpdatePackage()`
- Both call `supabase.rpc('upsert_package_with_services', { p_package, p_services })`
- `p_services`: array of `{ service_id, discount_override }` — `discount_override` is `null` when using package default
- Calls `logActivity({ action: 'create'|'update', module: 'subscription_packages', entity_id, details })`
- Invalidates `['subscription_packages']` and `['subscription_package_services', packageId]`

### `useArchivePackage()`
- Sets `is_active = false` directly on `subscription_packages`
- Calls `logActivity({ action: 'archive', … })`
- Invalidates `['subscription_packages']`

---

## 4. Components

### `SubscriptionsPage.tsx`
Client shell. Manages:
- `showArchived: boolean` — toggles archived row visibility
- `search: string` — client-side filter on `name` / `name_ar`
- `editTarget: SubscriptionPackage | null` — null = create, set = edit
- `archiveTarget: SubscriptionPackage | null` — triggers AlertDialog

Renders: header bar → filter bar → table → `PackageEditDialog` → archive `AlertDialog`.

### `SubscriptionPackageRow.tsx`
One `<TableRow>` per package. Props: `package: SubscriptionPackageWithCount`, `onEdit`, `onArchive`.

Columns: Name (EN bold + AR muted RTL) | Discount | Initial Fee | Priority badge | Services count | Duration | Subscribers pill | Status (visible only when archived toggle on) | Actions.

Archived rows: `opacity-50`, Archive action hidden.

### `PackageEditDialog.tsx`
Scrollable `<Dialog>` (full-screen on mobile, `max-w-2xl` centered on `md:+`).

**Field layout:**
1. Name EN + Name AR — `grid grid-cols-2`
2. Description — `<Textarea>`
3. Discount % (default) + Initial Fee (QAR) + Duration (months) — `grid grid-cols-3`
4. Priority Response — `<Select>`: None / 24–48 HR / < 24 HR
5. Response Hours — `<Input type="number">` — only rendered when `priority_response !== 'none'`
6. Auto-renew by default — `<Switch>`
7. Applicable Services — `<ServicePickerTree>` with "X services selected" counter

**SLA Strict-Mode Validation (Low severity fix):**

| `priority_response` | Valid `response_hours` range | UI hint |
|---|---|---|
| `none` | field hidden, value = NULL | — |
| `24_48hr` | 25 – 48 | "Enter hours between 25 and 48" |
| `under_24hr` | 1 – 24 | "Enter hours between 1 and 24" |

Saving with an out-of-band value shows an inline field error: "Response hours must be between X and Y for the selected priority level."

**Per-service discount override:** When a service is selected in `ServicePickerTree`, users can optionally set a `discount_override` for that service. Default shows "— (use package default X%)". This is implemented as an expandable row in the picker or a secondary inline input next to each selected service chip.

**Validation before save:**
- `name` non-empty
- `discount_percent` in [0, 100]
- `initial_fee` ≥ 0
- At least 1 service selected
- `response_hours` within band-specific range when priority ≠ 'none'
- All `discount_override` values (if set) in [0, 100]

**Save flow:**
1. Validate → show inline field errors on failure
2. Call `useCreatePackage()` or `useUpdatePackage()` (both → `upsert_package_with_services` RPC)
3. Toast success / error
4. Close dialog on success

### `ServicePickerTree.tsx`
Props:
```typescript
interface ServicePickerTreeProps {
  selectedIds: string[]
  overrides: Record<string, number | null>   // service_id → discount_override
  onChange: (ids: string[], overrides: Record<string, number | null>) => void
}
```

- Calls `useServiceTree(treeType, [])` for all tree types (Normal, Contract, Mobile) and merges
- Renders division → service-type → leaf-service using `buildTreeMap` + `collectDescendantIds` (imported from `ServiceTree.tsx`)
- **Search input at top of tree** — filters visible nodes by name in real-time (fixes large-catalog UX)
- Tri-state parent checkboxes: checked / unchecked / indeterminate
- Selecting a parent selects all descendants; deselecting clears all descendants
- Each selected leaf row shows an optional `discount_override` input (small, right-aligned): placeholder "— pkg default"
- No DnD, no edit buttons

---

## 5. Page UI

### Header
```
[Title: Subscription Packages]  [Subtitle: Manage annual subscription tiers for customers]
                                 [Show Archived toggle]  [+ New Package btn (orange)]
```

### Filter bar
```
[Search input: "Search packages…"]     [X active packages chip]
```

### Table

| Name | Discount | Fee | Priority | Services | Duration | Subscribers | Actions |
|---|---|---|---|---|---|---|---|
| Bronze / برونز | 🟠 10% | QAR 500 | — | 🟠 6 services | 12 mo | 🟠 3 | ✏️ 🗄️ |
| Silver / فضي | 🟠 20% | QAR 1,200 | 24–48 HR | 🟠 12 services | 12 mo | 🟠 7 | ✏️ 🗄️ |

**Badge styles:**
- Discount: `bg-primary/10 text-primary` orange pill
- Priority None: `bg-muted text-muted-foreground`
- Priority 24–48 HR: `bg-warning/10 text-warning` amber
- Priority < 24 HR: `bg-primary/10 text-primary` orange
- Services count: `border border-primary/30 text-primary` outline pill
- Subscribers: `bg-primary text-primary-foreground` filled orange oval

### States
- **Loading:** 3 skeleton rows with `animate-pulse`
- **Empty (no packages):** centred message + ghost `+ New Package` button
- **Empty (search miss):** "No packages match your search."
- **Archived rows:** `opacity-50`, Archive action hidden

### Archive confirmation
`<AlertDialog>`: "Archive [Name]? Existing customer subscriptions will not be cancelled." — Confirm (destructive) / Cancel.

---

## 6. Navigation

- Sidebar group: **Master Data**
- Link label: "Subscription Packages"
- Icon: `PackageCheck` (lucide)
- Route: `/master-data/subscriptions`
- Position: after existing master-data items
- Permissions: owner / purchase_manager

---

## 7. Audit Trail

| Action | `action` | `module` |
|---|---|---|
| Create package | `'create'` | `'subscription_packages'` |
| Edit package | `'update'` | `'subscription_packages'` |
| Archive package | `'archive'` | `'subscription_packages'` |

`details`: JSON of changed fields (edit) or full payload (create).

---

## 8. Downstream Consumers (out of scope for this ticket)

| Consumer | Integration point |
|---|---|
| Create Order / Quotation | `COALESCE(sps.discount_override, sp.discount_percent)` applied per service line; bigger wins vs promotion, no stacking |
| Payment (Dibsy + WATI) | See `docs/superpowers/notes/subscription-payment-flow.md` |
| Customer Self-Service Portal | Tokenised WhatsApp link → view plan, toggle auto-renew, cancel |
| Cron: `cron-renew-subscriptions` | Nightly auto-renew; skips archived packages |
| Priority routing / SLA | `priority_response` + `response_hours` feed order priority scoring |

---

## 9. Review Findings — Resolution Summary

| Severity | Finding | Resolution |
|---|---|---|
| 🔴 High | Non-atomic service updates | `upsert_package_with_services` RPC wraps delete+insert in one transaction |
| 🔴 High | Client-side subscriber count bottleneck | `subscription_packages_with_counts` DB view; single query, no client aggregation |
| 🔴 High | No financial snapshotting | `price_paid` + `discount_percent_snapshot` columns on `customer_subscriptions` |
| 🟡 Medium | Flat discount (same % for all services) | `discount_override` on junction table; `COALESCE(override, package_default)` |
| 🟡 Medium | Silent cascade on service deletion | `ON DELETE RESTRICT` on `service_id` FK — service cannot be deleted while in a package |
| 🟢 Low | SLA band vs hours mismatch | Strict-mode validation: `under_24hr` → 1–24, `24_48hr` → 25–48, inline error |
| 🟢 Low | Service tree UX at scale | Search input at top of `ServicePickerTree` filters nodes in real-time |
