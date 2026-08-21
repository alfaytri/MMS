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

### Repair Vendor CRUD (sub-container of shared Repair warehouse)

- **Module:** Warehouse
- **Status:** Active (DB shipped Phase 9.2 · 2026-07-30; UI in Phase 9.6; consolidated onto one shared Repair warehouse Phase D.6.b · 2026-08-01)
- **Trigger surface(s):** `RepairVendorFormDialog` opened from Damaged Stock → Repair Vendors dropdown. Also invoked indirectly by the send-for-repair flow to look up vendors.
- **Primary hook(s):** `useRepairVendors`, `useCreateRepairVendor`, `useUpdateRepairVendor` (Phase 9.6).
- **RPC(s):** None — direct table inserts/updates on `repair_vendors`. BEFORE-INSERT trigger `trg_repair_vendor_provision_warehouse` stamps derived columns on the incoming row.
- **Ledger writes:** `repair_vendors`; `warehouse_sub_containers` (via trigger — one sub-container per vendor under the single shared `Repair` warehouse).
- **Downstream side-effects:** **Post-D.6.b:** on `repair_vendors` INSERT, `_repair_vendor_provision_warehouse()` (SECURITY DEFINER, BEFORE INSERT) locates the single shared `Repair` warehouse (`is_virtual=true, division_id=NULL`), inserts a `warehouse_sub_containers` row named after the vendor, and stamps `NEW.virtual_warehouse_id = <shared repair id>` + `NEW.sub_container_id = <new sub id>` before the row is written (both NOT NULL satisfied at row-write time). **Pre-D.6.b (historic):** the trigger was AFTER INSERT and created one whole `warehouses` row per vendor (`Repair: <name>`, `is_virtual=true`). Phase D.6.b consolidation renamed the old per-vendor warehouses to `[archived] Repair: <name>` on 2026-08-01; the D.6.b cleanup migration (`20260801400000`) retired them entirely on 2026-08-01 by repointing historical transfers to the shared warehouse + vendor sub-container via the `repair_vendor_id` bridge, then deleting the archived rows.
- **Dialog / component:** `RepairVendorFormDialog` (Phase 9.6).
- **Guards / preconditions:** `name` UNIQUE; `sub_container_id NOT NULL` (D.6.b Task 1); SECURITY DEFINER trigger bypasses the caller's INSERT policy on `warehouse_sub_containers`.
- **Related flows:** [[Send Damaged for Repair]] (Phase 9.4 + D.6.b), [[Return Damaged from Repair]] (Phase 9.5 + D.6.b).
- **Docs / plans:** [docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md](docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md) — Sub-task 9.2; [docs/superpowers/plans/2026-08-01-warehouse-model-v2-phases-d6-d11.md](docs/superpowers/plans/2026-08-01-warehouse-model-v2-phases-d6-d11.md) — Phase D.6.b + cleanup.
- **Migrations:** `20260802000200_repair_vendors.sql`, `20260802000300_damaged_transfers.sql`, `20260802000350_warehouses_division_virtual_fix.sql`, `20260802000360_repair_vendor_trigger_security_definer.sql`, `20260801300000_warehouse_model_v2_phase_d6b_repair_consolidation.sql` (D.6.b consolidation), `20260801300100_warehouse_model_v2_phase_d6b_repair_rpcs.sql` (RPCs rewritten to read vendor's new sub_container_id), `20260801400000_warehouse_model_v2_phase_d6b_cleanup_retire_archived_repair_warehouses.sql` (D.6.b cleanup — dropped the archived per-vendor warehouses).
- **Notes:** Repair vendors are deliberately NOT in `suppliers` — repair shops are not goods vendors. Post-D.6.b, all vendors' units-in-repair are recorded under one shared Repair warehouse; the vendor is identified by the sub-container column on transfers + damaged-stock rows rather than by a distinct warehouse row.

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
- **Notes:** Two intentional departures from the plan doc: (1) plan used `notes` JSON strings to link inbound transfers back to the outbound; this uses the existing `warehouse_transfers.source_return_line_disposition_id` column instead — the 9.2 CHECK permits it for the return kinds, and it's queryable via a normal join instead of text-JSON parsing. (2) Plan assumed a `_add_good_stock_layer` helper; that helper does not exist, so the good-stock addition is inlined using the receival/adjustment pattern (fifo_cost_layers + stock_level bump + stock movement + recalc_average_cost). New `stock_movement_type` enum value `damaged_return_from_repair_as_good` added by this migration. **⚠ Cost-stripped (Phase 2 rework, 2026-08-18, migration `20260923000300`, staging):** `rpc_return_damaged_from_repair` no longer amortizes `p_repair_cost` into returned good units (they come back at their **original** unit cost) and stamps `repair_cost=0` on the transfers — repair is never charged. `p_repair_cost` kept accepted-but-ignored for one release; the Repair Cost field removed from [`ReturnFromRepairDialog`](src/components/warehouse/ReturnFromRepairDialog.tsx).

### Custody & Consumption (unified custody warehouse model · 2026-08-12)

- **Module:** Warehouse / Consumption
- **Status:** Active (Virtual Warehouses redesign · 2026-08-12). Supersedes the split Teams/Places model.
- **Trigger surface(s):** Custody page (`/warehouse/custody`) — one tab per custody warehouse; Master Data → Admin → Custody Locations (CRUD); New Consumption dialog; Add/Edit Warehouse **Type** field (Stock / Custody / Repair).
- **Primary hook(s):** `useCustodyLocations` / `useCustodyWarehouses` / `useCreateCustodyLocation` / `useUpdateCustodyLocation` (replaced `useTeamSubContainers` + `usePlaceSubContainers`); `useCreateConsumption` / `useConsumerLabel` (`useConsumption.ts`).
- **RPC(s):** `get_custody_master_list(p_warehouse_id?)` (replaced `get_teams_master_list` + `get_places_master_list`), `rpc_upsert_warehouse_sub_container` (replaced `rpc_upsert_team_or_place`), `rpc_create_custody_assign`, `rpc_create_custody_return`, `rpc_post_consumption(…, p_consumer_sub_container_id, …)` (dropped the team/place params), `generate_consumption_number` (CE-Custody / CE-Internal), `rpc_cancel_consumption`.
- **Ledger writes:** custody assign/return → `warehouse_transfers` (kind `custody_assign` / `custody_return`) + items + FIFO on return; consumption → `consumption_entries` + `consumption_lines` + `cogs_entries` (`consumer_sub_container_id`) + `inventory_stock_movements`.
- **Data model:** `warehouses.warehouse_kind ∈ {general, repair, custody}` (operator-picked Type; custody/repair are virtual). `teams`+`places` collapsed to `custody`; the ex-`Places` warehouse renamed **Projects**. `consumer_type ∈ {custody, internal}`; the two consumer FK columns merged into `consumer_sub_container_id` (consumption_entries + cogs_entries).
- **Guards / preconditions:** custody RPCs enforce responsible-person + division + `inventory_manager` / `is_system_admin` (server-side, unchanged). Per-warehouse `custody.<id>.view` / `.edit` permission keys gate **UI visibility only** (client-side) — not a server boundary.
- **Related flows:** [[Repair Vendor CRUD (sub-container of shared Repair warehouse)]], [[Dispatch Warehouse Transfer (issue)]].
- **Migrations:** `20260820000100`–`20260820000400` (kind + Places→Projects rename, consumer_type + column merge, custody RPC rewrites, permission-grant remap).
- **Notes:** Repair uses the SAME warehouse+sub-container backbone (vendors = sub-containers of the one shared Repair warehouse), so no repair mechanics changed. Retired: `useTeamSubContainers`, `usePlaceSubContainers`, `TeamPlaceFormDialog`, `get_teams/places_master_list`, `rpc_upsert_team_or_place`, `/master-data/admin/{teams,places}`.

### Custody → Custody Transfer (hand-out · 2026-08-19)

- **Module:** Warehouse (Custody)
- **Status:** Active — staging 2026-08-19 (pending operator smoke → new-prod).
- **Trigger surface(s):** Custody page (`/warehouse/custody`) → a location card's **Transfer** action — shown only where the card's custody warehouse is flagged `can_transfer_custody`, the caller is the location RP (or holds `custody.<wh>.edit/manage`), and the card has stock. The source flag is toggled on the warehouse in Master Data → Warehouses ("Can hand out stock to other custody locations", custody type only).
- **Primary hook(s):** `useCreateCustodyTransfer` ([useCustodyMoves.ts](src/hooks/useCustodyMoves.ts)); the accept side reuses `useAcceptCustodyAssign` + [`AcceptCustodyDialog`](src/components/warehouse/custody/AcceptCustodyDialog.tsx); the pending banner reuses `usePendingCustodyAssigns` (now also carries `from_warehouse_kind`).
- **RPC(s):** `rpc_create_custody_transfer(p_source_sub_container_id, p_dest_sub_container_id, p_items, p_notes, p_created_by_profile_id, p_created_by_name)` — SECURITY DEFINER, `revoke … from public` + `grant execute … to authenticated, service_role`. Accept reuses `rpc_accept_custody_assign` **unchanged** (it is source-agnostic — restocks `to_sub`, reconciles shortfall against `from_sub`).
- **Ledger writes:** creates a `warehouse_transfers` row (`transfer_kind='custody_assign'`, `status='in_transit'`, dispatch stamps set) + items; deducts source FIFO now and books `transfer_out` movements (identical to `rpc_dispatch_custody_assign`). On accept: dest FIFO layer + `transfer_in`; shortfall → `transfer_shrinkage` (writeoff) or a re-created source layer (restock).
- **Data model:** `warehouses.can_transfer_custody boolean not null default false` — per-custody-warehouse capability. A custody→custody move stays distinguishable from a warehouse→team assign because BOTH `from_sub_container_id` and `to_sub_container_id` sit under custody warehouses.
- **Guards / preconditions:** source = active custody sub whose warehouse has `can_transfer_custody=true`; dest = a DIFFERENT active custody sub WITH a responsible person; **dest division must be one the caller is assigned to** — `is_division_member(dest.division_id)` (owner/accountant see all), enforced server-side AND mirrored in the dialog's destination filter (`useUserDivisionScope`); caller = source-sub RP or `_has_custody_admin_role`. Table CHECK `check_different_location` allows same-warehouse moves (Team 1 → Team 2) as long as the sub differs.
- **Dialog / component:** [`CustodyTransferDialog`](src/components/warehouse/custody/CustodyTransferDialog.tsx) — source fixed to the card; side-by-side destination warehouse→location selects (destinations scoped to the caller's divisions); item picker from source-sub stock. The destination card surfaces it in the pending banner as In transit → **Accept**.
- **Related flows:** [[Custody & Consumption (unified custody warehouse model · 2026-08-12)]] (assign/return siblings + the reused accept path), [[Create Warehouse Transfer]] (the generic engine — deliberately NOT used here so the move stays on the Custody card).
- **Migrations:** `20260925000000_warehouse_can_transfer_custody.sql`, `20260925000100_rpc_create_custody_transfer.sql`, `20260925000200_custody_transfer_division_guard.sql` (dest-division scope via `is_division_member`).
- **Notes:** 2-step by design (send → accept). The source RP is also the dispatcher, so there is no separate dispatch stage — the transfer is created directly at `in_transit`. Teams warehouses stay `can_transfer_custody=false`, so teams can RECEIVE but never initiate a hand-out.

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
- **RPC(s):** `rpc_create_purchase_order(p_payload jsonb)` (SECURITY DEFINER)
- **Writes:** `purchase_orders`, `po_line_items` (incl. per-line `division_id`), seeds `po_rfq_quotes` when `po_type='rfq'`; `savePoSnapshot` + PO activity log
- **Multi-division:** each line carries its own `division_id` (falls back to the header division); `purchase_orders.division_ids uuid[]` is the distinct set, kept current by the `po_recompute_division_ids` trigger on `po_line_items`. Access is enforced per line via `is_division_member` (membership, NOT the active-division-narrowed `is_division_visible`). Visibility is array-aware RLS: `is_any_division_visible(division_ids)` (see migrations `20260824000000`–`000300`).
- **Notes:** Draft or RFQ starting state. Confirmed state comes from [[Submit PO for Approval]]. Approval routing is amount-tier based, division-agnostic. Per-division financial reporting/receiving-routing is Phase 2.

### Update / Amend Purchase Order
- **Trigger:** `/purchase/edit-po/[id]`
- **Hook:** [`useUpdatePO`](src/hooks/usePurchaseOrders.ts)
- **RPC(s):** `rpc_replace_po_lines(p_po_id, p_lines)` — atomic line replace (guards on existing receival/RFQ rows)
- **Writes:** replaces `po_line_items` (carries per-line `division_id`, falls back to the PO header division; enforces `is_division_member`), recomputes totals + approval level, saves versioned snapshot; the trigger recomputes `purchase_orders.division_ids`
- **Related:** [[Request PO Edit (post-approval amendment)]], [[Create Purchase Order (draft or RFQ)]]

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

### Edit Customer Payment
- **Module:** sales / payments
- **Status:** Active
- **Trigger surface(s):** `InvoiceDetail` payment rows (pencil icon per row); `SoDetailDialog` Payments tab (pencil icon per row via `PaymentSummaryTab.onEditPayment`)
- **Primary hook(s):** [`useEditCustomerPayment`](src/hooks/useCustomerPayments.ts)
- **RPC(s):** `rpc_edit_customer_payment(uuid, numeric, text, date, text, text, numeric)` — SECURITY DEFINER; enforces `sales.payments.manage`; refuses `credit_note_id IS NOT NULL` (store-credit redemptions must flow through `rpc_redeem_credit_note`)
- **Writes:** `payments` (amount/amount_qar/method/date/reference/notes/exchange_rate/updated_at)
- **Guards:** payment must be `direction='incoming'`, not soft-deleted, and not a CN redemption
- **Downstream side-effects:** `invoice_recompute_paid_trg` fires on payment UPDATE → `so_invoices.paid_amount` + `payment_status` recomputed; `sale_order_paid_summary` view auto-refreshes; installment-linked payments get `paid_amount` shifted by the delta, status recomputed, plan re-derived; activity log entry `Payment Edited` (severity warning, `module='sale_orders'` when linked to an SO, `module='invoices'` otherwise)
- **Dialog/component:** [`CustomerPaymentEditDialog`](src/components/sales/CustomerPaymentEditDialog.tsx)
- **Related flows:** [[Delete Customer Payment]], [[Detach Payment From Invoice]], [[Edit Supplier Payment]]

### Delete Customer Payment
- **Module:** sales / payments
- **Status:** Active
- **Trigger surface(s):** `InvoiceDetail` payment rows (trash icon per row); `SoDetailDialog` Payments tab (trash icon per row via `PaymentSummaryTab.onDeletePayment`)
- **Primary hook(s):** [`useDeleteCustomerPayment`](src/hooks/useCustomerPayments.ts)
- **RPC(s):** `rpc_delete_customer_payment(uuid)` — SECURITY DEFINER; enforces `sales.payments.manage`; idempotent; refuses CN redemptions
- **Writes:** `payments.deleted_at = now()`
- **Guards:** payment must be `direction='incoming'`, not a CN redemption
- **Downstream side-effects:** `invoice_recompute_paid_trg` fires → `so_invoices` balance restored; installment link cleared, `paid_amount` restored, plan un-completed if the reversed row was the last one holding it complete; activity log entry `Payment Deleted` with amount
- **Dialog/component:** Inline `AlertDialog` confirmation in `InvoiceDetail` and `SoDetailDialog`
- **Related flows:** [[Edit Customer Payment]], [[Detach Payment From Invoice]], [[Delete Supplier Payment]]

### Edit Supplier Payment
- **Module:** purchase / payments
- **Status:** Active
- **Trigger surface(s):** `PoDetailDialog` Payments tab (pencil icon per row); `/purchase/bills/[id]` Payments popover (pencil icon per row)
- **Primary hook(s):** [`useEditSupplierPayment`](src/hooks/useSupplierPayments.ts)
- **RPC(s):** `rpc_edit_supplier_payment(uuid, numeric, text, date, text, text, numeric)` — SECURITY DEFINER; enforces `purchase.payments.manage`; refuses payments with more than one `payment_bill_allocations` row
- **Writes:** `payments` (amount/amount_qar/method/date/reference/notes/exchange_rate/updated_at); mirrors single-allocation row to keep bill balance in sync
- **Guards:** payment must be `direction='outgoing'`, not soft-deleted, and single-allocated at most
- **Downstream side-effects:** `bill_recompute_paid_trg` fires on payment UPDATE → bill's paid_amount + payment_status recomputed automatically; installment-linked payments (via `payment_installments.payment_id`) get their `paid_amount` shifted by the delta, status recomputed, and plan active/completed re-derived (migration 20260817010000); activity log entry `Payment Edited` (PO activity when opened from PO, `module='bills'` otherwise)
- **Dialog/component:** [`SupplierPaymentEditDialog`](src/components/purchase/SupplierPaymentEditDialog.tsx)
- **Related flows:** [[Delete Supplier Payment]], [[Record Supplier Payment (PO)]], [[Attach Payment to Bill]]

### Delete Supplier Payment
- **Module:** purchase / payments
- **Status:** Active
- **Trigger surface(s):** `PoDetailDialog` Payments tab (trash icon per row); `/purchase/bills/[id]` Payments popover (trash icon per row)
- **Primary hook(s):** [`useDeleteSupplierPayment`](src/hooks/useSupplierPayments.ts)
- **RPC(s):** `rpc_delete_supplier_payment(uuid)` — SECURITY DEFINER; enforces `purchase.payments.manage`; idempotent (no-op on already-deleted)
- **Writes:** `payments.deleted_at = now()`, deletes single-allocation row from `payment_bill_allocations`
- **Guards:** payment must be `direction='outgoing'`; refuses multi-allocated payments (must detach first)
- **Downstream side-effects:** `bill_recompute_paid_trg` fires on payment UPDATE (deleted_at set) → bill balance restored to reflect the reversal; installment-linked payments are reversed — `paid_amount` reduced, `payment_id` cleared, installment status recomputed, plan un-completed if needed (migration 20260817010000); activity log entry `Payment Deleted` with amount
- **Dialog/component:** Inline `AlertDialog` confirmation in `PoDetailDialog` and `BillPaymentsList`
- **Related flows:** [[Edit Supplier Payment]], [[Record Supplier Payment (PO)]]

### Attach Supplier Invoice Files to Bill
- **Module:** purchase / bills
- **Status:** Active
- **Trigger surface(s):** `CreateBillFromPODialog`, `BillFormDialog` (upload-on-selection); `BillDetailDocument` (view / download / delete)
- **Primary hook(s):** [`useBillAttachments`](src/hooks/useSupplierBills.ts), [`useDeleteBillAttachment`](src/hooks/useSupplierBills.ts), [`persistBillAttachments`](src/hooks/useSupplierBills.ts), [`getBillAttachmentSignedUrl`](src/hooks/useSupplierBills.ts)
- **RPC(s):** none — direct storage upload + `INSERT INTO bill_attachments`
- **Storage:** `bill-attachments` bucket (private, 5 MB / file, PDF/JPG/PNG/WEBP)
- **Writes:** `bill_attachments` (bill_id, storage_key, file_name, mime_type, size_bytes, uploaded_by)
- **Guards:** RLS — SELECT via parent-bill existence; INSERT/UPDATE/DELETE gated on `purchase.bills.manage`
- **Cancel sweep:** dialog Cancel removes uploaded storage objects (best-effort, mirrors [[Create Landed Cost]] `lc-bills` pattern)
- **Related flows:** [[Create Supplier Bill]]

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
- **Guards:** a receival may be attached to **multiple** LCs (e.g. one for shipping, one for customs) — each stacks its own cost onto the FIFO layers on apply. The dialog shows a non-blocking `LC: …` badge on receivals that already carry one (informational, via `useLcUsedReceivalMap`). A non-blocking amber note warns when the selected receivals span more than one PO currency (the LC splits by QAR-converted value — the warn flags an accidental wrong-receival pick; consolidated multi-currency invoices are valid). The per-LC "apply once" lock still holds — see [[Apply / Allocate Landed Cost]].

### Apply / Allocate Landed Cost
- **Hook:** [`useApplyLandedCost`](src/hooks/useLandedCosts.ts)
- **RPC:** `allocate_landed_cost`
- **Writes:** allocates cost across receival lines, adjusts FIFO layer cost
- **Currency:** `receival_items.unit_cost` is in the PO's original currency; the RPC converts each item to QAR (`× COALESCE(purchase_orders.initial_exchange_rate, 1)`, joined via `receivals.po_id`) before computing the value-share base **and** the `original_unit_cost`/`updated_unit_cost` audit columns — so allocation is correct across mixed-currency LCs and the audit columns are coherent QAR (migration `20260816100000`, built on the live `20260815004600` body). The Apply-preview mirrors this via `useReceivalItemsBatch.unit_cost_qar`. (Coordinated with `20260910000000`, which reproduces this QAR block verbatim + adds COGS `division_id`/`source_id` P&L stamping.)

### Revert Landed Cost
- **Hook:** [`useRevertLandedCost`](src/hooks/useLandedCosts.ts)
- **RPC:** `revert_landed_cost`
- **Writes:** un-allocates and reverses FIFO cost changes

### Void Landed Cost
- **Hook:** [`useVoidLandedCost`](src/hooks/useLandedCosts.ts)

---

## Inventory Receivals (standalone / carve-out)

### Create Standalone Inventory Receival
- **Trigger:** `InventoryReceivalDialog`, opened **per origin leaf** from `OriginVariantRow` (the box-plus action on a brand→origin row in the catalog tree). Legacy opener `BrandVariantRow` is dead code (0 JSX callers — delete-later).
- **Hook:** [`useCreateInventoryReceival`](src/hooks/useInventoryReceivals.ts)
- **RPC:** `create_inventory_receival(p_mode, p_warehouse_id, p_brand_variant_id, p_qty, p_unit_cost, p_source_layer_id, p_date, p_notes, p_sub_container_id)`
- **Writes:** `inventory_receivals`, seeds FIFO layers, books `inventory_stock_movements`
- **Notes:** Carve-out / no-PO new stock. `source_type='inventory_import'` seed data uses this same path. **Origin-aware (brands+origin feature, 2026-08-08):** the dialog takes `brandVariantId` as a prop = the exact `(item, brand, origin)` leaf clicked in the tree; the hook forwards it as `p_brand_variant_id` and FIFO layers key off `brand_variant_id`, so new stock + cost layers land only on that origin leaf — sibling-origin leaves of the same brand are untouched. There is **no in-dialog item/brand/origin picker by design** — the row you click IS the target (cleaner than a picker; can't select the wrong leaf). Verified 2026-08-08 (received into brand `LD`→India; the `LD`→Nepal leaf stayed 0 with no cost layers).
- **Related flows:** [[Create / Edit Brand-Origin Variant]]

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

### Picture Transfer — Send (create pending)
- **Status:** ✅ SHIPPED TO PROD 2026-08-17 (v2 merge `489d565a`; sub-container-RP + full-names follow-up merge `c74f35d3`). Coexists with the classic flow.
- **Module:** Warehouse (picture-first front-end over the SAME engine; classic `WhTransferDialog` untouched).
- **Trigger surface(s):** `/warehouse/picture-transfer` (route [`page.tsx`](src/app/(dashboard)/warehouse/picture-transfer/page.tsx)) → SEND → [`PictureSendFlow`](src/components/warehouse/picture-transfer/PictureSendFlow.tsx) (Find → Where → Confirm). Nav entry gated by `warehouse.transfer.simple` ([`nav-config.ts`](src/components/layout/nav-config.ts)).
- **Primary hook(s):** [`useCreateTransfer`](src/hooks/useWarehouseOperations.ts); source from [`useMyTransferSources`](src/hooks/useMyTransferSources.ts) (warehouse-RP ∪ sub-container-RP) + `useWarehouseSubContainers`; ⭐ strip from [`useOftenMovedVariants`](src/hooks/useOftenMovedVariants.ts); destination from `useCustodyLocations`.
- **RPC(s):** `create_transfer_v2` (reused; requires `warehouse.transfer.create`) + reads `get_my_transfer_sources()` (warehouse-RP ∪ sub-container-RP), `get_often_moved_variants(uuid,int)` (SECURITY DEFINER, RP-guarded, `revoke … from public`). (`get_my_responsible_warehouses()` was the v2 source RPC — now superseded, orphaned in DB.)
- **Ledger writes:** `warehouse_transfers` + items, reserves source stock (`status='pending'`). Dispatch stays on the classic surface.
- **Guards:** `warehouse.transfer.simple` (route/nav) + `warehouse.transfer.create` (RPC) + must be a Warehouse RP **or sub-container RP** of the source (source derivation via `get_my_transfer_sources`). Destination = custody locations only.
- **Dialog/component:** `PictureTransferHome`, `PictureItemFind`, `PictureWhere`, `PictureConfirm`, `PicturePhoto`, `QtyStepper`.
- **Related flows:** [[Create Warehouse Transfer]] (same RPC, classic UI), [[Dispatch Warehouse Transfer (issue)]] (downstream), [[Picture Transfer — Receive]].
- **Docs/plans:** [design.md](docs/superpowers/specs/2026-08-17-picture-transfer/design.md) + [plan.md](docs/plans/2026-08-17-picture-transfer/plan.md). Migrations `20260916000000`, `20260916000100`, `20260916000200` (sub-container-RP sources).

### Picture Transfer — Receive
- **Status:** ✅ SHIPPED TO PROD 2026-08-17 (merges `489d565a` + `c74f35d3`).
- **Module:** Warehouse (picture-first Receive; reuses the classic `receive_transfer`).
- **Trigger surface(s):** `/warehouse/picture-transfer` → RECEIVE → [`PictureReceive`](src/components/warehouse/picture-transfer/PictureReceive.tsx). Shows `in_transit` transfers whose `to_warehouse_id` is one of the worker's RP warehouses.
- **Primary hook(s):** [`useReceiveTransfer`](src/hooks/useWarehouseOperations.ts), `useWarehouseTransfers({status:'in_transit'})`, [`useVariantImages`](src/hooks/useVariantImages.ts) (photos for transfer items).
- **RPC(s):** `receive_transfer` (reused; requires `warehouse.transfer.receive` + (`is_field_rp_of(dest warehouse)` **OR** `is_sub_container_rp(dest sub)` — a contained OR-branch spliced in via migration `20260916000300`, drift-guarded; dispatch/consumption `is_field_rp_of` callers untouched)).
- **Ledger writes:** books incoming FIFO layers at destination; "I got fewer" drives the existing shrinkage path.
- **Guards:** `warehouse.transfer.simple` (route) + `warehouse.transfer.receive` + Warehouse RP of the destination **warehouse OR sub-container RP of the destination sub-container**.
- **Related flows:** [[Receive Warehouse Transfer]] (same RPC, classic UI), [[Picture Transfer — Send (create pending)]].

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
- **Status:** Deprecated — trigger removed in the brands+origin redesign (2026-08-08). `BrandVariantEditDialog` no longer carries a warehouse-allocation block; a repo grep shows **zero app callers** of `allocate_warehouse_stock` (RPC + `database.types.ts` entry remain in the DB). Drop the RPC in a future inventory cleanup.
- **Historic trigger:** `BrandVariantEditDialog` (pre-redesign)
- **RPC:** `allocate_warehouse_stock`
- **Writes:** seeded `inventory_stock` for a new variant at a warehouse

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

### Cancel Inventory Check
- **Trigger:** `WhInventoryCheckDetail` footer — initiator or manager only, while `draft` / `in_progress` / `pending_approval`
- **Hook:** [`useCancelInventoryCheck`](src/hooks/useWarehouseOperations.ts)
- **Writes:** `inventory_checks.status`→`cancelled` (guarded, row read-back); `inventory_check_log` `cancelled` event (optional reason in `meta`). No stock movements — a cancel just abandons the count.
- **Guards:** `approved` / `rejected` / `cancelled` cannot be cancelled; race-safe `.in('status', CANCELLABLE)` + affected-row check
- **DB:** `20260819250000` (adds `cancelled` to `inventory_check_event_type` enum), `20260819260000` (adds `cancelled` to `inventory_checks_status_check`)
- **Related flows:** [[Start Inventory Check]]

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
- **Triggers:** `ItemEditDialog`, `BrandVariantEditDialog`, `CategoryEditDialog`; category is also archived from row actions (`CategoryRow`, `ToolCategoryRow`).
- **Hooks:** [`useArchiveInventoryItem`, `useArchiveInventoryBrandVariant`, `useArchiveInventoryCategory`](src/hooks/useInventory.ts)
- **RPC(s):** Category archive routes through `rpc_archive_inventory_category(p_category_id uuid)` (brands+origin feature, 2026-08-08; migration `20260819030000_inventory_rls_permissions.sql`) — gated by RLS `inventory.catalog.manage`. Item / brand-variant archive are direct status updates.
- **Notes:** Guards against archiving while reservations / stock exist.
- **Related flows:** [[Reorder Inventory Catalog Tree]], [[Create / Edit Brand-Origin Variant]]

### Create / Edit Brand-Origin Variant

- **Module:** Master Data · Inventory
- **Status:** Active — brands+origin feature (2026-08-08)
- **Trigger surface(s):** Catalog tree at `/master-data/inventory`: item-level **+ Add brand** (`ItemRow`), brand-level **+ Add origin** (`BrandGroupRow`), and the **edit (pencil)** on an origin leaf (`OriginVariantRow`). Brand chosen via searchable [`BrandCombobox`](src/components/services/inventory/BrandCombobox.tsx) (A–Z, inline "Add new brand"); origin via [`OriginCombobox`](src/components/services/inventory/OriginCombobox.tsx) (country list). The same hooks also back `BrandVariantFormDialog` (master-data) and the PO buying picker's inline **+ Add brand / variant** (`CascadeNewVariantForm` in `CascadeInlineForms`) — as of the origin-aware PO picker (Phase 1, 2026-08-09) the inline form uses the same searchable `BrandCombobox`+`OriginCombobox` and creates leaves carrying `brand_id`+`country_id` (was free-text brand). The PO cascade popover + breadcrumb also now display each leaf's origin via [`variantPickerLabel`](src/lib/inventory/variantPickerLabel.ts).
- **Primary hook(s):** [`useCreateBrandVariant`, `useUpdateBrandVariant`](src/hooks/useInventory.ts)
- **RPC(s):** none — direct INSERT/UPDATE on `inventory_item_brand_variants` carrying `brand_id` (uuid) + `country_id` (int). No `margin_percent` column (it does not exist).
- **Ledger writes:** `inventory_item_brand_variants` only (master-data table). BEFORE-trigger `trg_sync_brand_variants_brand_text` syncs the denormalized `brand` text from `brands.name` when `brand_id` is set; the dialog writes `brand=''` when clearing brand and OMITS `brand` when editing a legacy null-brand leaf (preserves legacy text).
- **Downstream side-effects:** invalidates the bare `queryKeys.inventory.brandVariantsV2` prefix (reload-bug fix) plus related stock/items keys. The tree groups rows via [`groupVariants`](src/lib/inventory/groupVariants.ts) → BrandGroup → origin rows (Unbranded + null-origin sort last).
- **Dialog / component:** [`BrandVariantEditDialog`](src/components/services/inventory/BrandVariantEditDialog.tsx) — 3 modes via a `fixedBrand?: {id, name}` prop (add-origin / add-brand / edit); warehouse-allocation block removed (see Deprecated [[Allocate Warehouse Stock (initial per-variant setup)]]).
- **Guards / preconditions:** RLS `inv_var_*` policies gate INSERT/UPDATE/DELETE on `inventory.catalog.manage`. Cost/selling price UPDATEs additionally gated by `inventory_pricing_guard_trg` → `inventory.pricing.manage` (BEFORE UPDATE only; an INSERT can set price with just catalog.manage). Unique index on `(item_id, brand_id, country_id)` — a duplicate leaf raises 23505, surfaced as a friendly "this brand + origin already exists" toast.
- **Related flows:** [[Create Standalone Inventory Receival]] (receives stock into these leaves), [[Reorder Inventory Catalog Tree]], [[Archive Inventory Item / Brand Variant / Category]]
- **Docs / plans:** [docs/plans/2026-08-08-inventory-brands-origin.md](plans/2026-08-08-inventory-brands-origin.md); spec [docs/specs/2026-08-08-inventory-brands-origin-design.md](specs/2026-08-08-inventory-brands-origin-design.md); origin-aware PO picker Phase 1 [docs/inventory-origin-po-so-pickers/phase-1-po-picker-plan.md](inventory-origin-po-so-pickers/phase-1-po-picker-plan.md)
- **Migrations:** `20260819000000_inventory_origin_and_integrity.sql` (origin column + integrity + case-dup brand dedup), `20260819010000_backfill_brands_from_text.sql` (legacy brand text → `brand_id`), `20260819020000_inventory_variant_unique_swap.sql` (unique-index swap to `(item_id, brand_id, country_id)`), `20260819030000_inventory_rls_permissions.sql` (RLS + 4 permission keys + pricing guard + archive/sort RPCs). All mirrored to `supabase/migrations-staging/`; applied to STAGING only.

### Reorder Inventory Catalog Tree

- **Module:** Master Data · Inventory
- **Status:** Active — brands+origin feature (2026-08-08)
- **Trigger surface(s):** Up/Down arrows on catalog rows — categories (`CategoryRow`, `ToolCategoryRow`, `ItemsListView`, `ToolsAssetsView`), items (`CategoryRow`), and origin leaves within a brand (`BrandGroupRow`).
- **Primary hook(s):** [`useUpdateSortOrders(table)`](src/hooks/useInventory.ts) — `table ∈ {inventory_categories, inventory_items, inventory_item_brand_variants}`.
- **RPC(s):** `rpc_update_inventory_sort_orders(p_updates jsonb)` — jsonb array of `{table_name, id, sort_order}`; whitelists the three tables (an unknown `table_name` is silently ignored — minor, noted for review).
- **Ledger writes:** `sort_order` column on the targeted table only.
- **Downstream side-effects:** invalidates the relevant list query keys so the tree re-sorts.
- **Guards / preconditions:** RLS `inventory.catalog.manage` on each targeted table.
- **Related flows:** [[Create / Edit Brand-Origin Variant]], [[Archive Inventory Item / Brand Variant / Category]]
- **Docs / plans:** [docs/plans/2026-08-08-inventory-brands-origin.md](plans/2026-08-08-inventory-brands-origin.md)

### Batch Update Selling Prices
- **Status:** Deprecated — the multi-row price grid was removed in the brands+origin redesign (2026-08-08). Single cost/selling price is now edited per origin leaf in `BrandVariantEditDialog` (direct UPDATE, gated by `inventory_pricing_guard_trg` → `inventory.pricing.manage`). A repo grep shows **zero callers** of `useBatchUpdateSellingPrices`; the hook + `batch_update_variant_prices` RPC remain but are dead. Drop in a future cleanup.
- **Historic trigger:** `BrandVariantEditDialog` price grid (pre-redesign)
- **Hook:** [`useBatchUpdateSellingPrices`](src/hooks/useInventory.ts)
- **RPC:** `batch_update_variant_prices`

### Manage Category Attribute Definitions & Options

- **Module:** Master Data · Inventory · Attributes
- **Status:** Active
- **Trigger surface(s):** `/master-data/inventory` → any category row → Tags icon → `CategoryAttributesDialog`.
- **Primary hook(s):** [`useUpsertAttributeDefinition`, `useDeleteAttributeDefinition`, `useUpsertAttributeOption`, `useDeleteAttributeOption`](src/hooks/useAttributes.ts)
- **RPC(s):** none — direct upserts against `inventory_attribute_definitions` + `inventory_attribute_options`. Read helpers via `get_effective_attributes(p_category_id)` RPC (walks category + ancestors, `is_inherited` flag).
- **Ledger writes:** none. Master-data tables only.
- **Downstream side-effects:** invalidates `queryKeys.attributes.definitionsForCategory` + `effectiveForCategory` + `optionsForDefinition` + `attributes.all`. Attributes defined on a parent inherit down to descendants.
- **Dialog / component:** [`CategoryAttributesDialog`](src/components/master-data/attributes/CategoryAttributesDialog.tsx) → [`AttributesTab`](src/components/master-data/attributes/AttributesTab.tsx) → [`AttributeFormDialog`](src/components/master-data/attributes/AttributeFormDialog.tsx) + [`AttributeOptionsEditor`](src/components/master-data/attributes/AttributeOptionsEditor.tsx).
- **Guards / preconditions:** `master_data.inventory.attributes.view` (list) / `.create` / `.edit`. Branch-uniqueness trigger enforces one `attribute_key` per top-level tree (depth cap 10). Option delete uses `ON DELETE RESTRICT` on `inventory_item_attributes.option_id` — archive-instead surfaced as toast.
- **Related flows:** [[Set Item Attribute Values]], [[Filter Inventory by Attribute Chips]]
- **Docs / plans:** [docs/plans/2026-08-04-category-attributes-plan.md](docs/plans/2026-08-04-category-attributes-plan.md) §Phase 2.
- **Notes:** Migrations `20260804120000` (definitions + branch-uniqueness trigger), `_120100` (options), `_120300` (`get_effective_attributes`). Trigger fix in `_123000` (alias-out-of-scope + depth=1 ancestor exclusion).

### Set Item Attribute Values

- **Module:** Master Data · Inventory
- **Status:** Active
- **Trigger surface(s):** `/master-data/inventory` → any leaf item → Edit → `ItemEditDialog` → "Attributes" section.
- **Primary hook(s):** [`useItemAttributes`, `useUpsertItemAttributes`](src/hooks/useAttributes.ts)
- **RPC(s):** none — plain upsert/delete on `inventory_item_attributes` keyed by `(item_id, definition_id)`.
- **Ledger writes:** none. `inventory_item_attributes` rows only.
- **Downstream side-effects:** invalidates `queryKeys.attributes.itemValues(itemId)` + `attributes.all`. Read-only [`AttributeChipStrip`](src/components/shared/AttributeChipStrip.tsx) rows under `ItemRow` refresh via the batched options loader.
- **Dialog / component:** [`ItemAttributesSection`](src/components/master-data/attributes/ItemAttributesSection.tsx), rendered inside [`ItemEditDialog`](src/components/services/inventory/ItemEditDialog.tsx).
- **Guards / preconditions:** `master_data.inventory.attributes.edit` (or `.create` on new items). Race-guard: propagation to parent form only after `useItemAttributes.isSuccess` — a mid-fetch Save no longer wipes existing rows.
- **Related flows:** [[Manage Category Attribute Definitions & Options]], [[Filter Inventory by Attribute Chips]]
- **Docs / plans:** [docs/plans/2026-08-04-category-attributes-plan.md](docs/plans/2026-08-04-category-attributes-plan.md) §Phase 3.
- **Notes:** Semantics = FULL desired state; `option_id: null` deletes the row. Options retained after archive so historically-picked values still display via `(archived)` suffix.

### Filter Inventory by Attribute Chips

- **Module:** Master Data · Inventory
- **Status:** Active
- **Trigger surface(s):** `/master-data/inventory` → expand any category with effective attributes → dropdown chip row appears (`TON: Any ▾`, `REFRIGERANT: Any ▾`, …).
- **Primary hook(s):** [`useEffectiveAttributes`, `useAttributeOptionsBatch`, `useItemAttributesByCategory`, `useItemAttributesByCategories`](src/hooks/useAttributes.ts), [`useInventoryItemsByCategories`](src/hooks/useInventory.ts). Filter state is local per `CategoryRow` React state (not persisted).
- **RPC(s):** `get_effective_attributes(p_category_id)` — walks category + ancestors so a definition on "AC Unit" surfaces at every AC descendant.
- **Ledger writes:** none — read-side filter only.
- **Downstream side-effects:** cascades to descendant `CategoryRow`s via `inheritedAttributeFilter` prop; descendants merge (own picks win on the same definition_id). Empty subtree branches pruned via `attributeVisibleCategoryIds` computed in the row that owns the filter picks.
- **Dialog / component:** [`AttributeFilterBar`](src/components/shared/AttributeFilterBar.tsx) — dropdown chip with checkbox popover + `X` clear at end. Rendered inline under each expanded [`CategoryRow`](src/components/services/inventory/CategoryRow.tsx).
- **Guards / preconditions:** none — read-only filter, respects RLS on `inventory_items` + `inventory_item_attributes`. Match semantics = STRICT: item passes if for every attribute with picks, its `option_id` is in the picked set (OR within attribute, AND across attributes). Untagged items excluded when any filter active.
- **Related flows:** [[Set Item Attribute Values]], [[Manage Category Attribute Definitions & Options]]
- **Docs / plans:** [docs/plans/2026-08-04-category-attributes-plan.md](docs/plans/2026-08-04-category-attributes-plan.md) §Phase 4/5 (integration reshaped 2026-08-04 from a per-line guided picker to a per-category inline dropdown filter).
- **Notes:** Deliberately NOT wired into SO / Consumption / Quotations line pickers — filtering adds value only in the tree browser where you cross many descendants at once. Guided picker + `ProductAttributePicker` component removed in same session.

### Assign Item to Divisions

- **Module:** Master Data · Inventory
- **Status:** Active (shipped 2026-08-15, `feature/item-division-assignment` — replaces the retired `inventory_items.shared_with_division_ids` sharing array, dropped in migration `20260825000300`)
- **Trigger surface(s):** `/master-data/inventory` → any leaf item → Edit → [`ItemEditDialog`](src/components/services/inventory/ItemEditDialog.tsx) → **"Assigned divisions"** checklist. Read-side consumed by the buy-side PO / receival item pickers ([`CascadeInventorySelector`](src/components/purchase/CascadeInventorySelector.tsx) via [`PoLineItemsEditor`](src/components/purchase/PoLineItemsEditor.tsx) with `divisionFilterRequiresStock={false}`).
- **Primary hook(s):** [`useItemDivisions` + `useSetItemDivisions`](src/hooks/useItemDivisions.ts) (read + replace-set write); [`useCascadeAccessibleItems`](src/hooks/useCascadeAccessibleItems.ts) (buy-side accessibility filter); [`useItemDivisionsByStock`](src/hooks/useItemDivisionsByStock.ts) (inventory-list division filter, via the RPC below).
- **RPC(s):** `rpc_set_item_divisions(p_item_id uuid, p_division_ids uuid[])` (SECURITY DEFINER replace-set, gated on `inventory.catalog.manage`, revoked from public); `rpc_item_divisions_by_stock(p_type text)` (STABLE DEFINER — item→divisions = explicit assignment ∪ where-stock-currently-sits).
- **Ledger writes:** `public.inventory_item_divisions` (item_id, division_id, category_id, created_at, created_by); PK `(item_id, division_id)`. RLS `iid_select` (SELECT `TO authenticated`) + `iid_ins`/`iid_upd`/`iid_del` (write, `TO authenticated`, gated on `inventory.catalog.manage`) — tightened in migration `20260825000400`.
- **Downstream side-effects:** invalidates `['item-divisions', itemId]`, `['cascade-accessible','assignment']`, `['item-divisions-by-stock']`. Determines which items appear in each division's **buy-side** PO/receival picker (assignment = membership) and the inventory-list division filter. The **consume/sell** side is unaffected — it gates on owning stock in the active division, not on assignment.
- **Dialog / component:** [`ItemEditDialog`](src/components/services/inventory/ItemEditDialog.tsx) "Assigned divisions" section — seeded once per open; save guarded against a pre-load wipe (`assignedFromDb !== undefined && assignmentsChanged`).
- **Guards / preconditions:** write requires `inventory.catalog.manage`. Empty `p_division_ids` unassigns all; an existing row's `category_id` overlay is preserved on re-save via `ON CONFLICT DO NOTHING`.
- **Related flows:** [[Create Purchase Order (draft or RFQ)]] (buy-side consumer of the assignment membership), [[Set Item Attribute Values]] (same `ItemEditDialog`), [[Bulk Tools — per-category tracking mode]] (bulk tool items join this flow via the same dialog).
- **Docs / plans:** [docs/plans/2026-08-15-item-division-assignment/design.md](plans/2026-08-15-item-division-assignment/design.md) + [plan.md](plans/2026-08-15-item-division-assignment/plan.md). Migrations `20260825000000`–`000400`.
- **Notes:** Replaces the old "ownership-derived-from-stock + `shared_with_division_ids`" sharing model (there is no separate registry row for the old model — it was app-layer only). Each division keeps its own stock pool; cross-division movement is transfer-only (no shared consumption). The catalog importer ([reload_inventory.py](inventory-reorg/reload_inventory.py)) writes assignment rows directly. The bulk-tools follow-up ([docs/plans/2026-08-15-bulk-tools/NOTES.md](plans/2026-08-15-bulk-tools/NOTES.md)) opted bulk tools into this model — see [[Bulk Tools — per-category tracking mode]].

### Bulk Tools — per-category tracking mode

- **Module:** Master Data · Inventory / Warehouse
- **Status:** Active — Phase 2a (2026-08-15), branch `feature/bulk-tools`, staging only (not merged/shipped)
- **Trigger surface(s):** Tools & Assets tab (`ToolsAssetsView` → `ToolCategoryRow`) → category edit (`CategoryEditDialog`, `type='tools'`) → **Serialized (per-unit) / Bulk (qty tracking)** `Select`. Once a category is `bulk`, its "Add Tool/Asset" action opens the qty [`ItemEditDialog`](src/components/services/inventory/ItemEditDialog.tsx) (same dialog consumables use) instead of the serialized `ToolAssetEditDialog`, and the category row renders each item as a [`BulkToolItemRow`](src/components/services/inventory/BulkToolItemRow.tsx) (variant count + division-scoped qty on-hand) instead of serialized `ToolUnitRows`.
- **Primary hook(s):** [`useCategoryHasStockOrUnits`](src/hooks/useCategoryHasStockOrUnits.ts) (client-side toggle-disable check mirroring the DB guard); [`useCascadeAccessibleItems`](src/hooks/useCascadeAccessibleItems.ts) (buy-side picker, mode-aware for `type='tools'`); [`useItemDivisions`/`useSetItemDivisions`](src/hooks/useItemDivisions.ts) (bulk tool items assign through [[Assign Item to Divisions]]); [`useVariantStockByDivision`](src/hooks/useVariantStockByDivision.ts) (on-hand qty for `BulkToolItemRow`).
- **RPC(s) / triggers:** No RPC for the toggle itself — direct `UPDATE inventory_categories SET tool_tracking_mode=…`, gated by `inventory.catalog.manage`. Two SECURITY DEFINER triggers make the rest of the system mode-aware: **`guard_tool_tracking_mode_switch()`** (BEFORE UPDATE on `inventory_categories`, migration `20260826000200`) blocks flipping the mode while the category holds ANY `tool_asset_units` OR remaining FIFO qty — raises with the actual counts; empty categories switch freely. **`create_tool_units_on_receival_layer()`** (AFTER INSERT on `fifo_cost_layers`, rewritten from its live body in migration `20260826000100`) now also checks `inventory_categories.tool_tracking_mode`: only `type='tools' AND tool_tracking_mode='serialized'` spawns placeholder `tool_asset_units` rows — **bulk tool receivals spawn no units at all**, the FIFO layer alone represents the stock, exactly like a consumable.
- **Ledger writes:** `inventory_categories.tool_tracking_mode` (new enum `tool_tracking_mode`, default `'serialized'`, migration `20260826000000`). Bulk tool items otherwise write the same ledgers as any qty item — `inventory_items` + `inventory_item_brand_variants` + `fifo_cost_layers` + `inventory_stock_movements` + `inventory_item_divisions` (via [[Assign Item to Divisions]]) — never `tool_asset_units`.
- **Downstream side-effects:** the buy-side cascade picker filters `type='tools'` items to `tool_tracking_mode='bulk'` only (serialized tools were already excluded pre-Phase-2a and remain so — never purchased through the qty picker). Bulk tools reuse the qty transfer engine as-is — see [[Create Warehouse Transfer]] — and the existing per-division pools/consumption paths; no new transfer or consumption code was needed.
- **Dialog / component:** `CategoryEditDialog` (Serialized/Bulk `Select`, disabled + explanatory copy when `useCategoryHasStockOrUnits` is true); `BulkToolItemRow` (qty row) vs `ToolUnitRows` (serialized) inside `ToolCategoryRow`; `ItemEditDialog` (bulk tool create/edit — same "Assigned divisions" checklist as [[Assign Item to Divisions]]).
- **Guards / preconditions:** `tool_tracking_mode` is meaningful only when `inventory_categories.type='tools'` (ignored otherwise). Switching mode is blocked **server-side** (not just client-disabled) while the category has stock/units. Selling a bulk tool to a customer stays out of scope — `SoLineItemsEditor` excludes ALL tools regardless of mode (design decision, Task 2a.7).
- **Related flows:** [[Assign Item to Divisions]] (bulk tool items join this flow via `ItemEditDialog`), [[Create Warehouse Transfer]] (bulk tools transfer exactly like consumables), [[Create & Approve Receival]] (mode-aware unit-spawn gate lives on this trigger's insert path), [[Reorder Inventory Catalog Tree]] (`ToolCategoryRow`/`ToolsAssetsView` also reorder).
- **Docs / plans:** [docs/plans/2026-08-15-bulk-tools/design.md](plans/2026-08-15-bulk-tools/design.md) + [plan.md](plans/2026-08-15-bulk-tools/plan.md).
- **Migrations:** `20260826000000_inventory_categories_tool_tracking_mode.sql` (enum + column), `20260826000100_receival_tool_units_serialized_only.sql` (mode-aware receival trigger, rebased on the live function body), `20260826000200_guard_tool_tracking_mode_switch.sql` (populated-guard trigger). All staging-only (`mwvblpgbgxipvrevkeff`), mirrored to `supabase/migrations-staging/`.
- **Notes:** Serialized tool categories are entirely unaffected (default mode, zero behavior change) — they keep `tool_asset_units`, per-unit rows, and stay excluded from the buy-side qty picker. **Phase 2b (in progress, same branch):** Task 2b.1 added `tool_asset_units.division_id` (nullable, no backfill), Task 2b.2 added a Division select to the unit edit dialog, and Task 2b.3 added the dedicated unit-level transfer — see [[Transfer Serialized Tool Unit]]. The Phase-1 per-division **category overlay** (same item shown as a different category per division) is explicitly out of scope here — bulk tools join assignment + per-division pools + transfers only (boundary comment in `useCascadeAccessibleItems.ts`; Task 2a.7).

### Transfer Serialized Tool Unit

- **Module:** Master Data · Inventory / Warehouse (Tools & Assets)
- **Status:** Active — Phase 2b Task 2b.3 (2026-08-27), branch `feature/bulk-tools`, staging only (not merged/shipped)
- **Trigger surface(s):** Tools & Assets tab → serialized tool category → expand item → unit row → **Transfer** icon button (`ArrowRightLeft`, next to Edit) → [`ToolUnitTransferDialog`](src/components/services/inventory/ToolUnitTransferDialog.tsx).
- **Primary hook(s):** [`useTransferToolUnit`](src/hooks/useInventory.ts) (calls the RPC below, invalidates `queryKeys.inventory.toolAssetUnits(item_id)`, logs `activity_log`).
- **RPC(s):** `rpc_transfer_tool_unit(p_unit_id uuid, p_to_division_id uuid, p_notes text DEFAULT NULL)` — SECURITY DEFINER, gated on `inventory.catalog.manage`, `revoke all … from public` + explicit `grant execute … to authenticated, service_role` (no anon).
- **Ledger writes:** `public.tool_asset_units.division_id` only (single-column UPDATE, `FOR UPDATE` row lock). `assigned_to` is deliberately **never** touched by this RPC — division owns, person holds, and the two fields are independent (set in Task 2b.1/2b.2). No movement/ledger row is booked — unlike the qty transfer engine ([[Create Warehouse Transfer]]), a serialized unit has no FIFO cost layer to move.
- **Downstream side-effects:** invalidates `['tool-asset-units', itemId]` (the unit list refetches with the new division). Client also writes one `activity_log` row (`action: 'Tool Unit Transferred'`, old/new `division_id`, optional operator notes in `details`) — the RPC itself has no notes column.
- **Dialog / component:** [`ToolUnitTransferDialog`](src/components/services/inventory/ToolUnitTransferDialog.tsx) — current division (read-only), destination Division `Select` (human-readable names, excludes the current division, pre-selected+disabled when exactly one option remains), optional notes, neutral explanatory copy (division moves, assignee stays). Wired from [`ToolCategoryRow.tsx`](src/components/services/inventory/ToolCategoryRow.tsx) `ToolUnitRows`.
- **Guards / preconditions:** caller must hold `inventory.catalog.manage` (checked server-side via `_user_has_permission(_current_user_data_id(), …)`; both an authenticated non-manager and an unauthenticated caller are rejected with `not authorized`). `p_to_division_id` required (FK-enforced against `company_divisions`); the RPC does not itself forbid transferring to the unit's current division (UI prevents it by excluding that option from the picker). **Table-level backstop (2026-08-27, Task 2b.6):** `trg_guard_tool_unit_division_write` (BEFORE UPDATE on `tool_asset_units`) independently re-checks `inventory.catalog.manage` whenever `division_id` changes, regardless of write path. **Full write lock-down (2026-08-16, migration `20260828000000`, staging only):** the blanket `USING(true)` policy was replaced — SELECT stays open to authenticated; INSERT/UPDATE/DELETE now require `inventory.catalog.manage`, so the other columns (condition/status/assigned_to/serial/brand/expiry) are no longer directly editable by non-managers either. The receival serial-confirm step is rerouted through the DEFINER `rpc_confirm_tool_serial` (gated on `inventory.catalog.manage` OR `purchase.receivals.create`) so receivers still serialize; the previously-ungated DEFINER `auto_generate_tool_serials` gained the same gate.
- **Related flows:** [[Bulk Tools — per-category tracking mode]] (bulk tools instead reuse [[Create Warehouse Transfer]] — this flow exists because serialized units have no FIFO layer to move), [[Assign Item to Divisions]] (parallel "division owns" model at the item level; this is the unit level).
- **Docs / plans:** [docs/plans/2026-08-15-bulk-tools/design.md](plans/2026-08-15-bulk-tools/design.md) + [plan.md](plans/2026-08-15-bulk-tools/plan.md) `## Task 2b.3`. Migrations `20260827000100_rpc_transfer_tool_unit.sql` + `20260827000200_guard_tool_unit_division_write.sql` (Task 2b.6).
- **Notes:** **Gap CLOSED 2026-08-27 (Task 2b.6):** `tool_asset_units` RLS was `USING (true)`/`WITH CHECK (true)` for ALL commands to `{authenticated}` at the time of Task 2b.6, so the division backstop trigger was the closure for the `division_id` vector specifically. **The blanket policy has since been fully tightened (2026-08-16, migration `20260828000000`, staging):** writes now require `inventory.catalog.manage` (mirrors `inventory_item_divisions`), the Edit-Unit direct-write path (`useUpdateToolAssetUnit`) is manager-only, and the receival serial-confirm was rerouted to the gated DEFINER `rpc_confirm_tool_serial` (`PlaceholderUnitRow`) so non-manager receivers keep working. **Prod (new-prod) still on the old blanket policy pending ship** — the division backstop trigger is already live there. But `trg_guard_tool_unit_division_write` (see Guards, above) now re-checks the same `inventory.catalog.manage` permission at the table level whenever `division_id` changes, so the direct-Edit path can no longer bypass the RPC's gate — both paths now require the same permission. Rolled-back probe (2026-08-27): manager division-change allowed, non-manager division-change blocked (`not authorized to change the owning division of a tool unit`), non-manager non-division edit allowed.

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

## Warranty

### Create Warranty Records at Delivery

- **Module:** Sales / Warranty
- **Status:** Active
- **Trigger surface(s):** `SoDeliveryDialog` → **Mark Delivered** (any surface that flips a `sale_deliveries` row from `pending` to `delivered` via [[Complete Delivery]]).
- **Primary hook(s):** No dedicated hook — the flow is DB-owned. Read-side: [`useWarrantyRecordsForDelivery`](src/hooks/useWarrantyRecordsForDelivery.ts).
- **RPC(s):** [`public.complete_delivery_inventory`](supabase/migrations/20260815003600_warranty_delivery_hook_inline.sql) calls [`public.create_warranty_records_for_delivery(p_delivery_id)`](supabase/migrations/20260815003500_warranty_delivery_hook.sql) inline immediately after the status flip. Resolver: [`public.get_effective_warranty_policy(p_item_id)`](supabase/migrations/20260815003300_get_effective_warranty_policy.sql). Body re-issued several times since (`so_invoices` reassert, `warranty_number`/`source_type` fix, origin columns) — current live body tracked in [`20261002000200_warranty_origin_snapshot.sql`](supabase/migrations/20261002000200_warranty_origin_snapshot.sql); always confirm via `pg_get_functiondef` before editing again.
- **Ledger writes:** `warranty_records` — one row per `sale_delivery_line` with `brand_variant_id`, snapshotted policy fields (`policy_name_snapshot`, `coverage_type_snapshot`, `duration_months_snapshot`, `terms_en_snapshot`, `terms_ar_snapshot`, `void_conditions_snapshot`, `starts_from_snapshot`), computed `start_date` + `end_date`, `warranty_number` from `next_warranty_number()`, and (since Stage 2 Task 1) a country-of-origin snapshot — `origin_country_id` (FK) + `origin_name_snapshot` (text), sourced from `inventory_item_brand_variants.country_id` → `public.country_codes.name` at issuance time (nullable — items with no origin set snapshot NULL). Denormed `sale_order_id`, `customer_id`, `division_id` for RLS + reporting.
- **Downstream side-effects:** None outside `warranty_records`. Certificate PDF is on-demand — no Storage upload. `ON CONFLICT (sale_delivery_line_id) DO NOTHING` gives free idempotency if the RPC is retried.
- **Dialog / component:** N/A for creation (server-side). Preview badges: [`WarrantyBadge` in `SoLineItemsEditor`](src/components/sales/SoLineItemsEditor.tsx), effective-policy preview under the item edit dialog override select in [`ItemEditDialog`](src/components/services/inventory/ItemEditDialog.tsx).
- **Guards / preconditions:** Skipped silently for lines with (a) no `brand_variant_id`, (b) `qty_delivered <= 0`, (c) resolved policy is NULL (item uninsured — no fallback default), or (d) `duration_months = 0` (explicit "No Warranty" policy). Deliveries whose SO has no `division_id` also skip because `warranty_records.division_id` is NOT NULL.
- **Related flows:** [[Complete Delivery]], [[Print Warranty Certificate]]
- **Docs / plans:** [docs/plans/2026-08-05-warranty-phase-1.md](plans/2026-08-05-warranty-phase-1.md), [docs/plans/2026-08-05-warranty-context.md](plans/2026-08-05-warranty-context.md), [docs/plans/2026-08-21-warranty-completion/02-registry-and-origin.md](plans/2026-08-21-warranty-completion/02-registry-and-origin.md)
- **Notes:** Immutable by design — policy edits do NOT retroactively change existing records. Correction path is a controlled `UPDATE warranty_records SET terms_*_snapshot = ...` by an admin. There is **no `public.countries` table** — despite the name, the origin lookup table is `public.country_codes` (`id integer`, `name text`), the same reference table used by `PhoneInputWithCode`/`useCountryCodes` and the inventory "Origin" picker (`OriginCombobox`). `origin_country_id` is `integer`, not `uuid`.

### Print Warranty Certificate

- **Module:** Sales / Warranty
- **Status:** Active
- **Trigger surface(s):** [`DeliveryDetailDialog`](src/components/sales/DeliveryDetailDialog.tsx) → footer **Print Warranty Certificate** button (visible only when the delivery has ≥1 `warranty_records` row). Also the invoice detail toolbar at [`/sales/invoices/[id]`](src/app/(dashboard)/sales/invoices/[id]/page.tsx) — same gate against the invoice's `sale_delivery_id`.
- **Primary hook(s):** [`useWarrantyRecordsForDelivery`](src/hooks/useWarrantyRecordsForDelivery.ts) (button gate). No mutation — read-only download.
- **RPC(s):** N/A. Route: [`GET/POST /api/sales/deliveries/[id]/warranty-certificate`](src/app/api/sales/deliveries/[id]/warranty-certificate/route.ts) → [`generateWarrantyCertificatePdf`](src/lib/sales/generate-warranty-certificate-pdf.ts) → [`buildWarrantyCertificateHtml`](src/lib/sales/warranty-certificate-pdf-html.ts) → `htmlToPdfBuffer`.
- **Ledger writes:** None.
- **Downstream side-effects:** None. PDF bytes stream inline to the browser (`Content-Disposition: inline`); the client wraps them in a blob URL and opens in a new tab.
- **Dialog / component:** Delivery detail footer + invoice detail toolbar (see triggers).
- **Guards / preconditions:** Bearer-token auth via `SUPABASE_SERVICE_ROLE_KEY.auth.getUser()`. RLS on `warranty_records` (`is_division_visible(division_id)`) still applies to the read path.
- **Related flows:** [[Create Warranty Records at Delivery]]
- **Docs / plans:** [docs/plans/2026-08-05-warranty-phase-1.md](plans/2026-08-05-warranty-phase-1.md)
- **Notes:** Regenerated on every call — no Storage upload. Rationale: warranty terms are already snapshotted onto `warranty_records`, so future logo / template edits ARE meant to reflect on reprints; storing would double the storage-cascade work. Since Stage 2 Task 1, each item row also renders an "Origin: <name>" line (from `origin_name_snapshot`) when non-null — see [`warranty-certificate-pdf-html.ts`](src/lib/sales/warranty-certificate-pdf-html.ts).

### Warranty Claim (sale)

- **Module:** Sales / Warranty
- **Status:** Active
- **Trigger surface(s):** [`/sales/warranties`](src/app/(dashboard)/sales/warranties/page.tsx) → **Claims** tab (list + **File a claim**) and the **File claim** button on a warranty record's detail dialog. Actions from [`WarrantyClaimDetailDialog`](src/components/sales/WarrantyClaimDetailDialog.tsx): Assess (Cover / Reject), Start resolution, Void. File entry: [`FileWarrantyClaimDialog`](src/components/sales/FileWarrantyClaimDialog.tsx).
- **Primary hook(s):** [`useWarrantyClaims` / `useWarrantyClaim` / `useFileWarrantyClaim` / `useAssessWarrantyClaim` / `useVoidWarrantyClaim` / `useStartWarrantyClaimResolution`](src/hooks/useWarrantyClaims.ts).
- **RPC(s):** [`public.rpc_file_warranty_claim(p_warranty_record_id, p_issue)`](supabase/migrations/20261002000400_warranty_claim_rpcs.sql), [`public.rpc_assess_warranty_claim(p_claim_id, p_decision, p_reason)`](supabase/migrations/20261002000400_warranty_claim_rpcs.sql), [`public.rpc_void_warranty_claim(p_claim_id, p_reason)`](supabase/migrations/20261002000400_warranty_claim_rpcs.sql), [`public.rpc_start_warranty_claim_resolution(p_claim_id)`](supabase/migrations/20261002000500_warranty_claim_resolution_wiring.sql). Schema + numbering: [`20261002000300_warranty_claims_schema.sql`](supabase/migrations/20261002000300_warranty_claims_schema.sql).
- **Ledger writes:** `warranty_claims` (one row per claim; lifecycle `open → covered/rejected → in_progress → resolved`, plus `void`), `warranty_claim_counters` (per-division numbering). Start-resolution INSERTs a warranty-flagged `so_po_returns` row (`warranty_claim_id` set, `source_type='sale_order'`, `SR-#####`) + its `return_lines`, then flips the claim to `in_progress` with `linked_return_id`.
- **Downstream side-effects:** The created return is resolved entirely through the **existing** Returns machinery (Approach B — no new resolution code). Trigger [`_sync_warranty_claim_from_return`](supabase/migrations/20261002000600_warranty_claim_resolution_type_fix.sql) (AFTER UPDATE on `so_po_returns`, `WHEN warranty_claim_id IS NOT NULL`) flips the claim to `resolved` with `resolution_type` (replacement / refund / credit; NULL for a mixed/partial return) + `linked_credit_note_id` the moment the return reaches a terminal status (`resolved_credit` / `resolved_replacement` / `resolved_partial`) via `_maybe_close_return`. Invalidations: `warranty.claims`, `warranty.records`, `saleReturns.all`.
- **Dialog / component:** `WarrantyClaimDetailDialog`, `FileWarrantyClaimDialog`, Claims tab in the Warranties page.
- **Guards / preconditions:** All four RPCs are SECURITY DEFINER, gated on `sales.warranty_claims.manage` (REVOKE from PUBLIC/anon; GRANT authenticated). Assess requires `status='open'` (reject requires a reason); Start-resolution requires `status='covered'` AND `warranty_type='sale'` (service/contract raises `0A000` — deferred); Void allowed from any non-terminal status (blocked on `resolved`/`void`, reason required). SELECT is division-scoped RLS; writes are RPC-only. **"Repair" is NOT a customer resolution** — it is an inventory disposition ([[Send Damaged for Repair]]); a claim resolves only once a customer outcome (refund / replacement / store-credit) is recorded on the linked return. Repair-as-a-customer-warranty-outcome belongs to the deferred service/contract workflow.
- **Related flows:** [[Create Warranty Records at Delivery]], [[Create Sales Return (Direct)]], [[Complete Return Inspection]], [[Restock Sales Return]], [[Issue Credit Note for Sales Return]], [[Create Partial Replacement (customer + inventory atomic)]], [[Record Return Refund]], [[Record Return Store Credit]], [[Send Damaged for Repair]]
- **Docs / plans:** [docs/plans/2026-08-21-warranty-completion/03-claims.md](plans/2026-08-21-warranty-completion/03-claims.md)
- **Notes:** Approach B — `warranty_claims` consumes the Returns machinery, it does not re-implement it. `warranty_type` is snapshotted onto the claim to branch future service/contract workflows; only `sale` is built now. Claim numbering mirrors `next_warranty_number` (per-division counter). The resolution-sync trigger reads `NEW.credit_note_id` at the terminal-status transition — safe because both `_maybe_close_return` and `rpc_close_return` write the terminal status WITHOUT touching `credit_note_id` (it is set earlier at credit-note creation).

---

## Storage Hygiene

### Storage Cascade Cleanup

- **Module:** Cross-cutting (storage hygiene) — invoked automatically by DB triggers.
- **Status:** Active
- **Trigger surface(s):** Any `DELETE` or `UPDATE OF <path column>` on: `customers`, `companies`, `company_divisions`, `inventory_items`, `stock_adjustments`, `consumption_entries`, `landed_cost_lines`.
- **Primary hook(s):** N/A — server-side triggers only. No client hook.
- **RPC(s):** `public.storage_delete_object(bucket, path, source_table, source_id)`.
- **Ledger writes:** `public.storage_cleanup_failures` on failure only (RLS enabled, service-role only).
- **Downstream side-effects:** HTTP `DELETE` against Supabase Storage REST API via `pg_net`. Fire-and-forget — a Storage outage never aborts the parent DML.
- **Dialog / component:** N/A.
- **Guards / preconditions:** `SECURITY DEFINER` functions; service-role key read from `vault.decrypted_secrets` under name `storage_cleanup_service_role_key` at call time; caught exceptions logged to `storage_cleanup_failures`.
- **Related flows:** [[Create Sale Order (quotation / SO)]] (customer credit-doc side-effects), [[Complete Return Inspection]] (adjustment photos side-effects).
- **Docs / plans:** [docs/superpowers/plans/2026-08-04-storage-cascade-triggers.md](docs/superpowers/plans/2026-08-04-storage-cascade-triggers.md)
- **Notes:** `avatars` bucket intentionally out of scope (deterministic path + upsert = no orphans). PDF buckets deferred to storage-audit item 3D. **Per-environment Vault-secret bootstrap runbook: [docs/ops/storage-cascade-vault-bootstrap.md](ops/storage-cascade-vault-bootstrap.md)** — must be run once per environment before triggers can succeed.

---

## Registered placeholders — not yet implemented in code

These modules are called out in project plans / seed docs but have no material flow surface yet. Do NOT delete — fill in as the code lands.

- **Contact Centre** — Wati inbound handling, 3CX call log, task creation, priority queue. Only `src/types/wati.ts` types + `docs/wati-*.md` / `docs/whapi-*.md` reference material exist; no hooks or dialogs. See `project_contact_centre` memory.
- **Quotations / Contracts** — no dedicated quotation entity yet. Quotations are represented as an SO stage and drive off [[Create Sale Order (quotation / SO)]] → [[Confirm Sale Order]]. `OrderQuotationSettingsAdmin` only edits master-data numbering.
- **Calendar / Teams / Contracts (Phase 2 backlog)** — see `project_future_modules` memory.

### Request Warehouse Item (buy-new)

- **Module:** Warehouse / Operations
- **Status:** Active
- **Trigger surface(s):** `CustodyAssignDialog` ("Request stock for …") → **"Need an item that isn't stocked here?"** section (item name + qty) → submitted with the dialog's main **Submit request** button (no separate button).
- **Primary hook(s):** [`useRequestWarehouseItem`](src/hooks/useCustodyMoves.ts) (create) · [`useResolveItemRequest`](src/hooks/useWarehouseItemRequests.ts) (fulfil/dismiss) · [`useWarehouseItemRequests`](src/hooks/useWarehouseItemRequests.ts) (list)
- **RPC(s):** `public.rpc_request_warehouse_item` (persist + notify) · `public.rpc_resolve_item_request` (resolve + clear notifications)
- **Ledger writes:** `warehouse_item_requests` (the request record) + `notifications` (one `item_request` row per warehouse RP). No stock / FIFO movement.
- **Downstream side-effects:** Notification is actionable, deep-links to Master Data → Warehouses → **Requested Items** tab; resolving marks the request `fulfilled` / `dismissed` and actions the related notifications for every RP.
- **Dialog / component:** [`CustodyAssignDialog`](src/components/warehouse/custody/CustodyAssignDialog.tsx) (create) · [`WhItemRequestsTab`](src/components/purchase/wh/WhItemRequestsTab.tsx) (list + resolve)
- **Guards / preconditions:** Create — signed-in requester, valid warehouse, qty > 0. List — RLS-scoped to the warehouse RP(s) + super-viewers / admins. Resolve — RP of the request's warehouse, super-viewer, or system admin (`rpc_resolve_item_request`, fail-closed).
- **Related flows:** [[Create Custody Assign]]
- **Docs / plans:** [docs/plans/2026-08-13-warehouse-item-requests/plan.md](docs/plans/2026-08-13-warehouse-item-requests/plan.md)
- **Notes:** Free-text item (no catalog link) — by definition an item the warehouse doesn't stock. Replaces the old fire-and-forget notification (was notification-only, no record). Permissions: `warehouse.item_requests.view` / `.manage`.

---

## Customers & Credit

### Change Customer Credit Group

- **Module:** Sales / Master Data
- **Status:** Active
- **Trigger surface(s):** Customers page → **Edit Customer** → Customer Type = **Credit** + pick a credit group with a non-zero limit → **Save Changes** (also on **New Customer**).
- **Primary hook(s):** [`useSubmitCreditGroupChange`](src/hooks/useCreditGroupApprovals.ts) · [`useSaveCustomerCreditDocs`](src/hooks/useCustomerCreditDocs.ts) · [`useUpdateCustomer`](src/hooks/useSaleOrders.ts)
- **RPC(s):** `public.submit_credit_group_change(uuid, uuid)` · `save_customer_credit_docs` · `approve_/reject_/force_approve_credit_group_change`
- **Ledger writes:** `customer_credit_group_requests` (one per submitted change) + `customer_credit_group_approvals` (chain steps) · `customers.credit_group_id` + `block_reason` on approval/auto-approve · `customer_credit_docs` (docs) · `activity_log`
- **Downstream side-effects:** notifications (`credit_group_pending` / `_approved` / `_rejected`); new customers (no prior group) are blocked while a request is pending; invalidates customer + credit-summary caches.
- **Dialog / component:** [`CustomerDialog`](src/components/master-data/CustomerDialog.tsx) (submit) · [`CreditGroupApprovalsContent`](src/components/master-data/CreditGroupApprovalsContent.tsx) (decide).
- **Guards / preconditions:** `master_data.customers.change_credit_group`; group limit > 0 (zero-limit groups are assigned directly, no approval); required docs — business: CR + Establishment ID + Signed Credit Form, individual: Signed Credit Form only; one pending request per customer.
- **Related flows:** —
- **Docs / plans:** [docs/superpowers/specs/2026-08-14-supplier-scoping-and-credit-docs-fix-design.md](docs/superpowers/specs/2026-08-14-supplier-scoping-and-credit-docs-fix-design.md)
- **Notes:** `submit_credit_group_change` reads the customer's docs from `customer_credit_docs` (the wide docs table), **not** from `customers` — those columns were moved off `customers` by `20260815010600` / `010800`, and this function was missed until the fix in `20260823000000` (was raising `column "cr_url" does not exist` for every credit-group submission, individual + business).

### Create Project (+ disciplines)

- **Module:** Warehouse (Virtual Warehouse — Projects)
- **Status:** Active
- **Trigger surface(s):** Master Data → Warehouses → **Projects** tab → **New Project** button.
- **Primary hook(s):** [`useCreateProject`](src/hooks/useProjects.ts)
- **RPC(s):** `create_project` (SECURITY DEFINER; asserts custody warehouse + `is_division_member`; spins up one discipline sub-container per picked discipline, named `"{project_number} · {discipline}"`)
- **Ledger writes:** `projects` (1 row), `warehouse_sub_containers` (1 per discipline, `project_id`+`discipline_id` set, division inherited).
- **Downstream side-effects:** invalidates `queryKeys.projects.all`; the new discipline buckets become ordinary sub-containers usable by all stock/receival/consumption/transfer machinery.
- **Dialog / component:** [`ProjectFormDialog`](src/components/warehouse/projects/ProjectFormDialog.tsx), listed by [`ProjectsTab`](src/components/warehouse/projects/ProjectsTab.tsx)
- **Guards / preconditions:** `warehouse.projects.manage`; `UNIQUE(division_id, project_number)` → duplicate raises 23505 ("Project number already used in this division").
- **Related flows:** [[Add Project Discipline]], [[Close Project]], [[Add/Close Project Milestone]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)

### Add Project Discipline

- **Module:** Warehouse (Virtual Warehouse — Projects)
- **Status:** Active
- **Trigger surface(s):** Project detail dialog → **Add Discipline** (picker of disciplines not already on the project).
- **Primary hook(s):** [`useAddProjectDiscipline`](src/hooks/useProjects.ts)
- **RPC(s):** `add_project_discipline` (SECURITY DEFINER; inserts one `warehouse_sub_containers` row; partial-unique `(project_id, discipline_id)` blocks dupes)
- **Ledger writes:** `warehouse_sub_containers` (1 row).
- **Dialog / component:** [`ProjectDetail`](src/components/warehouse/projects/ProjectDetail.tsx)
- **Guards / preconditions:** `warehouse.projects.manage`.
- **Related flows:** [[Create Project (+ disciplines)]], [[Close Project]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)

### Close Project

- **Module:** Warehouse (Virtual Warehouse — Projects)
- **Status:** Active
- **Trigger surface(s):** Project detail dialog → **Close Project** (AlertDialog confirm).
- **Primary hook(s):** [`useCloseProject`](src/hooks/useProjects.ts)
- **RPC(s):** `close_project` (SECURITY DEFINER; RAISES "Cannot close a project while its disciplines still hold stock" if any bucket has `total_qty>0`, else deactivates project + its sub-containers)
- **Ledger writes:** `projects.is_active=false`, `warehouse_sub_containers.is_active=false` (that project's rows).
- **Guards / preconditions:** `warehouse.projects.manage`; all discipline buckets empty.
- **Dialog / component:** [`ProjectDetail`](src/components/warehouse/projects/ProjectDetail.tsx)
- **Related flows:** [[Create Project (+ disciplines)]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)

### Add/Close Project Milestone

- **Module:** Warehouse (Virtual Warehouse — Projects)
- **Status:** Active
- **Trigger surface(s):** Project detail dialog → per-discipline **MilestoneManager** (add label / close milestone).
- **Primary hook(s):** [`useAddMilestone` / `useCloseMilestone`](src/hooks/useProjectMilestones.ts)
- **RPC(s):** `add_project_milestone(p_sub_container_id, p_label)`, `close_project_milestone(p_milestone_id)` (both SECURITY DEFINER, `warehouse.projects.manage`-gated, EXECUTE revoked from PUBLIC)
- **Ledger writes:** `project_milestones` (add: 1 row; close: `is_active=false`, history kept).
- **Dialog / component:** [`MilestoneManager`](src/components/warehouse/projects/MilestoneManager.tsx)
- **Guards / preconditions:** `warehouse.projects.manage`; `UNIQUE(sub_container_id, label)` → 23505 friendly message.
- **Related flows:** [[Post Consumption with Milestone tag]], [[Project Consumption Report]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)

### Post Consumption with Milestone tag

- **Module:** Warehouse (extends the existing Consumption flow)
- **Status:** Active
- **Trigger surface(s):** `/consumption` (or custody card) → New Consumption → optional **Milestone** picker (shown only when the custody consumer sub-container has active milestones).
- **Primary hook(s):** [`useCreateConsumption`](src/hooks/useConsumption.ts)
- **RPC(s):** `rpc_post_consumption(..., p_milestone_id uuid DEFAULT NULL)` (SECURITY DEFINER; validates the milestone belongs to `p_consumer_sub_container_id`; stamps `consumption_entries.milestone_id` + copies onto every per-FIFO-layer `cogs_entries` row; EXECUTE revoked from PUBLIC)
- **Ledger writes:** `consumption_entries` (+milestone_id), `cogs_entries` (+milestone_id per layer), `inventory_stock_movements`, FIFO drain.
- **Downstream side-effects:** milestone is a copied cost tag only — no new cost math; feeds [[Project Consumption Report]].
- **Dialog / component:** [`NewConsumptionDialog`](src/components/consumption/NewConsumptionDialog.tsx)
- **Guards / preconditions:** existing consumption access rules; milestone optional (null stays valid); non-custody consumption forces null.
- **Related flows:** [[Add/Close Project Milestone]], [[Project Consumption Report]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)
- **Notes:** Milestone anchored to the CONSUMER sub-container to stay consistent with how the report resolves discipline (`cogs.consumer_sub_container_id`). A free-text **code** tag was added 2026-08-17 (migration `20260917000000`): `rpc_post_consumption(..., p_code text DEFAULT NULL)` stamps `consumption_entries.code` + copies it onto every per-layer `cogs_entries` row. UI-required for a project pool (the dialog gate), but the RPC does NOT hard-require it — `p_code` stays `DEFAULT NULL` so the param is backward compatible and consistent with discipline/milestone (also UI-only-required). Column is nullable; non-project / internal consumptions carry no code.

### Team vs Service item consumption

- **Module:** Warehouse / Consumption (routing layer over the existing Post Consumption flow)
- **Status:** Active. Base feature shipped to prod 2026-08-18. **2026-08-19 reshape (operator):** the Service/Team choice moved OUT of page-level tabs and INTO the New Consumption dialog itself (a segmented toggle), present on both the `/consumption` header and the custody-card Consume; the `/consumption` page tabs were removed — one list now shows both kinds with a per-row **Type** badge.
- **Trigger surface(s):** `/consumption` → New Consumption (in-dialog **Service items / Team items** toggle) · custody card (`/warehouse/custody`) → Consume (same toggle; source locked to the team). Inventory editors mark items team-held (a **Team item category** switch on `CategoryEditDialog`; a tri-state Inherit/Yes/No per-item override on `ItemEditDialog`).
- **Primary hook(s):** [`useConsumptionList`](src/hooks/useConsumption.ts) (`teamItems` omitted on the page → returns both; each row carries `is_team_item`) · [`useTeamItemVariantIds`](src/hooks/useConsumption.ts) (picker scoping) · [`useItemTeamItemContext`](src/hooks/useInventory.ts) (editor seed) · [`useCreateConsumption`](src/hooks/useConsumption.ts) (posting, unchanged).
- **RPC(s):** `rpc_post_consumption(…)` — signature unchanged; DERIVES + stamps `consumption_entries.is_team_item` from the consumed items (effective = `COALESCE(item, category, false)`) and RAISEs on a mixed post (homogeneity). `rpc_team_item_variant_ids()` (STABLE SECURITY INVOKER, revoked from anon/public) returns the effective team-item variant ids for the picker.
- **Ledger writes:** same as [[Post Consumption with Milestone tag]] — `consumption_entries` (+`is_team_item`) / `consumption_lines` / per-layer `cogs_entries` / `inventory_stock_movements` / FIFO drain. **No cost or stock behaviour change** — is_team_item is a UI routing attribute only.
- **Downstream side-effects:** one history list shows both kinds with a per-row Service/Team **Type** badge; the in-dialog toggle scopes the item picker (Service excludes team-items; Team shows only team-items and restricts a *pickable* source to custody holdings). Switching the toggle clears picked lines so a post stays homogeneous.
- **Dialog / component:** [`NewConsumptionDialog`](src/components/consumption/NewConsumptionDialog.tsx) (in-dialog Service/Team toggle; `initialMode` seed prop; mobile item picker rendered as a full-screen bottom sheet with tap-to-type) · [`consumption/page.tsx`](<src/app/(dashboard)/consumption/page.tsx>) (single list + Type badge; tabs removed).
- **Guards / preconditions:** existing consumption access rules unchanged; team-item routing is UI-enforced (picker filter + Team-mode custody-only source) plus the RPC homogeneity assertion. A team-item sitting in a real warehouse (unassigned) is consumable only once in a team's custody.
- **Migrations:** `20260918000000` (flag columns), `20260919000000` (stamp in rpc_post_consumption), `20260919000100` (variant-ids RPC) — all on staging + new-prod (base feature). The 2026-08-19 reshape is frontend-only (no migration).
- **Related flows:** [[Post Consumption with Milestone tag]], [[Custody & Consumption]], [[Assign / Move / Return Tool Unit (team custody)]]
- **Docs / plans:** [docs/consumption/2026-08-18-team-vs-service-consumption-design.md](docs/consumption/2026-08-18-team-vs-service-consumption-design.md)

### Virtual Sub-container Transfer (project/discipline)

- **Module:** Warehouse (extends the existing Transfer flow)
- **Status:** Active
- **Trigger surface(s):** Master Data → Warehouses → Transfers → **New Transfer** — custody warehouses are now selectable as source/destination (discipline buckets), with source + destination sub-container pickers (destination ≠ source).
- **Primary hook(s):** [`useCreateTransfer`](src/hooks/useWarehouseOperations.ts) (dispatch/receive unchanged)
- **RPC(s):** `create_transfer_v2(..., p_from_sub_container_id, p_to_sub_container_id)` → `dispatch_transfer` → `receive_transfer` (all pre-existing; no schema change — Task 3.1 verified no guard blocks custody→custody / cross-division / same-warehouse-different-sub; receive SoD check is skipped when from=to)
- **Ledger writes:** `warehouse_transfers`, `warehouse_transfer_items`, stock movements + FIFO cost moved by `sub_container_id` on receive.
- **Downstream side-effects:** cross-division receive moves value to the destination sub-container's division automatically.
- **Dialog / component:** [`WhTransferDialog`](src/components/purchase/wh/WhTransferDialog.tsx); warehouse eligibility widened in [`master-data/warehouses/page.tsx`](src/app/(dashboard)/master-data/warehouses/page.tsx) via a `transferWarehouses` memo (real + custody, not repair).
- **Guards / preconditions:** dispatch = field RP of FROM warehouse; receive = field RP of TO warehouse.
- **Related flows:** [[Create Project (+ disciplines)]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)

### Project Consumption Report

- **Module:** Reports (Warehouse)
- **Status:** Active
- **Trigger surface(s):** Reports → **Project Consumption** (`/reports/project-consumption`).
- **Primary hook(s):** [`useProjectConsumptionReport`](src/hooks/reports/useProjectConsumptionReport.ts)
- **RPC(s):** `rpc_report_project_consumption(p_from, p_to, p_division_ids)` (read-only STABLE SECURITY DEFINER; `is_division_visible`-scoped; EXECUTE revoked from PUBLIC)
- **Ledger writes:** none (read-only; sums `cogs_entries.total_cost`/`qty` where `source_type='consumption'`).
- **Downstream side-effects:** none.
- **Dialog / component:** [`reports/project-consumption/page.tsx`](src/app/(dashboard)/reports/project-consumption/page.tsx) — `ReportFilterBar` + `ReportGroupedTable` (single-level grouping by consumer; discipline + milestone as columns) + `ReportExportMenu`.
- **Guards / preconditions:** `reports.view` OR `consumption.cost.view`.
- **Related flows:** [[Post Consumption with Milestone tag]], [[Add/Close Project Milestone]]
- **Docs / plans:** [docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md](docs/plans/2026-08-15-vwh-projects-and-transfers/plan.md)
- **Notes:** Renamed to **Consumption** + split into Teams (day-cards) / Projects (grouped table) 2026-08-17; nav/title/breadcrumb say "Consumption" (route + `reports.project_consumption.view` key unchanged). The RPC now also returns a **code** column (migration `20260917000000`) so the Projects table reads project → discipline → milestone → **code** → item → date. Per-section PDF/Excel export; Day (calendar) / Team / Project drill-in filters. ReportGroupedTable is single-level; hierarchy carried by RPC sort + columns.

### Assign / Move / Return Tool Unit (team custody)

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 1 (2026-08-18), staging only (not shipped to prod)
- **Trigger surface(s):** Operations → **Tools & Assets** (`/warehouse/tools-assets`) → Teams tab (cards grouped by division, collapsible) → team card → team detail: **Assign tool** ([`AssignToolUnitDialog`](src/components/warehouse/tools-assets/AssignToolUnitDialog.tsx) — a fixed-size **category → item → unit** tree picker with search), per-row **Move** ([`MoveToolUnitDialog`](src/components/warehouse/tools-assets/MoveToolUnitDialog.tsx)) and **Return**.
- **Primary hook(s):** [`useAssignToolUnit`, `useMoveToolUnit`, `useReturnToolUnit`](src/hooks/useToolAssignments.ts)
- **RPC(s):** `rpc_assign_tool_unit_to_team(p_unit_id, p_team_id, p_notes)`, `rpc_move_tool_unit_to_team(p_unit_id, p_to_team_id, p_notes)`, `rpc_return_tool_unit(p_unit_id, p_notes)` — all SECURITY DEFINER, gated on `tools.assets.manage` (repointed from `inventory.catalog.manage` by Phase-2 migration `20260922000200`; new-prod carries the repoint only when Phase 2 ships), revoke public + grant authenticated/service_role.
- **Ledger writes:** `tool_unit_assignments` (the custody ledger — open row = current holder; closed with `release_reason` moved/returned) + denormalized `tool_asset_units.current_custody_location_id` pointer + `status` (assigned/available). Assign ESTABLISHES `tool_asset_units.division_id` from the team when it is NULL (ISSUE-9); it never changes an already-set division.
- **Downstream side-effects:** invalidates `queryKeys.toolAssignments.all` (team cards + counts, a team's units, assignable list, and timelines all refetch).
- **Dialog / component:** [`TeamsTab`](src/components/warehouse/tools-assets/TeamsTab.tsx) → [`TeamToolsDetail`](src/components/warehouse/tools-assets/TeamToolsDetail.tsx) → the two dialogs above.
- **Guards / preconditions:** same-division only (server asserts `unit.division_id = team.division_id`, except NULL→establish); at most one open assignment per unit (partial unique index `uq_tool_unit_open_assignment`). A cross-division move is blocked — use [[Transfer Serialized Tool Unit]] to change the owning division first (that now auto-releases the open team assignment, ISSUE-8).
- **Related flows:** [[Transfer Serialized Tool Unit]] (owning-division change; releases the open assignment), [[Custody & Consumption (unified custody warehouse model · 2026-08-12)]] (teams = custody sub-containers), [[Tool Unit Custody History & Usage]] (reads the ledger this writes).
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/](docs/plans/2026-08-18-tools-assets-team-tracking/) (design + required-data + issues + phase-1/plan). Migrations `20260920000000`–`20260920000200`.
- **⚠ Return destination (Phase 2 rework, 2026-08-18, migration `20260923000100`, staging):** `rpc_return_tool_unit` gained `p_to_warehouse_id` (DROP+CREATE — the 2-arg signature was dropped) so a returned tool records **which store warehouse** it went back to (`tool_unit_assignments.returned_to_warehouse_id`, surfaced in the unit timeline). Return picks a store via [`ReturnToolDialog`](src/components/warehouse/tools-assets/ReturnToolDialog.tsx) (`get_return_destinations` = physical warehouses). A tool becomes `lifecycle_type='used'` on **return** (not on assign) — a freshly-created, first-assigned tool stays **New**; `rpc_return_tool_unit` advances new→used, `rpc_return_tool_from_repair` (usable) sets **repaired**, and the unit editor has a manual Type override (migrations `20260923000000` + `20260923000600`, operator correction 2026-08-19). The team detail is now an item-grouped **tree** with an "In repair" section ([`TeamToolsDetail`](src/components/warehouse/tools-assets/TeamToolsDetail.tsx)).

### Tool Unit Custody History & Usage

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — on staging + new-prod. Custody-card tools surface + `condition` column added 2026-08-19.
- **Trigger surface(s):** Operations → Tools & Assets → **History & Usage** tab (search by serial / item name → open a unit → its custody timeline; default list of currently-assigned units) · Teams tab (teams+counts, a team's units) · **Custody page** (`/warehouse/custody`) team cards — a **"Show tools (N)"** collapsible surfaces each team's currently-assigned tools (read-only: name + `SN`, with a Good/Fair **condition** badge).
- **Primary hook(s):** [`useSearchToolUnits`, `useToolUnitTimeline`, `useAssignedToolUnits`](src/hooks/useToolUnitHistory.ts); [`useTeamsWithToolCounts`, `useTeamToolUnits`, `useAssignableToolUnits`](src/hooks/useToolAssignments.ts)
- **RPC(s):** `search_tool_units(p_query)`, `get_tool_unit_timeline(p_unit_id)`, `list_assigned_tool_units(p_division_ids)` (assigned units incl. `current_team_id`/`current_team_name`, division-scoped, LIMIT 200 — powers the History default list AND the custody-card tools list; **now also returns `condition`** via migration `20260924000200`), `get_teams_with_tool_counts(p_division_ids)`, `get_team_tool_units(p_team_id)`, `get_assignable_tool_units(p_division_id, p_search)` — all STABLE SECURITY DEFINER, revoke public + granted authenticated/service_role (read-only). `get_assignable_tool_units` also returns `item_id` + `category_id`/`category_name` (migration `20260921000000`) so the Assign dialog renders a **category → item → unit** tree.
- **Ledger writes:** none (read-only over `tool_unit_assignments` + `tool_asset_units`).
- **Downstream side-effects:** none.
- **Dialog / component:** [`HistoryUsageTab`](src/components/warehouse/tools-assets/HistoryUsageTab.tsx) → [`ToolUnitTimeline`](src/components/warehouse/tools-assets/ToolUnitTimeline.tsx) · [`custody/page.tsx`](<src/app/(dashboard)/warehouse/custody/page.tsx>) (one bulk `list_assigned_tool_units` per warehouse tab, grouped per team, distributed to each card like `stockRows`) · [`ToolConditionBadge`](src/components/warehouse/tools-assets/ToolBadges.tsx).
- **Guards / preconditions:** the Tools & Assets hub nav + page are gated on `tools.assets.view`; the **custody-card** tools list is intentionally NOT gated on `tools.assets.view` — it is shown to any custody-card viewer (a team lead seeing their own tools), backed by the authenticated-only `list_assigned_tool_units` (no cost/pricing exposed). `get_assignable_tool_units` returns division-matched OR not-yet-divisioned units (ISSUE-9), bounded (LIMIT 200) + searchable.
- **Related flows:** [[Assign / Move / Return Tool Unit (team custody)]] (writes the ledger these read), [[Custody & Consumption (unified custody warehouse model · 2026-08-12)]] (the card these tools now appear on).
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/](docs/plans/2026-08-18-tools-assets-team-tracking/) (incl. `phase-1/refinements-plan.md`). Migrations `20260920000300`, `20260921000000` (assign-tree columns), `20260924000000` (`list_assigned_tool_units`), `20260924000200` (+`condition`).

### Record Tool Inspection (condition check)

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 2 (2026-08-18), staging only (not shipped to prod)
- **Trigger surface(s):** Operations → Tools & Assets → Teams tab → team detail → per-row **Good / Bad / Repair** buttons ([`InspectionVerdictButtons`](src/components/warehouse/tools-assets/InspectionVerdictButtons.tsx)); the row also shows the last-checked date + a "Due" badge when there is no check in the current calendar month.
- **Primary hook(s):** [`useRecordInspection`](src/hooks/useToolInspections.ts) (+ [`useTeamToolUnitsV2`](src/hooks/useToolInspections.ts) for the last-checked / due read).
- **RPC(s):** `rpc_record_tool_inspection(p_unit_id, p_verdict, p_notes)` — SECURITY DEFINER, gated on `tools.assets.manage`, revoke public + grant authenticated/service_role. Read: `get_team_tool_units_v2(p_team_id)` (STABLE DEFINER; the Phase-1 team read + `last_inspected_at` + `inspection_due`).
- **Ledger writes:** `tool_unit_inspections` (append-only condition-check history; snapshots `custody_location_id` + `inspected_by`). Applies the §6 lifecycle map to `tool_asset_units` with **no new enums**: `good`→`condition='Good'`, `bad`→`condition='Fair'`, `under_repair`→`status='maintenance'` (moves the unit into the Repair bucket).
- **Downstream side-effects:** invalidates `queryKeys.toolInspections.all` + `queryKeys.toolAssignments.all` (team detail + repair bucket refetch).
- **Dialog / component:** [`TeamToolsDetail`](src/components/warehouse/tools-assets/TeamToolsDetail.tsx) inline row action (no dialog — buttons + toast).
- **Guards / preconditions:** manage-gated; a `retired` unit cannot be inspected; verdict ∈ {`good`, `bad`, `under_repair`} (column CHECK + in-RPC guard).
- **Related flows:** [[Resolve Tool Repair (Repaired / Scrap → P&L)]] (drains the maintenance bucket this fills), [[Assign / Move / Return Tool Unit (team custody)]] (the units being checked), [[Tool Unit Custody History & Usage]].
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/phase-2/](docs/plans/2026-08-18-tools-assets-team-tracking/phase-2/) (design §6). Migrations `20260922000000` (table + RLS), `20260922000100` (RPCs), `20260922000200` (permission repoint → `tools.assets.manage`).
- **⚠ Reworked (Phase 2 rework, 2026-08-18, staging):** the inline Good/Bad/Repair buttons + `InspectionVerdictButtons` are **removed**. Condition checks now run through the **[[Tool Monthly Check Session]]** page (session-linked) — `rpc_record_tool_inspection` gained `p_session_id` (DROP+CREATE, migration `20260923000400`). Ad-hoc repair-sending moved to [[Send Tool for Repair (team → bucket → vendor)]].

### Resolve Tool Repair (Repaired / Scrap → P&L)

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 2 (2026-08-18), staging only (not shipped to prod)
- **Trigger surface(s):** Operations → Tools & Assets → **Repair** tab ([`RepairTab`](src/components/warehouse/tools-assets/RepairTab.tsx) — `status='maintenance'` units grouped by division, scoped by the top-bar division view filter) → per-unit **Repaired** or **Scrap** ([`ScrapToolDialog`](src/components/warehouse/tools-assets/ScrapToolDialog.tsx)).
- **Primary hook(s):** [`useResolveRepair`](src/hooks/useToolRepair.ts) (+ [`useRepairBucket`](src/hooks/useToolInspections.ts) for the bucket read).
- **RPC(s):** `rpc_resolve_tool_repair(p_unit_id, p_outcome, p_notes)` (`p_outcome ∈ {repaired, scrap}`) — SECURITY DEFINER, gated on `tools.assets.manage`. Read: `get_repair_bucket(p_division_ids)` (STABLE DEFINER, division-scoped).
- **Ledger writes:** **repaired** → `tool_asset_units.condition='Good'` + `status` back to `assigned` (still held) / `available`. **scrap** → closes the open `tool_unit_assignments` row (`release_reason='scrapped'`), sets `status='retired'` + clears the custody pointer, then — reusing the existing write-off applier — inserts a qty-1 `write_off` `stock_adjustments` row + `PERFORM approve_stock_adjustment_inventory(id, actor)`, which books an `inventory_stock_movements` row that `rpc_report_pnl` reads into the **"Scrap & Defective" (`v_scrap`)** line. Cost = the unit's receival FIFO layer (via `receival_item_id → receival_items`), FIFO-valued by `deduct_fifo_layers`.
- **Downstream side-effects:** invalidates `queryKeys.toolInspections.all` + `queryKeys.toolAssignments.all`. Scrap decrements `warehouse_stock_summary` qty −1 + FIFO `remaining_qty` −1 for the resolved `(brand_variant, sub_container)`.
- **Dialog / component:** [`RepairTab`](src/components/warehouse/tools-assets/RepairTab.tsx) → [`ScrapToolDialog`](src/components/warehouse/tools-assets/ScrapToolDialog.tsx) (confirm + optional notes; full-screen on mobile, one scroll region).
- **Guards / preconditions:** manage-gated; an already-`retired` unit is rejected. The cost write-off is **savepoint-guarded** — a unit with no receival link / no FIFO layer / short stock (seed units, ISSUE-2 drift) retires at **zero value + a NOTICE**, never failing the scrap (design §8). Uses `approve_stock_adjustment_inventory`, **not** the legacy `apply_adjustment` / `inventory_adjustments` path.
- **Related flows:** [[Record Tool Inspection (condition check)]] (fills the maintenance bucket), [[Create Stock Adjustment]] (the write-off → approve path reused to book P&L), [[Assign / Move / Return Tool Unit (team custody)]] (custody ledger row closed on scrap).
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/phase-2/](docs/plans/2026-08-18-tools-assets-team-tracking/phase-2/) (design §8, ISSUE-1/2). Migrations `20260922000100` (RPCs), `20260922000200` (permission repoint).
- **⚠ Reworked (Phase 2 rework, 2026-08-18, staging):** the bucket keeps **Scrap** (this flow — direct scrap for a dead tool, operator decision) but drops **Repaired** — a fixable tool now goes to a vendor via [[Send Tool for Repair (team → bucket → vendor)]] → [[Return Tool from Repair (usable / writeoff)]]. `get_repair_bucket` refined to **awaiting-vendor-only** (maintenance minus an open repair transfer) + `lifecycle_type` (migration `20260923000200`).

### Send Tool for Repair (team → bucket → vendor)

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 2 rework (2026-08-18), **staging only, pending operator smoke** (not shipped to prod)
- **Trigger surface(s):** (1) Teams → team detail → per-unit **Repair** ([`SendToRepairDialog`](src/components/warehouse/tools-assets/SendToRepairDialog.tsx) — *"Have you collected this tool?"* confirm) collects the tool into the **Repair bucket** (awaiting vendor). (2) Repair tab → **Awaiting vendor** card → **Send for repair** ([`SendToolForRepairDialog`](src/components/warehouse/tools-assets/SendToolForRepairDialog.tsx) — vendor + expected-return date) dispatches it.
- **Primary hook(s):** [`useSendToolToRepairBucket`, `useSendToolForRepair`, `useToolsOutForRepair`](src/hooks/useToolRepair.ts).
- **RPC(s):** `rpc_send_tool_to_repair_bucket(p_unit_id, p_notes)` (assigned → **closes the team assignment** `release_reason='sent_for_repair'` + clears custody + `status='maintenance'` — **the tool leaves the team**), `rpc_send_tool_for_repair(p_unit_id, p_repair_vendor_id, p_expected_return_date, p_notes)` — both SECURITY DEFINER, gated `tools.assets.manage`.
- **Ledger writes:** send-for-repair inserts a `warehouse_transfers(transfer_kind='damaged_repair_out', status='in_transit', **tool_unit_id**, repair_vendor_id, from = the team it was collected from (its latest assignment), to = vendor `virtual_warehouse_id`+`sub_container_id`)` — **no** damaged-stock ledger, **no** `warehouse_transfer_items` row (a tool has no brand-variant qty). A tool in repair is **removed from the team** (not on `get_team_tool_units_v2`) and **not assignable** (`get_assignable_tool_units` excludes `maintenance`); it shows only in the Repair bucket with the team it came from.
- **Downstream side-effects:** unit leaves the awaiting-vendor bucket, appears in the Repair tab's **Out for repair** section; invalidates `toolAssignments` + `toolInspections` + `damagedStock.outForRepairAll`.
- **Dialog / component:** [`SendToRepairDialog`](src/components/warehouse/tools-assets/SendToRepairDialog.tsx), [`SendToolForRepairDialog`](src/components/warehouse/tools-assets/SendToolForRepairDialog.tsx), [`RepairTab`](src/components/warehouse/tools-assets/RepairTab.tsx).
- **Guards / preconditions:** manage-gated; send-to-bucket requires the tool be **currently held by a team** (open assignment); send-for-repair requires `status='maintenance'` + no existing open repair transfer + an active vendor with a warehouse/sub_container.
- **Related flows:** [[Return Tool from Repair (usable / writeoff)]] (closes this transfer), [[Repair Vendor CRUD (sub-container of shared Repair warehouse)]], [[Assign / Move / Return Tool Unit (team custody)]].
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/](docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/). Migrations `20260923000200`, `20260923000500` (tool leaves the team on send-to-repair).

### Return Tool from Repair (usable / writeoff)

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 2 rework (2026-08-18), **staging only, pending operator smoke**
- **Trigger surface(s):** Repair tab → **Out for repair** card → **Return from repair** ([`ReturnToolFromRepairDialog`](src/components/warehouse/tools-assets/ReturnToolFromRepairDialog.tsx)).
- **Primary hook(s):** [`useReturnToolFromRepair`](src/hooks/useToolRepair.ts).
- **RPC(s):** `rpc_return_tool_from_repair(p_transfer_id, p_outcome, p_to_warehouse_id, p_notes)` (`p_outcome ∈ {usable, writeoff}`) — SECURITY DEFINER, gated `tools.assets.manage`.
- **Ledger writes:** **usable** → unit `status='available'`, `condition='Good'`, `lifecycle_type='repaired'`, custody cleared; stamps the **return store** (`returned_to_warehouse_id`) on the already-closed `sent_for_repair` ledger row (the team assignment was closed when the tool left for repair); transfer `status='received'`. **writeoff** → unit retired + **scrap→P&L** (reuses `approve_stock_adjustment_inventory`, savepoint-guarded — same path as [[Resolve Tool Repair (Repaired / Scrap → P&L)]]); transfer `received`. **Repair cost is never charged.**
- **Downstream side-effects:** invalidates `toolAssignments` + `toolInspections` + `damagedStock.outForRepairAll`.
- **Guards / preconditions:** manage-gated; the transfer must be a `damaged_repair_out` `in_transit` with a `tool_unit_id`.
- **Related flows:** [[Send Tool for Repair (team → bucket → vendor)]] (produces the transfer), [[Create Stock Adjustment]] (write-off path), [[Return Damaged from Repair]] (the sibling bulk flow — now also cost-free).
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/](docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/). Migrations `20260923000200`, `20260923000500`.

### Tool Monthly Check Session

- **Module:** Warehouse (Operations → Tools & Assets)
- **Status:** Active — Phase 2 rework (2026-08-18), **staging only, pending operator smoke**
- **Trigger surface(s):** Operations → Tools & Assets → **Monthly Check** tab ([`ToolCheckPage`](src/components/warehouse/tools-assets/checks/ToolCheckPage.tsx), one division in the top-bar view) → **Initiate check** → team cards + progress → open a team ([`ToolCheckTeamPanel`](src/components/warehouse/tools-assets/checks/ToolCheckTeamPanel.tsx)) → **Good/Bad** each tool → **Finish** → report ([`ToolCheckReport`](src/components/warehouse/tools-assets/checks/ToolCheckReport.tsx)) → Excel/PDF export.
- **Primary hook(s):** [`useInitiateCheckSession`, `useRecordCheck`, `useFinalizeCheckSession`, `useOpenCheckSession`, `useCheckProgress`, `useCheckReport`](src/hooks/useToolChecks.ts).
- **RPC(s):** `rpc_initiate_tool_check_session(p_division_id)` (one open session per division), `rpc_record_tool_inspection(…, p_session_id)`, `rpc_finalize_tool_check_session(p_session_id)`; reads `get_open_tool_check_session`, `get_tool_check_session_progress` (checked/total), `get_tool_check_session_report`. All gated `tools.assets.manage` (reads DEFINER/authenticated).
- **Ledger writes:** `tool_check_sessions` (RLS: `tcs_select` read, `tcs_write` manage) + `tool_unit_inspections.session_id` links each check to the session; Good→`condition='Good'`, Bad→`condition='Fair'`.
- **Downstream side-effects:** the report exports server-side via `/api/reports/excel` + `/api/reports/pdf` (columns Item · Serial · Type · Condition · Inspected).
- **Guards / preconditions:** manage-gated; a single division must be in the top-bar view; a second initiate for a division with an open session is rejected.
- **Related flows:** [[Record Tool Inspection (condition check)]] (the underlying inspection RPC, now session-aware), [[Assign / Move / Return Tool Unit (team custody)]] (the units checked).
- **Docs / plans:** [docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/](docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/). Migration `20260923000400`.
