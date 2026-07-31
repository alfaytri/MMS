# Business Flow Registry

**Purpose.** Central index of every material business flow in MMS so we do not build duplicate paths for the same operation. Every time a new flow is added, extended, or replaced, an entry must land here in the same PR that ships the flow.

## Why this exists

We hit the duplication risk during Phase 6/7: the "damaged return" story ended up with a blanket write-off checkbox in one dialog, a `useWriteOffDamagedReturn` hook, a marker "Send Replacement" button on the credit note, AND a separate real replacement path in `SoDetailDialog` — four entry points, two of which were dead ends. This registry is the safeguard: before adding a new action, search here first.

## Mandatory rule

- When you introduce a new flow (or meaningfully change an existing one), add / update an entry below **in the same commit that ships the code**.
- When you retire a flow, mark it Deprecated (do not delete the row until a full Phase cleanup drops the code too).
- Before writing a new action / RPC / dialog, `grep` this file first. If the flow already exists, extend it — do not re-invent it.

## Entry template

Copy-paste this for a new flow:

```
### <Flow name — verb noun>

- **Module:** <Sales / Purchase / Inventory / Warehouse / Finance / Contact Centre / …>
- **Status:** <Active | Deprecated | Planned>
- **Trigger surface(s):** <where the operator initiates it — page + button + component>
- **Primary hook(s):** <src/hooks/... — the mutation(s) called>
- **RPC(s):** <public.rpc_* — the DB entry points>
- **Ledger writes:** <tables written to; whether via SECURITY DEFINER recorder>
- **Downstream side-effects:** <invalidations, movements booked, statuses flipped>
- **Dialog / component:** <the dialog or panel that renders the flow>
- **Guards / preconditions:** <who can call it, what state is required>
- **Related flows:** <cross-links to other rows here>
- **Docs / plans:** <path to the plan or spec that owns the flow>
- **Notes:** <anything a next-implementer needs to know>
```

Field rules:
- Use one row per flow, not per action. A flow that supports multiple side-actions (e.g. "record refund + close return") is one row.
- Cross-link with `[[Flow name]]` so related rows can be found via ripgrep.
- Never inline SQL bodies here — link to migrations.

## Registry

### Create Sales Return (Direct)

- **Module:** Sales
- **Status:** Active
- **Trigger surface(s):** `SoDetailDialog` → Returns tab → **+ Create Return** button. Also `/sales/returns` list → **+ Create Return** button.
- **Primary hook(s):** [`useCreateSaleReturn`](src/hooks/useSaleReturns.ts)
- **RPC(s):** `rpc_create_sale_return` (Direct path — condition + qty per line submitted up-front)
- **Ledger writes:** `so_po_returns`, `return_lines`. No ledger rows yet — those come from resolutions.
- **Downstream side-effects:** For damaged rows under Direct path, warning banner shown (Layer 1). Status starts `pending` or `pending_inspection` per the operator's choice.
- **Dialog / component:** [`CreateReturnDialog`](src/components/sales/CreateReturnDialog.tsx)
- **Guards / preconditions:** SO status ∈ `delivered | partial_delivery | invoiced | closed`.
- **Related flows:** [[Complete Return Inspection]], [[Restock Sales Return]]
- **Docs / plans:** [docs/superpowers/plans/2026-07-28-delivery-return-replacement-redesign.md](docs/superpowers/plans/2026-07-28-delivery-return-replacement-redesign.md)

### Complete Return Inspection

- **Module:** Sales
- **Status:** Active
- **Trigger surface(s):** Return row in `SoReturnsTab` / `/sales/returns` list with status `pending_inspection` → **Complete Inspection** button.
- **Primary hook(s):** [`useCompleteReturnInspection`](src/hooks/useSaleReturns.ts)
- **RPC(s):** `rpc_complete_return_inspection`
- **Ledger writes:** Updates `return_lines.condition` + qty splits per line; flips `so_po_returns.status → received`.
- **Downstream side-effects:** Layer 2 confirmation modal when damaged qty > 0. Restock warehouse auto-defaults to `so_po_returns.restock_warehouse_id`.
- **Dialog / component:** [`CompleteInspectionDialog`](src/components/sales/CompleteInspectionDialog.tsx)
- **Guards / preconditions:** `status = pending_inspection`.
- **Related flows:** [[Create Sales Return (Direct)]], [[Restock Sales Return]]

### Restock Sales Return

- **Module:** Sales / Inventory
- **Status:** Active
- **Trigger surface(s):** Return row with status `received` → **Mark Restocked** button.
- **Primary hook(s):** [`useUpdateReturnStatus`](src/hooks/useSaleReturns.ts) → status = `restocked`
- **RPC(s):** `rpc_process_return_restock` (called by the DB status-transition trigger)
- **Ledger writes:** `inventory_stock_movements` (`sale_return` for good units) — damaged units are NOT auto-restocked (they wait for an inventory disposition).
- **Downstream side-effects:** Good units land back in `restock_warehouse_id` stock. Flips `so_po_returns.status → restocked`.
- **Related flows:** [[Create Sales Return (Direct)]], [[Record Inventory Disposition]]

### Issue Credit Note for Sales Return

- **Module:** Sales / Finance
- **Status:** Active
- **Trigger surface(s):** Return row in `SoReturnsTab` (any status) with no CN yet → **Create Credit Note** button.
- **Primary hook(s):** [`useCreateCreditNoteForReturn`](src/hooks/useCreditNotes.ts)
- **RPC(s):** `rpc_create_credit_note_for_return`
- **Ledger writes:** `credit_notes` + `credit_note_lines` (original + returned lines both). No return-line ledger rows.
- **Downstream side-effects:** CN starts in `open` status (Phase 8.1b vocabulary — `open` → `in_progress` → `resolved` describes the return-resolution lifecycle); `so_po_returns.credit_note_id` linked.
- **Related flows:** [[Record Return Refund]], [[Record Return Store Credit]]

### Create Partial Replacement (customer + inventory atomic)

- **Module:** Sales
- **Status:** Active — Phase 7.2 rewrite
- **Trigger surface(s):** `SoDetailDialog` → Returns tab → **Resolve Remaining** / **Book Dispositions** button on any restocked return.
- **Primary hook(s):** [`useCreateReplacementDelivery`](src/hooks/useSaleDeliveries.ts)
- **RPC(s):** `rpc_create_partial_replacement(p_return_id, p_warehouse_id, p_lines, p_gift_items, p_dispositions)`
- **Ledger writes:** `sale_deliveries` (`type='replacement'`) + `sale_delivery_lines` + `return_line_customer_resolutions` (type=replacement) + optional `return_line_inventory_dispositions` (from `p_dispositions`) + `inventory_stock_movements` (`sale_return_damaged` for write-offs). All atomic — a disposition failure rolls back the delivery.
- **Downstream side-effects:** `_record_customer_resolution` flips linked CN status `open → in_progress` on first replacement row (Phase 8.1b). `_maybe_close_return` closes only when BOTH `customer_remaining` and `inventory_remaining` reach 0, at which point the CN status flips to `resolved` and `resolution_type` is stamped from the ledger mix. Inventory dispositions do NOT flip CN status — the customer side owns the CN lifecycle.
- **Dialog / component:** [`ReplacementDeliveryDialog`](src/components/sales/ReplacementDeliveryDialog.tsx)
- **Guards / preconditions:** Return status ∈ `restocked | resolved_credit | resolved_replacement | resolved_partial`, `customer_remaining > 0` on target lines.
- **Related flows:** [[Record Inventory Disposition]], [[Record Return Refund]]

### Record Return Refund

- **Module:** Sales / Finance
- **Status:** Active — Phase 7.2 rewrite
- **Trigger surface(s):** `CreditDebitNoteDetailDialog` → **Refund** button → qty picker → Record Refund.
- **Primary hook(s):** [`useResolveCreditNoteRefund`](src/hooks/useCreditNotes.ts) → internal `resolveCreditNoteViaLedger`
- **RPC(s):** `rpc_record_return_refund(p_return_id, p_lines, p_refund_method, p_refund_reference)`
- **Ledger writes:** `return_line_customer_resolutions` (type=refund) via `_record_customer_resolution`. Stamps `credit_notes.refund_method` / `refund_reference` when provided.
- **Downstream side-effects:** `_record_customer_resolution` flips `credit_notes.status: open → in_progress` on first partial resolution (Phase 8.1b). `_maybe_close_return` flips it to `resolved` and stamps `resolution_type` from the customer-ledger mix when the return closes.
- **Related flows:** [[Record Return Store Credit]], [[Create Partial Replacement (customer + inventory atomic)]]

### Record Return Store Credit

- **Module:** Sales / Finance
- **Status:** Active — Phase 7.2 rewrite
- **Trigger surface(s):** `CreditDebitNoteDetailDialog` → **Store Credit** button → qty picker → Record Store Credit.
- **Primary hook(s):** [`useResolveCreditNoteStoreCredit`](src/hooks/useCreditNotes.ts) → internal `resolveCreditNoteViaLedger`
- **RPC(s):** `rpc_record_return_store_credit(p_return_id, p_lines)`
- **Ledger writes:** `return_line_customer_resolutions` (type=store_credit) via `_record_customer_resolution`. Also adds to the customer's credit balance.
- **Downstream side-effects:** Same as [[Record Return Refund]] — CN status auto-flips `open → in_progress → resolved` through the recorder + closer chain. On terminal, `_maybe_close_return` stamps `credit_notes.resolution_type='store_credit'` (Phase 8.6 fix — previously mis-stamped as `refund` for pure store-credit closes).
- **Related flows:** [[Record Return Refund]]

### Record Inventory Disposition

- **Module:** Sales / Inventory
- **Status:** Active — Phase 7.2 new action; extended Phase 9.3 (`restock_as_damaged`)
- **Trigger surface(s):** `ReplacementDeliveryDialog` (dispositions-only submit — no replacement lines).
- **Primary hook(s):** [`useRecordInventoryDisposition`](src/hooks/useSaleDeliveries.ts)
- **RPC(s):** `rpc_record_inventory_disposition(p_return_id, p_warehouse_id, p_dispositions)`; disposition dispatch also lives inline in `rpc_create_partial_replacement(p_return_id, p_warehouse_id, p_lines, p_gift_items, p_dispositions)`.
- **Ledger writes:** For `{return_line_id, type='write_off', qty}`: `inventory_stock_movements(movement_type='sale_return_damaged')` + `return_line_inventory_dispositions` via `_record_inventory_disposition`. For `{return_line_id, type='restock_as_damaged', qty, notes?}` (Phase 9.3, migration `20260802000400_rpc_restock_as_damaged.sql`): `return_line_inventory_dispositions` (both FKs null) + `inventory_damaged_stock_layers` (FIFO layer, cost via `_return_line_fifo_unit_cost`) + `inventory_damaged_stock` (weighted-avg upsert) + `inventory_damaged_movements(movement_type='restock_as_damaged_in')`, all booked inside `_record_inventory_disposition` itself (not the caller) once it validates the condition/qty guards. For `{return_line_id, type='send_for_repair', qty, notes?}` (Phase 9.4, migration `20260802000500_rpc_send_for_repair.sql`): `return_line_inventory_dispositions` ONLY (both FKs null initially — `warehouse_transfer_id` is populated later by the [[Send Damaged for Repair]] follow-up RPC once the operator picks a vendor). No damaged-stock side-effects at disposition time; the physical restock + transfer both happen inside `rpc_send_damaged_for_repair`.
- **Guards / preconditions:** Return_line must be `condition='damaged'`; qty ≤ `inventory_remaining_qty`. `restock_as_damaged` and `send_for_repair` both require a non-null `p_warehouse_id` (the operator-chosen damaged-stock warehouse — NOT `so_po_returns.restock_warehouse_id`). For `send_for_repair` the warehouse is where the units will be sourced from during the follow-up vendor step.
- **Related flows:** [[Create Partial Replacement (customer + inventory atomic)]], [[Write Off Damaged Return (compat wrapper)]], [[Repair Vendor CRUD (auto-provisioned virtual warehouse)]]
- **Docs / plans:** [docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md](docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md)

### Write Off Damaged Return (compat wrapper)

- **Module:** Sales / Inventory
- **Status:** Dropped — Phase 8.2 (migration `20260731000100_drop_legacy_writeoff_wrapper.sql`).
- **Historic surface:** `rpc_write_off_return_damaged(p_return_id, p_warehouse_id)` RPC + `useWriteOffDamagedReturn` hook. Both removed 2026-07-29 after 8.1 grep confirmed zero live callers; work migrated to [[Record Inventory Disposition]] with per-line control.

### Repair Vendor CRUD (auto-provisioned virtual warehouse)

- **Module:** Warehouse
- **Status:** Active (DB shipped Phase 9.2 · 2026-07-30; UI in Phase 9.6)
- **Trigger surface(s):** `/warehouse/repair-vendors` page (Phase 9.6). Also invoked indirectly by the send-for-repair flow to look up vendors.
- **Primary hook(s):** `useRepairVendors`, `useCreateRepairVendor`, `useUpdateRepairVendor` (Phase 9.6).
- **RPC(s):** None — direct table inserts/updates on `repair_vendors`. Trigger `trg_repair_vendor_provision_warehouse` runs the derived side-effect.
- **Ledger writes:** `repair_vendors`; `warehouses` (via trigger — one virtual row per vendor).
- **Downstream side-effects:** On repair_vendors INSERT, `_repair_vendor_provision_warehouse()` (SECURITY DEFINER) creates a `warehouses` row named `Repair: <vendor>` with `is_virtual=true, repair_vendor_id=NEW.id, division_id=NULL` (conditional CHECK on `warehouses` — virtual warehouses are shared across divisions). Vendor's `virtual_warehouse_id` back-linked.
- **Dialog / component:** `RepairVendorFormDialog` (Phase 9.6).
- **Guards / preconditions:** `name` UNIQUE; SECURITY DEFINER trigger bypasses the caller's INSERT policy on `warehouses`.
- **Related flows:** [[Send Damaged for Repair]] (Phase 9.4), [[Return Damaged from Repair]] (Phase 9.5).
- **Docs / plans:** [docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md](docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md) — Sub-task 9.2.
- **Migrations:** `20260802000200_repair_vendors.sql`, `20260802000300_damaged_transfers.sql`, `20260802000350_warehouses_division_virtual_fix.sql`, `20260802000360_repair_vendor_trigger_security_definer.sql`.
- **Notes:** Repair vendors are deliberately NOT in `suppliers` — repair shops are not goods vendors. The virtual warehouse gives the send/return-from-repair transfer flow (Phase 9.4–9.5) a real `warehouse_id` target so damaged units can be tracked while off-site.

### Send Damaged for Repair

- **Module:** Warehouse / Sales
- **Status:** Active (DB shipped Phase 9.4 · 2026-07-30; SendForRepairDialog shipped Phase 9.6 · 2026-07-31; Pending Vendor Assignment list shipped Phase 9.7 · 2026-07-31)
- **Trigger surface(s):** (1) Pending Vendor Assignment amber section on `/warehouse/damaged-stock` Out-for-Repair tab (Phase 9.7) — lists every `return_line_inventory_dispositions` row where `disposition_type='send_for_repair' AND warehouse_transfer_id IS NULL`. Each row has an "Assign Vendor" button that opens `SendForRepairDialog` prefilled with warehouse + item context. (2) Direct invocation from `ReplacementDeliveryDialog` deferred to the pending list — the disposition saves without a vendor, operator picks it up from the overview page.
- **Primary hook(s):** `useSendDamagedForRepair` (Phase 9.6).
- **RPC(s):** `rpc_send_damaged_for_repair(p_return_line_disposition_id, p_repair_vendor_id, p_warehouse_id, p_expected_return_date, p_notes)`.
- **Ledger writes:** (a) If damaged stock at `(p_warehouse_id, brand_variant_id)` is short of `qty`: `inventory_damaged_stock_layers` (FIFO layer, cost via `_return_line_fifo_unit_cost`) + `inventory_damaged_stock` (weighted-avg upsert) + `inventory_damaged_movements(movement_type='restock_as_damaged_in')` — an implicit restock leg attributed to THIS disposition. (b) `warehouse_transfers(transfer_kind='damaged_repair_out', status='in_transit', repair_vendor_id, source_return_line_disposition_id, expected_return_date, from_warehouse_id=p_warehouse_id, to_warehouse_id=vendor.virtual_warehouse_id)`. (c) `warehouse_transfer_items` normalized row. (d) FIFO consume via `_consume_damaged_stock_fifo(p_warehouse_id, brand_variant_id, qty)` decrements layers + aggregate. (e) `inventory_damaged_movements(movement_type='send_for_repair_out')` linked to both the disposition and the transfer. (f) `return_line_inventory_dispositions.warehouse_transfer_id` UPDATE stamps the disposition-to-transfer link.
- **Downstream side-effects:** Damaged stock at source warehouse decreases; virtual repair-vendor warehouse now logically holds the units (though no aggregate row is written there — the transfer row is the record of location). Return status is unaffected here — closure was already decided by the disposition-creation step.
- **Dialog / component:** `SendForRepairDialog` (Phase 9.6).
- **Guards / preconditions:** Disposition must have `disposition_type='send_for_repair'` and `warehouse_transfer_id IS NULL` (never linked before). Vendor must exist and be `is_active`. Source warehouse must NOT be the vendor's virtual warehouse. FIFO consume raises if `inventory_damaged_stock_layers` cannot cover the qty (should never happen after the implicit-restock branch runs).
- **Related flows:** [[Record Inventory Disposition (post-restock)]] (creates the disposition row this RPC consumes), [[Repair Vendor CRUD (auto-provisioned virtual warehouse)]], [[Return Damaged from Repair]] (Phase 9.5).
- **Docs / plans:** [docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md](docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md) — Sub-task 9.4.
- **Migrations:** `20260802000500_rpc_send_for_repair.sql`, `20260802000660_fix_damaged_rpcs_user_data_lookup.sql` (auth.uid→user_data.id lookup), `20260802000700_damaged_transfers_division_id_backfill.sql` (Phase 9.7 — backfills existing rows + recreates the RPC so future INSERTs stamp `division_id` on the outbound transfer).
- **Notes:** Two-step UX by design — disposition + vendor choice are decoupled so an operator can record "these 3 units are going for repair" without knowing which vendor yet. The `return_line_inventory_dispositions_link_matches_type` CHECK was relaxed in 9.4 to allow `warehouse_transfer_id` NULL for `send_for_repair` (9.3's version required it NOT NULL, which blocked the two-step flow).

### Return Damaged from Repair

- **Module:** Warehouse / Sales
- **Status:** Active (DB shipped Phase 9.5 · 2026-07-30; UI shipped Phase 9.7 · 2026-07-31)
- **Trigger surface(s):** "Return from Repair" action button on rows in the Out-for-Repair section of `/warehouse/damaged-stock` (Phase 9.7). Opens `ReturnFromRepairDialog` for outcome + qty inputs.
- **Primary hook(s):** `useReturnFromRepair` (exported from `src/hooks/useDamagedStockOverview.ts`, Phase 9.7).
- **RPC(s):** `rpc_return_damaged_from_repair(p_transfer_id, p_outcome, p_qty_good, p_qty_writeoff, p_repair_cost, p_notes)`. `p_outcome ∈ {good, writeoff, mixed}` acts as a sanity check on the qty inputs — the RPC raises if the outcome doesn't match the qtys.
- **Ledger writes:** For `p_qty_good > 0`: (a) `fifo_cost_layers` fresh layer at source warehouse with `source_type='damaged_repair_return', source_id=<outbound transfer id>`, `unit_cost = original_unit_cost + (p_repair_cost / p_qty_good)` — repair cost amortized across good units only; (b) `inventory_item_brand_variants.stock_level += qty_good`; (c) `inventory_stock_movements(movement_type='damaged_return_from_repair_as_good')` — NEW enum value added by this migration; (d) `recalc_average_cost(variant_id)` weighted-avg recompute; (e) `warehouse_transfers` row (from=vendor virtual warehouse, to=source, `transfer_kind='damaged_repair_return_good'`, `status='received'`, `repair_cost=<p_repair_cost>`, `source_return_line_disposition_id` = same disposition as the outbound); (f) `warehouse_transfer_items` normalized child row. For `p_qty_writeoff > 0`: (a) `inventory_damaged_movements(movement_type='return_from_repair_as_writeoff')` linked to both disposition and outbound transfer — writeoff units use the ORIGINAL unit cost (no repair-cost inheritance; that spend is sunk); (b) `warehouse_transfers` row with `transfer_kind='damaged_repair_return_writeoff', status='received'` — no stock added, but the row exists so the Damaged Stock overview page's join logic doesn't have to special-case the "outcome had no good units" shape; (c) `warehouse_transfer_items` normalized child row with `received_qty=0`. Finally: outbound transfer UPDATE to `status='received', received_at=now(), received_by_profile_id=auth.uid(), repair_cost=<p_repair_cost>`.
- **Downstream side-effects:** Damaged stock at source warehouse is not affected by this RPC directly (the `send_for_repair_out` movement already decremented it in 9.4; good units return to `inventory_stock` not damaged stock). Good units are immediately available for normal sale. The vendor's virtual warehouse still doesn't hold any aggregate stock — the transfer rows are the record of location.
- **Dialog / component:** `ReturnFromRepairDialog` (Phase 9.7). Client-side validation must enforce `qty_good + qty_writeoff == transfer_qty`.
- **Guards / preconditions:** Outbound transfer must have `transfer_kind='damaged_repair_out'` and `status='in_transit'`. `qty_good + qty_writeoff` must equal the outbound transfer's qty (server-side). `p_repair_cost >= 0`. Outcome sanity: `good` requires qty_writeoff=0, `writeoff` requires qty_good=0, `mixed` requires both > 0.
- **Related flows:** [[Send Damaged for Repair]] (produces the outbound transfer this RPC consumes), [[Record Inventory Disposition (post-restock)]] (originates the disposition both transfers share).
- **Docs / plans:** [docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md](docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md) — Sub-task 9.5.
- **Migrations:** `20260802000600_rpc_return_from_repair.sql`, `20260802000610_fix_rpc_return_from_repair_items_column.sql` (column-name hotfix), `20260802000660_fix_damaged_rpcs_user_data_lookup.sql` (auth.uid→user_data.id lookup fix), `20260802000700_damaged_transfers_division_id_backfill.sql` (Phase 9.7 — recreates the RPC one more time to stamp `division_id` on the two inbound return transfers, closing the RLS leak from the 9.6 audit).
- **Notes:** Two intentional departures from the plan doc: (1) plan used `notes` JSON strings to link inbound transfers back to the outbound; this uses the existing `warehouse_transfers.source_return_line_disposition_id` column instead — the 9.2 CHECK permits it for the return kinds, and it's queryable via a normal join instead of text-JSON parsing. (2) Plan assumed a `_add_good_stock_layer` helper; that helper does not exist, so the good-stock addition is inlined using the receival/adjustment pattern (fifo_cost_layers + stock_level bump + stock movement + recalc_average_cost). New `stock_movement_type` enum value `damaged_return_from_repair_as_good` added by this migration.

### Warehouse Sub-Container Auto-Provision (planned)

- **Module:** Warehouse / Inventory
- **Status:** Planned — Phase A + B + C.1 + C.2 (a/b/c/d/e/f — full RPC sweep + NOT NULL flip) shipped 2026-07-31. Phase C.3 (RLS policies) + D (UI) + E (drop legacy) pending.
- **Trigger surface(s):** Every write path that lands stock in a warehouse (receival, transfer receive, sale return restock, damaged-side dispositions). All resolved through the shared helper `public._find_or_create_sub_container(warehouse_id, division_id)` from Phase C.
- **Primary hook(s):** N/A (Phase A schema only; hooks appear in Phase D).
- **RPC(s):** `_find_or_create_sub_container(uuid, uuid)` (Phase C). No public RPCs in Phase A.
- **Ledger writes:** N/A in Phase A. From Phase C: every stock row acquires `sub_container_id`; `warehouses.company_id` becomes NOT NULL.
- **Downstream side-effects:** N/A in Phase A. From Phase C: RLS policy `is_sub_container_visible(sub_container_id)` gates all stock-table reads on top of the existing `is_division_visible()` policies.
- **Dialog / component:** N/A in Phase A (UI arrives in Phase D — nested sub-container editor under Master Data → Warehouses).
- **Guards / preconditions:** N/A in Phase A. From Phase B: every warehouse must have a default sub-container per hosted division before Phase C flips FK columns NOT NULL.
- **Related flows:** [[Division Switcher]] (JWT active_division_id claim narrows sub-container visibility via `is_division_visible()`), all Phase 9 damaged-side flows (they'll pick up sub-container resolution during Phase C's RPC sweep).
- **Docs / plans:** [docs/warehouse-model-v2-design.md](docs/warehouse-model-v2-design.md); Phase A plan `docs/superpowers/plans/2026-07-31-warehouse-model-v2-phase-a.md`.
- **Migrations:** Phase A → `20260803000100`; Phase B → `20260803000200`; Phase C.1 → `20260803000300` + `_000400` (NOT NULL revert); Phase C.2 → `20260803000500` (C.2.a helper + triggers) + `_000600` (C.2.b receival + return-restock) + `_000700` (C.2.c transfer lifecycle) + `_000800` (C.2.d adjustments + deduct_fifo) + `_000900` (C.2.e damaged-side) + `_001000` (C.2.f re-flip NOT NULL). Phases C.3 / D / E → TBD.
- **Notes:** Warehouses were previously tied to exactly one division via `warehouses.division_id`. This flow's design lets a single physical warehouse host multiple divisions' stock through per-division sub-containers, with RLS granting cross-division visibility only to `warehouse_responsible_persons`. Strict isolation: a warehouse with no sub-container visible to the caller does not render for that caller.

---

## Cross-flow patterns

- **Ledger closure:** `_maybe_close_return(return_id)` is called at the end of every customer-ledger and inventory-ledger write. Do not duplicate closure logic in the UI.
- **Recorders vs actions:** `_record_customer_resolution` / `_record_inventory_disposition` are internal (`service_role` only). Never call from client code — always go through a public action wrapper.
- **RPC transactionality:** Every action wrapper is atomic — either every ledger write in the call succeeds or the whole transaction rolls back. Do not chain multiple wrappers client-side when one wrapper already covers the multi-write case (see [[Create Partial Replacement (customer + inventory atomic)]] vs the retired "delivery + then write-off" split).
- **Backward-compat window:** During Phase 7 the bridge trigger `trg_bridge_legacy_resolution_to_dual_ledger` mirrored any legacy `return_line_resolutions` insert into the new tables. Dropped in Phase 8.3 (migration `20260731000200_drop_bridge_trigger.sql`) — the bridge had been inert since 7.2 landed. The legacy table + its recorder `rpc_record_return_line_resolution` were dropped in Phase 8.5 (migration `20260731000400_drop_legacy_resolutions.sql`).

---

## Purchase Orders

Compact rows (5 fields: **Trigger** · **Hook** · **RPC(s)** · **Writes / side-effect** · **Notes**). Expand to the full template when a flow is next materially changed.

### Create Purchase Order (draft or RFQ)
- **Trigger:** `/purchase/create-po`
- **Hook:** [`useCreatePO`](src/hooks/usePurchaseOrders.ts)
- **RPC(s):** none — direct table inserts
- **Writes:** `purchase_orders`, `po_line_items`, seeds `po_rfq_quotes` when `po_type='rfq'`; `savePoSnapshot` + PO activity log
- **Notes:** Draft or RFQ starting state. Confirmed state comes from [[Submit PO for Approval]].

### Update / Amend Purchase Order
- **Trigger:** `/purchase/edit-po/[id]`
- **Hook:** [`useUpdatePO`](src/hooks/usePurchaseOrders.ts)
- **Writes:** replaces `po_line_items`, recomputes totals + approval level, saves versioned snapshot
- **Related:** [[Request PO Edit (post-approval amendment)]]

### Soft-delete Purchase Order
- **Trigger:** PO list actions
- **Hook:** [`useSoftDeletePO`](src/hooks/usePurchaseOrders.ts)
- **Writes:** flips `purchase_orders.deleted_at`

### Submit PO for Approval
- **Trigger:** `PoDetailDialog` → Submit
- **Hook:** [`useSubmitPOForApproval`](src/hooks/usePurchaseOrders.ts)
- **Writes:** `po_approvals` chain, PO status→`pending_approval`, `po_type→'confirmed'`, snapshot `po-v1`, `notifications` fan-out

### Approve / Reject / Force-approve PO Step
- **Trigger:** `/purchase/approvals` + `PoDetailDialog` review
- **Hooks:** [`useApproveStep`, `useForceApproveStep`, `useForceApproveAllSteps`, `useRejectPO`](src/hooks/usePOApprovals.ts)
- **RPC:** `po_approval_action`
- **Writes:** advances `po_approvals`, flips PO status to `approved` / `rejected`, snapshots

### Cancel Purchase Order
- **Trigger:** `PoDetailDialog`
- **Hook:** [`useCancelPO`](src/hooks/usePurchaseOrders.ts)
- **Writes:** status→`cancelled`, snapshot

### Record Supplier Payment (PO)
- **Trigger:** `PoPaymentDialog`
- **Hook:** [`useCreatePOPayment`](src/hooks/usePurchaseOrders.ts)
- **RPC:** `refresh_po_status`
- **Writes:** `payments` (SPAY-… outgoing); overpayment guard
- **Notes:** When the PO is in a foreign currency, `trg_payments_compute_fx`
  (BEFORE INSERT/UPDATE) populates `payments.exchange_gain`/`exchange_loss`
  by comparing `payment.amount × po.initial_exchange_rate` (booked) vs
  `payment.amount × payment.exchange_rate` (paid). AFTER trigger
  `trg_payments_refresh_document_fx` rolls the totals up to
  `purchase_orders.exchange_gain`/`exchange_loss` via `rpc_recompute_document_fx`.
  QAR-only PO/payment combinations bypass the compute (stays 0). See
  [[Change Booked Exchange Rate (PO)]].

### Change Booked Exchange Rate (PO)
- **Trigger:** `PoDetailDialog` → Exchange tab → BookedRateLockRow Edit button;
  also `/purchase/edit-po/[id]` → BookedRateLockRow
- **Hook:** [`useChangeDocumentBookedRate`](src/hooks/useChangeDocumentBookedRate.ts)
- **RPC:** `rpc_update_document_initial_rate('po', po_id, new_rate, reason)`
- **Writes:** `purchase_orders.initial_exchange_rate` + `.exchange_rate`
  (kept in lockstep), `.initial_rate_captured_at`, `.initial_rate_captured_by`
  (resolved from `auth.uid()` → `user_data.id`); appends `exchange_rate_change_log`
  row (audit); then calls `rpc_recompute_document_fx` which refreshes every
  linked payment's FX and the PO rollup.
- **Guards:** `p_new_rate > 0`, `char_length(trim(p_reason)) >= 5`,
  `auth.uid()` not null, `user_data` row exists for the caller.
- **Dialog:** [`ChangeBookedRateDialog`](src/components/shared/ChangeBookedRateDialog.tsx)
- **Related:** [[Record Supplier Payment (PO)]]

### Save RFQ Quote
- **Trigger:** RFQ tab in `PoDetailDialog`
- **Hook:** [`useSaveQuote`](src/hooks/useRfqQuotes.ts)
- **Writes:** `po_rfq_quote_items`, flips `po_rfq_quotes.status→received`

### Award RFQ Quote
- **Trigger:** RFQ tab in `PoDetailDialog`
- **Hook:** [`useAwardQuote`](src/hooks/useRfqQuotes.ts)
- **Writes:** copies quoted prices onto `po_line_items`, recomputes PO totals, sets supplier, `po_type→'draft'`, marks winning quote awarded and rejects the rest

### Delete / Submit PO Version
- **Trigger:** `PoDetailDialog` versions panel
- **Hooks:** [`useDeletePoVersion`, `useSubmitPoVersion`](src/hooks/usePurchaseOrders.ts)
- **Writes:** manages `po_snapshots`; submit promotes a chosen snapshot

### Request PO Edit (post-approval amendment)
- **Trigger:** `RequestEditDialog`
- **Hook:** [`useCreateEditRequest`](src/hooks/usePoEditRequests.ts)
- **Writes:** `po_edit_requests`
- **Related:** [[Review PO Edit Request]], [[Mark PO Edit Request Used]]

### Review PO Edit Request
- **Trigger:** approver panel
- **Hook:** [`useReviewEditRequest`](src/hooks/usePoEditRequests.ts)
- **Writes:** approves / rejects the `po_edit_requests` row

### Mark PO Edit Request Used
- **Trigger:** post-receival apply
- **Hook:** [`useMarkEditRequestUsed`](src/hooks/usePoEditRequests.ts)
- **Writes:** flips edit-request status once the linked receival lands

---

## PO Shipments

### Create Shipment
- **Trigger:** `PoShipmentDialog`
- **Hook:** [`useCreateShipment`](src/hooks/useShipments.ts)
- **Writes:** `shipments`

### Update Shipment Status
- **Trigger:** `PoShipmentDialog`
- **Hook:** [`useUpdateShipmentStatus`](src/hooks/useShipments.ts)

### Add Shipment Event
- **Trigger:** dialog + 17track webhook ([src/app/api/webhooks/17track/route.ts](src/app/api/webhooks/17track/route.ts), [src/app/api/shipments/register-tracking/route.ts](src/app/api/shipments/register-tracking/route.ts))
- **Hook:** [`useAddShipmentEvent`](src/hooks/useShipments.ts)
- **RPC:** `append_shipment_events`

### Archive Shipment
- **Trigger:** `PoShipmentDialog`
- **Hook:** [`useArchiveShipment`](src/hooks/useShipments.ts)

---

## Supplier Bills

### Create Supplier Bill
- **Trigger:** `BillFormDialog` / `CreateBillFromPODialog`
- **Hook:** [`useCreateBill`](src/hooks/useSupplierBills.ts)
- **Writes:** `supplier_bills` + `supplier_bill_lines`, links to PO / receival

### Attach Payment to Bill
- **Trigger:** `AttachBillDialog`
- **Hook:** [`useAttachPaymentToBill`](src/hooks/useAttachPaymentToBill.ts)
- **RPC:** `allocate_payment_to_bill`

---

## Inventory Receivals (PO receiving)

### Create & Approve Receival
- **Trigger:** `ReceivalFormDialog`
- **Hook:** [`useCreateReceival`](src/hooks/useReceivals.ts)
- **RPC:** `create_and_approve_receival`
- **Writes:** `receivals` + `receival_items`, books `inventory_stock_movements` and FIFO layers
- **Notes:** For foreign-currency POs, `fifo_cost_layers.unit_cost` and
  `inventory_stock_movements.unit_cost` are converted to QAR at receival time
  using `po.initial_exchange_rate` (source of truth). `receival_items.unit_cost`
  stays in the PO's currency (audit of what the operator entered).
  `fifo_cost_layers.source_currency` + `.source_exchange_rate` are stamped for
  audit. QAR POs unchanged (rate=1, no conversion). Going-forward only —
  historical FIFO layers are NOT backfilled. See migration
  `20260729214710_fx_receival_qar_conversion.sql`.

### Request Receival Edit
- **Trigger:** `ReceivalDetailDialog`
- **Hook:** [`useRequestReceivalEdit`](src/hooks/useReceivals.ts)
- **Writes:** `receival_edit_requests`

### Approve Receival Edit
- **Trigger:** approver flow
- **Hook:** [`useApproveReceivalEdit`](src/hooks/useReceivals.ts)
- **RPC:** `apply_receival_edit`
- **Writes:** adjusts stock deltas + FIFO layers

### Save Receival Edit (self-serve)
- **Hook:** [`useSaveReceivalEdit`](src/hooks/useReceivals.ts)

### Create Replacement Receival
- **Trigger:** `ReplacementReceivalDialog`
- **Hook:** [`useCreateReplacementReceival`](src/hooks/useReceivals.ts)
- **RPC:** `create_and_approve_receival`
- **Writes:** inbound replacement units against a PO return
- **Related:** [[Resolve Debit Note as Replacement]]

---

## Landed Costs

### Create Landed Cost
- **Trigger:** `/purchase/landed-costs`
- **Hook:** [`useCreateLandedCost`](src/hooks/useLandedCosts.ts)
- **RPC:** `create_landed_cost`
- **Writes:** `landed_costs` header

### Apply / Allocate Landed Cost
- **Hook:** [`useApplyLandedCost`](src/hooks/useLandedCosts.ts)
- **RPC:** `allocate_landed_cost`
- **Writes:** allocates cost across receival lines, adjusts FIFO layer cost

### Revert Landed Cost
- **Hook:** [`useRevertLandedCost`](src/hooks/useLandedCosts.ts)
- **RPC:** `revert_landed_cost`
- **Writes:** un-allocates and reverses FIFO cost changes

### Void Landed Cost
- **Hook:** [`useVoidLandedCost`](src/hooks/useLandedCosts.ts)

---

## Inventory Receivals (standalone / carve-out)

### Create Standalone Inventory Receival
- **Trigger:** `InventoryReceivalDialog`
- **Hook:** [`useCreateInventoryReceival`](src/hooks/useInventoryReceivals.ts)
- **Writes:** `inventory_receivals`, seeds FIFO layers, books `inventory_stock_movements`
- **Notes:** Carve-out / no-PO new stock. `source_type='inventory_import'` seed data uses this same path.

---

## Purchase Returns

### Create Purchase Return
- **Trigger:** `POReturnDetailDialog` / returns list
- **Hook:** [`useCreatePurchaseReturn`](src/hooks/usePurchaseReturns.ts)
- **Writes:** `so_po_returns` + `return_lines` for supplier-bound goods

### Dispatch PO Return
- **Trigger:** `POReturnDetailDialog`
- **Hook:** [`useUpdatePOReturnStatus`](src/hooks/usePurchaseReturns.ts) (dispatch branch)
- **RPC:** `rpc_process_po_return_dispatch`
- **Writes:** deducts FIFO layers by-layer, writes `sale_return` / dispatch movement rows

### Cancel PO Return Dispatch
- **Hook:** [`useUpdatePOReturnStatus`](src/hooks/usePurchaseReturns.ts) (cancel branch)
- **RPC:** `rpc_cancel_po_return_dispatch`
- **Writes:** reverses the dispatch

### Issue Debit Note for PO Return
- **Hook:** [`useCreateDebitNoteForReturn`](src/hooks/usePurchaseReturns.ts)
- **Writes:** `debit_notes` + `debit_note_lines`

### Resolve Debit Note as Supplier Credit
- **Trigger:** `CreditDebitNoteDetailDialog`
- **Hook:** [`useResolveDebitNoteSupplierCredit`](src/hooks/useCreditNotes.ts)
- **Writes:** `debit_notes.resolution_type='supplier_credit'` AND `status='resolved'`. Manual transition — DN has no per-line supplier resolution ledger yet (dual-ledger deferred to Phase 9); until then, status flips together with resolution_type on the resolve action.

### Resolve Debit Note as Replacement
- **Trigger:** `CreditDebitNoteDetailDialog`
- **Hook:** [`useResolveDebitNoteReplacement`](src/hooks/useCreditNotes.ts)
- **Writes:** `debit_notes.resolution_type='replacement'` AND `status='resolved'`. Same manual-transition pattern as [[Resolve Debit Note as Supplier Credit]].
- **Related:** [[Create Replacement Receival]]

---

## Warehouse Transfers

### Create Warehouse Transfer
- **Trigger:** `WhTransferDialog`
- **Hook:** [`useCreateTransfer`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `create_transfer_v2`
- **Writes:** `warehouse_transfers` + items, reserves source stock

### Dispatch Warehouse Transfer (issue)
- **Hook:** [`useDispatchTransfer`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `dispatch_transfer`
- **Writes:** deducts source-warehouse stock, books outgoing FIFO consumption, transfer→in-transit

### Receive Warehouse Transfer
- **Hook:** [`useReceiveTransfer`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `receive_transfer`
- **Writes:** books incoming FIFO layers at destination, handles shrinkage

### Cancel Warehouse Transfer
- **Hook:** [`useCancelTransfer`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `cancel_transfer`

### Reject Warehouse Transfer
- **Hook:** [`useRejectTransfer`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `reject_transfer_v2`

---

## Stock Adjustments

### Create Stock Adjustment
- **Trigger:** `WhAdjustmentDialog`
- **Hook:** [`useCreateStockAdjustmentV2`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `create_stock_adjustment_v2`
- **Writes:** `stock_adjustments` header + approval chain, `notifications` fan-out
- **Notes:** Types: increase / decrease / damage / write-off.

### Approve / Reject Stock Adjustment Step
- **Trigger:** `WhAdjustmentDetailDialog`
- **Hook:** [`useActionStockAdjustmentStep`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `action_stock_adjustment_step`
- **Writes:** on final approval books `inventory_stock_movements` and updates stock

### Force-approve Stock Adjustment
- **Hook:** [`useForceApproveStockAdjustment`](src/hooks/useWarehouseOperations.ts)

### Allocate Warehouse Stock (initial per-variant setup)
- **Trigger:** [`BrandVariantEditDialog`](src/components/services/inventory/BrandVariantEditDialog.tsx)
- **RPC:** `allocate_warehouse_stock`
- **Writes:** seeds `inventory_stock` for a new variant at a warehouse

---

## Inventory Checks (physical count)

### Start Inventory Check
- **Trigger:** `WhInventoryCheckStartDialog`
- **Hook:** [`useStartInventoryCheck`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `generate_check_number`
- **Writes:** `inventory_checks` + `inventory_check_assignments` + `inventory_check_items`

### Save Item Count
- **Trigger:** check screen
- **RPC:** `save_inventory_check_item_count`

### Complete Inventory Check Assignment
- **Hook:** [`useCompleteAssignment`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `build_inv_check_approval_chain`
- **Writes:** closes assignment; when all done builds approval chain, snapshots, `notifications` fan-out

### Approve / Reject Inventory Check Step
- **Hook:** [`useApproveCheckStep`](src/hooks/useWarehouseOperations.ts)
- **RPC:** `snapshot_inventory_check_system_qty` (on reject), `apply_inventory_check_adjustments` (on final approve)
- **Writes:** books variance stock movements

---

## Sale Orders

### Create Customer
- **Trigger:** `CustomerDialog`
- **Hook:** [`useCreateCustomer`](src/hooks/useSaleOrders.ts)
- **RPC:** `save_customer_phones`
- **Writes:** `customers` + phones, links to `credit_groups`

### Update Customer
- **Hook:** [`useUpdateCustomer`](src/hooks/useSaleOrders.ts)
- **RPC:** `save_customer_phones` (phone sync)

### Toggle Customer Active
- **Hook:** [`useToggleCustomerActive`](src/hooks/useSaleOrders.ts)

### Create Sale Order (quotation / SO)
- **Trigger:** `/sales/create-so`
- **Hook:** [`useCreateSO`](src/hooks/useSaleOrders.ts)
- **RPC:** `create_sale_order`, `batch_update_reserved_qty`
- **Writes:** `sale_orders` + `sale_order_lines`, reserves stock

### Update / Amend Sale Order
- **Trigger:** `/sales/edit-so/[id]`
- **Hook:** [`useUpdateSO`](src/hooks/useSaleOrders.ts)
- **Writes:** recomputes reservations against previous lines

### Confirm Sale Order
- **Trigger:** `SoDetailDialog`
- **Hook:** [`useConfirmSO`](src/hooks/useSaleOrders.ts)
- **Writes:** status→`confirmed`, adjusts reservations

### Cancel Sale Order
- **Trigger:** `SoDetailDialog`
- **Hook:** [`useCancelSO`](src/hooks/useSaleOrders.ts)
- **RPC:** `batch_update_reserved_qty`
- **Writes:** releases reservations

### Approve / Reject / Force-approve Sale Order
- **Trigger:** `SalesApprovalDetailDialog`
- **Hooks:** [`useApproveSO`](src/hooks/useSaleOrders.ts) and [`useSalesApprovals`](src/hooks/useSalesApprovals.ts)
- **RPC:** `approve_sales_request`, `force_approve_sales_request`, `reject_sales_request`
- **Notes:** Out-of-limit / credit-hold approvals.

### Resubmit Sale Order (after rejection)
- **Hook:** [`useResubmitSaleOrder`](src/hooks/useSaleOrders.ts)
- **RPC:** `resubmit_sale_order`

---

## Sales Deliveries

### Create Delivery (from SO)
- **Trigger:** `SoDeliveryDialog`
- **Hook:** [`useCreateDelivery`](src/hooks/useSaleOrders.ts)
- **RPC:** `create_and_confirm_delivery`, `next_delivery_number`
- **Writes:** `sale_deliveries` + lines, books stock movements
- **Related:** [[Create Partial Replacement (customer + inventory atomic)]] uses a separate delivery path.

### Update Delivery (draft edit)
- **Trigger:** `DeliveryFormDialog`
- **Hook:** [`useUpdateDelivery`](src/hooks/useSaleDeliveries.ts)

### Complete Delivery (confirm & book stock)
- **Trigger:** `DeliveryDetailDialog`
- **Hook:** [`useCompleteDelivery`](src/hooks/useSaleDeliveries.ts)
- **RPC:** `complete_delivery_inventory`
- **Writes:** deducts FIFO layers, allocates delivery number, status→`completed`

### Cancel Delivery
- **Trigger:** `DeliveryDetailDialog`
- **Hook:** [`useCancelDelivery`](src/hooks/useSaleDeliveries.ts)
- **RPC:** `cancel_delivery_inventory`
- **Writes:** restores stock, flips status

---

## Customer Invoices / AR

### Generate Invoice from SO
- **Trigger:** `CustomerInvoiceDetailDialog`
- **Hook:** [`useGenerateInvoice`](src/hooks/useCustomerInvoices.ts)
- **RPC:** `generate_invoice_from_so`
- **Writes:** `so_invoices` + lines

### Void Invoice
- **Trigger:** `VoidInvoiceDialog`
- **Hook:** [`useVoidInvoice`](src/hooks/useInvoices.ts)
- **Writes:** `so_invoices.status→'void'`

### Issue Credit Note against Invoice
- **Trigger:** `CreditNoteDialog` / `CreditNoteFormDialog`
- **Hooks:** [`useIssueCreditNote`](src/hooks/useInvoices.ts), [`useCreateCreditNote`](src/hooks/useCreditNotes.ts)
- **Writes:** `credit_notes` + `credit_note_lines`
- **Notes:** Distinct from [[Issue Credit Note for Sales Return]] — this is invoice-scoped, not return-scoped.

### Apply Credit Note to Invoice
- **Trigger:** `CreditDebitNoteDetailDialog`
- **Hook:** [`useApplyCreditNote`](src/hooks/useCreditNotes.ts)
- **Writes:** CPAY store-credit payment, updates invoice `payment_status`. Does NOT touch `credit_notes.status` (Phase 8.1b) — balance depletion is derived from the payments ledger vs the store-credit resolution rows, not from a status flag. `status` is owned by the return-resolution lifecycle only.

### Bulk QuickBooks Sync Invoices
- **Hook:** [`useBulkQbSyncInvoices`](src/hooks/useInvoices.ts)
- **Notes:** External sync — QB idempotency keys tracked on the invoice row.

---

## Payments

### Record Customer Payment
- **Trigger:** `CustomerPaymentDialog` / `PaymentFormDialog`
- **Hook:** [`useCreateCustomerPayment`](src/hooks/useCustomerPayments.ts)
- **Writes:** CPAY payment, recomputes `so_invoices.payment_status`
- **Notes:** When the source SO is in a foreign currency, `trg_payments_compute_fx`
  populates `payments.exchange_gain`/`exchange_loss` at insert (sign flipped
  vs supplier payments — customer gain = we received more QAR than booked).
  Rolled up to `sale_orders.exchange_gain`/`exchange_loss` via
  `rpc_recompute_document_fx`. See [[Change Booked Exchange Rate (SO)]].

### Change Booked Exchange Rate (SO)
- **Trigger:** `SoDetailDialog` → Exchange tab → BookedRateLockRow Edit button;
  also `/sales/edit-so/[id]` → BookedRateLockRow
- **Hook:** [`useChangeDocumentBookedRate`](src/hooks/useChangeDocumentBookedRate.ts)
- **RPC:** `rpc_update_document_initial_rate('so', so_id, new_rate, reason)`
- **Writes:** `sale_orders.initial_exchange_rate` + `.exchange_rate` (in lockstep),
  `.initial_rate_captured_at`, `.initial_rate_captured_by`; appends
  `exchange_rate_change_log` row; triggers `rpc_recompute_document_fx` to
  refresh linked payments' FX + SO rollup.
- **Guards:** same as PO variant — `p_new_rate > 0`, `reason ≥ 5 chars`, authenticated.
- **Dialog:** [`ChangeBookedRateDialog`](src/components/shared/ChangeBookedRateDialog.tsx)
- **Related:** [[Record Customer Payment]], [[Change Booked Exchange Rate (PO)]]

### Apply Store Credit (FIFO across CNs)
- **Trigger:** `CreditBalanceDialog`
- **Hook:** [`useApplyStoreCredit`](src/hooks/useCustomerPayments.ts)
- **Writes:** one CPAY per CN consumed, method=`store_credit`

### Attach Payment to Invoice
- **Trigger:** `AttachInvoiceDialog` / `SelectInvoiceDialog`
- **Hook:** [`useAttachPaymentToInvoice`](src/hooks/useAttachPaymentToInvoice.ts)
- **RPC:** `attach_payment_to_invoice`

### Detach Payment from Invoice
- **Hook:** [`useDetachPaymentFromInvoice`](src/hooks/useDetachPaymentFromInvoice.ts)
- **RPC:** `detach_payment_from_invoice`

### Create Payment Plan (installments)
- **Trigger:** `PaymentPlanDialog` (finance + purchase)
- **Hook:** [`useCreatePaymentPlan`](src/hooks/usePaymentPlans.ts)
- **Writes:** `payment_plans` + `payment_installments`

### Settle Installment
- **Trigger:** `PaymentPlanDialog`
- **Hook:** [`useSettleInstallment`](src/hooks/usePaymentPlans.ts)
- **Writes:** `payments`, installment status, closes plan when all paid

---

## Credit Groups (customer credit-limit approvals)

### Submit Credit Group Change
- **Trigger:** `CreditGroupPendingDialog`
- **Hook:** [`useSubmitCreditGroupChange`](src/hooks/useCreditGroupApprovals.ts)
- **RPC:** `submit_credit_group_change`

### Approve / Reject / Force-approve Credit Group Change
- **Hooks:** [`useApproveCreditGroupChange`, `useRejectCreditGroupChange`, `useForceApproveCreditGroupChange`](src/hooks/useCreditGroupApprovals.ts)
- **RPCs:** `approve_credit_group_change`, `reject_credit_group_change`, `force_approve_credit_group_change`

### Cancel Credit Group Change
- **Hook:** [`useCancelCreditGroupChange`](src/hooks/useCreditGroupApprovals.ts)

### Create / Update / Delete Credit Group
- **Hooks:** [`useCreateCreditGroup`, `useUpdateCreditGroup`, `useDeleteCreditGroup`](src/hooks/useCreditGroups.ts)
- **Notes:** Cascades to customer credit-limit resnaps — non-trivial CRUD.

---

## Master data with status transitions or ledger side-effects

### Archive Inventory Item / Brand Variant / Category
- **Triggers:** `ItemEditDialog`, `BrandVariantEditDialog`, `CategoryEditDialog`
- **Hooks:** [`useArchiveInventoryItem`, `useArchiveInventoryBrandVariant`, `useArchiveInventoryCategory`](src/hooks/useInventory.ts)
- **Notes:** Guards against archiving while reservations / stock exist.

### Batch Update Selling Prices
- **Trigger:** `BrandVariantEditDialog` price grid
- **Hook:** [`useBatchUpdateSellingPrices`](src/hooks/useInventory.ts)
- **RPC:** `batch_update_variant_prices`

### Create User (auth + profile + roles)
- **Trigger:** `AddUserDialog`
- **Hook:** [`useCreateUser`](src/hooks/useProfiles.ts) → `/api/users/create`
- **RPC:** `replace_user_custom_roles_v2`
- **Writes:** provisions auth user, profile, division scopes

### Update User / Roles
- **Trigger:** `EditUserDialog`
- **Hook:** [`useUpdateUser`](src/hooks/useProfiles.ts) → `/api/users/[id]`
- **RPC:** `replace_user_custom_roles_v2`

### Assign / Remove Division on Profile
- **Hooks:** [`useAssignDivision`, `useRemoveDivision`](src/hooks/useProfiles.ts)

### Assign / Remove Role
- **Trigger:** `UserRoleDialog`
- **Hooks:** [`useAssignRole`, `useRemoveRole`](src/hooks/useRoles.ts)

### Rename Payment Method (cascading)
- **Trigger:** [`PaymentMethodsAdmin`](src/components/master-data/PaymentMethodsAdmin.tsx)
- **RPC:** `rename_payment_method`
- **Writes:** cascades to historical `payments` rows

### Replace Warehouse Responsible Persons
- **Trigger:** warehouse admin
- **Hook:** [`useWarehouseResponsiblePersons`](src/hooks/useWarehouseResponsiblePersons.ts)
- **RPC:** `replace_warehouse_responsible_persons`

---

## Workflow / Approval configuration

### Add / Update / Archive Workflow Step
- **Hooks:** [`useAddWorkflowStep`, `useAddWorkflowStepForRole`, `useUpdateWorkflowStepRole`, `useUpdateWorkflowStepConditions`, `useArchiveWorkflowStep`](src/hooks/useWorkflowSteps.ts)
- **RPCs:** `add_workflow_step`, `toggle_workflow_step`, `add_workflow_step_for_role`, `update_workflow_step_role`, `update_workflow_step_conditions`, `archive_workflow_step`

### Create / Update / Delete Workflow Group
- **Hooks:** [`useCreateWorkflowGroup`, `useUpdateWorkflowGroup`, `useDeleteWorkflowGroup`](src/hooks/useWorkflowGroups.ts)

### Archive Approval Chain
- **Hook:** [`useArchiveApprovalChain`](src/hooks/useApprovalChains.ts)
- **Notes:** Guards against archiving chains that back active approvals.

---

## Notifications

### Mark Notification Read / Actioned / Bulk-Actioned
- **Trigger:** bell menu
- **Hooks:** [`useMarkNotificationRead`, `useMarkNotificationActioned`, `useMarkAllNotificationsActioned`](src/hooks/useNotifications.ts)

---

## Registered placeholders — not yet implemented in code

These modules are called out in project plans / seed docs but have no material flow surface yet. Do NOT delete — fill in as the code lands.

- **Contact Centre** — Wati inbound handling, 3CX call log, task creation, priority queue. Only `src/types/wati.ts` types + `docs/wati-*.md` / `docs/whapi-*.md` reference material exist; no hooks or dialogs. See `project_contact_centre` memory.
- **Quotations / Contracts** — no dedicated quotation entity yet. Quotations are represented as an SO stage and drive off [[Create Sale Order (quotation / SO)]] → [[Confirm Sale Order]]. `OrderQuotationSettingsAdmin` only edits master-data numbering.
- **Calendar / Teams / Contracts (Phase 2 backlog)** — see `project_future_modules` memory.
