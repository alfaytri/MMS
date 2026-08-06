# Money-Path + Six-Domains Fix Batch 1 — Smoke Checklist

**Date:** 2026-08-05
**Branch:** `feature/warranty-module-phase-1`
**Target DB:** staging (`mwvblpgbgxipvrevkeff`) — all migrations applied
**Commits:** `544dd39c`, `4b2c1814`, `7f637277`, `27f26c64`, `b3446c88` + PROGRESS docs
**tsc --noEmit:** clean

---

## PART 1 — Ship-verified fixes (need your smoke)

Nineteen findings closed. Ordered by priority: **do #1–#9 in one sitting**, then #10–#19 whenever.

### 🟢 Already smoke-tested by you today

- ✅ **money C1 + C2** — atomic PO line replace with receival + RFQ guards (`rpc_replace_po_lines`). Smoked on PO-2026-07-015.
- ✅ **money C3 + C4** — PO return dispatch/cancel FIFO restore. Smoked on variant `496089e0…`, dispatch drained + cancel restored via source_id.
- ✅ **money C5** — `allocate_landed_cost` scope leak. Applied but not yet exercised end-to-end (LC apply flow is rare) — see #1 below.

### 1. `allocate_landed_cost` — scope + ISM (money C5)

**Setup:** pick a brand variant that has ≥1 fresh open receival + ideally a second receival of the same variant in a different warehouse (variant `496089e0…` has three receivals across the same warehouse+sub, so it works but doesn't prove the *cross-warehouse* scope).

1. Create a landed cost, attach it to ONE receival only, apply it.
2. **Expected:** the attached receival's FIFO layer gets `landed_cost_per_unit` bumped by (LC_amount ÷ qty). All *other* layers of the same variant remain untouched. One `cost_adjustment` ISM row per layer, each carrying that layer's `warehouse_id` + `sub_container_id` + `source_id = layer_id`.
3. Query to verify:
   ```sql
   SELECT receival_number, warehouse_id, sub_container_id, remaining_qty, landed_cost_per_unit, total_unit_cost
   FROM fifo_cost_layers
   WHERE brand_variant_id = '<your bv>'
   ORDER BY date, created_at;
   ```

### 2. `apply_receival_edit` — qty + cost + COGS scoping (money C6, C7, H9)

**Setup:** any received receival with `qty_received > 1` and at least one unit already delivered.

1. Request an edit that **changes qty** on one line. Approve it.
2. **Expected (C6):** save succeeds. Previously the ISM insert raised NOT-NULL on `sub_container_id`.
3. Request an edit that **changes unit cost** on a line of a **USD PO**. Approve it.
4. **Expected (C7):** the fifo_cost_layer's `unit_cost` becomes `new_cost × booked_rate` (QAR). Cross-check:
   ```sql
   SELECT fcl.unit_cost, fcl.source_exchange_rate, ri.unit_cost AS receival_cost
   FROM fifo_cost_layers fcl
   JOIN receival_items ri ON ri.brand_variant_id = fcl.brand_variant_id
   WHERE fcl.receival_id = '<your receival>';
   -- fcl.unit_cost should = ri.unit_cost × fcl.source_exchange_rate
   ```
5. **Expected (H9):** COGS rows attributable to a *different* receival of the same variant at the same old cost are NOT rewritten.

### 3. custom_roles / user_custom_roles RLS lockdown (six-domains C2)

**Do this test with a non-admin account.**

1. Log in as a user who does NOT hold `master_data.roles.manage`.
2. Open browser DevTools → console. Try:
   ```js
   const s = (window as any).supabaseClient ?? null // or wire up via createClient
   await s.from('custom_roles').insert({ name: 'exploit', is_system_admin: true, permissions: ['system.admin'] })
   ```
3. **Expected:** 42501 / "new row violates row-level security policy". No new role appears.
4. Re-log-in as an admin and confirm you can still create roles from the master-data UI.

### 4. Consumption cancel restores stock_level (six-domains C4)

1. Pick a consumption entry that is `posted`. Note the variant's `stock_level` before cancel.
2. Cancel the consumption (via the operator dialog).
3. **Expected:** `stock_level` on `inventory_item_brand_variants` bumps back up by the cancelled qty. Previously it stayed too low.
   ```sql
   SELECT id, code, stock_level FROM inventory_item_brand_variants WHERE id = '<bv>';
   ```

### 5. Consumption edit self-approval blocked (six-domains H12)

**Do this test with a user who holds BOTH consumption create AND `consumption_edit` approver roles.**

1. As that user, open a posted consumption → Request Cancellation.
2. Immediately try to approve the same request from the approvals surface.
3. **Expected:** RAISE — "cannot approve your own request". Have a second user approve to complete the flow.

### 6. Consumption number sequence (six-domains H13)

1. Open two browser tabs. In each, kick off a New Consumption dialog with the same source sub-container and different lines.
2. Submit both nearly simultaneously.
3. **Expected:** both succeed with distinct CE-numbers (CE-XXXXX and CE-XXXXY, sequential). Previously one would hit UNIQUE violation because COUNT(*) races.

### 7. Cancel SO status guard (six-domains H1)

1. Try to cancel an SO in status `delivered` or `partial_delivery`.
2. **Expected:** UI shows an error toast — *"Cannot cancel a sale order in 'delivered' status…"* — no state change.
3. Cancelling a `confirmed` SO with no deliveries still works.
4. Cancelling a `confirmed` SO that has any non-pending delivery is blocked with *"non-pending deliveries"* message.

### 8. Purchase-return "Prior returned" counter (money H3)

1. Dispatch a PO return of 2 units on a receival, then cancel it (via the flow you already smoked for C3+C4).
2. Open the Create-PO-Return dialog on the same receival.
3. **Expected:** "Prior returned" shows **0**, not 2. Cancelled returns no longer burn returnable qty.

### 9. Debit note refuses zero unit_price (money H5)

**Hard to test without a broken PO reference. Best you can do:**

1. Verify the happy path still works — issue a debit note on any completed PO return; DN totals should still match previous behavior.
2. If any operator ever renamed a PO line item that had a return against it, that DN now throws with a clear message instead of silently issuing a 0-total DN. No repro data needed unless you have such a case.

### 10. warehouse-reports API permission gate (six-domains H9)

1. From a user without `reports.view`, hit `/reports/warehouse` and try to generate a PDF.
2. **Expected:** 403 with *"Missing reports.view permission"*. Previously any authenticated user could hit this endpoint and export the full inventory valuation.

### 11. requireAdmin() recognises system admins (six-domains H10)

1. If you have a user whose seeded role has `is_system_admin=true` but who does NOT hold the `master_data.users.manage` string in their permissions array:
   - Log in as them → navigate to any admin API route (e.g. user management).
   - **Expected:** 200. Previously 403.
2. If no such user exists yet, this is just a safety net — no regression on existing admin flows.

### 12. useSaleOrders / WhStockValueTab pagination cap (six-domains H7, H8)

1. Open `/sales/orders`. Should render fine, no perceived difference. Under the hood the query now has `.limit(200)`.
2. Open the warehouse Stock Value tab. Should render fine, `fifo_cost_layers` fetch now `.limit(10000)`.
3. If you have >200 SOs and one is missing from the list, that's the expected trade-off — server-side pagination is deferred (still on the checklist under M1-M3).

---

## PART 2 — Deferred fixes with plan-of-fix

**Twenty-four remaining findings** I did not ship in this batch, ordered by priority. For each: the reason it was deferred + the shape of the fix so you can call the shots on when/how.

### Deferred CRITICALs (need your call before I write them)

#### D-C1 — money-path C8 + C9 + C11 + C12 (credit-note / store-credit path)
- **Files:** `src/hooks/useCreditNotes.ts:296` (C8/C9), `src/hooks/useCustomerPayments.ts:180` (C11), `src/hooks/useInvoices.ts:204` (C12)
- **Why deferred:** the four findings are interlocking. The correct fix per the checklist is a single new `rpc_redeem_store_credit(invoice_id, redemptions jsonb)` that FOR-UPDATE-locks each CN, verifies customer match + resolution_type='store_credit' + SUM ≤ total_amount, then inserts payments; REVOKE direct INSERT on `payments` when `credit_note_id IS NOT NULL`. This is ~200 lines of SQL + 3 hook rewrites and I don't want to guess your redemption model (single-CN-per-invoice? partial redemption allowed? refund path?). Also C12 references a non-existent `amount` column on `credit_notes` — need to know if you want `total_amount` (per the checklist) or add `amount` as a computed column.
- **What you need to decide:** (a) redemption model — atomic per-invoice or per-line? (b) rename `amount → total_amount` in `useIssueCreditNote`, or add an `amount` alias? (c) revoke the direct INSERT policy on `payments` — safe to do now, or wait until every hook is migrated to the RPC?

#### D-C2 — money-path C10 (settle installment overwrite + status + PAY-id race)
- **File:** `src/hooks/usePaymentPlans.ts:106`
- **Why deferred:** the fix is a new RPC that: (a) reads current `paid_amount`, adds the new amount instead of overwriting; (b) sets status conditionally on `paid_amount >= amount`; (c) uses an advisory-locked sequence for PAY-id (or `payment_number_seq`); (d) recomputes plan completion. Also needs to check whether `payment_id` on `payments` should just move to `next_payment_id()` shared with the other payment paths. Similar sequence question as consumption H13 — I want your call on whether to spin a fresh sequence or reuse an existing one.

#### D-C3 — six-domains C1 (useConfirmSO bypasses approval chain + double-reserves)
- **File:** `src/hooks/useSaleOrders.ts:826`
- **Why deferred:** the checklist says "Remove `useConfirmSO` or restrict to quotation-status SOs only". This changes UX — the operator's "Confirm" button on the SO list currently short-circuits pending-approval → confirmed. I need to know whether: (a) that button should be hidden for pending_approval SOs (my recommendation) or (b) rewired to trigger `approve_sales_request`. Also the double-reserve — need to confirm which of `create_sale_order` / `useConfirmSO` was intended to reserve.

#### D-C4 — six-domains C3 (stock_adjustment damage → damaged stock)
- **File:** `supabase/migrations/20260814000100_phase_f_stock_adjustments_source_pile.sql:146`
- **Why deferred:** medium-scope RPC change to `approve_stock_adjustment_inventory` — needs three synchronized INSERTs into `inventory_damaged_stock`, `inventory_damaged_stock_layers`, `inventory_damaged_movements` mirroring `_record_inventory_disposition`. I want to look at how the disposition helper actually stamps those three tables before I write the damage branch — didn't have time in this batch.

### Deferred HIGHs

Grouped by concern; each entry is: **finding → shape-of-fix**.

**Money-path highs — atomic create paths:**
- **H1** money `useCreatePO` — RPC `create_purchase_order(payload jsonb)` that runs `next_po_number` + header INSERT + lines INSERT + optional RFQ INSERT + activity log + snapshot in one txn.
- **H2** money `useCreateBill` — RPC `create_purchase_bill(payload jsonb)` that validates `0 ≤ discount ≤ subtotal`, INSERTs bill + lines in one txn. Also add CHECK `bills.total_amount >= 0` + short-circuit on negative totals in `allocate_payment_to_bill`.
- **H15** money `useCompleteDelivery` — fold the follow-up delivery-stub creation inside `complete_delivery_inventory` so FIFO + COGS + stub commit atomically.

**Money-path highs — AR/AP correctness:**
- **H6** money apply DN to bill — new RPC `rpc_apply_debit_note_to_bill(dn_id, bill_id, amount)` + `debit_notes.remaining_amount` column to prevent double application.
- **H7** money `useVoidLandedCost` — BEFORE UPDATE trigger on `landed_costs` blocking `voided_at` set when `applied_at IS NOT NULL` and revert has not run. Same fix: tighten RLS on `voided_at` column.
- **H8** money `revert_landed_cost` post-apply COGS gap — emit reversing `cogs_entries` for sale rows whose `source_id` is in `revert_snapshot`, using `qty_drawn × lc_per_unit_delta`.
- **H10** money `create_inventory_receival` carve cross-sub-container — add guard: `IF v_source_layer.sub_container_id IS DISTINCT FROM v_sub_container_id THEN RAISE 'use a warehouse transfer instead'`.
- **H11** money payment attach over-allocate — guard in `attach_payment_to_invoice` (`SUM(payments) + new ≤ total_amount`) + BEFORE INSERT validating trigger on `payments` + `LEAST` clamp in `invoice_recompute_paid_fn` for parity with `bill_recompute_paid_fn`.
- **H12** money invoice payment_status mixed FX — convert every payment to invoice currency before summing in `invoice_recompute_paid_fn`. Simplest: normalise via `amount_qar` (already computed by the FX trigger).
- **H13** money `useUpdateReturnStatus` reversed order — call the RPC first, THEN flip status. Or fold status flip + CN creation into the RPC (mirror `complete_delivery_inventory`). Applies to `useUpdateReturnStatus:427` + `useAssignWarehouseAndRestock:624`.
- **H14** money `useCreateCustomerPayment` soft-deleted + fail-open — add `.is('deleted_at', null)` filter, check `error` on the fetch, better: delete the client-side recompute since the DB trigger already handles it.
- **H4** money PO return dispatch over-return — inside `rpc_process_po_return_dispatch`, FOR-UPDATE-lock `receival_items` and RAISE when `SUM(qty already returned) + new > qty_received`. Also add a BEFORE INSERT trigger on `return_lines`. Same repro shape as the `credit_note_id` FK error you saw during smoke.

**Six-domains highs — PDFs (all one-file each):**
- **H3** invoice PDF hardcodes QAR — resolve currency from parent SO in `generate-invoice-pdf.ts`, pass to template.
- **H4** CN/DN PDF hardcodes QAR — resolve from source invoice/bill.
- **H5** PO PDF mixes QAR total with original-currency label — compute grand total in original currency, or relabel QAR rows.
- **H6** Bill PDF payment table duplicates — dedup by payment id across three queries.

**Six-domains highs — sales/permissions/warehouse:**
- **H2** `create_sale_order` 18-arg intent check — `p_intent IN ('save_quote', 'quotation')` or drop the 18-arg overload.
- **H11** `receive_transfer` shrinkage — after the item loop, `IF v_total_shrinkage > 0 THEN UPDATE inventory_item_brand_variants SET stock_level = stock_level - v_total_shrinkage`.

### Deferred MEDIUMs

- **M1** money — Phase E return-restock reversal missing `consumer_division_id`. LATENT (no code reads it yet). One-column addition to a large CREATE OR REPLACE.
- **M1/M2/M3** six-domains — add `.limit(N)` to `useReceivalsAndDeliveries`, `useSaleReturns`, `useReorderPoints`. Same pattern as H7/H8. 3 one-line changes.

### Deferred MIGRATION BLOCKER

- **MIG1** money — `supabase/migrations-staging/` is 58 files behind `supabase/migrations/` (excluding the 6 files I mirrored today). Two fix paths:
  - **A** re-run the pg_dump rebuild against live staging to refresh the baseline (see README "Rebuild procedure"), archiving deltas into `_archive/`.
  - **B** copy the 58 files verbatim into `migrations-staging/` and prove `db reset --linked` succeeds on a scratch project.
  - Add CI check that fails PRs adding `supabase/migrations/*.sql` without a matching path in `migrations-staging/`.
  - **Recommendation:** path A. Cleaner baseline, no risk of stale deltas.

---

## PART 3 — Bugs surfaced during smoke (filed for follow-up)

Two bugs I noticed while you were smoke-testing but that are separate from the 49-item review:

1. **`returns_credit_note_id_fkey` FK violation on return CN creation.** Non-atomic client hop where CN insert fails but the return_id update still runs. Same shape as H13 money — will be closed by the H13 fix.
2. **PO-return dispatch on legacy pre-fix data** — if any return was dispatched before today's C3+C4 migrations, its ISM rows don't have `source_id` and cancel now RAISEs with a reconcile hint. Contact ops if you find any of these; I'll write a one-shot reconcile SQL against the affected returns.

---

## Rollout order I'd recommend

1. You smoke Part 1 items #1–#9 tonight — that closes 15 of the 19 shipped fixes end-to-end.
2. Tomorrow: I take D-C1 (CN/store-credit RPC) and D-C2 (settle installment) once you've told me your redemption-model preferences.
3. After that: all the deferred HIGHs — mostly RPC rewrites, low individual risk once the CN foundation is stable.
4. MIG1 last — it's mechanical but you want the migration set correct once the fix pass is done.
