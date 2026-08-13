# Notification Routing — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every notification to recipients derived from a feature permission (requests → everyone holding the mapped action permission; outcomes → the original requester), via one shared resolver — so granting/removing a permission automatically turns notifications on/off, with no separate notification toggle.

**Architecture:** One `recipients_for_permission(p_perm, p_warehouse_id, p_override)` `SECURITY DEFINER` SQL function is the single source of truth. It is exposed as an RPC that client creation sites call, and it is called internally by DB-side creators (`item_request`, `low_stock_alert`, `service_change_*`). Per-type metadata (permission key, warehouse-scoping, override) lives beside the existing route/icon/actionable metadata in `notification-routes.ts`. The four ad-hoc mechanisms (`getApprovalScopeRecipients` with its fail-open `IS NULL`, the "all approval-slot" query, the "all internal users" query, the hardcoded `inventory_manager` role-name lookup) are all removed.

**Tech Stack:** Next.js 15 / React / TanStack Query v5, Supabase (Postgres 17, RLS, SECURITY DEFINER RPCs), TypeScript.

**Approved model + full 29-type mapping:** [notification-classification.md](notification-classification.md). Read it first.

## Global Constraints

- **Recipient model (approved):** archetype **A (request/actionable)** → holders of the mapped permission, resolved by `recipients_for_permission`; warehouse-scoped types additionally intersect the relevant warehouse's RPs, unioned with holders of the override permission. Archetype **B (outcome)** → the original requester by identity (`created_by`/`requested_by`/`initiated_by_profile_id`), **unconditional** (no permission check on send).
- **PO approvals (decision 1):** `po_approval_requested` + `po_edit_request_pending` → **all** `purchase.approvals.view` holders (no chain-tier filter).
- **Every new migration is written to BOTH** `supabase/migrations/` **and** `supabase/migrations-staging/` (byte-identical) in the same commit.
- **Staging only** (`mwvblpgbgxipvrevkeff`) via `npx supabase db push`; **new-prod is deferred** — batch Phase 1 + Phase 2 together after credential rotation. Do not push to new-prod in this plan.
- **Do not push git / do not merge** to `deploy/warehouse-shipping`. Commits stay local until the operator says otherwise.
- Every commit uses a HEREDOC message ending with both trailers: `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` and `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Prove every DB write/read path against the pushed function via a **rolled-back DO block** before claiming done. `tsc --noEmit` must be clean. Update the flow registry + PROGRESS.md Security Audit Log at the end.
- After `supabase gen types`, re-append the four DBTable/DBInsert/DBUpdate/AllTables helper aliases.

---

## File Structure

- **Create** `supabase/migrations/20260822000000_recipients_for_permission.sql` (+ staging mirror) — the shared resolver function + grants.
- **Create** `supabase/migrations/20260822000100_service_change_outcome_notifications.sql` (+ mirror) — wire `service_change_approved/_rejected` to the requester inside the approve/reject RPCs.
- **Create** `supabase/migrations/20260822000200_item_request_low_stock_use_resolver.sql` (+ mirror) — point the two DB-side warehouse creators at `recipients_for_permission` (uniform model).
- **Modify** `src/lib/notify.ts` — add `getRecipientsForPermission()` (thin RPC wrapper); **remove** `getApprovalScopeRecipients` once all callers are migrated.
- **Modify** `src/lib/notification-routes.ts` — add a `transfer_rejected` entry; add optional `recipients` metadata (permission/warehouseScoped/override) to `NotificationMeta`.
- **Modify** the client creation sites (exact list in Task 4/5).
- **Modify** `src/types/database.types.ts` — regenerate for the new RPC.
- **Modify** `docs/flows-registry.md` + `PROGRESS.md` — registry entry + Security Audit Log row.

---

## Task 1: Shared resolver SQL function + RPC

**Files:**
- Create: `supabase/migrations/20260822000000_recipients_for_permission.sql`
- Mirror: `supabase/migrations-staging/20260822000000_recipients_for_permission.sql`

**Interfaces:**
- Produces: RPC `recipients_for_permission(p_perm text, p_warehouse_id uuid default null, p_override text default null) returns setof uuid` — distinct `user_data` ids of everyone whose non-deleted role grants `p_perm` (or `system.admin`, or `is_system_admin`, or `p_override`); when `p_warehouse_id` is passed, a `p_perm` holder must also be an RP of that warehouse, **but** any `p_override` holder is always included.

- [ ] **Step 1: Write the migration**

```sql
-- Single source of truth for "who should be notified for permission X".
-- SECURITY DEFINER: reads role tables past RLS; returns only user_data ids.
create or replace function public.recipients_for_permission(
  p_perm         text,
  p_warehouse_id uuid default null,
  p_override     text default null
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ucr.profile_id
  from public.user_custom_roles ucr
  join public.custom_roles cr on cr.id = ucr.role_id
  where cr.deleted_at is null
    -- role grants the permission (or is a full system admin, or holds the override)
    and (
      p_perm = any(cr.permissions)
      or 'system.admin' = any(cr.permissions)
      or coalesce(cr.is_system_admin, false)
      or (p_override is not null and p_override = any(cr.permissions))
    )
    -- warehouse scope: perm-holders must be an RP of the warehouse; override-holders bypass
    and (
      p_warehouse_id is null
      or exists (
        select 1 from public.warehouse_responsible_persons rp
        where rp.warehouse_id = p_warehouse_id and rp.profile_id = ucr.profile_id
      )
      or (p_override is not null and p_override = any(cr.permissions))
    );
$$;

revoke all on function public.recipients_for_permission(text, uuid, text) from public;
grant execute on function public.recipients_for_permission(text, uuid, text) to authenticated, service_role;
```

- [ ] **Step 2: Copy byte-identical to the staging-mirror path.**

- [ ] **Step 3: Apply + verify** — `npx supabase db push`, then a rolled-back DO block (single line) proving: (a) a known approver id is returned for `('purchase.approvals.view')`; (b) warehouse scoping drops a non-RP for `('warehouse.transfer.dispatch', <whId>)`; (c) an override holder is returned for `('warehouse.transfer.dispatch', <whId>, 'warehouse.transfer.approve')` even when not an RP. Compare counts against a direct query.

- [ ] **Step 4: Regenerate types** — `npx supabase gen types typescript --linked > src/types/database.types.ts`; re-append the four helper aliases.

- [ ] **Step 5: Commit** (migration + types) with the standard trailer.

---

## Task 2: Client wrapper + per-type recipient metadata

**Files:**
- Modify: `src/lib/notify.ts`
- Modify: `src/lib/notification-routes.ts`
- Test: `src/lib/notify.test.ts` (new — pure map coverage)

**Interfaces:**
- Consumes: RPC from Task 1.
- Produces: `getRecipientsForPermission(perm: string, opts?: { warehouseId?: string; override?: string }): Promise<string[]>`; and `NOTIFICATION_RECIPIENTS: Record<string, { permission: string; warehouseScoped?: boolean; override?: string }>` (archetype-A types only).

- [ ] **Step 1: Add the wrapper to `notify.ts`:**

```ts
export async function getRecipientsForPermission(
  perm: string,
  opts?: { warehouseId?: string; override?: string },
): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('recipients_for_permission', {
    p_perm: perm,
    p_warehouse_id: opts?.warehouseId ?? undefined,
    p_override: opts?.override ?? undefined,
  })
  if (error) throw new Error(`recipients_for_permission(${perm}): ${error.code} ${error.message} ${error.details ?? ''}`.trim())
  return [...new Set(((data ?? []) as string[]))]
}
```

- [ ] **Step 2: Add the archetype-A map to `notification-routes.ts`** (single source of truth for coupling):

```ts
export const NOTIFICATION_RECIPIENTS: Record<string, { permission: string; warehouseScoped?: boolean; override?: string }> = {
  po_approval_requested:   { permission: 'purchase.approvals.view' },
  po_edit_request_pending: { permission: 'purchase.approvals.view' },
  receival_edit_request:   { permission: 'purchase.receivals.manage' },
  transfer_pending:        { permission: 'warehouse.transfer.dispatch', warehouseScoped: true, override: 'warehouse.transfer.approve' },
  transfer_dispatched:     { permission: 'warehouse.transfer.receive',  warehouseScoped: true, override: 'warehouse.transfer.approve' },
  stock_adj_pending:       { permission: 'warehouse.adjustments.view' },
  inv_check_pending:       { permission: 'warehouse.checks.view' },
  credit_group_pending:    { permission: 'master_data.customers.change_credit_group' },
  // item_request, low_stock_alert, service_change_pending are created DB-side (Task 6/7 handle them).
}
```

- [ ] **Step 3: Add `transfer_rejected` to `NOTIFICATION_ROUTES`** (fixes the missing entry):

```ts
  transfer_rejected: { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },
```

- [ ] **Step 4: Unit-test the map** — every key in `NOTIFICATION_RECIPIENTS` references a real permission in `ALL_PERMISSIONS` (import from `permissions.ts`); every actionable warehouse route has an entry. Run `npx tsc --noEmit`.

- [ ] **Step 5: Commit.**

---

## Task 3: Migrate Purchase client sites

**Files:** `src/hooks/usePurchaseOrders.ts` (~576-596, 629, 965-995), `src/hooks/usePoEditRequests.ts` (~83-100), `src/hooks/useReceivals.ts` (~245-251).

**Pattern (apply at each site):** replace the ad-hoc recipient query with
```ts
const recipients = await getRecipientsForPermission(NOTIFICATION_RECIPIENTS[<type>].permission)
```
then the existing `sendNotifications(recipients.map(...))`.

- [ ] **Step 1:** `po_approval_requested` (both submit + amend paths in `usePurchaseOrders.ts`) → drop `getNotificationRecipients(tiers, assignments)` + the `rawAssignments` fetch; use the resolver with `purchase.approvals.view`. (Tier/`assignments` fetch stays only if still needed to *build* steps — remove only the notification-recipient use.)
- [ ] **Step 2:** `po_edit_request_pending` in `usePoEditRequests.ts` → drop the `is_approval_slot` query; use the resolver.
- [ ] **Step 3:** `receival_edit_request` in `useReceivals.ts` → drop the `user_type='internal'` broadcast; use the resolver with `purchase.receivals.manage`.
- [ ] **Step 4:** `npx tsc --noEmit`; confirm no remaining import of the removed queries.
- [ ] **Step 5: Commit.**

---

## Task 4: Migrate Warehouse + Finance client sites

**Files:** `src/components/purchase/wh/WhTransferDialog.tsx` (~152, 301), `src/components/purchase/wh/WhTransfersTab.tsx` (~157-187), `src/hooks/useWarehouseOperations.ts` (~777, 1379), `src/hooks/useCreditGroupApprovals.ts` (~206).

- [ ] **Step 1:** `transfer_pending` (`WhTransferDialog.tsx`) → resolver `('warehouse.transfer.dispatch', { warehouseId: fromWhId, override: 'warehouse.transfer.approve' })`. Remove `sourceFieldRPs`.
- [ ] **Step 2:** `transfer_dispatched` (`WhTransfersTab.tsx`) → resolver `('warehouse.transfer.receive', { warehouseId: t.to_warehouse_id, override: 'warehouse.transfer.approve' })`. Remove `getFieldRPProfileIds`.
- [ ] **Step 3:** `transfer_received_shrinkage` (`WhTransfersTab.tsx`) → recipients = creator (`t.created_by_profile_id`) ∪ `getRecipientsForPermission('warehouse.transfer.approve')`. Remove `getInventoryManagerProfileIds` (hardcoded role name).
- [ ] **Step 4:** `stock_adj_pending` + `inv_check_pending` (`useWarehouseOperations.ts`) → resolver with `warehouse.adjustments.view` / `warehouse.checks.view`. Remove `getApprovalScopeRecipients` calls.
- [ ] **Step 5:** `credit_group_pending` (`useCreditGroupApprovals.ts`) → resolver with `master_data.customers.change_credit_group`. Remove the `getApprovalScopeRecipients('credit_group')` call.
- [ ] **Step 6:** `npx tsc --noEmit`. Confirm `getApprovalScopeRecipients` now has zero callers.
- [ ] **Step 7: Commit.**

---

## Task 5: Remove the dead resolver + fail-open

**Files:** `src/lib/notify.ts`.

- [ ] **Step 1:** Delete `getApprovalScopeRecipients` (fail-open `IS NULL` gone with it). Grep the repo to confirm no import remains.
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3: Commit.**

---

## Task 6: DB-side warehouse creators use the resolver

**Files:** Create `supabase/migrations/20260822000200_item_request_low_stock_use_resolver.sql` (+ mirror). Source both function bodies from the LIVE DB (`pg_get_functiondef`) first.

- [ ] **Step 1:** In `rpc_request_warehouse_item` (latest live body), replace the inline `warehouse_responsible_persons` recipient loop with `insert ... select ... from recipients_for_permission('warehouse.item_requests.view', p_warehouse_id)`. Verify no RP that should be notified is dropped — the Phase-1 backfill granted `warehouse.item_requests.view` to every role holding `warehouse.access`, so RPs keep coverage; **flag in the commit if any active RP's role lacks the key.**
- [ ] **Step 2:** In `check_low_stock_and_notify` (live body), replace the RP loop with `recipients_for_permission('warehouse.stock.view', NEW.warehouse_id)`.
- [ ] **Step 3:** Apply + rolled-back DO-block verify each emits to the expected set. Regenerate types if signatures changed (they don't).
- [ ] **Step 4: Commit.**

---

## Task 7: Wire service-change outcomes

**Files:** Create `supabase/migrations/20260822000100_service_change_outcome_notifications.sql` (+ mirror). Source `approve_service_change` + `reject_service_change` bodies from the LIVE DB first.

- [ ] **Step 1:** In `approve_service_change`, after the status update, insert a `service_change_approved` notification to the request's `created_by` (requester), `related_id = <request id>`, `related_type = 'service_change'`.
- [ ] **Step 2:** Same for `reject_service_change` → `service_change_rejected`.
- [ ] **Step 3:** Apply + rolled-back DO-block verify each outcome inserts exactly one notification to the requester.
- [ ] **Step 4: Commit.**

---

## Task 8: Verify, document, security checklist

- [ ] **Step 1:** `npx tsc --noEmit` clean; grep proves the four removed mechanisms have zero callers.
- [ ] **Step 2:** Per-type regression — for each archetype-A type, a rolled-back DO block (or a scripted RPC call) proves the resolver returns exactly the intended recipients; for each B type, confirm the requester id is used.
- [ ] **Step 3:** `docs/flows-registry.md` — add/adjust the notification-routing entry noting the permission-coupled model + the shared resolver.
- [ ] **Step 4:** `PROGRESS.md` Security Audit Log row (Secrets/RLS/Auth/Error/Layout): the DEFINER resolver is read-only, returns only ids, `REVOKE public` + `GRANT authenticated/service_role`; note the pre-existing latent item that clients can still `insert` into `notifications` directly (out of scope; flag for a future RLS pass).
- [ ] **Step 5:** Update PROGRESS.md In Progress/Completed; commit docs separately.
- [ ] **Step 6:** Operator smoke matrix (spawn a per-type test sheet): grant/remove each mapped permission and confirm the notification appears/disappears for that user; confirm outcomes still reach the requester; confirm `transfer_rejected` now deep-links.

---

## Self-Review notes

- **Spec coverage:** all 29 types are covered — archetype-A via Tasks 3/4/6 (+ service_change_pending already correct), archetype-B unchanged except the two service-change outcomes (Task 7) and `transfer_rejected` route (Task 2). The 5 approved decisions map to: dec.1 → Task 2 map (no tier filter); dec.2 → B types untouched (unconditional); dec.3 → Task 3 Step 3; dec.4 → Task 7; dec.5 → Task 2 Step 3 + it's already emitted.
- **No new permission keys needed** — every mapped key already exists in `permissions.ts` (verified).
- **Behavior-change callouts:** PO approval notifications broaden to all `purchase.approvals.view` holders (approved); `receival_edit_request` narrows (approved); `item_request` becomes permission∩RP instead of all-RP (Task 6 — verify no RP loses coverage).
- **Latent, out of scope:** `notifications` table INSERT is client-side; a future pass could move creation fully DB-side and tighten RLS.
