# Notification Routing — Phase 2 Classification (APPROVED)

- **Date:** 2026-08-13
- **Branch:** `feature/item-requests-and-notifications`
- **Status:** APPROVED — all §4 decisions signed off by the operator 2026-08-13; ready for the implementation plan.
- **Source inventory:** full read-only sweep of every notification `type` (29), its creation site, and its current recipient rule. Permission keys below are verified against `src/lib/permissions.ts`.

## 1. The model

Every notification type is exactly one of two archetypes:

**A — Request / actionable** (stays pending until someone approves / dispatches / accepts / resolves).
Recipients = **every user whose role holds the mapped ACTION permission**, resolved by one shared helper `getRecipientsForPermission(permKey)`. For surfaces that are *warehouse-scoped*, additionally scoped to **RPs of the relevant warehouse** (a data assignment a permission can't express):
`recipients = holders(permKey) ∩ ( RP(warehouse) ∪ holders(crossWarehouseOverride) )`.

**B — Outcome** (approved / rejected / received / response).
Recipient = **the original requester** (identity read from the source row's `created_by` / `requested_by` / `initiated_by_profile_id`). No permission fan-out — that would spam everyone with "PO-123 approved". Optionally still gated on the requester holding the surface's `.view`/`.create` (see decision 2).

**Auto-coupling.** Because archetype-A recipients are derived live from "who holds permission X", granting the permission adds you to the recipient set and removing it drops you — with **no separate notification permission or toggle**. This is exactly what the operator asked for ("grant PO access → PO notifications on; remove → off"), made precise: *approval* notifications couple to the *approval* permission; *outcome* notifications reach *the person who created the record*.

**One shared resolver** replaces today's four ad-hoc mechanisms:
- `getApprovalScopeRecipients(scope)` — `approval_scopes @> {scope} OR approval_scopes IS NULL` (the `IS NULL` branch is a fail-open bug: a role with null scopes receives *every* pending type).
- "all approval-slot holders" inline query (`usePoEditRequests`, `usePurchaseOrders`).
- "all internal users" (`useReceivals` — the widest fan-out in the app).
- hardcoded role-name lookup `custom_roles.name = 'inventory_manager'` (shrinkage).

Model the replacement on the **one site that already does it right** —
`notify_approvers_on_service_change`: `'master_data.services.approve' = ANY(cr.permissions)`.

New signature (client + a SQL mirror):
```
getRecipientsForPermission(permKey: string, opts?: { warehouseId?: string; alsoOverride?: string }): profileId[]
```

## 2. Classification table (proposed mapping — real permission keys)

`A` = actionable/request · `B` = outcome. "WH-RP" = additionally scoped to the relevant warehouse's responsible persons.

| type | Group | Kind | Recipients today | Proposed coupling |
|---|---|---|---|---|
| `po_approval_requested` | Purchase | A | matched chain-tier approver roles | `purchase.approvals.view` (all holders — no tier filter, per resolved decision 1) |
| `po_approved` | Purchase | B | PO creator | requester; couples to `purchase.orders.create` |
| `po_rejected` | Purchase | B | PO creator | requester; `purchase.orders.create` |
| `po_edit_request_pending` | Purchase | A | ALL approval-slot roles | `purchase.approvals.view` |
| `po_edit_request_approved` | Purchase | B | requester | requester; `purchase.orders.manage` |
| `po_edit_request_declined` | Purchase | B | requester | requester; `purchase.orders.manage` |
| `receival_edit_request` | Purchase | A | **ALL internal users** | `purchase.receivals.manage` (**decision 3**) |
| `receival_edit_response` | Purchase | B | requester | requester; `purchase.receivals.create` |
| `so_approved` | Sales | B | SO creator | requester; `sales.orders.create` |
| `so_rejected` | Sales | B | SO creator | requester; `sales.orders.create` |
| `transfer_pending` | Warehouse | A | source-WH RPs | `warehouse.transfer.dispatch` + WH-RP(source) |
| `transfer_dispatched` | Warehouse | A | dest-WH RPs | `warehouse.transfer.receive` + WH-RP(dest) |
| `transfer_received` | Warehouse | B | transfer creator | requester; `warehouse.transfer.create` |
| `transfer_received_shrinkage` | Warehouse | B | creator + hardcoded `inventory_manager` | creator + `warehouse.transfer.approve` holders |
| `transfer_rejected` | Warehouse | B | transfer creator (**no route entry**) | requester; `warehouse.transfer.create` (**decision 5**) |
| `stock_adj_pending` | Warehouse | A | approval_scopes-or-null | `warehouse.adjustments.view` |
| `stock_adj_approved` | Warehouse | B | initiator | requester; `warehouse.adjustment.request` |
| `stock_adj_rejected` | Warehouse | B | initiator | requester; `warehouse.adjustment.request` |
| `inv_check_pending` | Warehouse | A | approval_scopes-or-null | `warehouse.checks.view` |
| `inv_check_approved` | Warehouse | B | initiator | requester; `warehouse.check.create` |
| `inv_check_rejected` | Warehouse | B | initiator | requester; `warehouse.check.create` |
| `low_stock_alert` | Warehouse | A* | affected-WH RPs | `warehouse.stock.view` + WH-RP(affected) |
| `item_request` | Operations | A | target-WH RPs (Phase 1) | `warehouse.item_requests.view` + WH-RP(target) — already correct |
| `service_change_pending` | Master-Data | A | holders of `master_data.services.approve` | `master_data.services.approve` — **already the target model** |
| `service_change_approved` | Master-Data | B | **never sent (dead route)** | requester; `master_data.services.create` (**decision 4**) |
| `service_change_rejected` | Master-Data | B | **never sent (dead route)** | requester; `master_data.services.create` (**decision 4**) |
| `credit_group_pending` | Finance | A | approval_scopes-or-null | `master_data.customers.change_credit_group` |
| `credit_group_approved` | Finance | B | requester | requester; `master_data.customers.change_credit_group` |
| `credit_group_rejected` | Finance | B | requester | requester; `master_data.customers.change_credit_group` |

\* `low_stock_alert` never "resolves" like an approval, but it is a broadcast-to-permission-holders type, so it follows archetype A's resolver (permission + WH-RP), not the requester pattern.

Note: **Sales has no actionable/pending notification today** — approvers watch the queue directly; only outcomes (`so_approved`/`so_rejected`) are sent, to the creator. If the operator wants SO-approval requests to notify approvers (like PO does), that's a net-new type (`so_approval_requested` → `sales.approvals.view`), not in scope unless requested.

## 3. Bugs / gaps found (fix during Phase 2, independent of the model)

1. **Fail-open recipients** — `getApprovalScopeRecipients` includes roles with `approval_scopes IS NULL`, so a null-scope role receives *every* pending type. The permission-based resolver removes this.
2. **`receival_edit_request` → all internal users** — broadest fan-out in the app; narrow to `purchase.receivals.manage`.
3. **Hardcoded role name** — shrinkage targets `custom_roles.name = 'inventory_manager'`; couple to `warehouse.transfer.approve` instead.
4. **`transfer_rejected` has no `notification-routes.ts` entry** — no deep-link, wrong icon, not flagged actionable. Add a route (`/master-data/warehouses`, `transfer` icon).
5. **`service_change_approved` / `service_change_rejected` are dead route entries** — never emitted, so a service requester is never told the outcome. Wire them in the approve/reject RPCs (decision 4).

## 4. Decisions (RESOLVED 2026-08-13)

1. **PO approval precision → All approval-queue viewers.** `po_approval_requested` and `po_edit_request_pending` go to every holder of `purchase.approvals.view`, with **no** chain-tier filter. Fully uniform with every other archetype-A type — the shared resolver needs no special-case tier logic. (Trade-off accepted: an approver may be pinged for a PO below/above their tier.)
2. **Outcome gating → Always notify the requester**, unconditionally, regardless of whether they still hold the module permission. Archetype-B recipients stay pure identity (`created_by`/`requested_by`/`initiated_by_profile_id`); no permission check on send.
3. **Narrow `receival_edit_request`** → `purchase.receivals.manage` holders (was: all internal users). ✅ in scope.
4. **Wire service-change outcomes** — `service_change_approved` / `service_change_rejected` now notify the requester (`created_by`); today they are never sent. ✅ in scope.
5. **`transfer_rejected`** — add the missing `notification-routes.ts` entry (`/master-data/warehouses`, `transfer` icon) and treat as a `B` outcome to the transfer creator. ✅ in scope.

All five locked by the operator; §2's proposed coupling is now the final mapping.

## 5. Implementation outline (after sign-off)

1. `getRecipientsForPermission(permKey, opts)` — client helper + a `SECURITY DEFINER` SQL function mirror for DB-side creators (`item_request`, `low_stock_alert`, `service_change_*`).
2. Migrate the ~8 client creation sites off the ad-hoc queries onto the resolver.
3. Fix the 5 bugs in §3.
4. Add the missing route + wire the two service-change outcomes.
5. Regression pass: for each type, prove (rolled-back DO block / unit) that exactly the intended recipients resolve.
