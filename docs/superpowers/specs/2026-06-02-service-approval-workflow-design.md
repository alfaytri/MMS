# Service Approval Workflow — Design Spec

**Date:** 2026-06-02
**Status:** Draft
**Module:** Master Data — Services

---

## Problem

Currently any user with `master_data.services.manage` permission can add, edit, or delete services directly. There is no review step — changes go live immediately. The business needs owners to review and approve high-impact service changes before they take effect.

## Decisions

| Decision | Choice |
|---|---|
| Changes requiring approval | Add, edit name, edit price, delete, toggle active/inactive |
| Changes that bypass approval | Sort order, invoice text, instructions, inventory links, QC, reminders, photos |
| Tracking approach | JSONB diff (`{ field: { old, new } }`) per change request |
| Approver identity | New permission `master_data.services.approve` |
| Owner UX | Dedicated approval page (not inline) |
| Pending visibility | Orange badge on service row; "add" requests shown as pending entries |
| Concurrency | One pending change per service at a time |
| Rejection | Marked as rejected, reason **required** |
| Post-rejection | Proposer submits a fresh request if they want to retry |
| Change history | Info icon (i) on each service row opens a dialog showing all past changes |

---

## 1. Database Schema

### 1.1 New enum: `service_change_type`

```sql
CREATE TYPE service_change_type AS ENUM ('add', 'edit', 'delete', 'toggle_status');
```

### 1.2 New enum: `service_change_status`

```sql
CREATE TYPE service_change_status AS ENUM ('pending', 'approved', 'rejected');
```

### 1.3 New table: `service_change_requests`

```sql
CREATE TABLE service_change_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID REFERENCES services(id),          -- NULL for 'add' requests
  change_type   service_change_type NOT NULL,
  changes       JSONB NOT NULL,                         -- { field: { old, new } } or full payload for 'add'
  status        service_change_status NOT NULL DEFAULT 'pending',
  requested_by  UUID NOT NULL REFERENCES profiles(id),
  reviewed_by   UUID REFERENCES profiles(id),
  rejection_reason TEXT,                                -- required when status = 'rejected'
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Constraints:**
- `CHECK (status != 'rejected' OR rejection_reason IS NOT NULL)` — rejection reason is mandatory
- `CHECK (change_type != 'add' OR service_id IS NULL)` — add requests have no existing service
- `CHECK (change_type = 'add' OR service_id IS NOT NULL)` — edit/delete/toggle must reference a service

**Indexes:**
- `idx_scr_service_id_status` ON `(service_id, status)` — quick lookup for pending changes per service
- `idx_scr_status` ON `(status)` — approval queue filtering
- `idx_scr_requested_by` ON `(requested_by)` — user's own requests

### 1.4 Changes to `services` table

```sql
ALTER TABLE services ADD COLUMN has_pending_change BOOLEAN NOT NULL DEFAULT false;
```

### 1.5 RLS Policies

- `service_change_requests`: authenticated users can INSERT (create requests), SELECT their own + all if they have `services.approve`
- UPDATE restricted to users with `services.approve` permission (for approve/reject)

---

## 2. Permission

Add to the existing permission definitions in `src/lib/permissions.ts`:

```
master_data.services.approve   — Review and approve/reject service change requests
```

**Behavior:**
- Users **with** `services.approve`: all service changes apply directly (current behavior, no change request created)
- Users **without** `services.approve` but **with** `services.manage`: changes create a change request instead of applying directly
- Users **without** `services.manage`: cannot propose changes at all (existing behavior)

---

## 3. Business Logic

### 3.1 Submitting a change request

**Trigger:** A user without `services.approve` submits the ServiceEditDialog or clicks delete/toggle.

**For `edit`:**
1. Compare submitted values against current service values
2. Build diff object: `{ price: { old: 150, new: 200 }, name_en: { old: "AC", new: "Air Conditioning" } }`
3. Only include fields that actually changed among the approval-required fields (name_en, name_ar, price, emergency_price, status)
4. Insert into `service_change_requests` with `change_type = 'edit'`
5. Set `has_pending_change = true` on the service

**For `add`:**
1. Store the full service payload in `changes` (all form fields)
2. Insert with `service_id = NULL`, `change_type = 'add'`

**For `delete`:**
1. Insert with `change_type = 'delete'`, `changes = {}` (no diff needed)
2. Set `has_pending_change = true` on the service

**For `toggle_status`:**
1. Insert with `change_type = 'toggle_status'`, `changes = { status: { old: 'active', new: 'inactive' } }`
2. Set `has_pending_change = true` on the service

**Guard:** If `has_pending_change = true` on the service, reject the submission with a toast: "This service already has a pending change awaiting approval."

### 3.2 Approving a change request

**Trigger:** User with `services.approve` clicks "Approve" on the approval page.

**For `edit`:**
1. For each field in `changes`, update the corresponding column on the `services` row
2. Mark request: `status = 'approved'`, `reviewed_by`, `reviewed_at = now()`
3. Set `has_pending_change = false` on the service

**For `add`:**
1. Insert a new row into `services` using the payload from `changes`
2. Set `service_change_requests.service_id` to the newly created service ID (for history linkage)
3. Mark request as approved

**For `delete`:**
1. Soft-delete the service: `SET deleted_at = now()`
2. Mark request as approved
3. Set `has_pending_change = false`

**For `toggle_status`:**
1. Update `services.status` to the `new` value from `changes`
2. Mark request as approved
3. Set `has_pending_change = false`

### 3.3 Rejecting a change request

1. Validate rejection_reason is not empty
2. Mark request: `status = 'rejected'`, `reviewed_by`, `reviewed_at = now()`, `rejection_reason`
3. Set `has_pending_change = false` on the service (if service_id is not null)

---

## 4. UI

### 4.1 Services List Page — Indicators

**Pending badge:**
- Services with `has_pending_change = true` show a small orange dot next to the service name
- Tooltip on hover: "Change pending approval"

**Pending new services:**
- `add` requests with `status = 'pending'` appear in a section above or below the main service tree
- Visually distinct: muted/dashed style, label "Pending Approval"
- Not interactable as normal services (can't be assigned to orders, etc.)

**Info icon (i):**
- Appears on every service row (in the ACTIONS column area)
- Opens the Change History Dialog (see 4.3)

### 4.2 Approval Page

**Route:** `/master-data/services/approvals`

**Access:** Only visible to users with `master_data.services.approve` permission. Add as a link/tab accessible from the services page.

**Layout:**
- Filter tabs: **Pending** | **Approved** | **Rejected**
- Table columns:
  - Service name (or "New Service: {name_en}" for adds)
  - Change type badge — color-coded: Add (blue), Edit (orange), Delete (red), Toggle Status (purple)
  - Changes summary — human-readable diff lines (e.g. "Price: 150 → 200")
  - Requested by — user name + avatar
  - Requested at — relative time (e.g. "2 hours ago")
  - Actions — **Approve** button (green), **Reject** button (red)

**Reject dialog:**
- Opens a dialog with a required textarea for rejection reason
- "Reject" button disabled until reason is entered

**Approve confirmation:**
- Simple confirm dialog: "Apply these changes to {service name}?" with Approve/Cancel buttons

### 4.3 Change History Dialog

**Trigger:** Click the info icon (i) on a service row.

**Title:** "Change History — {Service Name}"

**Content:** List of all change requests for this service, newest first.

Each entry shows:
- **Status badge** — Pending (orange), Approved (green), Rejected (red)
- **Change type** — Add / Edit / Delete / Toggle Status
- **Diff lines** — Each changed field: `Price: 150 → 200`, `Name: AC → Air Conditioning`
- **Requested by** — User name, relative timestamp
- **Reviewed by** (if resolved) — User name, relative timestamp
- **Rejection reason** (if rejected) — Red-tinted callout box

**Special cases:**
- `add` requests: Show full proposed values (name, price, division, etc.) instead of diffs
- `delete` requests: Show "Requested deletion of this service"
- `toggle_status` requests: Show "Status: Active → Inactive" (or vice versa)

### 4.4 ServiceEditDialog — Behavior Change

**Detection:** Check if current user has `master_data.services.approve` permission via `useHasPermission('master_data.services.approve')`.

**If user has approval permission:**
- Submit works exactly as today — direct save to `services` table

**If user does NOT have approval permission:**
- Same form, same validation, same fields
- On submit: create a `service_change_requests` row instead of writing to `services`
- Show success toast: "Change submitted for approval"
- If `has_pending_change` is already true on the service, show the form in read-only or disable submit with message: "A change is already pending approval for this service"

**Delete and toggle actions:**
- Same pattern: if no approval permission, create a change request instead of acting directly
- Show toast: "Deletion/status change submitted for approval"

---

## 5. API Routes

### 5.1 `POST /api/service-change-requests`

Create a new change request. Body: `{ service_id?, change_type, changes }`.

**Logic:**
1. Authenticate user, verify `services.manage` permission
2. If user has `services.approve` → reject with 400 (they should use the direct save path)
3. If `service_id` provided and service `has_pending_change = true` → reject with 409
4. Insert change request, set `has_pending_change = true` on service
5. Return the created request

### 5.2 `PATCH /api/service-change-requests/[id]/approve`

**Logic:**
1. Authenticate user, verify `services.approve` permission
2. Load the change request, verify status is `pending`
3. Apply changes based on `change_type` (see section 3.2)
4. Mark request approved, clear `has_pending_change`

### 5.3 `PATCH /api/service-change-requests/[id]/reject`

Body: `{ rejection_reason }` (required).

**Logic:**
1. Authenticate user, verify `services.approve` permission
2. Load the change request, verify status is `pending`
3. Mark request rejected with reason, clear `has_pending_change`

### 5.4 `GET /api/service-change-requests`

Query params: `?status=pending&service_id=...`

Returns change requests with joined profile data (requested_by, reviewed_by names).

---

## 6. Hooks

| Hook | Purpose |
|---|---|
| `useServiceChangeRequests(filters)` | Fetch change requests with filtering (status, service_id) |
| `useCreateChangeRequest()` | Submit a new change request |
| `useApproveChangeRequest()` | Approve a pending request |
| `useRejectChangeRequest()` | Reject a pending request with reason |
| `useServiceChangeHistory(serviceId)` | Fetch all change requests for one service (for info icon dialog) |

---

## 7. Fields Subject to Approval

Only these fields trigger the approval workflow when changed by a non-owner:

| Field | Change Type |
|---|---|
| `name_en` | edit |
| `name_ar` | edit |
| `price` | edit |
| `emergency_price` | edit |
| `status` (active/inactive) | toggle_status |
| New service creation | add |
| Service deletion | delete |

All other fields (invoice text, instructions, reminders, inventory, QC, sort order, photos, etc.) save directly regardless of role.

---

## 8. Edge Cases

1. **User edits both approval and non-approval fields at once:** Split the submission — non-approval fields save directly, approval-required fields go into a change request. Toast: "Some changes saved directly. Name/price changes submitted for approval."
2. **Service is deleted while a change request is pending:** The approval page should show the request as stale — auto-reject or let the approver dismiss it.
3. **Approver is also the requester:** Allowed — if they have `services.approve`, their changes go direct anyway, so this only happens if they manually navigate to the approval page to review someone else's request.
4. **Pending "add" request:** Shows in a pending section on the services page. Cannot be used in orders or any other module until approved and inserted into `services`.
