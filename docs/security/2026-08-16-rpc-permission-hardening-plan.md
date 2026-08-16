# RPC Permission Hardening — plan (2026-08-16)

Follow-up to [the permission audit](2026-08-16-permission-audit.md) §E: ~40 user-callable `SECURITY DEFINER` write RPCs enforce no permission (DEFINER bypasses RLS), so most operational `.create`/action permissions are UI-only.

**Key de-risker:** the roles are **already configured** with the right keys (Purchase User/Manager hold `purchase.orders/bills/receivals.create`, Sales hold `sales.orders/invoices/deliveries.create`, Inventory/Warehouse hold `warehouse.transfer.*` / `check.*`, Accounting holds `bills/invoices/credit_notes.create`, etc.). So wiring each RPC to check its key **enforces the existing config** — the intended users already hold the keys, admins bypass, so **no regression** — it only blocks users who shouldn't have access.

---

## Two fix patterns (decided per RPC by how it's called)

- **Pattern A — service-role lockdown.** RPC is called ONLY from a server-side, permission-gated API route via the service-role client → `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (keep `service_role`). An in-body user check can't be used (service-role call has no user JWT).
- **Pattern B — in-body check.** RPC is called directly by the authenticated client → add `IF NOT public._auth_user_has_permission('<key>') THEN RAISE EXCEPTION … USING ERRCODE='42501'; END IF;` at the top, **preserving** any existing division/RP guard (add, don't replace).
- **Pattern C — leave (already gated).** Approval-step RPCs gated by the approval chain (`is_approval_slot` / `user_has_approval_role_in_scope`), RP-gated custody RPCs, and reads gated by `is_division_visible`. Verify, don't add a second gate.

**Per-RPC execution protocol:** (1) grep the app for the call site → pattern A or B; (2) read the body → confirm current gating (avoid double-gating / breaking a chain); (3) confirm the target roles hold the key (matrix below); (4) apply to staging + new-prod; (5) rolled-back probe (holder passes, non-holder blocked); (6) commit + mirror.

---

## Priority & staged batches

### ✅ P0 — DONE (2026-08-16, commit `6a02e096`)
`replace_user_custom_roles_v2` / `replace_user_custom_roles` — role assignment, was authenticated-callable + ungated → **self-assign-admin hole**. Fixed via Pattern A (service-role only). Live on staging + new-prod.

### Batch 1 — integrity/security (do next)
- **Approval-chain tampering:** `add_workflow_step` / `update_workflow_step_role` / `update_workflow_step_conditions` / `archive_workflow_step` / `toggle_workflow_step` → require `purchase.approvals.chain.manage` (Pattern B, or A if route-only). *Ungated here = a user could edit approval chains and bypass approvals — treat as P1.*
- **RP assignment:** `replace_warehouse_responsible_persons` → `master_data.warehouses.manage` (or A if route-only).
- **Verify (Pattern C, likely leave):** `advance_po_approval_tier`, `po_approval_action`, `advance_sales_approval`, `approve/reject/force_approve_sales_request`, `approve_stock_adjustment_inventory`, `force_approve_stock_adjustment`, `action_stock_adjustment_step`, credit-group approvals — confirm each is chain/slot-gated.

### Batch 2 — money-path creates (client-called → Pattern B)
| RPC | Require |
|---|---|
| `rpc_create_purchase_order` | `purchase.orders.create` OR `.manage` |
| `rpc_create_purchase_bill` | `purchase.bills.create` OR `.manage` |
| `generate_invoice_from_so` / `rpc_sync_invoice_from_so` | `sales.invoices.create` OR `.manage` |
| `create_sale_order` / `create_order_with_dates` / `resubmit_sale_order` | `sales.orders.create` OR `.manage` |
| `create_and_approve_receival` / `apply_receival_edit` | `purchase.receivals.create` / `.manage` |
| `create_landed_cost` / `allocate_landed_cost` / `revert_landed_cost` | `purchase.landed_costs.create` / `.manage` |
| `create_and_confirm_delivery` / `complete_delivery_inventory` / `cancel_delivery_inventory` | `sales.deliveries.create` / `.manage` |

### Batch 3 — warehouse / inventory ops (client-called → Pattern B)
`create_transfer_v2` → `warehouse.transfer.create`; `dispatch_transfer` → `.dispatch`; `receive_transfer` → `.receive`; `cancel_transfer`/`reject_transfer_v2` → `.approve` *(confirm)*; `create_stock_adjustment_v2` → `warehouse.adjustment.request`; `save_inventory_check_item_count` → `warehouse.check.count`; `snapshot_inventory_check_system_qty`/`apply_inventory_check_adjustments` → `warehouse.check.create` *(confirm)*. Custody assign (`rpc_create_custody_assign`/`dispatch`/`accept`) — verify RP-gated (Pattern C).

### Batch 4 — returns / credit-notes / master-data / misc
Returns + credit-notes RPCs (`rpc_record_return_refund`/`_store_credit`/`_process_return_restock`/`_close_return`/`rpc_redeem_credit_note`/…) → `sales.returns.manage` / `sales.credit_notes.manage` / `purchase.returns.manage` by type. Master-data RPCs (`create_customer_with_phone`, `create_service_customer`, `create_tool_item_with_default_variant`, `batch_update_variant_prices`, `service_inventory_bulk_upsert`, `upsert_package_with_services`) → the matching `.create`/`.manage` / `inventory.catalog.manage`.

### ✅ Batch 5 — approval-EXECUTION hardening (2026-08-16, migrations `20260909000000` + `20260909000100`)
Resolves open decision #3. Read the body of every approval action RPC and traced call sites (client + internal).

**Already correctly gated (Pattern C — verified, left as-is):** `po_approval_action` (derives `auth.uid()`, ignores `p_approver_*`, checks the step's role / Owner-for-force; advances tiers *inline*), `approve_sales_request` / `reject_sales_request` (inline `is_approval_slot` + scope check + four-eyes), `force_approve_sales_request` / `force_approve_stock_adjustment` (Owner-slot check), credit-group approvals. `build_inv_check_approval_chain` is a **read-only** `STABLE` preview (no writes) — left callable.

**Fixed — HOLE 1 (identity spoofing):** `action_stock_adjustment_step` authorized on a **client-supplied `p_profile_id`** → a caller could pass a victim's profile_id (who holds the role) and forge an approval in their name. Rewritten to derive the real approver from `auth.uid()` for both the `user_can_action_adjustment_step` check and the attribution; `p_profile_*` args are now ignored (frontend already passes the current user's own id → zero behavior change).

**Fixed — HOLES 2–5 (ungated internal mutators, Pattern A / REVOKE):** these `SECURITY DEFINER` functions posted inventory/cost or flipped approval state with **no caller authz** and were directly `authenticated`-callable; each is only ever invoked by the gated DEFINER functions above (all owned by `postgres`, so REVOKE keeps the internal `PERFORM` working). 0 client call-sites for all.
| RPC | Effect if called directly | Caller |
|---|---|---|
| `approve_stock_adjustment_inventory` | approve + post FIFO/stock/cost for any adjustment | `action_stock_adjustment_step`, `force_approve_stock_adjustment` |
| `approve_receival_inventory` | approve + post receival inventory (or reverse `received_qty`) | *orphan* (live flow = `create_and_approve_receival`) |
| `advance_sales_approval` | flip SO → `confirmed` | `approve_sales_request`, `force_approve_sales_request` |
| `advance_po_approval_tier` | flip PO → `approved` | *orphan* (logic inlined in `po_approval_action`) |
| `build_sales_approval_chain` | inject arbitrary `sale_order_approvals` rows | `create_sale_order`, `apply_sale_order_edit`, `resubmit_sale_order` |

Verified on staging + new-prod: rewrite landed, `authenticated` grant removed on all five, `authenticated` direct call → `42501`, owner still reaches body (internal path intact). Post-fix sweep of `approv|advance|reject|action.*step` SECDEF functions shows only the read-only preview + a trigger function remain `authenticated`-callable (both non-holes).

### ✅ Batch 6 — deferred DEFINER RPCs gated (2026-08-16, migration `20260910000300`)
Resolves the 4 Batch-4 **"Deferred"** RPCs (deferred because no non-admin role held a matching key → couldn't gate blindly). Re-verified live: the matching keys **already exist** in the catalog, so each is gated on its natural key via the byte-faithful injector (guard spliced after the outer `BEGIN`, single-key variant of the Batch-2 template). **No grants made** — the operator assigns keys to roles in the role editor; admins bypass.

| RPC | Key (gate) | Notes |
|---|---|---|
| `create_service_customer(text,text,text)` | `master_data.service_customers.create` | no frontend caller (Data-API-only surface) — gate closes the hole |
| `upsert_package_with_services(jsonb,jsonb)` | `master_data.services.manage` | no frontend caller (Data-API-only surface) |
| `rpc_cancel_consumption(uuid)` | `consumption.cancel` | **LIVE** (`useConsumption.ts`; reverses posted stock + COGS). Operator chose **Owner/admins-only** → no role holds the key yet, so only admins pass until it's granted |
| `rpc_create_custody_return(...)` | — (**Pattern C**) | **already RP-gated in-body** — only the source sub-container's responsible person may return (`"Only <name> can return stock…"`). Documented, no migration |

Applied to staging (`db push`) + new-prod (single-statement `db query`). Verified on both via a rolled-back JWT probe: non-holder → `42501`, admin passes (reaches the body). **This completes the RPC permission-hardening effort (P0 + batches 1–6).**

---

## Current role → action-key grants (new-prod — proves no regression)
```
Purchase User/Manager : purchase.orders.create, bills.create, receivals.create, returns.create, shipments.create, landed_costs.create
Sales User            : sales.orders.create, invoices.create, deliveries.create, returns.create
Sales Manager         : + sales.credit_notes.create
Accounting Junior     : bills.create, landed_costs.create, shipments.create, invoices.create
Accounting Senior     : + credit_notes.create, warehouse adjustment/check/transfer.*
Inventory User/Manager: receivals.create, warehouse.transfer.*, check.*, adjustment.request
Warehouse Manager     : receivals.create, deliveries.create, warehouse.transfer.*, check.*, adjustment.request
```
Admins (Owner / Admin Level / exploit) bypass all checks.

---

## Open decisions (confirm during execution)
1. **cancel/reject transfer** — gate on `warehouse.transfer.approve`, or on `.create` (creator can cancel own)? 
2. **inventory-check apply/snapshot** — reuse `warehouse.check.create`, or add a distinct `warehouse.check.apply`?
3. ~~**Approval-step RPCs** — confirm they're chain-gated and leave (recommended), vs also add a permission key.~~ **RESOLVED (Batch 5):** client-facing actions were already chain/slot-gated and left; one identity-spoofing hole (`action_stock_adjustment_step`) fixed; five ungated internal mutators REVOKEd from `authenticated`.
4. **Reports RPCs** (`rpc_report_*`) — reads; confirm `reports.*` gating or leave (division-scoped).
