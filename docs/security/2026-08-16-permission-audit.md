# Permission Audit — catalog vs. actual enforcement (2026-08-16)

**Method.** Cross-referenced three sources on staging (`mwvblpgbgxipvrevkeff`):
1. **Catalog** — grantable keys in `PermissionTree.tsx` (source of truth for the role editor). 134 keys.
2. **RLS** — every `public` table's INSERT/UPDATE/DELETE policy (`pg_policies`) and the permission key it checks.
3. **RPCs** — every `SECURITY DEFINER` function body that calls `_user_has_permission` / `_auth_user_has_permission`.

A permission is only *real* if a write path (RLS policy or the RPC that performs the write) actually checks its key. The gaps below are where a granted permission does **nothing**, or where a write needs **no** permission at all.

> Scope note: analysis is on **staging**. Policies come from shared migrations, so new-prod matches for the spot-checks done (customers, payments). Verify each item on new-prod before fixing there.

---

## TL;DR

- **Systemic:** the app exposes a `.create` checkbox for most modules, but the DB almost never checks `.create`. Creating is gated by `.manage`, by division/sub-container scope, by "any internal user" (`with_check = true`), or by an RPC that checks nothing. So most `.create` permissions are **inert** — granting them has no effect.
- **Two already fixed this session:** `master_data.customers.create` and the new `sales/purchase.payments.record`.
- **No orphan keys:** every key checked in RLS/RPCs exists in the catalog (nothing ungrantable).

---

## A. Inert "Create" permissions — the checkbox does nothing

### A1. Create is gated on `.manage` instead of `.create` (same class as the customers bug — quick fix)
| Permission (grantable) | Table | INSERT actually requires | Verdict |
|---|---|---|---|
| `master_data.roles.create` | `custom_roles` | `master_data.roles.manage` | **inert** — creating a role needs *manage* |
| `purchase.bills.create` | `bills` | `purchase.bills.manage` | **inert** |
| `sales.invoices.create` | `so_invoices` | `sales.invoices.manage` | **inert** |
| `sales.credit_notes.create` | `credit_notes` | `sales.credit_notes.manage` OR a hardcoded Accounting-role check | **inert** |

**Fix (per table):** `ALTER POLICY <insert> WITH CHECK (has(<x>.create) OR has(<x>.manage))` — exactly the customers fix. Backward-compatible (keeps `.manage`).

### A2. Create is open to any internal user / gated only by division scope (create + manage both inert here)
| Permission | Table | INSERT gate | Verdict |
|---|---|---|---|
| `master_data.companies.create` | `companies` | `with_check = true` | **inert + wide-open** (any authenticated) |
| `master_data.divisions.create` | `company_divisions` | `with_check = true` | **inert + wide-open** |
| `master_data.warehouses.create` | `warehouses` | `with_check = true` | **inert + wide-open** |
| `master_data.suppliers.create` | `suppliers` | `with_check = true` | **inert + wide-open** |
| `sales.orders.create` | `sale_orders` | division visibility only | **inert** (any user in-division) |
| `purchase.orders.create` | `purchase_orders` | division visibility only | **inert** (any user in-division) |
| `sales.deliveries.create` | `sale_deliveries` | `true` + division | **inert** |
| `sales.returns.create` / `purchase.returns.create` | `so_po_returns` | `true` + division | **inert** |
| `warehouse.adjustment.request` | `stock_adjustments` | `true` + sub-container | **inert** |

### A3. Create runs through a DEFINER RPC that does NOT check the create key
| Permission | Write path | Verdict |
|---|---|---|
| `purchase.receivals.create` | `create_and_approve_receival` / `create_inventory_receival` | RPC does not check the key (not in the permission-checking set) |
| `warehouse.transfer.create` | transfer RPC | RPC does not check the key |
| `purchase.shipments.create` | shipments write (restrictive-only RLS → RPC) | not checked |
| `warehouse.check.create` | inventory-check RPC | not checked |

*(These need the check added **inside** the RPC, not via RLS — bigger change.)*

---

## B. Under-gated writes (security / defense-in-depth)

Any authenticated user can insert directly (RLS `with_check = true`), regardless of role — the UI hides the button, but the Data API doesn't:
- **Master data:** `companies`, `company_divisions`, `warehouses`, `suppliers` (also listed in A2).
- **Order/flow tables** insertable with only division/sub-container visibility (no permission): `sale_orders`, `purchase_orders`, `sale_order_lines`, `sale_deliveries`, `so_po_returns`, `stock_adjustments`.
- **Reference data (lower risk):** `currencies`, `payment_methods`, `country_codes`, `credit_groups`, `warehouse_reorder_points`, `approval_workflow_groups`, `po_rfq_quotes`, `po_version_lines` — all `with_check = true`.

Internal-ERP context lowers the practical risk (all users are staff), but the RLS should enforce what the UI implies.

---

## C. Fixed this session ✅
- `master_data.customers.create` — `customers` INSERT now `create OR manage` (migration `20260902000000`; live on staging + new-prod).
- `sales.payments.record` + `purchase.payments.record` — new keys + per-type payments INSERT gate (migration `20260903000000`; live on staging + new-prod).

## D. Properly enforced (control group)
`inventory.catalog.manage` (brands/categories/items/variants/item_divisions/tool_asset_units), `warehouse.projects.manage` (disciplines/projects/milestones), `master_data.roles.manage`, `purchase.bills.manage`, `sales.invoices.manage`, `sales.credit_notes.manage`, `purchase.payments.manage`. These modules have **no separate `.create`**, so there's no mismatch — `.manage` is the single write key (consistent).

---

## Recommended fix order
1. **A1 (quick, high-value):** make `roles/bills/invoices/credit_notes` INSERT honor `.create OR .manage`. Small migrations, same shape as customers, no regression.
2. **B/A2 (decide):** tighten `companies/divisions/warehouses/suppliers` INSERT to require the module's `.create`/`.manage` (removes the wide-open access). Needs a call on who should create each.
3. **A3 (per-RPC):** add the create-permission check inside the receival/transfer/shipment/check RPCs.
4. **Reference tables:** decide whether to gate or leave open.
