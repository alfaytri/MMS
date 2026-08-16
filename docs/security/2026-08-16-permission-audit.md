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

## E. ⚠️ Operational write RPCs bypass permissions entirely (systemic — found during batch 2)

Most create/action flows don't insert directly — they call a `SECURITY DEFINER` RPC, which **bypasses RLS**. Almost none of those RPCs check a permission key (or even division/RP scope) in-body, so the matching catalog keys are **cosmetic (UI-only)**: any authenticated user can perform the action by calling the RPC directly via the Data API.

**Confirmed DEFINER + `checks_perm = false`** (spot-checked `rpc_create_purchase_bill` + `generate_invoice_from_so` = **no access control at all**, only field validation):
- Bills `rpc_create_purchase_bill` · Invoices `generate_invoice_from_so` · POs `rpc_create_purchase_order` · Receivals `create_and_approve_receival` · Transfers `create_transfer_v2` / `dispatch_transfer` / `receive_transfer` / `cancel_transfer` / `reject_transfer_v2` · Adjustments `create_stock_adjustment_v2` / `apply_adjustment` / `approve_stock_adjustment_inventory` / `force_approve_stock_adjustment` · Deliveries `create_and_confirm_delivery` / `complete_delivery_inventory` / `cancel_delivery_inventory` · Returns/credit-notes `rpc_record_return_refund` / `rpc_record_return_store_credit` / `rpc_process_return_restock` / `rpc_create_custody_return` / `rpc_redeem_credit_note` · Inventory checks `save_inventory_check_item_count` / `apply_inventory_check_adjustments` / `snapshot_inventory_check_system_qty`.

**Counter-examples that DO check** (`create_inventory_receival`, `rpc_transfer_tool_unit`, VWh `create_project`/milestone RPCs) — the pattern exists; it's just applied inconsistently, so the gaps read as oversights, not design.

**Impact.** Batch-2's items (bills / invoices / credit-notes `.create`) are part of this. Making any of them enforceable means adding a permission check **inside the RPC**. Each is a **tightening** (ungated today → requires a permission), so each needs a role-impact check + granting the key to the roles that should perform it. ~30 money-path RPCs → a planned, staged hardening effort, not an ad-hoc fix.

---

## Recommended fix order
1. **A1 (quick, high-value):** make `roles/bills/invoices/credit_notes` INSERT honor `.create OR .manage`. Small migrations, same shape as customers, no regression.
2. **B/A2 (decide):** tighten `companies/divisions/warehouses/suppliers` INSERT to require the module's `.create`/`.manage` (removes the wide-open access). Needs a call on who should create each.
3. **A3 (per-RPC):** add the create-permission check inside the receival/transfer/shipment/check RPCs.
4. **Reference tables:** decide whether to gate or leave open.

---

## F. ✅ Approval-EXECUTION layer — COMPLETE (Batch 5, migrations `20260909000000` + `20260909000100`)

Ran a full sweep of every `SECURITY DEFINER` function matching `approv|advance|reject|action.*step` and read each body. Findings (details in [the hardening plan](2026-08-16-rpc-permission-hardening-plan.md) § Batch 5):

- **Already correct (left as-is):** `po_approval_action`, `approve_sales_request`, `reject_sales_request`, `force_approve_sales_request`, `force_approve_stock_adjustment`, credit-group approvals — all derive identity from `auth.uid()` and check the step role / Owner slot in-body. (So §E's spot-check note above was pessimistic for `force_approve_stock_adjustment` — it *does* check the Owner role.) `build_inv_check_approval_chain` is a read-only preview — left callable.
- **HOLE fixed — identity spoofing:** `action_stock_adjustment_step` authorized on a **client-supplied `p_profile_id`**; rewritten to use `auth.uid()`.
- **HOLES fixed — ungated internal mutators (REVOKEd from `authenticated`, service-role/internal only):** `approve_stock_adjustment_inventory`, `approve_receival_inventory` (orphan; posts receival inventory with no check — matches §E's flag), `advance_sales_approval`, `advance_po_approval_tier` (orphan), `build_sales_approval_chain`. All owned by `postgres` and only invoked by gated DEFINER callers → REVOKE closes the direct Data-API path without breaking the internal flow.

Verified on staging + new-prod (grant removed, direct `authenticated` call → `42501`, internal path intact). **Still open:** the four *deferred* create-RPCs from Batch 4 (`create_service_customer`, `upsert_package_with_services`, `rpc_cancel_consumption`, `rpc_create_custody_return`) — no role holds their key today, so gating would make them admin-only; needs a role-grant decision.
