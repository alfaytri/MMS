# Permission Audit — 3-state (view/create/edit) Sweep

**Date:** 2026-08-04
**Companion plan:** [2026-08-04-category-attributes-plan.md](2026-08-04-category-attributes-plan.md) Phase 0.3
**Files touched:** `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx`

## Legend

| Column | Meaning |
|---|---|
| `.view` | Read-only key exists |
| `.create` | Create key exists (added in this sweep unless noted) |
| `.edit` | Edit key exists (either explicit `.edit` or legacy `.manage` alias) |
| `—` | Intentionally absent — column note explains why |
| ✅ | Present before this sweep |
| ➕ | Added in this sweep |

## Master Data

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `master_data.companies` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.divisions` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.warehouses` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.inventory` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.suppliers` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.customers` | ✅ | ➕ | ✅ (.manage) | Plus bespoke `.change_credit_group` / `.change_type` for elevated actions |
| `master_data.service_customers` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.services` | ✅ | ➕ | ✅ (.manage) | Plus bespoke `.approve` for governance |
| `master_data.users` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.roles` | ✅ | ➕ | ✅ (.manage) | |
| `master_data.admin` | ✅ | — | ✅ (.manage) | Admin settings is edit-only surface (no distinct "create") |
| `master_data.audit` | ✅ | — | — | Read-only log |

## Purchase

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `purchase.orders` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.approvals` | ✅ | — | — | Governance via `chain.manage` + `bypass` sub-keys |
| `purchase.shipments` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.receivals` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.landed_costs` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.bills` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.dead_stock` | ✅ | — | — | Read-only report |
| `purchase.returns` | ✅ | ➕ | ✅ (.manage) | |
| `purchase.debit_notes` | ✅ | — | — | View-only page; DN creation is a downstream effect of purchase returns |
| `purchase.warehouses` | ✅ | — | ✅ (.manage) | Legacy alias for `warehouse.*` — deprecated |

## Sales

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `sales.orders` | ✅ | ➕ | ✅ (.manage) | |
| `sales.approvals` | ✅ | — | ✅ (.manage) | Approve/reject action, no create distinction |
| `sales.invoices` | ✅ | ➕ | ✅ (.manage) | |
| `sales.returns` | ✅ | ➕ | ✅ (.manage) | |
| `sales.deliveries` | ✅ | ➕ | ✅ (.manage) | |
| `sales.credit_notes` | ✅ | ➕ | ✅ (.manage) | |

## Warehouse

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `warehouse.warehouses` | ✅ | — | — | Tab visibility only; edit is via `warehouse.settings.manage` |
| `warehouse.settings` | — | — | ✅ (.manage) | WH row edits; row creation is via `master_data.warehouses.create` |
| `warehouse.stock` | ✅ | — | — | Read-only overview |
| `warehouse.stock_value` | ✅ | — | — | Read-only financial view |
| `warehouse.movements` | ✅ | — | — | Read-only audit log |
| `warehouse.receivals` | ✅ | — | — | Read-only summary (creation via `purchase.receivals.create`) |
| `warehouse.transfers` | ✅ | — | — | Uses bespoke `warehouse.transfer.{create,dispatch,receive,approve}` |
| `warehouse.adjustments` | ✅ | — | — | Uses bespoke `warehouse.adjustment.request` |
| `warehouse.checks` | ✅ | — | — | Uses bespoke `warehouse.check.{count,create}` |

## Operations

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `custody.teams` | ✅ | — | ➕ | Rows created by upstream flows (receivals / transfers) — no create key |
| `custody.places` | ✅ | — | ➕ | Same as teams |
| `consumption` | ✅ | ✅ | ✅ (.cancel) | Already 3-state via bespoke `.cancel` acting as edit |
| `damaged_stock.on_hand` | ✅ | — | ➕ | Rows created by receival / return flows — no create key |
| `damaged_stock.out_for_repair` | ✅ | — | ➕ | Same — no create key |

## Orders

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `orders` | ✅ | ➕ | ✅ (.manage) | |
| `follow_ups` | — | — | — | Uses bespoke `.request` / `.confirm` |
| `quotations` | ✅ | ➕ | ✅ (.manage) | |

## Contracts

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `contracts.quotations` | ✅ | ➕ | ✅ (.manage) | |
| `contracts.live` | ✅ | — | ✅ (.manage) | Live contracts arise from activation, not direct create |
| `contracts.activate` | — | — | — | Bespoke governance key |

## Invoices & Payments

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `invoices` | ✅ | ➕ | ✅ (.manage) | |
| `payments` | ✅ | ➕ | ✅ (.manage) | |

## Teams

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `teams` | ✅ | ➕ | ✅ (.manage) | |
| `employees` | ✅ | ➕ | ✅ (.manage) | |
| `teams.team_leader` | ✅ | — | ✅ (.manage) | Assignments only; no distinct create surface |
| `teams.map` | ✅ | — | ✅ (.manage) | Assignments only |
| `calendar` | ✅ | — | ✅ (.manage) | Visits come from orders — no direct create |

## Reports / System / Contact Centre

| Area | .view | .create | .edit | Notes |
|---|---|---|---|---|
| `reports` | ✅ | — | ✅ (.manage as export) | Read-only pages; `.manage` here means "can export" |
| `system.admin` | — | — | — | Bypass key |
| `contact_centre` | ✅ | ➕ | ➕ | Was view-only; adds `.create` (new manual threads / tasks) + `.edit` (reply / edit customer / complete tasks) |

## Backwards compatibility

Every legacy `.manage` key is retained as an alias of `.edit` — no rename of role data. `useHasEditPermission(area)` treats `.manage` and `.edit` as synonymous. Task 0.4 backfill migration grants `.create` to every role currently holding `.manage`, so no existing workflow breaks on deploy.

The three helpers (`useHasViewPermission`, `useHasCreatePermission`, `useHasEditPermission`) are the ONLY new consumer contract. Callsites that check `.manage` directly via `useHasPermission('X.manage')` continue to work but should migrate to `useHasEditPermission('X')` opportunistically.

## Skipped intentionally

- Report / audit / read-only surfaces — no mutation, no `.create` / `.edit` needed.
- Bespoke sub-action keys (transfers, adjustments, follow-ups, approvals, activation) — already granular; not force-fit into the trio.
- `purchase.warehouses.*` — deprecated alias.
- `master_data.admin.*` — a bag-of-settings surface with no natural row-create/row-edit boundary.
