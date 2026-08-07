# Release Checklist — Money Path

> Fill this before merging `deploy/warehouse-shipping` to `main`. Every ❌ or ⚠️ is a blocker unless explicitly waived by the operator.

**Target DB:** staging (`mwvblpgbgxipvrevkeff`) → prod on cutover
**Reviewer:** ___________
**Date:** ___________

---

## 1. Migrations — Can a fresh DB be built from scratch?

- [ ] `dropdb && createdb && supabase db reset` completes with zero errors
- [ ] All `supabase/migrations/*.sql` apply in filename order without manual intervention
- [ ] `supabase/migrations-staging/` mirrors `supabase/migrations/` (spot-check last 20 files)
- [ ] `npx supabase gen types typescript` succeeds and matches the checked-in `database.types.ts`
- [ ] `npx supabase db push --dry-run` on staging reports "Remote database is up to date"
- [ ] No stale table refs in function bodies: `grep -rE '\b(profiles|brand_variants)\b' supabase/migrations/` returns only historical (pre-2026-07-24) files
- [ ] Every table created in the last 60 migrations has `ENABLE ROW LEVEL SECURITY` + at least one policy
- [ ] `pg_get_functiondef` for every money-path RPC matches the latest migration body

## 2. Purchase — PO / Bill / Return / Debit note

- [ ] Create PO with 3 lines, mixed items, one taxed → header total = SUM(lines)
- [ ] Edit PO: change qty on line 2, delete line 3, add a new line → save → reload → all three edits persist
- [ ] Delete PO with no bill attached → PO + lines + attachments removed, no orphans in `purchase_order_lines`
- [ ] Delete PO that has a bill attached → blocked with a clear error
- [ ] Create Bill from PO → bill total = PO total (or the received subset), bill number sequence increments per division
- [ ] Two concurrent edits on same PO → last write wins with a visible conflict warning (or optimistic-lock error), no silent line loss
- [ ] PO in USD, bill in USD → FX applied at bill date, receival cost in QAR matches (usd × fx)
- [ ] Create purchase return against a receival → return lines carry receival_line_id, restock reverses the correct FIFO layer
- [ ] Retry a failed return (network drop mid-submit) → no double-restock
- [ ] Debit note applied to a bill → bill balance reduces, cannot over-apply
- [ ] Same debit note applied twice → blocked

## 3. Receivals + FIFO

- [ ] Create new-stock receival for 100 units @ 10 QAR → new FIFO layer with remaining_qty = 100
- [ ] Carve receival: split parent layer of 100 into two children of 60 + 40 → parent layer's remaining_qty reduced, NO net quantity change
- [ ] Receive in USD-priced PO → FIFO layer stores unit_cost in QAR (usd × fx_at_receival)
- [ ] Two receivals same second → deterministic layer order on subsequent deducts
- [ ] Edit receival after downstream consumption → either blocked or safely re-computes COGS
- [ ] Delete receival with zero downstream consumption → layer removed, COGS ledger empty
- [ ] Delete receival with downstream consumption → blocked with clear error
- [ ] `deduct_fifo_layers` picks oldest layer first, splits partial correctly, writes correct COGS row per layer breakdown

## 4. Landed Cost + COGS

- [ ] Add LC of 1,000 QAR to a 4,000 QAR receival (100 units) → each unit_cost rises by 10 QAR proportional to line value
- [ ] Add LC AFTER 30 units already shipped → decide business rule: retroactive COGS correction or forward-only. Confirm behavior matches expectation.
- [ ] Delete LC → receival line unit_costs restored, FIFO layer unit_cost restored
- [ ] Two LCs on same receival (shipping + duty) → both apply proportionally, none overwrites the other
- [ ] LC in USD applied to QAR receival → FX pinned at LC-date, not receival-date (confirm which)
- [ ] `useCogsBreakdown` for a consumed item shows correct breakdown: base cost + LC allocations per unit
- [ ] Consumer-division fallback (phase E migration) works when consumer_division is null

## 5. Invoices + Payments (AR side)

- [ ] Create SO invoice: enforce-one-per-SO constraint blocks a second create on same SO
- [ ] Concurrent double-click "Create Invoice" → only one invoice row, second click gets clear error
- [ ] Attach payment > invoice balance → blocked
- [ ] Detach payment → invoice balance restored to pre-payment state, idempotent
- [ ] Partial payment then refund → refund re-opens exactly the refunded amount on the invoice
- [ ] Store-credit-as-payment: payment marked as store credit cannot also be refunded to cash
- [ ] Payment plan: instalment schedule persists, "next due" derives correctly, past-due flag flips at correct time
- [ ] Manual "mark paid" without payment row → blocked, or leaves an audit-visible flag
- [ ] Cross-division user cannot see or attach another division's payments (RLS)

## 6. Bill Payments (AP side)

- [ ] Attach payment to bill → bill balance reduces, cannot over-apply
- [ ] Detach payment from bill → balance restored, idempotent
- [ ] Supplier payment in USD against QAR bill → FX applied at payment date

## 7. Auth + Permissions + Layout

- [ ] All money-path routes require an authenticated session (middleware check + route-level guard)
- [ ] Any route using `SERVICE_ROLE_KEY` validates caller identity via `getUser()`
- [ ] Webhook routes have HMAC / shared-secret validation
- [ ] Every dropdown displays human-readable label, never raw UUID
- [ ] Every dialog: DialogFooter sticky, overflow-y scroll, no layout shift on select
- [ ] Every table on money-path pages paginates (server-side, page + limit) and sorts
- [ ] Every hook surfaces raw Postgrest error message on failure (per feedback rule)

## 8. PDFs + Print

- [ ] PO PDF: header, lines, totals, currency, signature block render correctly
- [ ] Bill PDF: renders correctly at A4 and mobile-print
- [ ] Invoice PDF: numbering matches DB, arabic + english both render, no missing glyphs
- [ ] Warranty certificate PDF: regenerates on demand, same numbers on reprint
- [ ] Delivery note PDF: renders correctly

## 9. Money math edge cases

- [ ] 0-qty line → blocked at UI and DB
- [ ] Negative unit price → blocked
- [ ] Very large qty (10^9) → no overflow, formats with thousands separators
- [ ] Rounding: 3 lines each 33.33 → header shows 99.99 (or 100.00 with rounding rule documented)
- [ ] FX rate change between PO date and receival date → correct rate frozen at correct event

## 10. Post-cutover smoke (run on prod within 15 min of deploy)

- [ ] Login works
- [ ] `/purchase/orders` lists POs (paginated)
- [ ] Create a test PO, receive it, add LC, ship, invoice, pay, refund → full loop
- [ ] `/warranty` register lists records (if module shipped)
- [ ] Rollback plan ready: last-known-good migration filename + revert script

---

## Bug findings from workflow review

Workflow `wf_f9705f92-0c7` — 6 finders → 21 adversarial verifiers → migration sanity → 28 confirmed defects. Only findings that survived independent verification are listed. Ordered by severity, then by blast radius.

### 🚨 CRITICAL — block deployment

**C1. `po_line_items` delete errors are swallowed → duplicate lines + broken PO totals** — [`src/hooks/usePurchaseOrders.ts:531`](src/hooks/usePurchaseOrders.ts:531) (also L953, L1111)
- Why: `.delete().eq('po_id', id)` never destructures `error`; then INSERT runs. `receival_items.po_line_item_id` FK has NO ON DELETE → the delete fails on any received PO, INSERT still runs. Old rows survive, new rows added, `SUM(lines) ≠ purchase_orders.subtotal`. Landed cost / bill matching / FIFO all read wrong values.
- Repro: Create PO with 2 lines → receive one → Edit-PO → change qty → Save. DB now has both old and new line rows; header total reflects only new.
- Fix: Destructure `error` on the delete and `throw` on it in all 3 sites. Long-term: move header + lines replace into a SECURITY DEFINER RPC in one transaction.

**C2. Editing PO lines silently wipes every supplier RFQ quote row (CASCADE)** — [`src/hooks/usePurchaseOrders.ts:953`](src/hooks/usePurchaseOrders.ts:953)
- Why: `po_rfq_quote_items.po_line_item_id ... ON DELETE CASCADE` (migration `20260702120000_rfq_quotes.sql:36`). All three edit paths DELETE all `po_line_items` and reinsert — every supplier quote is silently deleted with no warning and no audit row.
- Repro: RFQ PO with recorded supplier quotes → Edit-PO → Save Draft → `po_rfq_quote_items` is empty.
- Fix: Diff-based line update: match by id, UPDATE changed rows, INSERT only new rows, DELETE only removed rows. Refuse delete when a receival or quote row references the line.

**C3. PO return cancel does NOT restore `fifo_cost_layers.remaining_qty`** — [`supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:678`](supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:678) (`rpc_cancel_po_return_dispatch`)
- Why: Dispatch calls `deduct_fifo_layers` which decrements layer `remaining_qty` AND `stock_level`. Cancel only bumps `stock_level` back — layers are permanently short. Next consumption picks the WRONG layers at the wrong `unit_cost` → wrong COGS forever, and eventual "Insufficient stock" when layer sum falls below `stock_level`.
- Repro: Dispatch a PO return, then cancel. Deliver the same variant → COGS uses next-oldest layer's unit_cost, not the one that was actually consumed.
- Fix: In the cancel body, iterate the dispatch's `inventory_stock_movements` rows (or the `return_lines` mirrored qty × unit_cost) and `UPDATE fifo_cost_layers SET remaining_qty = remaining_qty + qty` per layer. Then call `recalc_average_cost`.

**C4. PO return cancel INSERTs NULL `warehouse_id` and no `sub_container_id` → cancel always fails** — same file `:722`
- Why: `so_po_returns.restock_warehouse_id` is intentionally NULL for D.4-era returns (provenance moved to `return_lines.receival_item_id`), and `inventory_stock_movements.sub_container_id` is NOT NULL since 20260803001000. The cancel INSERT lists neither.
- Repro: Create a return through the current dialog, dispatch, then cancel → `null value in column "warehouse_id"` (or `"sub_container_id"`) violates not-null constraint.
- Fix: Rewrite cancel to iterate `return_lines`, resolve `warehouse_id` + `sub_container_id` from `receival_items` via `return_lines.receival_item_id`, and pass both on the reversing insert.

**C5. `allocate_landed_cost` mis-scopes FIFO layers → inventory value inflates on unrelated stock** — [`supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:379`](supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:379)
- Why: `v_bv_remaining` reads `SUM(remaining_qty)` across ALL layers for the variant, ignoring the LC's attached receivals. The `UPDATE fifo_cost_layers SET landed_cost_per_unit` also lacks the receival scope. `source_id` exists on layers since 20260726260000 but is unused. Same variant stocked in another warehouse silently absorbs part of the freight cost.
- Repro: Receival R1 (10 units, all sold) + older R0 in another warehouse (5 remaining). Apply an LC of 100 attaching only R1 → half of it posts to R0's layers → W2's inventory value inflates by 50 QAR, and R1's sold units are under-costed in COGS.
- Fix: Add `AND source_type='receival' AND source_id = ANY(v_lc.attached_receival_ids)` to both the remaining-qty read AND the UPDATE (and the revert snapshot capture).

**C6. `apply_receival_edit` qty branch omits `sub_container_id` (NOT NULL) → every approved qty edit fails** — [`supabase/migrations/20260724280000_apply_receival_edit_uuid_cast_and_null_serial.sql:118`](supabase/migrations/20260724280000_apply_receival_edit_uuid_cast_and_null_serial.sql:118) (and L166)
- Why: `sub_container_id` was made NOT NULL on `inventory_stock_movements` by 20260803001000, but this RPC (unpatched since) still inserts without it (or `warehouse_id`). Every approved qty edit raises a NOT NULL violation and rolls back.
- Repro: Request qty change on any receival, approve, save → toast: "Failed to save".
- Fix: New CREATE OR REPLACE that loads `warehouse_id` + `sub_container_id` from the receival at the top and adds both columns/values to both inventory_stock_movements INSERTs.

**C7. `apply_receival_edit` cost branch writes PO-currency into QAR columns** — same file `:202`
- Why: Since 20260729214710, `fifo_cost_layers.unit_cost` and `cogs_entries.unit_cost` are in QAR (× initial_exchange_rate), but `receival_items.unit_cost` is PO currency. `apply_receival_edit` reads `v_new_cost` from PO currency and writes it into the QAR columns — no FX applied.
- Repro: PO in USD @ 3.64; approve edit changing unit_cost 100→110; layer's `unit_cost` becomes 110 (should be 400.40 QAR). Inventory value understated ~72%.
- Fix: Reload PO currency + `initial_exchange_rate` (or use `fifo_cost_layers.source_exchange_rate`); convert `v_new_cost`/`v_old_cost` to QAR before UPDATE.

**C8. `useApplyCreditNote` allows the same CN to be double-consumed as fake payment + store credit** — [`src/hooks/useCreditNotes.ts:296`](src/hooks/useCreditNotes.ts:296)
- Why: The apply insert into `payments` sets NO `credit_note_id`, `customer_id`, or `amount_qar`. `customer_credit_balances` only subtracts redemptions where `credit_note_id IS NOT NULL`, so the CN stays "unspent" for the whole `total_amount`. The same CN can then be resolved as store credit and applied to another invoice for the FULL amount.
- Repro: Apply CN-42 (500 QAR) to invoice A → paid. Resolve CN as store credit. Apply store credit 500 to invoice B → both invoices paid from one 500 CN.
- Fix: Delete `useApplyCreditNote` and route the Apply button through the store-credit RPC that stamps `credit_note_id` and validates ownership + remaining balance server-side. Interim: destructure `error` on every write, set `credit_note_id` + `customer_id` on the payment row.

**C9. `useApplyCreditNote` can insert a NEGATIVE payment row and stamp wrong `payment_status`** — same file `:296`
- Why: Chains 5 Supabase calls, checks `error` on none. If `so_invoices.select().single()` transiently fails → `inv=null` → `outstanding = 0 − alreadyPaid` is negative → `Math.min(cnTotal, outstanding)` inserts a negative amount. Even in the happy branch, the payment insert has no error check, so a failing insert still stamps `so_invoices.payment_status='paid'`.
- Repro: Apply a CN while RLS blocks reading the invoice → negative payment row, invoice marked paid.
- Fix: Same as C8 (delete hook, route through RPC). Immediate hardening: check `error` on every call; clamp `Math.max(outstanding, 0)`.

**C10. `useSettleInstallment` overwrites `paid_amount`, always stamps 'paid', generates PAY-ids by COUNT(*)** — [`src/hooks/usePaymentPlans.ts:106`](src/hooks/usePaymentPlans.ts:106)
- Why: (a) `.update({ paid_amount: payload.amount_paid })` overwrites prior partials — data loss on any 2nd settlement. (b) `status: 'paid'` is unconditional — a 1 QAR payment marks a 1000 QAR installment paid. (c) `payment_id = 'PAY-' + (COUNT(*)+1)` is not locked/transactional — concurrent settlements produce duplicate PAY-ids.
- Repro: Settle 300 then 400 on a 1000 installment → paid_amount=400 (300 lost). Two clerks settle concurrently → duplicate PAY-XXXXX.
- Fix: Reject `amount_paid <= 0` and `> remaining`. `paid_amount = existing + amount_paid`. `status = amount_paid >= amount ? 'paid' : 'partial'`. Move PAY numbering to a sequence or advisory-locked RPC. Fold the plan-completion recompute into the same RPC.

**C11. `useApplyStoreCredit` has no server-side ownership or balance validation** — [`src/hooks/useCustomerPayments.ts:180`](src/hooks/useCustomerPayments.ts:180)
- Why: Direct `.insert()` into `payments` with client-supplied `credit_note_id`, `customer_id`, `invoice_id`. No DB check that (a) CN.customer_id = invoice.customer_id, (b) CN.resolution_type='store_credit', (c) SUM(existing redemptions) + amount ≤ CN.total_amount. `customer_credit_balances` hides negative balances via `WHERE > 0`, so over-redemption becomes invisible.
- Repro: As any user with `purchase.payments.manage` → apply Customer A's open CN against Customer B's invoice → succeeds. Or apply the same CN twice past its total → succeeds silently.
- Fix: New RPC `rpc_redeem_store_credit(invoice_id, redemptions jsonb)` that FOR UPDATE-locks each CN, verifies customer match + `resolution_type='store_credit'` + `SUM ≤ total_amount`, then inserts. Revoke direct INSERT on `payments` when `credit_note_id IS NOT NULL`.

**C12. `useIssueCreditNote` inserts non-existent `amount` column, never sets `total_amount`, id collides** — [`src/hooks/useInvoices.ts:204`](src/hooks/useInvoices.ts:204)
- Why: `credit_notes` has no `amount` column — the insert fails with Postgres 42703 (masked by `as unknown as DBInsert<>`). If repaired, `total_amount` still defaults to 0 → every downstream reader treats the CN as worthless. `id = 'CN-' + crypto.randomUUID().slice(0,8)` collides with the 5-digit sequence used by `useCreateCreditNote`.
- Repro: Open an invoice detail → click "Issue Credit Note" → error.
- Fix: Rename `amount → total_amount` in the insert; use `await nextNoteId('credit')` so both paths share the monotonic sequence.

### ⚠️ HIGH — must fix before deployment

**H1. `useCreatePO` is not atomic — orphan PO header + consumed number on failure** — [`src/hooks/usePurchaseOrders.ts:394`](src/hooks/usePurchaseOrders.ts:394)
- Why: `next_po_number` → INSERT header → INSERT lines → optional INSERT RFQ are 4 auto-committed calls. If lines insert fails (bad brand_variant, RLS), the header commits with total but zero lines; the PO number is consumed.
- Fix: Move creation into a `create_purchase_order` SECURITY DEFINER RPC that runs all inserts in one transaction.

**H2. `useCreateBill` lets `discount_amount > subtotal` → negative bill total → any 1 QAR payment marks it PAID** — [`src/hooks/useSupplierBills.ts:126`](src/hooks/useSupplierBills.ts:126)
- Why: Client computes `total = subtotal - discount` with no floor. `allocate_payment_to_bill` compares `paid ≥ total` — negative total flips status to 'paid' on any positive allocation. Bill+lines insert is also non-atomic.
- Fix: `create_purchase_bill` RPC that validates `0 ≤ discount ≤ subtotal` and inserts bill + lines in one transaction. Add CHECK `bills.total_amount >= 0`. Short-circuit `allocate_payment_to_bill` on negative totals.

**H3. `returnable_qty` counts cancelled + soft-deleted returns → blocks legitimate re-returns** — [`src/hooks/usePurchaseReturns.ts:72`](src/hooks/usePurchaseReturns.ts:72)
- Why: The `return_lines` sum doesn't join to parent `so_po_returns.status` or `deleted_at`. Cancelled returns still burn returnable qty.
- Fix: Join to `so_po_returns!inner(status, deleted_at)` and exclude `status='cancelled'` / `deleted_at IS NOT NULL`. Better: server-side view/RPC so `return_lines` insert can enforce the same rule.

**H4. PO return dispatch never caps qty against the linked receival → over-return drains other suppliers' layers** — [`supabase/migrations/20260805000200_warehouse_model_v2_phase_d4_po_return_dispatch_scope.sql:78`](supabase/migrations/20260805000200_warehouse_model_v2_phase_d4_po_return_dispatch_scope.sql:78)
- Why: `rpc_process_po_return_dispatch` trusts `return_lines.qty` and calls `deduct_fifo_layers` scoped only by (bv, warehouse, sub_container) — not by source receival. Two tabs both submit qty=5 on a 5-unit receival → 10 units drain, some from another supplier's layers.
- Fix: Inside the RPC (and ideally a BEFORE INSERT trigger on `return_lines`), FOR UPDATE-lock the receival_items row and RAISE when `SUM(qty already returned) + new qty > receival_items.qty_received`.

**H5. Debit-note lines silently fall back to `unit_price = 0`** — [`src/hooks/usePurchaseReturns.ts:300`](src/hooks/usePurchaseReturns.ts:300)
- Why: `createDebitNoteForReturn` resolves unit price from `po_line_items` via `(brand_variant_id ‖ sku ‖ item_name)` OR-match, then falls back to `?? 0`. If any join fails (variant swap, name edit, translation), the whole DN records total=0 → supplier is never credited for goods that physically left the warehouse.
- Fix: Source unit price from `receival_items` (authoritative landed cost) or `bill_lines`, not `po_line_items`. RAISE on miss. Add CHECK `debit_note_lines.unit_price > 0`.

**H6. PO return flow never reduces the supplier bill's outstanding** — [`src/hooks/usePurchaseReturns.ts:191`](src/hooks/usePurchaseReturns.ts:191)
- Why: DN inserts with `bill_id: null`; `useResolveDebitNoteSupplierCredit` only flips a resolution flag. No payment row, no bill balance touch, no `apply_debit_note_to_bill` RPC exists anywhere in migrations. AP aging keeps the pre-return balance permanently.
- Fix: Introduce `rpc_apply_debit_note_to_bill(dn_id, bill_id, amount)` that inserts an offsetting payments row referencing the DN and recomputes `bill.payment_status`. Add `remaining_amount` on `debit_notes` to prevent double application.

**H7. `useVoidLandedCost` bypasses accounting when the LC is already applied** — [`src/hooks/useLandedCosts.ts:157`](src/hooks/useLandedCosts.ts:157)
- Why: Plain client-side UPDATE of `voided_at`; RLS is `USING(true) WITH CHECK(true)`. UI hides the Void button after apply, but any authenticated user in console/HTTP can void it → FIFO stays boosted, retroactive COGS stays booked, `revert_snapshot` is never consumed.
- Fix: BEFORE UPDATE trigger blocking `voided_at` set when `applied_at IS NOT NULL` and revert has not run. Or route void through an RPC that calls `revert_landed_cost` first. Tighten RLS on the sensitive columns.

**H8. `revert_landed_cost` leaves COGS overstated for sales drained between apply and revert** — [`supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:564`](supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:564)
- Why: Reversal only cancels `cogs_entries WHERE landed_cost_id = p_lc_id`. Sales that occurred after apply drained the boosted layers and wrote `landed_cost_id=NULL` COGS rows carrying the LC premium — those are never reversed. Ledger permanently off by `qty_drawn_post_apply × lc_per_unit`.
- Fix: Also emit reversing `cogs_entries` for sale rows whose `source_id` (layer id) is in `revert_snapshot`, using `qty_drawn × lc_per_unit_delta`. Or block revert when snapshotted layers show post-apply drainage and require a manual adjustment.

**H9. `apply_receival_edit` cost UPDATE clobbers unrelated receivals' COGS** — [`supabase/migrations/20260724280000_apply_receival_edit_uuid_cast_and_null_serial.sql:189`](supabase/migrations/20260724280000_apply_receival_edit_uuid_cast_and_null_serial.sql:189)
- Why: `UPDATE cogs_entries WHERE brand_variant_id = X AND unit_cost = old AND date >= receival_date`. Not scoped to `source_id` (the layer). When same variant received twice at same cost, editing one receival rewrites COGS rows attributed to the OTHER receival.
- Fix: `WHERE source_id IN (SELECT id FROM fifo_cost_layers WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id)`. Drop the fragile `unit_cost = v_old_cost` predicate.

**H10. `create_inventory_receival` carve mode allows cross-sub-container carves with no transfer record** — [`supabase/migrations/20260803001600_warehouse_model_v2_phase_d2_inventory_receival_rpc.sql:99`](supabase/migrations/20260803001600_warehouse_model_v2_phase_d2_inventory_receival_rpc.sql:99)
- Why: Only checks that dest sub-container is active + in the warehouse. Never compares against source layer's sub_container. Both stock_movement rows are stamped with the DEST — sub-container A's ledger shows zero net movement while qty silently left it.
- Fix: `IF v_source_layer.sub_container_id IS DISTINCT FROM v_sub_container_id THEN RAISE 'use a warehouse transfer instead'`.

**H11. Payments can be attached with amount > invoice balance → paid_amount > total_amount** — [`supabase/migrations/20240101000000_baseline_schema.sql:2386`](supabase/migrations/20240101000000_baseline_schema.sql:2386) (`attach_payment_to_invoice`) + [`src/hooks/useCustomerPayments.ts:81`](src/hooks/useCustomerPayments.ts:81)
- Why: No `SUM(payments) + new ≤ total_amount` check. `invoice_recompute_paid_fn` writes raw SUM (no `LEAST(v_paid, v_total)` clamp, unlike the AP mirror). QAR 500 payment on a QAR 100 invoice → `paid_amount=500`, customer statement shows outstanding = −400.
- Fix: Guard in `attach_payment_to_invoice`. Add BEFORE INSERT validating trigger on `payments`. Add `LEAST` clamp in `invoice_recompute_paid_fn` for parity with `bill_recompute_paid_fn`.

**H12. Invoice `payment_status` sums payments across mixed currencies with no FX conversion** — [`supabase/migrations/20260723100000_invoice_recompute_use_original_currency.sql:81`](supabase/migrations/20260723100000_invoice_recompute_use_original_currency.sql:81)
- Why: Trigger + RPC sum raw `payments.amount` regardless of currency. `CustomerPaymentDialog` always writes currency='QAR', exchange_rate=1. A 100-USD invoice paid with a 100-QAR payment (~$27) flips to `paid`.
- Fix: Convert every payment to invoice currency before summing (via a currencies/rates table or `amount_qar` normalisation). Or reject the insert when `payments.currency ≠ invoices.currency` without an explicit FX rate.

**H13. `useUpdateReturnStatus` stamps `status='restocked'` BEFORE calling the RPC** — [`src/hooks/useSaleReturns.ts:427`](src/hooks/useSaleReturns.ts:427)
- Why: Status update commits in tx 1, `rpc_process_return_restock` runs in tx 2. RPC failure leaves the return marked "Restocked" with no FIFO layer, no stock bump, no credit note. UI has no retry path because status is terminal. Same defect in `useAssignWarehouseAndRestock` (L624).
- Fix: Reverse the order — call the RPC first. Better, fold status flip + CN creation into the RPC (mirror `complete_delivery_inventory`).

**H14. `useCreateCustomerPayment` recompute counts soft-deleted payments and downgrades 'paid' → 'partially_paid' on fetch failure** — [`src/hooks/useCustomerPayments.ts:141`](src/hooks/useCustomerPayments.ts:141)
- Why: Sum lacks `.is('deleted_at', null)` — deleted refunds still count as paid. The `so_invoices` fetch discards `error` → on failure `inv?.total_amount ?? Infinity` short-circuits to `'partially_paid'`, regressing the DB trigger's correct value.
- Fix: Add the `deleted_at` filter. Check `error` on the fetch and the final UPDATE. Better, delete the client-side recompute — the DB trigger already handles it.

**H15. `useCompleteDelivery` follow-up partial delivery is not transactional with FIFO/COGS RPC** — [`src/hooks/useSaleDeliveries.ts:126`](src/hooks/useSaleDeliveries.ts:126)
- Why: `complete_delivery_inventory` commits FIFO + COGS. Only after commit does the client run 4 sequential calls to create the follow-up delivery stub. Any failure (RLS, unique violation on `delivery_number`, NOT NULL on `warehouse_id: null`, network) leaves inventory deducted with no stub for the remaining items.
- Fix: Fold the follow-up stub into `complete_delivery_inventory` so all writes commit atomically. Also: don't pass `warehouse_id: null`.

### 🧭 MEDIUM (latent, non-blocking) — worth logging

**M1. Phase E return-restock reversal doesn't set `consumer_division_id`** — [`supabase/migrations/20260813000100_phase_e_restock_cogs_division_fallback.sql:190`](supabase/migrations/20260813000100_phase_e_restock_cogs_division_fallback.sql:190)
- Legacy null-division SOs get their delivery COGS attributed to a division but the reversal lands with `consumer_division_id = NULL`. No shipped code reads `consumer_division_id` yet, so it's a latent gap — but Phase D.12 designates it as the go-forward canonical column.
- Fix: Add `consumer_division_id` to the INSERT with the same coalesce chain used for `division_id`.

### 🗂️ Migration sanity

**MIG1. `supabase/migrations-staging/` is 58 migrations behind `supabase/migrations/`** — [`supabase/migrations-staging/`](supabase/migrations-staging/)
- Why: Staging folder ends at `20260806002000`; primary folder has 58 newer files (through `20260815003700`) — none mirrored. Violates the mandatory "Mirror migrations into staging folder" rule in AGENTS.md. A fresh Supabase project provisioned via the staging README boots at a 2026-08-05 baseline missing: Phase E RPC rewrites, Phase F damaged-stock, Warranty Phase 1, teams_places consumption, `inventory_item_photos`, all Phase D.4b/D.5/E FIFO+COGS hotfixes.
- Repro: Follow `supabase/migrations-staging/00_README.md` on an empty project → deliver an invoiced sale → zero warranty records (hook function doesn't exist) → return restock hits pre-Phase-E RPC signature.
- Fix: Either (a) re-run the pg_dump rebuild against live staging to refresh the baseline (README "Rebuild procedure"), archiving the 58 deltas into `_archive/`; or (b) copy the 58 files verbatim into `migrations-staging/` and prove `db reset --linked` succeeds on a scratch project. Add a CI check that fails PRs adding `supabase/migrations/*.sql` without a matching path in `migrations-staging/`.
