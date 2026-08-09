# `division_scope_*` RLS over-permissive UPDATE — audit + remediation plan

**Date:** 2026-08-09 · **Target:** staging `mwvblpgbgxipvrevkeff` (migrations STAGING-only + mirror to `supabase/migrations-staging/`) · **Context:** memory `project_po_approval_security`, prior commits `589bf3de` (RPC identity hardening), `49d15dce` (PO status guard trigger).

## 1. Corrected findings (live-verified 2026-08-09, `npx supabase db query --linked`)

The adversarial-review task that triggered this work appears to **predate commit `49d15dce`**. Current staging state:

| Claim in the task | Live reality now | Status |
|---|---|---|
| `purchase_orders` grants full CRUD to **anon** | anon has **NO** grants on `purchase_orders` | ✅ already fixed (`49d15dce`) |
| Any authenticated user `update status='approved'` → approved with 0 steps | **Blocked** by `trg_guard_po_privileged_status` (BEFORE INS/UPD, enabled) — raises `42501` for `authenticated`/`anon` setting a privileged status | ✅ already fixed (`49d15dce`) |
| `po_approvals` UPDATE grant to authenticated (forge status) | authenticated has **no UPDATE** on `po_approvals` | ✅ already fixed (`589bf3de`) |
| `po_approvals` INSERT/DELETE under `USING(true)` (delete other tiers / forge approved_by) | authenticated **still has INSERT + DELETE**; policy "Internal users can manage po_approvals" = ALL `USING(true)`/`WITH CHECK(true)` | ❌ **OPEN (finding A)** |
| `division_scope_update` allows arbitrary **non-status** column rewrites (amounts, supplier, fx) on any PO in the division | True — the guard trigger only blocks status transitions, not other column edits or edits while the PO is locked | ❌ **OPEN** |
| The `division_scope_*` pattern repeats on many tables | Confirmed on **~23 tables** (see §2) | ❌ **OPEN (app-wide)** |

**Bottom line:** the headline "approve a PO with zero steps by a direct write" is already closed. The genuinely-open surface is (a) `po_approvals` INSERT/DELETE, (b) arbitrary non-privileged column rewrites via `division_scope_update` across ~23 tables.

## 2. The `division_scope_*` footprint (23 tables)

All have SELECT/INSERT/UPDATE/DELETE policies keyed only on `is_division_visible(division_id)`. A `WITH CHECK` (present on most for INSERT/UPDATE) only re-checks division visibility — it does **not** restrict columns, state, or role. So any division member can UPDATE any column on any row in their division via raw PostgREST.

## 3. Risk model (why the fix is not "revoke everything")

RLS/grants gate what a **malicious `authenticated` user** can do via hand-crafted PostgREST calls. But the legit app **also writes many of these tables directly as `authenticated`** (not only via RPCs). SECURITY DEFINER RPCs run as the table owner and bypass both RLS and grants, so:

- **RPC-only tables** (no direct client write) → safe to `REVOKE INSERT,UPDATE,DELETE FROM authenticated` (keep SELECT). Eliminates the vector entirely. **Pre-ship check: confirm every writing RPC is SECURITY DEFINER, not INVOKER** (e.g. `rpc_replace_po_lines` is INVOKER — but it writes `po_line_items`, which is *not* in this set).
- **Direct-write tables** → cannot blanket-revoke; need a BEFORE-UPDATE/INSERT **guard trigger** (SECURITY INVOKER, `current_user IN ('authenticated','anon')`) that blocks the *privileged* value/state transitions (the ones only RPCs should perform) while allowing the legit client columns — exactly the shape of `guard_po_privileged_status`.

## 4. Client write-path audit (src/ only, 2026-08-09)

**RPC-only (revoke candidates):** `bills`, `bill_line_items`, `invoice_line_items`, `payment_bill_allocations`, `sale_order_lines`, `cogs_entries`, `consumption_entries`.

**Direct client writes (need guards):** `purchase_orders`, `po_approvals`, `po_approval_chains`, `po_line_items`, `payments`, `payment_plans`, `so_invoices`, `credit_notes`, `debit_notes`, `sale_orders`, `sale_deliveries`, `so_po_returns`, `return_lines`, `receivals`, `shipments`.

Notable direct writes that set privileged state today:
- `sale_orders`: client sets `status:'confirmed'` (`useConfirmSO`, `useSaleOrders.ts:838/1088`) and `'cancelled'` (`:1067`); generic edit at `:805` does **not** strip `status`. → **no status guard exists** (unlike PO). Confirm should route through an RPC or a guard must block client `confirmed`.
- `po_approvals`: client insert (build steps) at `usePurchaseOrders.ts:596/982`; delete at `:785` (pending) / `:919` (all). → finding A.
- `so_invoices`: client `status:'void'`, `needs_refresh`, `qb_synced`. `payments`: client inserts (SPAY/CPAY) + `qb_synced`. `so_po_returns`: many client `status` writes.

## 5. Prioritized remediation

### P0 — contained, safe, high value (ship first, each with smoke)
- **P0b — revoke client writes on the 7 RPC-only tables. ✅ SHIPPED to staging 2026-08-09** (migration `20260819080000`, uncommitted pending flow smoke). `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON <t> FROM authenticated` + `REVOKE ALL FROM anon` on `bills, bill_line_items, invoice_line_items, payment_bill_allocations, sale_order_lines, cogs_entries, consumption_entries` (SELECT retained). **Pre-ship verification done:** every writer function is `prosecdef=true` except the AFTER trigger `bill_line_items_invalidate_parent_pdf_fn` (INVOKER) which only fires inside DEFINER-RPC context (bill_line_items has no direct client writes) → runs as owner → unaffected. Post-apply: authenticated now has only `REFERENCES,SELECT,TRIGGER`; anon nothing. ⏸ Operator smoke: create/edit bill, issue+sync invoice, attach payment/allocate, create/edit SO lines, post consumption, delivery COGS.
- **P0a — close finding A (`po_approvals` INSERT/DELETE). SCOPED — not a one-liner.** The approval tiers are derived **client-side** from authoritative config: `findApplicableTiers(po.total_qar, chain.po_approval_chain_tiers)` after selecting the active chain (PO division → company default). Because the client then INSERTs the step rows directly, a malicious client can substitute a weaker chain / fewer tiers → self-approvable. So a proper fix must **re-derive tiers server-side in SQL**, not accept them from the client. Design:
  - `rpc_submit_po_for_approval(p_po_id)` (DEFINER): `auth.uid()`→`user_data.id`, assert `= po.created_by`; assert PO in `draft`; select active chain (division→company default); compute applicable tiers from `total_qar` band; compute iteration; INSERT steps with `status='pending'`, `approved_by=NULL`; UPDATE PO → `pending_approval`/`po_type='confirmed'`. (Notifications + `savePoSnapshot` can stay client-side after the RPC — not security-critical.)
  - `rpc_recall_po(p_po_id)` (DEFINER): owner + `pending_approval` state check; delete **all** this PO's pending steps (all-or-nothing — blocks selective weakening); PO → `draft`.
  - `rpc_resubmit_po(p_po_id)` (DEFINER): owner + `rejected` state; wipe steps; rebuild as above (new iteration); PO → `pending_approval`.
  - Then `REVOKE INSERT, DELETE ON po_approvals FROM authenticated`; replace the `USING(true)` ALL policy with SELECT-only. Refactor 4 client sites (`usePurchaseOrders.ts:596,982,785,919`) to call the RPCs.
  - Requires porting `findApplicableTiers` + chain-selection to plpgsql, and a **full approval-flow operator smoke** (submit→approve tiers→recall→resubmit→reject) — login-gated. Best done as its own focused task.

### P1 — value/state guard triggers on high-value direct-write tables (table-by-table, with smoke)
- `sale_orders`: mirror the PO status guard — block client transition into `confirmed` (route through `rpc_confirm_sale_order` / guard), block edits while locked.
- `purchase_orders`: extend `guard_po_privileged_status` to also block **non-status** column edits when the PO is in a locked state (`approved/partially_received/received/completed/cancelled`) — client edits only in `draft/pending_approval`.
- `payments`: block client UPDATE of `amount/direction/source_*/currency` post-insert (allow only `qb_synced`); consider routing inserts through an RPC.
- `so_invoices`: block client changes to `total_amount/subtotal/paid_amount/payment_status`; allow `needs_refresh/qb_synced/status:'void'`.
- `so_po_returns`, `sale_deliveries`, `receivals`, `credit_notes`, `debit_notes`, `po_line_items`, `payment_plans`, `shipments`: per-table guard for the privileged fields identified in §4.

### P2 — consistency + admin gating
- `po_approval_chains` admin CRUD → gate on an admin permission (not just division visibility).
- Standardize the guard-trigger approach into a documented pattern; consider a shared helper.
- Re-run the full `pg_policies` + grants audit after P0/P1 and update this doc.

## 6. Verification discipline (per increment)
1. Before: fetch live grants/policies/RPC `provolatile`+`prosecdef` for the touched objects.
2. Confirm SECURITY DEFINER on every RPC that must keep writing a revoked table.
3. Apply to staging + byte-mirror; `db push --dry-run` = up to date.
4. Operator smoke of every legit write flow touching the changed table **before** the change is considered done (agent cannot log in).
5. Never ship a blanket revoke on a table with any SECURITY INVOKER writer.
