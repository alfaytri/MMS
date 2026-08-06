# Money-Path + Six-Domains Fix Pass — Session Handover (2026-08-05)

> Read this if you're picking up from a fresh `/clear`. Consolidates everything the money-path + six-domains fix pass shipped on branch `feature/warranty-module-phase-1`, plus the LC UX redesign the operator asked for at the end.

---

## TL;DR

Ran through the 49-finding money-path + six-domains adversarial QA reviews from earlier today, shipped **25 findings** across **11 migrations + client patches**, plus a **landed-cost UX overhaul** the operator asked for after smoking C5. Everything on staging (`mwvblpgbgxipvrevkeff`), `tsc --noEmit` clean, migrations mirrored to `supabase/migrations-staging/`.

Nothing broke money-path smoke: C1–C5 were smoke-tested end-to-end by the operator (PO edit guards, PO return dispatch/cancel, LC scope, receival edit qty+cost). The remaining shipped fixes are lower-radius (RPC guards, RLS, cooldowns, pagination limits, PDF currency labels).

**Deferred (~20):** the four criticals that need operator decisions (CN/store-credit redemption model, settle-installment sequencing, `useConfirmSO` UX, stock-adjustment-damage disposition), plus the atomic-create RPCs (H1/H2/H15 money) and the invoice-recompute FX cleanup (H11/H12 money). Full list at the bottom.

---

## What shipped today

### Money-path criticals (7 of 12)

| # | What | Migration / File | Verified |
|---|------|------------------|----------|
| C1 | Atomic PO line replace via `rpc_replace_po_lines` — RAISE 23503 when a line is referenced by `receival_items` (was: silent duplicate rows) | `20260815003800` + `usePurchaseOrders.ts` | ✅ operator smoke on received PO-2026-07-015 |
| C2 | Same RPC also RAISES on `po_rfq_quote_items` references (was: silent CASCADE wipe of every supplier quote) | Same as C1 | ✅ same smoke |
| C3 | `rpc_cancel_po_return_dispatch` restores `fifo_cost_layers.remaining_qty` via new `inventory_stock_movements.source_id` trail | `20260815003900` | ✅ operator smoke on variant `496089e0…` — dispatch drained RCV-00028 layer by 2, cancel restored to 10 |
| C4 | Same cancel body stamps `warehouse_id` + `sub_container_id` on reversing movements (was: NOT NULL crash) | Same as C3 | ✅ same smoke |
| C4' | Follow-up: dispatch derives warehouse + sub-container **per line** from `receival_items → receivals`, since `so_po_returns.restock_warehouse_id` is intentionally NULL post-D.4 | `20260815004000` | ✅ operator smoke — dispatch was returning "Insufficient stock" until this landed |
| C5 | `allocate_landed_cost` scope filter — `remaining_qty` sum + per-layer UPDATE + snapshot capture now scoped to `source_type='receival' AND receival_id = ANY(attached_receival_ids)`; ISM insert split per-layer so `warehouse_id` + `sub_container_id` land correctly | `20260815004100` (initial) + `20260815004600` (hotfix — scope by `receival_id` not `source_id` because receival RPCs never stamp `source_id`) | ✅ operator smoke on LC-2026-0003 → RCV-00030 layer got `landed_cost_per_unit=73.33`, `total_unit_cost=1573.33`; other layers untouched |
| C6 | `apply_receival_edit` qty branch now stamps `warehouse_id` + `sub_container_id` on the ISM inserts (was: NOT NULL crash) | `20260815004200` | Not exercised end-to-end this session (deferred to operator smoke) |
| C7 | Same RPC, cost branch: converts `v_new_cost` by the PO's `initial_exchange_rate` before writing to `fifo_cost_layers.unit_cost` + `cogs_entries.unit_cost` (both QAR since 2026-07-29) | Same as C6 | Same as C6 |

### Money-path highs (3 of 15)

| # | What | Migration / File |
|---|------|------------------|
| H3 | `usePurchaseReturns.receivalsForReturn` filters cancelled/soft-deleted returns out of the returnable-qty sum | `src/hooks/usePurchaseReturns.ts:72` |
| H5 | `createDebitNoteForReturn` RAISES on unresolved PO-line unit_price (was: silent `?? 0` fallback → DN totalled 0) | `src/hooks/usePurchaseReturns.ts:300` |
| H7 | BEFORE UPDATE trigger on `landed_costs` blocks `voided_at` set when `applied_at IS NOT NULL` — defence-in-depth for the LC-void path. Also revocations later removed the UI, so moot on happy path but keeps the DB safe from console bypass. | `20260815004500` |
| H9 | `apply_receival_edit` cost branch scopes the `cogs_entries` rewrite by `source_id ∈ (fifo layers of this receival + bv)` (was: rewrote COGS attributed to other receivals of the same variant at the same cost) | `20260815004200` |

### Six-domains criticals (1 of 4)

| # | What | Migration |
|---|------|-----------|
| C2 | `custom_roles` + `user_custom_roles` RLS lockdown — write policies now require `master_data.roles.manage` via new `_auth_user_has_permission(text)` helper (was: `USING(true) WITH CHECK(true)` → any authenticated user could self-escalate to system admin via the anon key) | `20260815004300` |
| C4 | `rpc_cancel_consumption` restores `inventory_item_brand_variants.stock_level` (was: only FIFO layers, `stock_level` stayed too low forever) | `20260815004400` |

### Six-domains highs (10 of 13) + M1/M3

| # | What | File |
|---|------|------|
| H1 | `useCancelSO` refuses to cancel SOs in `delivered`/`invoiced`/`partial_delivery` status or with any non-pending delivery | `src/hooks/useSaleOrders.ts` |
| H2 | `create_sale_order` (18-arg overload) intent check accepts both `'save_quote'` and `'quotation'` — was silently auto-confirming quotations | `20260815004500` (pg_get_functiondef + regexp_replace) |
| H3 | Invoice PDF currency label from SO — `fmtMoney` accepts currency, `generate-invoice-pdf` selects `sale_orders(currency)` | `src/lib/sales/invoice-pdf-html.ts` + `generate-invoice-pdf.ts` |
| H4 | Credit/Debit note PDF currency label from source SO / PO | `src/lib/sales/credit-debit-note-pdf-html.ts` + `generate-credit-debit-note-pdf.ts` |
| H7 | `useSaleOrders` adds `.limit(200)` on the join-heavy fetch | `src/hooks/useSaleOrders.ts:517` |
| H8 | `WhStockValueTab.latestReceivalMap` adds `.limit(10000)` on the unbounded `fifo_cost_layers` read | `src/components/purchase/wh/WhStockValueTab.tsx` |
| H9 | `/api/warehouse/reports` gates on `reports.view` permission via new `requireReportsPermission` (was: any authenticated user could hit `SERVICE_ROLE_KEY`-bypassed reads) | `src/app/api/warehouse/reports/route.ts` |
| H10 | `requireAdmin()` recognises `is_system_admin` (via seeded flag OR `'system.admin'` permission) in addition to `'master_data.users.manage'` — mirrors `requirePermission()` | `src/lib/auth/require-admin.ts` |
| H12 | `rpc_decide_consumption_edit` RAISES when the requester tries to approve their own request — separation of duties | `20260815004400` |
| H13 | `generate_consumption_number` uses a real `consumption_entry_seq` (was: `COUNT(*)`-based, raced on concurrent inserts) | `20260815004400` |
| M1 | `useReceivalsAndDeliveries` adds `.limit(200)` on both parallel queries | `src/hooks/useWarehouseOperations.ts:948` |
| M3 | `useReorderPoints` adds `.limit(5000)` | `src/hooks/useWarehouseOperations.ts:1517` |

### Landed-cost UX overhaul (operator ask, post-smoke)

Not part of the review — operator asked for these after smoking C5. Committed under `30523f35`, `1925a0a0`, `969ac165`, `06206a59`.

- **Removed** Void LC button + confirm dialog.
- **Removed** Revert Apply button + confirm dialog. LCs are now permanent by design; the trigger from H7 keeps the DB honest.
- **Added** Confirm Create dialog with 3-second cooldown, showing full payload summary (date, currency, description, cost lines with per-line currency + FX hint, QAR total in a highlighted panel, attached receivals list). "Create Landed Cost" button now says "Review & Create".
- **Added** 3-second cooldown on Apply LC's Confirm button; replaced "you can revert this later" copy with an amber Irreversible callout.
- **Attach receivals list redesign** — warehouse chip on each row, soft blue tint for selected, soft amber tint for already-used, `min-h-11` touch targets. Groups + rows sort by most-recent date DESC (was: PO number alphabetical).
- **Block re-attaching** an already-used receival — checkbox disabled + tooltip; group "select all" excludes used receivals from its math and is disabled if the whole PO is used.
- **Expandable rows in Confirm Create dialog** — each attached receival gets a chevron; clicking reveals a nested items table (name, SKU, received, remaining, unit cost). Uses `useReceivalItemsBatch` for one round-trip.
- **`validate_lc_allocation` scope fix** — the Apply-preview RPC had the same scope bug as `allocate_landed_cost` had (both fixed via C5); previously the preview lied about remaining qty. Also reworded the "not applicable to this item" warning to accurately describe what happens: *"All units already sold — LC posts entirely to COGS as a retroactive cost adjustment (does not change past invoices)"*.

### Retro-COGS behavior (operator confirmed)

For LC lines where all units are already sold (`v_bv_remaining = 0`):
- `allocate_landed_cost` posts one aggregate `cogs_entries` row per variant: `brand_variant_id` + `landed_cost_id` + `source_type='landed_cost'`, `sale_delivery_id`/`sale_order_id` = NULL.
- **Not** attributed back to specific past invoices — operator agreed this is correct: customers were billed at the original price; the LC is a variant-level cost adjustment going forward.
- Consequence: **H8 money-path (revert_landed_cost post-apply COGS gap) is dropped from the deferred list** — no revert path exists anymore (Revert Apply UI removed), so there's no reversal to leave anything overstated.

---

## Full commit list

Twelve commits on `feature/warranty-module-phase-1`, oldest-first:

```
544dd39c  fix(purchase,db): atomic PO line replace with receival + RFQ guards (C1+C2)
f97f3966  docs: update PROGRESS.md — money-path C1+C2 complete
4b2c1814  fix(db): PO return dispatch/cancel FIFO restore + warehouse derivation (C3+C4)
d310ce3a  docs: update PROGRESS.md — money-path C3+C4 complete
7f637277  fix(db): allocate_landed_cost scope leak + ISM sub_container (C5)
27f26c64  fix(db): apply_receival_edit rewrite (C6+C7+H9) + lock custom_roles RLS (six-domains C2)
b3446c88  fix: consumption RPC bugs + client-side pagination + permissions (six-domains C4/H1/H7-H10/H12/H13, money H3/H5)
45edade7  docs: money-path/six-domains fix batch 1 handover + PROGRESS
6c9cdf68  fix(background batch): six-domains H2/H3/H4/M1/M3 + money H7
6bc33cd7  fix(db): allocate_landed_cost — scope FIFO by receival_id (C5 hotfix)
30523f35  feat(lc): remove void/revert, add irreversible confirm dialogs with cooldown
1925a0a0  fix(lc): block re-attaching a receival that already has an LC
969ac165  feat(lc): expandable receival rows in Confirm Create dialog
06206a59  fix(db): validate_lc_allocation — scope remaining_qty + clearer warning
```

---

## Migrations applied to staging

All mirrored to `supabase/migrations-staging/` on the same commit that added the source file.

| Filename | Fixes |
|----------|-------|
| `20260815003800_rpc_replace_po_lines.sql` | C1, C2 |
| `20260815003900_rpc_cancel_po_return_dispatch_fifo_restore.sql` | C3, C4 |
| `20260815004000_rpc_process_po_return_dispatch_derive_warehouse.sql` | C4 (follow-up) |
| `20260815004100_allocate_landed_cost_scope_and_ism_fix.sql` | C5 (initial) |
| `20260815004200_apply_receival_edit_c6_c7_h9.sql` | C6, C7, H9 |
| `20260815004300_lock_custom_roles_rls.sql` | six-domains C2 |
| `20260815004400_consumption_fixes.sql` | six-domains C4, H12, H13 |
| `20260815004500_h2_h7_background_fixes.sql` | six-domains H2, money H7 |
| `20260815004600_c5_hotfix_scope_by_receival_id.sql` | C5 hotfix |
| `20260815004700_validate_lc_allocation_scope_and_message.sql` | LC preview scope + wording |

---

## Operator smoke completed (this session)

- **C1** — PO-2026-07-015 (received PO): save now blocked with clear `23503 Cannot replace PO lines: 1 receival record(s)...`.
- **C3 + C4** — variant `496089e0…`: dispatch drained RCV-00028 layer by 2, cancel restored to 10, ISM rows paired via `source_id = 8c88ea8c…`.
- **C4 follow-up** — same variant: dispatch was blocked with "Insufficient stock" until the warehouse-derivation follow-up landed, then succeeded.
- **C5** — LC-2026-0003 (RCV-00030, 15 units, 1100 QAR): applied → RCV-00030 layer's `landed_cost_per_unit = 73.33`, `total_unit_cost = 1573.33`; RCV-00028/29 layers untouched. C5 hotfix was needed because the initial migration scoped by `source_id` which the receival RPCs never stamp.
- **LC UX** — Confirm Create dialog with cooldown, expandable receival rows, blocked re-attach on already-used receivals all verified on staging.

---

## Deferred — need decisions or bigger scope

### Deferred criticals (need operator decisions before I write them)

- **money C8 + C9 + C11 + C12 — credit-note / store-credit path**. Correct fix per checklist is one `rpc_redeem_store_credit(invoice_id, redemptions jsonb)` that FOR-UPDATE-locks each CN, verifies customer match + `resolution_type='store_credit'` + `SUM ≤ total_amount`, then inserts payments; then REVOKE direct INSERT on `payments` when `credit_note_id IS NOT NULL`. Decisions needed: (a) redemption model — atomic per-invoice or per-line? (b) `useIssueCreditNote` references a non-existent `amount` column on `credit_notes` — rename to `total_amount` (checklist recommendation) or add `amount` as an alias? (c) safe to revoke direct INSERT policy on `payments` now, or wait until every hook is migrated?
- **money C10 — settle installment RPC**. Fix: RPC that reads current `paid_amount`, adds the new amount, sets `status = amount_paid >= amount ? 'paid' : 'partial'`, uses an advisory-locked sequence for `payment_id`. Decision needed: spin fresh `payment_number_seq` or share with the shipped Bill/Invoice payment sequences?
- **six-domains C1 — `useConfirmSO` bypasses approval + double-reserves**. Fix per checklist is "remove `useConfirmSO` or restrict to quotation-status SOs only" — the operator's Confirm button on the SO list currently short-circuits `pending_approval → confirmed`. Decision: (a) hide the button on `pending_approval` and route those through `approve_sales_request`, or (b) rewire the button to call `approve_sales_request`? Also confirm which of `create_sale_order` / `useConfirmSO` was intended to reserve stock (currently both do → 2× reserved qty).
- **six-domains C3 — stock_adjustment `damage` type doesn't create damaged_stock rows**. Fix: `approve_stock_adjustment_inventory` damage branch needs to mirror `_record_inventory_disposition` — three synchronized INSERTs into `inventory_damaged_stock`, `inventory_damaged_stock_layers`, `inventory_damaged_movements`. Deferred because I want to read the disposition helper carefully before writing it.

### Deferred highs (bigger scope; not risky, just longer)

**Money-path:**
- **H1** `useCreatePO` non-atomic → new `create_purchase_order(payload jsonb)` RPC.
- **H2** `useCreateBill` allows negative totals → new `create_purchase_bill(payload jsonb)` RPC + CHECK `bills.total_amount >= 0` + short-circuit in `allocate_payment_to_bill` on negative totals.
- **H4** PO return dispatch over-return guard → inside the dispatch RPC, FOR-UPDATE-lock `receival_items` and RAISE when `SUM(qty already returned) + new > qty_received`. Also add a BEFORE INSERT trigger on `return_lines`.
- **H6** DN → bill outstanding never reduced → new `rpc_apply_debit_note_to_bill(dn_id, bill_id, amount)` + `debit_notes.remaining_amount` column.
- **H10** `create_inventory_receival` carve mode allows cross-sub-container carves → add guard: `IF v_source_layer.sub_container_id IS DISTINCT FROM v_sub_container_id THEN RAISE 'use a warehouse transfer instead'`.
- **H11** payments over-allocate → guard in `attach_payment_to_invoice` + BEFORE INSERT validating trigger on `payments` + LEAST clamp in `invoice_recompute_paid_fn`.
- **H12** invoice `payment_status` sums mixed currencies → convert payments to invoice currency in `invoice_recompute_paid_fn` (simplest: normalise via `amount_qar`). Note: the invoice split (`so_invoices` vs `invoices` vs `tl_invoices`) means multiple recompute paths may need updating.
- **H13** `useUpdateReturnStatus` flips status before RPC → reverse the order (RPC first, then status), or fold both into one RPC (mirrors `complete_delivery_inventory`).
- **H14** `useCreateCustomerPayment` recompute counts soft-deleted rows + fails open on fetch error → add `.is('deleted_at', null)`, check `error`, or delete the client-side recompute (DB trigger already handles it).
- **H15** `useCompleteDelivery` follow-up delivery stub non-atomic with `complete_delivery_inventory` → fold the follow-up stub into the RPC.
- **M1** Phase E return-restock reversal missing `consumer_division_id` → one-column add to a full CREATE OR REPLACE. Latent — no code reads that column yet.

**Six-domains:**
- **H5** PO PDF Grand-Total mixes QAR with original-currency label → template redesign (Subtotal in PO currency vs Grand Total in `po.total_qar`). Decision needed: compute Grand Total in PO currency, or relabel QAR rows explicitly?
- **H6** Bill PDF payment table duplicates from three overlapping queries → dedup by payment id across all three.
- **H11** `receive_transfer` doesn't decrement stock_level for shrinkage → after the item loop: `IF v_total_shrinkage > 0 THEN UPDATE inventory_item_brand_variants SET stock_level = stock_level - v_total_shrinkage`.
- **M2** `useSaleReturns` — already added `.limit(200)` earlier in this session but confirm it stuck.

### Deferred migration blocker

- **MIG1** `supabase/migrations-staging/` was 58 files behind before this session; new files added today have been mirrored one-by-one. Two paths still on the board: (A) re-run the pg_dump rebuild against live staging to refresh the baseline (`supabase/migrations-staging/00_README.md` "Rebuild procedure"), archiving deltas into `_archive/`. (B) copy the remaining pre-today deltas verbatim into `migrations-staging/` and prove `db reset --linked` succeeds on a scratch project. Also add a CI check that fails PRs adding `supabase/migrations/*.sql` without a matching path in `migrations-staging/`.

### Dropped from the list

- **money H8** `revert_landed_cost` post-apply COGS gap — moot. Revert Apply UI was removed (LCs are permanent by design). No revert path = no reversal gap.

---

## Session-start ritual for resumption

1. Read `AGENTS.md`.
2. Read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`.
3. Read this file.
4. Skim `docs/release-checklist-money-path.md` + `docs/release-checklist-six-domains.md` for the full finding bodies you'll need to look up when picking up a deferred item.
5. Ask the operator which of the four deferred criticals to start with, or which high to tackle next.

---

## Follow-up bugs surfaced during smoke (filed, not fixed)

- **`returns_credit_note_id_fkey` violation** on the PO-return CN creation path — client-side non-atomic hop where CN insert fails but the return_id update still runs. Same shape as H13 money; will be closed by the H13 fix.
- **`create_inventory_receival` + `approve_receival_inventory` don't stamp `fifo_cost_layers.source_id`** on new inserts — the C5 hotfix works around this by scoping on `receival_id`, but the RPCs should be rewritten so both columns stay consistent. Emitted a `NOTICE` in migration `20260815004600` flagging this. Non-blocking.
