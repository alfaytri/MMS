# Subscription Packages — Design Spec

**Date:** 2026-05-06  
**Branch:** `feature/subscription-module`  
**Route:** `/master-data/subscriptions`  
**Color theme:** Orange + white (primary accent throughout)

---

## Overview

Admin-side master data page for defining annual customer loyalty tiers (e.g. Bronze / Silver / Gold). Each package gives subscribing customers a percentage discount on selected services and a priority SLA for 12 months. This page only manages the package catalog — customer subscription sign-ups and usage are handled downstream.

---

## 1. Database Schema

### `subscription_packages`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `name` | `text` NOT NULL | English label |
| `name_ar` | `text` | Arabic, RTL display |
| `description` | `text` | |
| `discount_percent` | `numeric(5,2)` NOT NULL DEFAULT 0 | 0–100 |
| `initial_fee` | `numeric(10,2)` NOT NULL DEFAULT 0 | QAR yearly upfront |
| `duration_months` | `int` NOT NULL DEFAULT 12 | |
| `priority_response` | `text` NOT NULL DEFAULT 'none' | CHECK IN ('none','24_48hr','under_24hr') |
| `response_hours` | `int` | NULL when priority = 'none'; range 1–168 |
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
| `service_id` | `uuid` NOT NULL FK → `services(id)` ON DELETE CASCADE | |
| UNIQUE | `(package_id, service_id)` | |

### `customer_subscriptions` (placeholder — populated downstream)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `customer_id` | `uuid` NOT NULL | FK → customers |
| `package_id` | `uuid` NOT NULL FK → `subscription_packages(id)` | |
| `start_date` | `date` NOT NULL | |
| `end_date` | `date` NOT NULL | |
| `auto_renew` | `bool` NOT NULL DEFAULT true | |
| `status` | `text` NOT NULL DEFAULT 'active' | CHECK IN ('active','expired','cancelled') |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

### `subscription_usage_log` (append-only — populated downstream)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `subscription_id` | `uuid` NOT NULL FK → `customer_subscriptions(id)` | |
| `order_id` | `uuid` NOT NULL | |
| `service_id` | `uuid` NOT NULL | |
| `discount_applied` | `numeric(5,2)` NOT NULL | % actually applied |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

---

## 2. File Structure

```
src/app/(dashboard)/master-data/subscriptions/
  page.tsx                             ← server component, loads current profile

src/components/master-data/subscriptions/
  SubscriptionsPage.tsx                ← client shell: state, filter bar, table
  SubscriptionPackageRow.tsx           ← single table row with subscriber pill
  PackageEditDialog.tsx                ← create/edit modal
  ServicePickerTree.tsx                ← checkbox tree for service selection

src/hooks/
  useSubscriptionPackages.ts           ← all React Query hooks
```

---

## 3. Hooks — `useSubscriptionPackages.ts`

### `useSubscriptionPackages({ includeArchived?: boolean })`
- Query key: `['subscription_packages', { includeArchived }]`
- Two parallel Supabase fetches (PostgREST cannot run filtered aggregates directly):
  1. `subscription_packages` — filtered by `is_active` when `includeArchived = false`
  2. `customer_subscriptions` — select `package_id`, filtered to `status = 'active'`, then count client-side with a `Map<packageId, number>`
- Returns merged array: each package has a `subscriber_count: number` field added client-side
- `staleTime`: 5 minutes

### `usePackageServices(packageId: string | null)`
- Query key: `['subscription_package_services', packageId]`
- Fetches `subscription_package_services` for a given package — returns `service_id[]`
- `enabled`: `!!packageId`

### `useCreatePackage()`
- Inserts into `subscription_packages`
- Bulk-inserts `subscription_package_services`
- Calls `logActivity({ action: 'create', module: 'subscription_packages', entity_id, details })`
- Invalidates `['subscription_packages']`

### `useUpdatePackage()`
- Updates `subscription_packages` row
- Deletes all existing `subscription_package_services` for `package_id`, then bulk-inserts new set
- Calls `logActivity({ action: 'update', … })`
- Invalidates `['subscription_packages']` and `['subscription_package_services', packageId]`

### `useArchivePackage()`
- Sets `is_active = false`
- Calls `logActivity({ action: 'archive', module: 'subscription_packages', … })`
- Invalidates `['subscription_packages']`

---

## 4. Components

### `SubscriptionsPage.tsx`
Client shell. Manages:
- `showArchived: boolean` — toggles archived row visibility
- `search: string` — client-side filter on `name` / `name_ar`
- `editTarget: SubscriptionPackage | null` — null = create, set = edit
- `archiveTarget: SubscriptionPackage | null` — triggers AlertDialog

Renders header bar → filter bar → table → dialogs.

### `SubscriptionPackageRow.tsx`
One `<TableRow>` per package. Props: `package`, `onEdit`, `onArchive`.

Columns: Name (EN bold + AR muted RTL) | Discount (orange badge) | Initial Fee | Priority badge | Services count pill | Duration | Subscribers pill | Status (when archived visible) | Actions.

Archived rows: `opacity-50`, no Archive button shown.

### `PackageEditDialog.tsx`
Scrollable `<Dialog>` (full-screen on mobile, max-w-2xl centered on md+).

**Field layout:**
1. Name EN + Name AR — `grid grid-cols-2`
2. Description — `<Textarea>`
3. Discount % + Initial Fee (QAR) + Duration (months) — `grid grid-cols-3`
4. Priority Response — `<Select>`: None / 24–48 HR / < 24 HR
5. Response Hours — `<Input type="number" min=1 max=168>` — only rendered when `priority_response !== 'none'`
6. Auto-renew by default — `<Switch>` with label
7. Applicable Services — `<ServicePickerTree>` (full width, max-h-64 overflow-y-auto, shows "X services selected" counter above)

**Validation before save:**
- `name` non-empty
- `discount_percent` in [0, 100]
- `initial_fee` ≥ 0
- At least 1 service selected
- `response_hours` in [1, 168] when priority ≠ 'none'

**Save flow:**
1. Validate → show inline field errors on failure
2. `useCreatePackage()` or `useUpdatePackage()` depending on mode
3. Toast success / error
4. Close dialog on success

### `ServicePickerTree.tsx`
Props:
```typescript
interface ServicePickerTreeProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}
```

- Calls `useServiceTree(treeType, [])` for all tree types (Normal, Contract, Mobile) and merges into one tree
- Renders division → service-type → leaf-service hierarchy using `buildTreeMap` (imported from `ServiceTree.tsx`)
- Each node has a checkbox; parent checkboxes show indeterminate state when partially selected
- Selecting a parent selects all descendants; deselecting a parent deselects all descendants
- Uses `collectDescendantIds` (imported from `ServiceTree.tsx`) for bulk select/deselect
- No DnD, no edit buttons — selection only

---

## 5. Page UI

### Header
```
[Title: Subscription Packages]  [Subtitle: Manage annual subscription tiers]
                                 [Show Archived toggle]  [+ New Package btn (orange)]
```

### Filter bar
```
[Search input: "Search packages…"]     [X active packages chip]
```

### Table

| Name | Discount | Fee | Priority | Services | Duration | Subscribers | Actions |
|---|---|---|---|---|---|---|---|
| Bronze / برونز | 🟠 10% | QAR 500 | None | 🟠 6 services | 12 mo | 🟠 3 | ✏️ 🗄️ |
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
- Position: after existing master-data items (Services, Teams, etc.)
- Permissions: owner / purchase_manager (same gate as other master-data pages)

---

## 7. Audit Trail

Every mutating action calls `logActivity()`:

| Action | `action` value | `module` |
|---|---|---|
| Create package | `'create'` | `'subscription_packages'` |
| Edit package | `'update'` | `'subscription_packages'` |
| Archive package | `'archive'` | `'subscription_packages'` |

`details` field: JSON string of changed fields for edit, full payload for create.

---

## 8. Downstream Consumers (out of scope for this ticket)

| Consumer | Integration point |
|---|---|
| Create Order / Quotation | `getActiveSubscription(customerId)` → apply discount if service in `subscription_package_services`, bigger wins vs promotion |
| Customer Self-Service Portal | Tokenised WhatsApp link → view plan, toggle auto-renew, cancel |
| Cron: `cron-renew-subscriptions` | Nightly auto-renew for subs with `auto_renew=true` nearing `end_date` |
| Priority routing / SLA | `priority_response` + `response_hours` feed order priority scoring |

These tables are created now so the schema is ready; the UI and logic are separate tickets.
