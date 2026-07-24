# Credit-Group assignment — proper request-and-approval dialog

**Status:** pending (spec only, no code yet)
**Date:** 2026-07-24
**Priority:** high — closes a compliance hole
**Blocks:** auditable customer credit-group history, per-customer doc-gate enforcement

## Problem

Today the "Assign group…" dropdown on the customer row directly writes `customers.credit_group_id`. That:

- **Bypasses the approval workflow** — an existing chain of RPCs (`submit_credit_group_change` → `approve_credit_group_change` / `reject_credit_group_change` / `force_approve_credit_group_change`) is fully built server-side but not invoked.
- **Bypasses the doc gate** — business customers must have CR + Establishment ID + Signed Credit Form uploaded; individuals must have the Signed Credit Form. The RPC enforces this; the dropdown skips it entirely.
- **Bypasses the blocking rule** — new customers should be blocked (`block_reason = 'Pending credit group approval'`) until an approver signs off. The dropdown doesn't block anyone.
- **Leaves no audit trail** — a request row in `customer_credit_group_requests` + approval steps in `customer_credit_group_approvals` should exist per assignment. The dropdown creates neither.

## Goal

Replace the plain dropdown with a **request-and-approve dialog** that:

1. Enforces doc-upload before submission
2. Calls `submit_credit_group_change` (creates request + starts approval chain)
3. Shows pending state on the customer row until approvers action
4. Reserves direct assignment (bypass) for Owner role via `force_approve_credit_group_change`

## UX

### On the customer row (list view)

Current:
```
Credit Group    [ Assign group ▼ ]
```

Proposed:
```
Credit Group    [—]    [+ Request]      ← cash customer, no group
Credit Group    Group Name    ⚠ Pending  ← request in flight
Credit Group    Group Name    [Change]   ← approved, credit customer
```

- Cash (no group): shows "—" with a "+ Request" button
- Pending request: shows requested group name with an amber "Pending" pill; clicking opens read-only status view
- Approved: shows group name with "Change" button (opens same dialog to change group — also goes through approval)
- Owners only: extra "Force Assign" menu action for bypassing the chain

### The Request dialog

Header: `Request Credit Group — <Customer Name>`

Body sections:

**1. Target group (Select)**
- Dropdown of `credit_groups` where `credit_limit > 0`
- Zero-limit groups get assigned directly today (bypasses approval per the RPC's own logic) — offer a separate "Assign to zero-limit group" flow if needed later

**2. Entity type badge (read-only)**
- Shows the customer's `entity_type` — Individual or Business — because it determines what docs are required

**3. Required documents checklist**

For **Business**:
- [x] CR (Commercial Registration) — uploaded ✓ or dropzone
- [x] Establishment ID — uploaded ✓ or dropzone
- [x] Signed Credit Form — uploaded ✓ or dropzone

For **Individual**:
- [x] Signed Credit Form — uploaded ✓ or dropzone

Each row:
- If already uploaded (URL exists on customer row): green checkmark + "View" link + "Replace" option
- If missing: red X + dropzone accepting PDF / JPG / PNG, max 10 MB
- On upload: file goes to Supabase Storage under `customer-docs/<customer_id>/<doc_type>-<timestamp>.pdf`; corresponding `<doc>_url` and `<doc>_uploaded_at` on the customer row get updated

**4. Notes (optional)**
- Free-text field, will pass to `submit_credit_group_change` if we add a `p_notes` param (small RPC signature bump)

**5. Actions**
- **Cancel** — closes dialog, no writes
- **Submit Request** — disabled until all required docs are present and target group is picked

### On submit

1. All missing docs upload to Storage first (parallel `Promise.all`)
2. Customer's `cr_url` / `establishment_id_url` / `signed_credit_form_url` get set via `UPDATE customers`
3. Call `submit_credit_group_change(customer_id, group_id)` — server does the rest (chain build, block if new, activity log)
4. Success toast → close dialog → invalidate customers query → row re-renders with Pending pill

If any step fails: rollback strategy is to keep the doc uploads (they're valid) but not create the request row. RPC failures show inline error.

### Pending state view

Clicking the Pending pill opens a read-only dialog showing:
- Requested group + when + by whom
- Current approval chain step + who's next
- Any comments from approvers
- **Cancel Request** button — only available to the requester, calls a new `cancel_credit_group_change(request_id)` RPC (needs to be built — see Server changes below)

### Approver-side (existing page)

`/master-data/credit-group-approvals` already exists ([CreditGroupApprovalsContent.tsx](src/components/master-data/CreditGroupApprovalsContent.tsx)) and reads the pending requests. Approvers see them, click Approve/Reject, existing RPCs run. No change needed there — this plan just funnels more requests into that queue.

### Owner force-assign

For a bypass:
- Menu action on the customer row: "Force Assign Group (Owner only)"
- Opens same dialog but with a warning banner: "This bypasses the approval chain — a Force Assign audit entry will be created"
- On submit: creates the request via `submit_credit_group_change`, then immediately calls `force_approve_credit_group_change(request_id, p_comment)`
- Two activity_log rows appear (request + force-approval), so the audit trail stays honest

## Server changes needed

Minor — most of the RPC machinery is already there.

1. **New RPC — `cancel_credit_group_change(p_request_id uuid, p_reason text)`**
   - Only the original requester (or an admin) can call it
   - Sets request status to `cancelled`, marks all pending approval steps as cancelled
   - If customer was auto-blocked, unblocks (`block_reason = NULL`)
   - Writes activity_log entry
   - ~40 lines of plpgsql

2. **Optional `p_notes` param on `submit_credit_group_change`** — thread the notes into the request row and activity_log entry. Keep the old signature for backward compat.

3. **Storage bucket + policies** — verify `customer-docs` bucket exists with:
   - Authenticated read
   - Authenticated write (for uploaders)
   - Service role update/delete
   - Migration file if any of these are missing today

## Client changes needed

New/modified files:

- **`src/components/master-data/CreditGroupRequestDialog.tsx`** (new, ~350 lines) — the dialog described above
- **`src/components/master-data/CreditGroupPendingDialog.tsx`** (new, ~120 lines) — the read-only pending status view
- **`src/hooks/useCreditGroupRequest.ts`** (new, ~150 lines) — mutations for submit + cancel; wraps the doc uploads
- **`src/hooks/useCreditGroups.ts`** — remove the current `useAssignCustomerToCreditGroup` mutation (the one that does `UPDATE customers SET credit_group_id` directly). Force all assignment through the dialog.
- **`src/app/(dashboard)/master-data/customers/page.tsx`** — rewrite the "Assign group…" dropdown into the new pattern (three states: cash / pending / assigned)
- **Storage upload helper** — small utility in `src/lib/customer-docs.ts` (new) that handles the upload + returns the public URL

## Testing checklist

Run on staging after implementation:

- [ ] Cash customer with no docs → open dialog → all docs required → cannot submit → upload docs → can submit → request appears in approvals page
- [ ] Business customer needs all 3 docs; individual needs only signed credit form
- [ ] Uploading a wrong file type → rejected client-side + server-side
- [ ] File over 10 MB → rejected client-side + server-side
- [ ] Submit request → customer row shows Pending pill; new customer (no prior group) gets `block_reason = 'Pending credit group approval'`
- [ ] Approve chain → customer group set, block_reason cleared
- [ ] Reject chain → request rejected, block_reason cleared (customer unblocked)
- [ ] Cancel request (from requester's side) → request cancelled, block_reason cleared
- [ ] Force-assign as Owner → group set immediately, both activity_log entries created
- [ ] Force-assign as non-Owner → server rejects
- [ ] Change existing group → same flow, request created for the change
- [ ] Concurrent requests on the same customer → RPC rejects the second one ("There is already a pending credit-group change for this customer")
- [ ] After DB is restarted mid-upload → docs uploaded but request not created → dialog can be reopened and submission retried

## Estimated effort

| Component | Effort |
|---|---|
| `cancel_credit_group_change` RPC | 30 min |
| Storage bucket check + policies | 20 min |
| `CreditGroupRequestDialog.tsx` | 4–5 hr |
| `CreditGroupPendingDialog.tsx` | 1.5 hr |
| `useCreditGroupRequest.ts` hook | 1.5 hr |
| Doc upload helper + validation | 1 hr |
| Wire into customers page | 1.5 hr |
| Testing on staging | 1 hr |
| **Total** | **~1 day (10–12 hours)** |

## Rollout

- Feature-flag the new dialog behind an env var (`NEXT_PUBLIC_CREDIT_APPROVAL_FLOW=v2`) so it can be turned off if issues arise
- Keep the old dropdown path in a hidden state (return early if flag is on) for one release cycle, then delete
- Migrate any in-flight direct assignments: none needed — the DB already has `submit_credit_group_change` records; existing customers with a group just have no `customer_credit_group_requests` row and that's OK

## Rollback

- Set feature flag to `v1` — restores old dropdown behavior
- Doc uploads that landed in Storage stay (they're valid), can be re-used when the flow returns
- Any pending `customer_credit_group_requests` rows that were created can be auto-cancelled by a one-liner UPDATE if needed

## Open questions to answer before building

1. **Who can be an approver?** — Set today by `approval_workflow_steps` where `workflow='credit_group'`. If empty, requests auto-approve. Confirm the current chain config is correct.
2. **What happens to a customer's docs when they change groups?** — Do they need to re-upload each time? Right now the RPC just checks `<doc>_url IS NOT NULL` — old docs are re-used. That's probably right; confirm.
3. **Should approved requests be visible in customer history?** — The activity_log module already stores them, but a "Credit Group History" tab on the customer detail page would be user-facing. Not included in this plan; can add later.

## Success criteria

- Zero direct `UPDATE customers SET credit_group_id` calls remain in the codebase (grep-verifiable)
- Every credit group assignment (past or future) has a matching `customer_credit_group_requests` row
- Every new business customer without required docs cannot get a credit group without uploading them first
- Owners can still bypass via a documented force-assign action that leaves a trail
