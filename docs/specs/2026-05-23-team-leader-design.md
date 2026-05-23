# Team Leader Module — Design Spec
**Date:** 2026-05-23
**Branch:** `feature/team-leader`
**Status:** Approved — ready for implementation planning

---

## Overview

The Team Leader module is a mobile-first field execution app for service team leaders. When a team leader logs in they land directly on `/team-leader` — a stripped, full-screen interface showing their assigned visits for the day. They walk through each visit: photos, services, inventory used, customer signature, and invoice. No nav, no distractions.

Admins and staff with the `teams.team_leader.view` permission access the same page via the **Teams** nav dropdown and can monitor any team using a team selector.

---

## Section 1 — Identity & Account Management

### Team leader toggle in User dialogs

Both `AddUserDialog` and `EditUserDialog` gain a **"Team Leader" toggle switch**.

**Toggle OFF (default):** Normal user — name, email, password, role picker visible as today.

**Toggle ON:** Role picker hides. A **"Linked Employee"** searchable select appears.

- For **new users**: shows only employees who are the designated leader of a team (`teams.leader_id = employee.id`) AND have no profile linked yet (`employee.profile_id IS NULL`).
- For **edit users**: pre-filled with the currently linked employee. Admin can change the linked employee or demote the account.

`user_type` auto-sets to `'team-leader'` when toggle is ON. Team leader accounts do not receive custom roles.

### Account creation (`/api/users/create`)

When toggle is ON, the API route does four things:

1. Creates Supabase auth user with `user_metadata: { is_team_leader: true, team_id: "<uuid>" }`
2. Creates `profiles` row with `user_type: 'team-leader'`
3. Updates `employees SET profile_id = <new_profile_id> WHERE id = employee_id`
4. Returns `{ profile, employee_id }`

### Editing an existing account (`/api/users/:id PATCH`)

| Transition | Action |
|---|---|
| OFF → ON | Link employee, set `user_metadata.is_team_leader = true`, set `employee.profile_id` |
| ON → ON (change employee) | Clear old `employee.profile_id = NULL`, link new employee |
| ON → OFF (demote) | Clear `user_metadata.is_team_leader`, set `user_type = 'internal'`, set `employee.profile_id = NULL` |

### DB changes

- `employees` table: add `profile_id UUID REFERENCES profiles(id) NULL` if not already present (migration checks first).

---

## Section 2 — Routing & Layout

### Middleware (`src/middleware.ts`)

Reads Supabase session from cookies server-side using `@supabase/ssr`.

| Condition | Action |
|---|---|
| `is_team_leader: true` + path NOT `/team-leader*` | Redirect → `/team-leader` |
| `is_team_leader: true` + path IS `/team-leader*` | Set response header `x-is-team-leader: 1`, pass through |
| Normal user / admin | No change — normal dashboard flow |

Team leader accounts are physically prevented from accessing any other route. The middleware bounces them back every time.

**Note:** The middleware does NOT guard staff-level access to `/team-leader`. Permission enforcement for staff users (requiring `teams.team_leader.view`) is handled at the page level — see Section 3.

### Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

Server Component reads the middleware-set header:

```ts
const isTeamLeader = headers().get('x-is-team-leader') === '1'
```

| `isTeamLeader` | Layout rendered |
|---|---|
| `false` | Full shell — `<TopNav>`, contact center sidebar, `<InactivityGuard>` |
| `true` | Stripped mobile shell — no `<TopNav>`, no contact center, no `<InactivityGuard>`, full-height children only |

Single layout file handles both experiences — no route group duplication.

### Nav entry

`nav-config.ts` — Teams dropdown:

```ts
{
  label: 'Teams',
  icon: 'Users',
  groups: [
    {
      items: [
        { label: 'Calendar',    href: '/calendar' },
        { label: 'Team Leader', href: '/team-leader' },  // new
      ],
    },
  ],
},
```

---

## Section 3 — Team Leader Page

**Route:** `src/app/(dashboard)/team-leader/page.tsx`

### `useTeamLeaderIdentity()` hook

Reads `supabase.auth.getUser()` → extracts `user_metadata.team_id` and `user_metadata.is_team_leader` from the JWT. No DB query needed.

Checks `teams.team_leader.view` permission via existing permissions system → sets `isAdmin: true` if present.

Returns: `{ teamId, isAdmin, loading }`

**Access guard:** If `teamId` is null (user is not a team leader) AND `isAdmin` is false (user lacks `teams.team_leader.view`) → the page renders a full-screen 403 "Access Denied" card. No redirect — staff users should see a clear message rather than a silent bounce.

`effectiveTeamId = adminOverride ?? teamId`

### Header (sticky, `bg-card`)

```
┌─────────────────────────────────────────────┐
│  [Team Name]           [Admin] [12 today ▾] │
│  Friday, May 23 2026                        │
│  ── Team override Select (admin only) ────  │
│  [ Today (8) ]  [ All Upcoming (23) ]       │
└─────────────────────────────────────────────┘
```

- **Team name** — resolved from `teams` using `effectiveTeamId`
- **Date** — `EEEE, MMM d, yyyy`
- **Admin badge** — visible only if `isAdmin`
- **Count badge** — "X today" in Today tab / "X total" in All Upcoming tab
- **Team override Select** — admin only; lists all non-deleted teams with division name
- **Tabs** — Today (`date = today`) | All Upcoming (`date >= today`)

### `useTeamLeaderOrders(teamId)` hook

Fetches from `visits`:
- `date >= today`
- `status != 'cancelled'`
- `team_id = effectiveTeamId`
- `limit 100`

Parallel joins: `orders`, `contracts`, `backwork_line_items`, `follow_up_line_items`

Sorted by `date` then `scheduled_time`. Grouped by date with **sticky date headers** ("Today" / "Tomorrow" / weekday name) + visit count badge.

### Order Card

Color-coded header strip:

| Type | Color | Label |
|---|---|---|
| `order` | primary | Normal Order |
| `site-visit-single` | warning | Site Visit – Single |
| `site-visit-contract` | purple | Site Visit – Contract |
| `contract` | success | Contract Visit |
| `backwork` | destructive | Backwork |
| `follow-up` | purple | Follow-up |
| `qc` | secondary | QC Visit |

**Card body:** customer name, address, first 3 services ("+N more" badge), Multi-Team badge if other teams share the visit.

**4 action buttons (2×2 grid, `min-h-11` for touch targets):**

| Button | Action |
|---|---|
| Navigate | Copies Google Maps directions URL to clipboard |
| Customer | `tel:` to customer phone |
| On Arrival | `tel:` to location/site phone |
| Start | Adds visit to `startedVisits` set → button turns warning-yellow, label "In Progress" |

**After Start:** A **"Customer Not Answering"** button appears below the grid → opens `CustomerUnavailableDialog`.

**Tap card body** → opens `OrderDetailDispatch`.

### States

| State | UI |
|---|---|
| Loading | Centered spinner |
| No team + not admin | Full-screen "No Team Assigned" warning card with support contact |
| No visits | Friendly empty state + "No visits scheduled" |
| Visit completed | Card greys out + "Completed" badge (optimistic update) |

---

## Section 4 — Order Dialogs

### `OrderDetailDispatch`

Routes by `visit.type` to the correct dialog:

```
'backwork'           → BackworkDialog
'follow-up'          → FollowUpDialog
'site-visit-single'  → SiteVisitSingleDialog
'site-visit-contract'→ SiteVisitContractDialog
'contract'           → ContractVisitDialog
'qc'                 → QcDialog
default              → NormalOrderDialog
```

All dialogs: **full-screen on mobile** (`w-full h-full rounded-none`), **centered card on `md:`+** (`max-w-2xl`).
All accept: `onComplete(data: OrderCompletionData) => void`

### Shared sub-components

| Component | Purpose |
|---|---|
| `PhotoCapture` | Camera trigger + preview grid; stores blobs locally until submit |
| `DamageReport` | Toggle + optional photo + notes field |
| `ServiceStatusList` | Per-service status selector: done / skipped / issue |
| `SignaturePad` | Canvas-based finger/stylus signature, outputs PNG blob |

### The 7 Dialogs

**1. `BackworkDialog`**
Read-only context section at top (customer complaint reason + internal note from `backwork_line_items`), then `PhotoCapture` + `DamageReport` + `ServiceStatusList` + confirm button.

**2. `FollowUpDialog`**
Previous visit reference + agent note from `follow_up_line_items`. Same structure — context section then shared capture components.

**3. `SiteVisitSingleDialog`**
Assessment-only. Shows scope of assessment. `PhotoCapture` + `DamageReport` + notes. No inventory, no invoice step.

**4. `SiteVisitContractDialog`**
Same as SiteVisitSingle but scoped to the linked contract. No inventory, no invoice.

**5. `ContractVisitDialog`**
Building → floor → room collapsible tree (`BuildingNode`) driven by `visit.services`. Each room node has its own `ServiceStatusList` + `PhotoCapture`. Most complex dialog — mobile-optimised collapsible navigation.

**6. `QcDialog`**
Scored checklist per service (`max_score` field). Team leader enters achieved score per item. Running total shown at bottom. **No invoice step** — closes after submission and posts scores to quality control module.

**7. `NormalOrderDialog`** *(default fallback)*
Full flow: services list → per-service `ServiceStatusList` → per-service inventory pickers (brand + variant + qty) → `PhotoCapture` → `DamageReport` → `SignaturePad`.

### `OrderCompletionData` type

```ts
interface OrderCompletionData {
  orderId:         string
  visitId:         string
  visitType:       string
  serviceStatuses: Record<string, 'done' | 'skipped' | 'issue'>
  inventoryUsage:  Record<string, InventoryUsageRecord[]>  // serviceId → items
  photos:          Blob[]
  damageReport:    { noted: boolean; description?: string; photos?: Blob[] }
  signature?:      Blob    // absent for qc / site-visit types
  qcScores?:       Record<string, number>  // qc only
}
```

---

## Section 5 — Completion Flow

### Step 1 — Stock deduction

1. Filter `inventoryUsage` → keep only records where `brandVariantId` exists **and** `qtyUsed > 0`
2. Build `StockDeductionItem[]`
3. `useDeductOrderStock` → `POST /api/deduct-order-stock` → edge function → FIFO deduction against team's mobile warehouse

**On failure** (insufficient stock): toast error, dialog stays open, team leader adjusts quantities.

**If `visit.type === 'qc'`**: after deduction → close. Done. No invoice.

### Step 2 — `TlInvoiceDialog` (all non-QC types)

Opens immediately after successful stock deduction. Full-screen mobile / `max-w-2xl` on `md:+`.

**Content (top → bottom):**
- Customer name + address
- Line items table: service name, qty, unit price, total
- Subtotal
- Contract discount selector (0 / 5 / 10 / 15 / 20 / custom %) — shown for `contract` visits
- CC discount selector (same options) — shown if visit was escalated
- **Total**
- `SignaturePad` for customer signature
- "Confirm & Create Invoice" button

**On confirm:**
1. `createInvoice` mutation with line items + discounts
2. Payment method selector (cash / card / pending) → `recordPayment` or mark pending
3. Toast "Invoice #XXXX created" → navigate to invoice detail in existing Invoices module

### Visit status update (all completions)

```sql
UPDATE visits
SET status = 'completed', completed_at = now(), completed_by = <profile_id>
WHERE id = <visitId>
```

The migration must confirm `completed_at timestamptz` and `completed_by uuid REFERENCES profiles(id)` columns exist on `visits`, adding them if not present. The `customer-unavailable` value must also be added to the `visits.status` check constraint.

Order card updates optimistically: greys out + "Completed" badge.

---

## Section 6 — Supporting Features

### `CustomerUnavailableDialog`

Two-step sheet. Triggered by "Customer Not Answering" button (visible after Start).

**Step 1:** "Take a photo of the building/location" → `PhotoCapture`
**Step 2:** "Upload screenshot of your call log" → `PhotoCapture` + optional notes textarea

**On submit:**
1. Uploads both images to Supabase Storage (`team-escalations/` bucket)
2. `POST /api/contact-center/escalate` → `{ visit_id, team_id, building_photo_url, call_screenshot_url, notes }` → creates CC task
3. Updates visit `status = 'customer-unavailable'`
4. Toast "Escalated to call centre" — "Customer Not Answering" button replaced by grey "Escalated" badge

### GPS Live Tracking

**On Start:**
```ts
const watchId = navigator.geolocation.watchPosition(
  (pos) => debouncedPing(pos.coords),  // 30-second debounce
  (err) => console.warn(err),
  { enableHighAccuracy: true, maximumAge: 15000 }
)
```

Ping → `POST /api/team-leader/update-location` → `{ team_id, lat, lng, accuracy }` → upsert `team_live_locations` (one row per team).

**Cleanup:** `clearWatch(watchId)` on page unmount or all visits completed.

### New DB table — `team_live_locations`

```sql
CREATE TABLE team_live_locations (
  team_id    uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  lat        numeric(10, 7) NOT NULL,
  lng        numeric(10, 7) NOT NULL,
  accuracy   float,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE team_live_locations ENABLE ROW LEVEL SECURITY;
-- Policy: team leaders can upsert their own team row only
-- Staff with teams.team_leader.view can read all rows
```

---

## Section 7 — Permissions

### New permission key

Added to the **Teams** group in `src/lib/permissions.ts`:

```ts
{
  key:         'teams.team_leader.view',
  label:       'View Team Leader',
  description: 'Access the Team Leader field execution page and monitor any team\'s visits',
}
```

### Access matrix

| User type | Permission | Experience on `/team-leader` |
|---|---|---|
| Team leader account | JWT flag (no roles) | Own team only, no selector, stripped layout |
| Staff with `teams.team_leader.view` | ✅ | Full nav + team selector dropdown, read any team |
| Staff without permission | ❌ | 403 / redirected away |

---

## File Map (new files to create)

```
src/
  middleware.ts
  app/(dashboard)/team-leader/
    page.tsx
  hooks/
    useTeamLeaderIdentity.ts
    useTeamLeaderOrders.ts
    useDeductOrderStock.ts
  components/team-leader/
    TlHeader.tsx
    TlVisitList.tsx
    TlOrderCard.tsx
    OrderDetailDispatch.tsx
    CustomerUnavailableDialog.tsx
    TlInvoiceDialog.tsx
    dialogs/
      BackworkDialog.tsx
      FollowUpDialog.tsx
      SiteVisitSingleDialog.tsx
      SiteVisitContractDialog.tsx
      ContractVisitDialog.tsx
      QcDialog.tsx
      NormalOrderDialog.tsx
    shared/
      PhotoCapture.tsx
      DamageReport.tsx
      ServiceStatusList.tsx
      SignaturePad.tsx
  types/
    team-leader.ts
  app/api/team-leader/
    update-location/route.ts
  app/api/contact-center/
    escalate/route.ts

supabase/migrations/
  YYYYMMDDHHMMSS_team_leader_module.sql
```

## Files to modify

```
src/middleware.ts                              (create new)
src/app/(dashboard)/layout.tsx                (add isTeamLeader header check)
src/components/layout/nav-config.ts           (add Team Leader nav item)
src/lib/permissions.ts                        (add teams.team_leader.view)
src/components/master-data/AddUserDialog.tsx  (add TL toggle + employee select)
src/components/master-data/EditUserDialog.tsx (add TL toggle + employee select)
src/app/api/users/create/route.ts             (handle employee link + JWT metadata)
src/app/api/users/[id]/route.ts               (handle TL promote/demote)
```
