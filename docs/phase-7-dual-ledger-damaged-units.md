# Phase 7 — Dual-Ledger for Damaged Units

**Filed:** 2026-07-28 (during Phase 6.9 verification)
**Status:** Backlog — proper fix, not started
**Owner:** TBD
**Related plan:** [`docs/superpowers/plans/2026-07-28-delivery-return-replacement-redesign.md`](superpowers/plans/2026-07-28-delivery-return-replacement-redesign.md)

## The gap

`return_line_resolutions` (built in Sub-task 6.1) treats every returned unit as having a **single** resolution — refund, store_credit, replacement, or write_off. The `rpc_record_return_line_resolution` recorder enforces `p_qty ≤ remaining_qty`, so a unit can be counted **once**.

That collapses two independent business concepts into one:

| Concept | Question it answers |
|---|---|
| Customer resolution | What did the customer receive back? (money / credit / replacement product) |
| Inventory disposition | What happened to the physical unit? (restocked / repaired / written off) |

For **good** units these two concepts happen to align: the physical unit goes back on the shelf (`sale_return` movement in `rpc_process_return_restock`) *and* the customer gets refund/credit/replacement. One ledger row per unit works.

For **damaged** units they diverge:

- Reason = **seller's fault** (defective, wrong item shipped, damaged in transit) → customer deserves refund/credit, business also writes off the physical unit as loss. **Two events on the same unit.**
- Reason = **customer's fault** (customer broke it) → customer gets nothing, business writes off. One event.

The single-ledger model can only represent one of the two events, so on SR-00007 the operator picked write-off (booking the QAR 3,000 inventory loss) and the customer got nothing back for the 2 damaged units — even though the return reason was "Wrong Item Shipped" (seller's fault).

## The proper fix — two independent ledgers

Two tables (or one table with a `dimension` column), each with its own coverage rule:

### Customer resolution ledger

- Must sum to `return_lines.qty` per line before the return can close
- Rows: `resolution_type IN ('refund', 'store_credit', 'replacement')`
- Links: `credit_note_id` (refund/store_credit), `sale_delivery_id` (replacement)
- Damaged units MUST have a customer resolution too — the reason (seller vs customer fault) is a **hint** to the operator, not a hard rule. The Damaged warning banner + Complete Inspection confirm modal already surface the caveat "you're marking these as unrecoverable — separately decide the customer's compensation."

### Inventory disposition ledger

- Must sum to `return_lines.qty` per line for damaged rows (good rows are handled by `rpc_process_return_restock` — implicit "restocked as good")
- Rows: `disposition_type IN ('write_off', 'restock_as_damaged', 'send_for_repair', 'salvage')`
- Links: `inventory_stock_movement_id`, or `warehouse_transfer_id` for repair/salvage flows

### Coverage & auto-close

`_maybe_close_return` becomes: return closes only when **both** ledgers are fully covered.

- `total_customer_remaining = 0` (every unit has customer resolution)
- `total_inventory_remaining = 0` (every damaged unit has inventory disposition; good units are auto-satisfied by the restock movement)

`_return_resolution_status` derivation stays similar but reads from the customer ledger only — inventory disposition doesn't affect the customer-facing status.

## UI implications

### ReplacementDeliveryDialog
- Damaged rows show BOTH an editable "Replace this time" input (currently locked at 0) *and* a "Write off" checkbox per row (not one blanket checkbox). Refurb / send-for-repair pickers can slot in later.
- Or: keep two-step UX — Send Replacement dialog handles customer resolution, a separate "Dispose of damaged units" panel on the return card handles inventory disposition.

### CreditDebitNoteDetailDialog refund/store-credit picker
- Already allows damaged qty (6.6 spec). Stays as-is — it's the customer resolution surface.
- Independent from write-off. Recording refund on a damaged unit no longer prevents write-off.

### Return card ledger summary
- Two lines: "Customer: 3 replaced · 2 refunded · 0 remaining" + "Inventory: 2 written off · 0 remaining (of 2 damaged)"
- Or condensed: "3 replaced (customer) + 2 refunded (customer) + 2 write-off (inventory) — all 5 covered"

## Migration path from Phase 6

Existing `return_line_resolutions` rows should be treated as customer resolutions when their type is `refund` / `store_credit` / `replacement`, and as inventory dispositions when type is `write_off`. Split the table (or add the `dimension` column) and set `dimension` based on type. Existing damaged units that got `write_off` recorded will need a follow-up customer resolution — either operator-driven per-return, or a data-migration script that assumes "customer got nothing" and stamps the customer ledger accordingly (Phase 6 behavior grandfathered in).

## Scope estimate

- 1 migration: split table (or add `dimension` column) + repoint FKs + rewrite `_maybe_close_return` and `_return_resolution_status`
- 4 RPCs re-designed: `rpc_record_return_line_resolution` splits into customer + inventory recorders; `rpc_create_partial_replacement` still writes customer side; `rpc_record_return_refund` / `_store_credit` stay customer-side; new `rpc_record_inventory_disposition` (write-off / repair / salvage)
- Dialog rewrites: ReplacementDeliveryDialog (or a new DamagedDispositionDialog), return card summary
- Backfill: split existing rows by type, add a follow-up "damaged compensation" prompt on returns that only had write-off recorded

Rough shape: 4-6 focused sessions. Comparable to Phase 6.

## Why we deferred it

Phase 6 shipped the ledger foundation. The single-ledger model is *correct for good units and for reason=customer-fault damaged units* — which covers the majority of returns in the current dataset. The seller-fault damaged case is a real-money bug but affects a smaller volume of returns. Phase 6 verification (Sub-task 6.9) surfaced it and we chose to log it here rather than double the scope mid-verification. Layer 1 warning banner (CreateReturnDialog) and Layer 2 confirmation modal (CompleteInspectionDialog) added during 6.9 make operators explicit about damaged classification so the bookkeeping stays honest until Phase 7.
