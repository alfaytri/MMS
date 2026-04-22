# PO Approval Chain — Design Spec
Date: 2026-04-22

## Problem

The existing `po_approvals` table and approval page exist but the system has no way to know which actual users fill each approval role. Steps are created but any user can approve anything. Thresholds are hardcoded. There is no in-app notification system.

## Goals

- Configurable approval chains per division (with company-wide default fallback)
- Cumulative, sequential tiers — a $100K PO goes through all tiers whose `min_amount` it exceeds, in rank order
- Within each tier, roles run in parallel — one person per role is enough (any-one-of, not all-of)
- Role-based queue — PO appears to anyone currently holding the required role (no pinning at submit time)
- Rejection short-circuits immediately — all pending steps cancelled
- In-app notification bell for approvers
- Creator cannot approve their own PO (audit compliance)
- Ghost notifications auto-cleared when a step is fulfilled

---

## Database Schema

### New Tables

```sql
-- One chain per division. NULL division_id = company default.
approval_chains (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id   UUID REFERENCES divisions(id),
  name          TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(division_id)  -- one active chain per division
)

-- Each tier: a ranked threshold band with required roles.
-- Tiers are cumulative: all tiers where total_qar >= min_amount apply.
-- Soft-deleted (deleted_at) — never hard-deleted while POs are in flight.
approval_chain_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id        UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  rank            INT NOT NULL,        -- execution order (1 = first)
  min_amount      NUMERIC NOT NULL,
  max_amount      NUMERIC,             -- NULL = no upper limit
  required_roles  approval_role[] NOT NULL,
  deleted_at      TIMESTAMPTZ,         -- soft delete
  UNIQUE(chain_id, rank)
)

-- Maps users to approval roles, scoped to a division or company-wide.
-- Soft-deleted (deleted_at) — removal does not break in-flight approvals.
approval_role_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         approval_role NOT NULL,
  division_id  UUID REFERENCES divisions(id),  -- NULL = company-wide
  created_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ,                    -- soft delete
  UNIQUE(profile_id, role, division_id)
)

-- In-app notification inbox.
notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,           -- e.g. 'po_approval_requested'
  title         TEXT NOT NULL,
  body          TEXT,
  related_id    UUID,                    -- e.g. po_id
  related_type  TEXT,                   -- e.g. 'purchase_order'
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
)
```

### Modified: `po_approvals`

Remove `assigned_to`. Add `tier_rank` and `is_active` flag.

```sql
ALTER TABLE po_approvals
  DROP COLUMN IF EXISTS assigned_to,
  ADD COLUMN tier_rank   INT NOT NULL DEFAULT 1,
  ADD COLUMN is_active   BOOLEAN DEFAULT false;
  -- approved_by already exists (TEXT). Keep as profile email.
  -- status already exists: pending | approved | rejected | cancelled
```

---

## Approval Chain Resolution

When a PO is submitted (`status → pending_approval`):

1. **Find chain** — look up `approval_chains` where `division_id` matches the PO's division. If none, fall back to `division_id IS NULL` (company default). If still none → block submission with error: *"No approval chain configured. Contact your administrator."*

2. **Find applicable tiers** — select all tiers from that chain where `total_qar >= min_amount`, ordered by `rank` ascending. These are the cumulative tiers the PO must pass through. *Recommended tier design: each tier should introduce a new role (e.g., Tier 1 = PM, Tier 2 = Accountant, Tier 3 = Owner) rather than repeating roles across tiers.*

3. **Create steps** — for each tier, for each role in `required_roles`, create one `po_approval` row:
   - `tier_rank = tier.rank`
   - `role = role`
   - `status = 'pending'`
   - `is_active = true` only for the **lowest rank** tier; higher tiers start as `is_active = false`

4. **Validation** — before creating steps, verify:
   - At least one user (other than the PO creator) holds each required role in the division or company-wide. If any role has no eligible assignee → block with error: *"No [role] assigned for this division (excluding you). Please assign an additional approver."*
   - Admin UI must also warn when a tier has zero assignees so dead-end configs are caught before submission.

5. **Self-approval guard** — the PO creator is excluded from being an eligible approver at any tier. This is enforced at two points:
   - Submission validation (step 4 above)
   - Queue query: `AND po.created_by != current_user_profile_id`

6. **Deduplication** — notifications use `DISTINCT ON profile_id` per PO. If a user holds 3 roles that all require approval on the same PO, they receive **one** notification, not three.

7. **Notifications** — for each newly activated step, collect the set of distinct users with `required_role` in that division (excluding PO creator), fire one `notification` row per user.

---

## Approval Execution

### Who sees pending POs
`/purchase/approvals` Pending tab queries:
```
po_approvals WHERE status = 'pending'
  AND is_active = true
  AND role IN (current user's approval_role_assignments for their division)
  AND po.created_by != current_user_profile_id   -- self-approval guard
```

### Approving a step
1. Current user clicks Approve on a PO step (their role's row)
2. Set `status = 'approved'`, `approved_by = current user email`, `date = now()`
3. **Ghost notification cleanup** — mark all `notifications` for this PO as read:
   `UPDATE notifications SET read_at = now() WHERE related_id = po_id AND type = 'po_approval_requested' AND read_at IS NULL`
4. Check if all `is_active` steps for this PO are `approved`
5. If yes → check if there is a next tier (lowest rank where `is_active = false`)
   - If next tier exists → set its steps to `is_active = true`, fire new notifications to those role holders
   - If no next tier → flip PO `status = 'approved'`, notify PO creator

### Rejecting a step
1. Set the rejecting step to `status = 'rejected'`
2. Set all other `po_approval` rows for this PO to `status = 'cancelled'`
3. **Ghost notification cleanup** — mark all `po_approval_requested` notifications for this PO as read
4. Flip PO status per rejection mode:
   - `full_rejection` → `status = 'cancelled'`
   - `send_back_to_draft` → `status = 'draft'`

---

## Admin Config UI

Location: **Settings → Approvals** (admin-only, gated by existing permission system)

### Tab 1 — Approval Chains
- List of chains: one per division + company default
- Each chain shows its tiers in a table: Rank | Amount Range | Required Roles | Actions
- "Add Tier" → inline form: rank, min amount, max amount (optional), role checkboxes
- Must have at least one tier to be active

### Tab 2 — Role Assignments
- Table: User | Role | Division | Actions
- "Assign Role" → pick user from profiles, pick role, pick division (or company-wide)
- A user can hold multiple roles across multiple divisions
- Removing an assignment uses soft delete — does not retroactively affect in-flight approvals
- Warning shown on chains/tiers where a required role has zero active (non-soft-deleted) assignees

---

## In-App Notifications

### Bell icon (top nav)
- Unread badge count: `notifications WHERE profile_id = me AND read_at IS NULL`
- Dropdown: latest 10 notifications, title + time ago
- Clicking a notification → navigate to `/purchase/approvals`, mark as read
- "Mark all as read" button

### Notification types (initial)
- `po_approval_requested` — "PO #123 requires your approval"
- `po_approved` — "PO #123 has been fully approved" (sent to PO creator)
- `po_rejected` — "PO #123 was rejected by [name]" (sent to PO creator)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No chain for division | Fall back to company default. If none, block submission. |
| Required role has no eligible assignees (excluding creator) | Block submission with named error. |
| PO creator holds the only approver role in a tier | Block submission: *"You are the only assigned [role] for this division."* |
| Creator tries to approve their own PO | Filtered from queue — button never appears to them. |
| Same user holds multiple required roles in a tier | One notification only (DISTINCT); separate step rows per role still created for audit trail. |
| Step claimed/approved/rejected | Auto-mark all `po_approval_requested` notifications for that PO as read (ghost cleanup). |
| User removed from role mid-approval | Soft delete only — their existing steps are unaffected. New POs no longer route to them. |
| Admin tries to delete a tier with in-flight POs | Block deletion: *"Active POs are pending approval on this tier."* |
| PO amount changes after submission | Not allowed — edit requires send-back-to-draft first (existing versioning behavior). |
| One rejection at any tier | All remaining pending/inactive steps cancelled immediately; PO rejected. |

---

## Out of Scope (this spec)

- Email / SMS notifications
- Approval delegation / substitute approvers
- Approval SLA tracking (overdue alerts)
- Batch approvals
- Approval chains for other modules (invoices, sales orders)
