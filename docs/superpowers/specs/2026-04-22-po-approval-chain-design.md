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
approval_chain_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id        UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  rank            INT NOT NULL,        -- execution order (1 = first)
  min_amount      NUMERIC NOT NULL,
  max_amount      NUMERIC,             -- NULL = no upper limit
  required_roles  approval_role[] NOT NULL,
  UNIQUE(chain_id, rank)
)

-- Maps users to approval roles, scoped to a division or company-wide.
approval_role_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         approval_role NOT NULL,
  division_id  UUID REFERENCES divisions(id),  -- NULL = company-wide
  created_at   TIMESTAMPTZ DEFAULT now(),
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

4. **Validation** — before creating steps, verify at least one user holds each required role in the division (or company-wide). If any role has no assignee → block with error: *"No [role] assigned for this division. Contact your administrator."*

5. **Deduplication** — if the same user holds multiple required roles within a single tier, they still only get one notification (but separate step rows remain per role so the audit trail is correct).

6. **Notifications** — for each active step, look up all users with `required_role` in that division, fire one `notification` row per user.

---

## Approval Execution

### Who sees pending POs
`/purchase/approvals` Pending tab queries:
```
po_approvals WHERE status = 'pending'
  AND is_active = true
  AND role IN (current user's approval_role_assignments for their division)
```

### Approving a step
1. Current user clicks Approve on a PO step (their role's row)
2. Set `status = 'approved'`, `approved_by = current user email`, `date = now()`
3. Check if all `is_active` steps for this PO are `approved`
4. If yes → check if there is a next tier (lowest rank where `is_active = false`)
   - If next tier exists → set its steps to `is_active = true`, fire notifications to those role holders
   - If no next tier → flip PO `status = 'approved'`

### Rejecting a step
1. Set the rejecting step to `status = 'rejected'`
2. Set all other `po_approval` rows for this PO to `status = 'cancelled'`
3. Flip PO status per rejection mode:
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
- Removing an assignment does not retroactively affect in-flight approvals

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
| Required role has no users | Block submission with named error. |
| Same user holds multiple required roles in a tier | One notification only; separate step rows per role still created. |
| User removed from role mid-approval | Their existing approved/pending steps are unaffected. New POs no longer route to them. |
| PO amount changes after submission | Not allowed — edit requires send-back-to-draft first (existing versioning behavior). |
| One rejection in a multi-role tier | All other pending steps on the PO are immediately cancelled. |

---

## Out of Scope (this spec)

- Email / SMS notifications
- Approval delegation / substitute approvers
- Approval SLA tracking (overdue alerts)
- Batch approvals
- Approval chains for other modules (invoices, sales orders)
