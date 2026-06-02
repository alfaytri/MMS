# Service Approval Workflow — Design Spec

**Date:** 2026-06-02
**Status:** Final
**Module:** Master Data — Services

---

## Problem

Currently any user with `master_data.services.manage` permission can add, edit, or delete services directly. There is no review step — changes go live immediately. The business needs owners to review and approve high-impact service changes before they take effect.

## Decisions

| Decision | Choice |
|---|---|
| Changes requiring approval | Add, edit name, edit price, delete, toggle active/inactive |
| Changes that bypass approval | Sort order, invoice text, instructions, inventory links, QC, reminders, photos |
| Tracking approach | JSONB diff (`{ field: { old, new } }`) — unified format for all change types including add (`old: null`) |
| Approver identity | New permission `master_data.services.approve` |
| Owner UX | Dedicated approval page (not inline) |
| Pending visibility | Orange badge on service row; "add" requests shown as pending entries |
| Concurrency | One pending change per service at a time (enforced by trigger-managed boolean) |
| Rejection | Marked as rejected, reason **required**. Proposer can resubmit fresh or "Duplicate & Edit" rejected adds. |
| Atomic submissions | If any approval-required field is touched, the **entire** payload is held for approval (no split submission) |
| Change history | Info icon (i) on each service row opens a dialog showing all past changes |
| API pattern | Single Postgres SECURITY DEFINER RPC — client never branches on permissions |
| RLS pattern | Simple auth-based reads, write RLS = `false` (all writes via RPC) |
| State sync | Postgres trigger on `service_change_requests` keeps `has_pending_change` in sync automatically |

---

## 1. Database Schema

### 1.1 New enum: `service_change_type`

```sql
CREATE TYPE service_change_type AS ENUM ('add', 'edit', 'delete');
```

Note: `toggle_status` is dropped as a separate type. A status toggle is just an `edit` with `changes = { status: { old: 'active', new: 'inactive' } }`.

### 1.2 New enum: `service_change_status`

```sql
CREATE TYPE service_change_status AS ENUM ('pending', 'approved', 'rejected');
```

### 1.3 New table: `service_change_requests`

```sql
CREATE TABLE service_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID REFERENCES services(id),          -- NULL for 'add' requests
  division         division,                               -- Copied from service or from payload for 'add'
  change_type      service_change_type NOT NULL,
  changes          JSONB NOT NULL,                         -- Always { field: { old, new } } format
  status           service_change_status NOT NULL DEFAULT 'pending',
  requested_by     UUID NOT NULL REFERENCES profiles(id),
  reviewed_by      UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Constraints:**
- `CHECK (status != 'rejected' OR rejection_reason IS NOT NULL)` — rejection reason mandatory
- `CHECK (change_type != 'add' OR service_id IS NULL)` — add requests have no existing service
- `CHECK (change_type = 'add' OR service_id IS NOT NULL)` — edit/delete must reference a service

**Indexes:**
- `idx_scr_service_id_status` ON `(service_id, status)` — pending lookup per service
- `idx_scr_status` ON `(status)` — approval queue filtering
- `idx_scr_requested_by` ON `(requested_by)` — user's own requests
- `idx_scr_division_status` ON `(division, status)` — division-scoped approval queue

### 1.4 Changes to `services` table

```sql
ALTER TABLE services ADD COLUMN has_pending_change BOOLEAN NOT NULL DEFAULT false;
```

This column is managed **exclusively** by a Postgres trigger (section 1.6) — application code never sets it directly.

### 1.5 RLS Policies

**`service_change_requests`:**

```sql
-- Reads: own requests OR users with services.approve permission
CREATE POLICY scr_select ON service_change_requests FOR SELECT USING (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = auth.uid()
    AND cr.deleted_at IS NULL
    AND 'master_data.services.approve' = ANY(cr.permissions)
  )
);

-- Writes: ALL writes go through SECURITY DEFINER RPCs — no direct client writes
CREATE POLICY scr_insert ON service_change_requests FOR INSERT WITH CHECK (false);
CREATE POLICY scr_update ON service_change_requests FOR UPDATE USING (false);
CREATE POLICY scr_delete ON service_change_requests FOR DELETE USING (false);
```

RLS is enabled, but all mutations route through SECURITY DEFINER functions, preventing any direct client-side manipulation.

### 1.6 Trigger: `sync_service_pending_lock`

Automatically maintains `has_pending_change` on the `services` table whenever `service_change_requests` rows are inserted, updated, or deleted.

```sql
CREATE OR REPLACE FUNCTION sync_service_pending_lock()
RETURNS TRIGGER AS $$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);

  -- Skip for 'add' requests (service_id is NULL)
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_change_requests
    WHERE service_id = target_service_id
    AND status = 'pending'
  )
  WHERE id = target_service_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_change_request_status_change
AFTER INSERT OR UPDATE OF status OR DELETE ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION sync_service_pending_lock();
```

### 1.7 Trigger: Auto-reject on service deletion

When a service is soft-deleted, all pending change requests for it are automatically rejected.

```sql
CREATE OR REPLACE FUNCTION auto_reject_pending_on_service_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_change_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now()
    WHERE service_id = NEW.id
    AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_service_soft_delete
AFTER UPDATE OF deleted_at ON services
FOR EACH ROW EXECUTE FUNCTION auto_reject_pending_on_service_delete();
```

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

## 3. Business Logic — Unified RPC

### 3.0 Architecture: Single Postgres RPC

All service mutations (create, edit, delete, toggle) route through a single `SECURITY DEFINER` RPC function:

```sql
CREATE OR REPLACE FUNCTION submit_service_change(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
  -- 1. Identify calling user via auth.uid()
  -- 2. Check user's permissions from custom_roles
  -- 3. If user has services.approve → apply changes directly to services table
  -- 4. If user has services.manage only → insert into service_change_requests
  -- 5. Return { action: 'applied' | 'pending', id: ... }
$$;
```

**Why SECURITY DEFINER:** The function executes with the DB owner's privileges, allowing it to bypass RLS for cross-table permission lookups and conditional inserts. The client calls a single `supabase.rpc('submit_service_change', { p_payload })` regardless of role.

**Payload shape:**
```json
{
  "service_id": "uuid-or-null",
  "change_type": "add | edit | delete",
  "data": { /* full form payload for add, or changed fields for edit */ },
  "division": "maintenance"
}
```

### 3.1 Submitting a change request (non-approver path)

**Atomic submission rule:** If any approval-required field is touched (name_en, name_ar, price, emergency_price, status), the **entire** form payload is held for approval. No split submissions — this prevents semantic incoherence (e.g. instructions updating for a renamed service that hasn't been approved yet).

**For `edit`:**
1. Compare submitted values against current service values
2. Build unified diff: `{ price: { old: 150, new: 200 }, name_en: { old: "AC", new: "Air Conditioning" } }`
3. Include ALL changed fields in the diff (both approval-required and non-approval) when any approval-required field was touched
4. If ONLY non-approval fields changed → save directly (no change request)
5. Guard: if `has_pending_change = true` on the service → return error

**For `add`:**
1. Format as unified diff: `{ name_en: { old: null, new: "Deep Clean" }, price: { old: null, new: 200 }, ... }`
2. Insert with `service_id = NULL`, `change_type = 'add'`
3. Set `division` on the change request from the payload

**For `delete`:**
1. Insert with `change_type = 'delete'`, `changes = { deleted: { old: false, new: true } }`
2. Guard: if `has_pending_change = true` → return error

**For status toggle (treated as `edit`):**
1. Insert with `change_type = 'edit'`, `changes = { status: { old: 'active', new: 'inactive' } }`
2. Guard: if `has_pending_change = true` → return error

### 3.2 Approving a change request

**RPC:** `approve_service_change(p_request_id UUID)`  — also SECURITY DEFINER.

**Stale data check (critical):** Before applying an `edit`, verify that every `old` value in the JSONB diff still matches the current live value in the `services` row. If any field has drifted (e.g. an approver directly edited the service since the request was made), reject the approval with error: "The live service data has changed since this request was made. Please reject this request and ask the user to submit a new one."

**For `edit`:**
1. Run stale data check
2. For each field in `changes`, update the corresponding column on the `services` row
3. Mark request: `status = 'approved'`, `reviewed_by = auth.uid()`, `reviewed_at = now()`

**For `add`:**
1. Validate uniqueness: attempt INSERT into `services` using the payload
2. If unique constraint violation → return a clear error ("A service with this name already exists in this division") instead of crashing. Manager can reject the duplicate request.
3. Set `service_change_requests.service_id` to the newly created service ID (for history linkage)
4. Mark request as approved

**For `delete`:**
1. Run pre-deletion safety checks: verify the service is not tied to incomplete orders, active contracts, or scheduled visits. Use the same validation logic as the standard service deletion path.
2. If safe → soft-delete: `SET deleted_at = now()`
3. If unsafe → return error explaining why deletion is blocked
4. Mark request as approved

### 3.3 Rejecting a change request

**RPC:** `reject_service_change(p_request_id UUID, p_reason TEXT)` — SECURITY DEFINER.

1. Validate `p_reason` is not empty
2. Mark request: `status = 'rejected'`, `reviewed_by = auth.uid()`, `reviewed_at = now()`, `rejection_reason = p_reason`
3. Trigger fires automatically to update `has_pending_change`

### 3.4 Withdrawing a change request

**RPC:** `withdraw_service_change(p_request_id UUID)` — SECURITY DEFINER.

1. Verify `auth.uid() = requested_by` (only the original requester can withdraw)
2. Verify `status = 'pending'`
3. Hard-delete the row (or set status to a 'withdrawn' value)
4. Trigger fires automatically to clear `has_pending_change`

### 3.5 Updating a pending request

**RPC:** `update_pending_service_change(p_request_id UUID, p_new_changes JSONB)` — SECURITY DEFINER.

1. Verify `auth.uid() = requested_by`
2. Verify `status = 'pending'`
3. Update the `changes` JSONB with the new payload
4. Update `updated_at`

This allows requesters to fix mistakes (e.g. a typo in a 20-field add request) without going through reject → re-create.

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

**Division scoping:** The approval queue filters by division. If the approver has division-scoped access, they only see requests for their division(s). The `division` column on `service_change_requests` enables this filtering (including for `add` requests that have no `service_id` to join against).

**Layout:**
- Filter tabs: **Pending** | **Approved** | **Rejected**
- Division filter dropdown (when multiple divisions exist)
- Table columns:
  - Service name (or "New Service: {name_en}" for adds)
  - Division badge
  - Change type badge — color-coded: Add (blue), Edit (orange), Delete (red)
  - Changes summary — human-readable diff lines (e.g. "Price: 150 → 200")
  - Requested by — user name + avatar
  - Requested at — relative time (e.g. "2 hours ago")
  - Actions — **Approve** button (green), **Reject** button (red)

**Reject dialog:**
- Opens a dialog with a required textarea for rejection reason
- "Reject" button disabled until reason is entered

**Approve confirmation:**
- Simple confirm dialog: "Apply these changes to {service name}?" with Approve/Cancel buttons
- If stale data check fails, show error: "Service has been modified since this request. Please reject and request a new change."
- If add uniqueness fails, show error with the specific conflict

### 4.3 Change History Dialog

**Trigger:** Click the info icon (i) on a service row.

**Title:** "Change History — {Service Name}"

**Content:** List of all change requests for this service, newest first.

Each entry shows:
- **Status badge** — Pending (orange), Approved (green), Rejected (red)
- **Change type** — Add / Edit / Delete
- **Diff lines** — Each changed field on its own row: `Price: 150 → 200`, `Name: AC → Air Conditioning`
- **Requested by** — User name, relative timestamp
- **Reviewed by** (if resolved) — User name, relative timestamp
- **Rejection reason** (if rejected) — Red-tinted callout box

**Unified diff rendering:** All change types use the same `{ field: { old, new } }` format:
- `add` requests: `old` is always `null` → render as "Price: — → 200"
- `delete` requests: render as "Requested deletion of this service"
- `edit` requests: render as "Price: 150 → 200"

**Rejected add requests:** Show a "Duplicate & Edit" button that repopulates the New Service form with the rejected request's payload, so the user doesn't have to re-type everything.

### 4.4 ServiceEditDialog — Behavior Change

**Detection:** The RPC handles permission routing server-side. The frontend only needs to know the result to display the right toast.

**Submit flow:**
1. Frontend always calls `supabase.rpc('submit_service_change', { p_payload })`
2. RPC returns `{ action: 'applied', id }` or `{ action: 'pending', id }`
3. If `action = 'applied'` → toast: "Service saved"
4. If `action = 'pending'` → toast: "Change submitted for approval"
5. If error (pending change exists) → toast: "This service already has a pending change awaiting approval"

**Form field locking:**
- When `has_pending_change = true`, only lock the specific approval-required inputs (name_en, name_ar, price, emergency_price, status toggle, delete button)
- Non-approval fields (invoice text, instructions, photos, QC, inventory, sort order) remain fully editable and save directly — they are never blocked by a pending approval

**Delete and toggle actions:**
- Same pattern: submit through the unified RPC
- Show appropriate toast based on the returned `action`

---

## 5. Hooks

| Hook | Purpose |
|---|---|
| `useSubmitServiceChange()` | Calls the unified `submit_service_change` RPC |
| `useServiceChangeRequests(filters)` | Fetch change requests with filtering (status, division, service_id) |
| `useApproveChangeRequest()` | Calls `approve_service_change` RPC |
| `useRejectChangeRequest()` | Calls `reject_service_change` RPC |
| `useWithdrawChangeRequest()` | Calls `withdraw_service_change` RPC |
| `useUpdatePendingChange()` | Calls `update_pending_service_change` RPC |
| `useServiceChangeHistory(serviceId)` | Fetch all change requests for one service (for info icon dialog) |

---

## 6. Fields Subject to Approval

Only these fields trigger the approval workflow when changed by a non-approver:

| Field | Approval required |
|---|---|
| `name_en` | Yes |
| `name_ar` | Yes |
| `price` | Yes |
| `emergency_price` | Yes |
| `status` (active/inactive) | Yes |
| New service creation | Yes (entire payload) |
| Service deletion | Yes |

All other fields (invoice text, instructions, reminders, inventory, QC, sort order, photos, etc.) save directly regardless of role.

**Atomic rule:** If ANY approval-required field is touched in an edit, the ENTIRE payload (including non-approval fields) is held for approval together. Non-approval fields are only saved directly when no approval-required field was changed.

---

## 7. Notifications

When a change request is approved or rejected, the system must notify the requester:

- **On approval:** In-app notification: "Your change to {service name} has been approved by {reviewer name}"
- **On rejection:** In-app notification: "Your change to {service name} was rejected by {reviewer name}: {reason}"
- Notifications use the existing in-app notification system (bell icon)
- Triggered inside the `approve_service_change` and `reject_service_change` RPCs

---

## 8. Edge Cases

1. **Atomic submissions:** If any approval-required field is touched, the entire payload is held. No split submissions. This prevents semantic incoherence (instructions referencing a renamed service that isn't approved yet).
2. **Service deleted while change pending:** Trigger `auto_reject_pending_on_service_delete` auto-rejects all pending requests with reason "Service was deleted."
3. **Approver is also the requester:** If they have `services.approve`, their changes go direct via the RPC — no change request is ever created.
4. **Pending "add" request:** Shows in pending section. Cannot be used in orders or other modules until approved.
5. **Stale data on approval:** The `approve_service_change` RPC verifies all `old` values in the diff still match the live service. If drifted, approval is blocked with error. Manager must reject and request a new change.
6. **Duplicate add requests:** If two users submit add requests for the same service name, the first approval succeeds. The second approval catches the unique constraint violation and returns a clear error — no server crash.
7. **Requester withdrawal:** Users can withdraw their own pending requests or update the JSONB payload while status is `pending`, avoiding the reject → re-type loop.
8. **Rejected add resubmission:** A "Duplicate & Edit" button on rejected add requests repopulates the form, so users don't re-type 20 fields from scratch.
9. **Pre-deletion safety on delete approval:** The `approve_service_change` RPC runs the same safety checks as standard deletion (active orders, live contracts, scheduled visits) before soft-deleting.
10. **Non-approval field edits during pending:** Only approval-required inputs are locked. Non-approval fields remain editable and save directly.

---

## 9. Architectural Constraints

1. **No module reads from `service_change_requests`:** The pending table is exclusively for the Approvals UI and Change History dialog. All operational features (Contracts, Orders, Quotations, Calendar) must query the live `services` table only. Pending unapproved prices must never bleed into revenue calculations or catalog displays.
2. **Data retention:** Rejected and approved requests are retained for audit history. A future cleanup job may hard-delete rejected requests older than 90 days if the table grows large.
