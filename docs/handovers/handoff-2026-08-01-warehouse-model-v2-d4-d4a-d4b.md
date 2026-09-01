# Handoff — Warehouse Model v2, Phases D.4 + D.4.a + D.4.b

**Date:** 2026-08-01  
**Branch:** `feature/warehouse-model-v2`  
**DB target:** staging `mwvblpgbgxipvrevkeff`  
**Smoke-tested by user:** yes, all 7 checks passed

---

## TL;DR

Every operator-triggered inventory flow that used to be "warehouse-wide" is now scoped to the exact sub-container where stock lives. Returns (PO and SO) explicitly remember which receival or delivery they came from — provenance is a first-class field on `return_lines`. Restock, replacement, write-off, and transfer dispatch all derive their source or destination sub-container from that link.

The visible outcome: no more "Restock Warehouse" dropdowns on return dialogs. Users pick which receival/delivery to return from, and the system handles routing.

---

## What shipped, at a glance

| Phase | What it did | User-visible change |
|---|---|---|
| **D.4 Task 1** | `dispatch_transfer` passes source sub-container to FIFO drain | Warehouse transfers no longer spill stock across sub-containers |
| **D.4.a** | Added `return_lines.receival_item_id` + backfilled 2 legacy rows + reworked PO-return UI | PO returns list one row per receival with warehouse + sub-container badges |
| **D.4 Task 2** | `rpc_process_po_return_dispatch` derives + drains from source sub-container | PO return dispatch now scope-tight |
| **D.4.b** | Added `return_lines.sale_delivery_line_id` + backfilled 28 legacy rows + reworked SO-return UI | SO returns list one row per delivery with warehouse + sub-container badges |
| **D.4.b Task 5** | `rpc_process_return_restock` restores per-line to source sub-container | Restock goes back where it came from; no header warehouse pick |
| **D.4.b Task 5b** | `rpc_create_partial_replacement` write_off stamps sub-container | Damaged write-offs no longer 500 on the NOT NULL constraint |
| **D.4.b hotfix chain** | Multiple fallbacks for pre-D.3 deliveries + inspection provenance carry-over | Legacy returns dispatch cleanly; inspection splits keep their source link |
| **D.4.b Task 6** | Shared `<ReturnLineSourceBadges>` + `useReturnLineSources` hook | Expanded return views (PO and SO) show provenance without extra queries per row |

---

## Migrations (7 files)

Apply order matters — do not squash.

| Timestamp | File | Purpose |
|---|---|---|
| 20260804000100 | `..._phase_d4_dispatch_transfer_scope.sql` | dispatch_transfer 5th arg |
| 20260805000100 | `..._phase_d4a_return_lines_receival_link.sql` | PO provenance column + backfill |
| 20260805000200 | `..._phase_d4_po_return_dispatch_scope.sql` | PO return dispatch scoped drain |
| 20260806000100 | `..._phase_d4b_return_lines_delivery_link.sql` | SO provenance column + backfill (28 rows) |
| 20260806000200 | `..._phase_d4b_return_restock_sub_container.sql` | Restock RPC rewrite |
| 20260806000300 | `..._phase_d4b_partial_replacement_writeoff_scope.sql` | Replacement RPC write_off stamps sub-container |
| 20260806000400 | `..._phase_d4b_return_restock_pre_d3_fallback.sql` | Fallback for pre-D.3 deliveries missing cogs source_id |
| 20260806000500 | `..._phase_d4b_return_restock_warehouse_division_fallback.sql` | Division-cascade fallback (return → SO → warehouse) |
| 20260806000600 | `..._phase_d4b_inspection_carry_delivery_link.sql` | Inspection split preserves provenance |
| 20260806000700 | `..._phase_d4b_inspection_restock_warehouse_optional.sql` | Restock warehouse now optional on inspection RPC |
| 20260806000800 | `..._phase_d4b_partial_replacement_division_fallback.sql` | Division cascade applied to replacement write_off too |

All applied to staging. No prod push yet.

---

## New tables/columns/functions

**New columns:**
- `return_lines.receival_item_id uuid → receival_items(id)` (nullable; NULL for SO returns)
- `return_lines.sale_delivery_line_id uuid → sale_delivery_lines(id)` (nullable; NULL for PO returns)

**Rewritten RPCs:**
- `dispatch_transfer` — passes `from_sub_container_id` to `deduct_fifo_layers`.
- `rpc_process_po_return_dispatch` — per-line derive of source sub-container via `return_lines.receival_item_id → receival_items.sub_container_id`.
- `rpc_process_return_restock` — per-line derive via `return_lines.sale_delivery_line_id → sale_delivery_lines → sale_deliveries → cogs_entries → fifo_cost_layers.sub_container_id`, with cascading fallback for pre-D.3 legacy deliveries.
- `rpc_create_partial_replacement` — write_off branch derives + stamps sub-container using the same chain.
- `rpc_complete_return_inspection` — carries `sale_delivery_line_id` + `receival_item_id` from the source inspection line to the split good/damaged rows; `p_restock_warehouse_id` is now `DEFAULT NULL` and informational only.

**New hook + component (frontend):**
- `useReturnLineSources(receivalItemIds, saleDeliveryLineIds, returnId?)` → `{ receival: Map<id, info>, delivery: Map<id, info> }`. One batched query per view; `info` includes `refNumber`, `warehouseId`, `warehouseName`, `subContainerName`.
- `<ReturnLineSourceBadges info={...} />` — renders the badge trio, or a "Legacy — no source link" note when info is null.

**New hooks (frontend):**
- `useReceivalItemsForPo(poId)` — SO-side equivalent for SO deliveries.
- `useSaleDeliveryLinesForSo(soId)` — the D.4.b analog.

---

## The "why" for future readers

**Q: Why remove the "Restock Warehouse" dropdown?**  
It was a scope-leak vector. Operators picked whichever warehouse felt right; the RPC then drained/restocked warehouse-wide. Since D.3 requires sub-container scoping, and D.4.a/b make provenance explicit, the header-level warehouse picker became redundant and misleading — it hinted "you can pick any warehouse" when the correct answer was always "wherever this receival/delivery came from."

**Q: Why hard-fail on missing `receival_item_id` / `sale_delivery_line_id` for new returns?**  
Silent NULL is exactly the scope-leak class this phase closes. The UI blocks creation without the link (D.4.a Task 2 / D.4.b Task 2 mutation validators), and the RPC blocks dispatch/restock without the link (Task 5 hard-fails). Legacy rows use fallback derives instead.

**Q: Why keep "Source Warehouse" picker on the Send Replacement dialog?**  
Replacement is the *only* flow where the source is genuinely operator-choice — replacement stock can come from any warehouse with inventory, not necessarily the original delivery's source. The picker auto-defaults to the original delivery warehouse (with an `[Auto]` badge) and hides behind a `Change` link — visible when needed, out of the way otherwise.

**Q: What is the fallback chain for `sub_container_id` on legacy data?**  
Primary: exact FIFO-layer derive (via `cogs_entries.source_id → fifo_cost_layers`).  
Fallback 1 (pre-D.3 deliveries without `source_id`): `_find_or_create_sub_container(delivery.warehouse_id, division)`.  
Division cascade for that fallback: `return.division_id → sale_order.division_id → warehouse.division_id`. If all three are NULL, the RPC hard-fails with a clear operator-facing message.

---

## What is still pending in Phase D.4

D.4 Tasks 3, 4, 5, 6, 7, 8, 9 from the original plan.

**Task 3 (return_restock)** — DONE, subsumed by D.4.b Task 5.

**Tasks 4–5 (stock adjustment stack):** still open.
- `create_stock_adjustment_v2` needs new optional `p_sub_container_id` param.
- `approve_stock_adjustment_inventory` needs to pass `stock_adjustments.sub_container_id` as 5th arg to `deduct_fifo_layers`.
- See the D.4 plan file for step-by-step.

**Tasks 6–8 (hook + dialogs):** still open.
- `useWarehouseOperations` needs to forward sub-container ids for transfers and adjustments.
- `WhTransferDialog` needs from/to sub-container pickers + scoped stock preview (a targeted query, not full stock-view rewrite).
- `WhAdjustmentDialog` needs a sub-container picker below the warehouse select.

**Task 9 (D.4 wrap):** smoke + commit + PROGRESS/EOD for the adjustment work.

**D.5 (deferred):** sub-container column in `warehouse_stock_view`, per-sub-container stock overview page.

---

## Known limitations / follow-up items

1. **No DB `NOT NULL` on either provenance column.** Deferred to a hardening phase once ops confirms all creation paths populate. Currently enforced at the app layer.
2. **Existing legacy returns' inventory movements retain warehouse-wide sub-container assignment.** A one-time backfill migration could re-stamp them via the same derive chain — no urgency, not blocking.
3. **`useReturnLineSources` is not paginated.** For a return with many lines the batch query is still one round-trip; fine at current scale (largest return in the wild is ~5 lines).
4. **`sale_deliveries.warehouse_id` is the ledger truth for the SO side.** `sale_deliveries.warehouse_name` (redundant denormalized column) is preserved for display but not consulted for derivation — the RPC uses `warehouse_id` only.
5. **Replacement delivery FIFO drain is not scoped in this phase.** `rpc_create_partial_replacement` inserts the replacement `sale_delivery_lines` at `status='delivered'` but doesn't call `deduct_fifo_layers`. Investigate whether a subsequent flow deducts inventory — if not, that's a separate bug independent of D.4.b's provenance work.

---

## File index

**DB (11 migrations):** listed in the Migrations table above.

**Hooks:**
- `src/hooks/usePurchaseReturns.ts` — added `useReceivalItemsForPo`, extended `POReturnItem`, added `receival_item_id` validation.
- `src/hooks/useSaleReturns.ts` — added `useSaleDeliveryLinesForSo`, extended payload, added `sale_delivery_line_id` validation. `useCompleteReturnInspection` param made optional.
- `src/hooks/useReturnLineSources.ts` — NEW; batch resolver for provenance labels.
- `src/hooks/useReceivals.ts`, `src/hooks/useSaleDeliveries.ts` — small `?? undefined` fixes on RPC calls after types regen.

**Components:**
- `src/components/shared/ReturnLineSourceBadges.tsx` — NEW; badge trio renderer.
- `src/components/purchase/PoReturnsTab.tsx` — receival-item picker + expanded-view source column.
- `src/components/purchase/PoDetailDialog.tsx` — dropped unused `receivals` prop from PoReturnsTab call.
- `src/components/sales/CreateReturnDialog.tsx` — delivery-line picker; no warehouse selector.
- `src/components/sales/CompleteInspectionDialog.tsx` — dropped warehouse picker; per-row "Restocks to" badges.
- `src/components/sales/ReplacementDeliveryDialog.tsx` — auto-default source warehouse with `Change` affordance; sub-container badge.
- `src/components/sales/SaleReturnDetailDialog.tsx` — added Source column to Items table.

**Pages:**
- `src/app/(dashboard)/purchase/returns/page.tsx` — reworked create-return flow to use receival-item rows.
- `src/app/(dashboard)/sales/returns/page.tsx` — reworked create-return flow to use delivery-line rows.

**Types:**
- `src/types/database.types.ts` — regenerated after schema changes; helper aliases re-appended.

---

## Contacts / next agent orientation

- **Continue with D.4 Tasks 4–9:** stock adjustment stack. Plan file: `docs/superpowers/plans/2026-08-01-warehouse-model-v2-phase-d4.md`.
- **User's smoke policy:** commit only after user confirms working. This handoff assumes commits have been done.
- **Co-authorship trailer required on every commit** (per AGENTS.md). HEREDOC pattern.
