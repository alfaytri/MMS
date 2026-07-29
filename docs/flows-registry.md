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
- **Downstream side-effects:** CN starts in `issued` status; `so_po_returns.credit_note_id` linked.
- **Related flows:** [[Record Return Refund]], [[Record Return Store Credit]]

### Create Partial Replacement (customer + inventory atomic)

- **Module:** Sales
- **Status:** Active — Phase 7.2 rewrite
- **Trigger surface(s):** `SoDetailDialog` → Returns tab → **Resolve Remaining** / **Book Dispositions** button on any restocked return.
- **Primary hook(s):** [`useCreateReplacementDelivery`](src/hooks/useSaleDeliveries.ts)
- **RPC(s):** `rpc_create_partial_replacement(p_return_id, p_warehouse_id, p_lines, p_gift_items, p_dispositions)`
- **Ledger writes:** `sale_deliveries` (`type='replacement'`) + `sale_delivery_lines` + `return_line_customer_resolutions` (type=replacement) + optional `return_line_inventory_dispositions` (from `p_dispositions`) + `inventory_stock_movements` (`sale_return_damaged` for write-offs). All atomic — a disposition failure rolls back the delivery.
- **Downstream side-effects:** `_maybe_close_return` closes only when BOTH `customer_remaining` and `inventory_remaining` reach 0.
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
- **Downstream side-effects:** `_maybe_close_return` may terminal-transition the return.
- **Related flows:** [[Record Return Store Credit]], [[Create Partial Replacement (customer + inventory atomic)]]

### Record Return Store Credit

- **Module:** Sales / Finance
- **Status:** Active — Phase 7.2 rewrite
- **Trigger surface(s):** `CreditDebitNoteDetailDialog` → **Store Credit** button → qty picker → Record Store Credit.
- **Primary hook(s):** [`useResolveCreditNoteStoreCredit`](src/hooks/useCreditNotes.ts) → internal `resolveCreditNoteViaLedger`
- **RPC(s):** `rpc_record_return_store_credit(p_return_id, p_lines)`
- **Ledger writes:** `return_line_customer_resolutions` (type=store_credit) via `_record_customer_resolution`. Also adds to the customer's credit balance.
- **Related flows:** [[Record Return Refund]]

### Record Inventory Disposition

- **Module:** Sales / Inventory
- **Status:** Active — Phase 7.2 new action
- **Trigger surface(s):** `ReplacementDeliveryDialog` (dispositions-only submit — no replacement lines).
- **Primary hook(s):** [`useRecordInventoryDisposition`](src/hooks/useSaleDeliveries.ts)
- **RPC(s):** `rpc_record_inventory_disposition(p_return_id, p_warehouse_id, p_dispositions)`
- **Ledger writes:** For each `{return_line_id, type='write_off', qty}` entry: `inventory_stock_movements(movement_type='sale_return_damaged')` + `return_line_inventory_dispositions` via `_record_inventory_disposition`. `restock_as_damaged` (Phase 8) and `send_for_repair` (Phase 9) raise "not yet implemented".
- **Guards / preconditions:** Return_line must be `condition='damaged'`; qty ≤ `inventory_remaining_qty`.
- **Related flows:** [[Create Partial Replacement (customer + inventory atomic)]], [[Write Off Damaged Return (compat wrapper)]]

### Write Off Damaged Return (compat wrapper)

- **Module:** Sales / Inventory
- **Status:** Active — thin backward-compat wrapper (Phase 6 signature preserved)
- **Trigger surface(s):** None in Phase 7 UI. Kept only for callers not yet migrated to `useRecordInventoryDisposition`.
- **Primary hook(s):** [`useWriteOffDamagedReturn`](src/hooks/useSaleDeliveries.ts)
- **RPC(s):** `rpc_write_off_return_damaged(p_return_id, p_warehouse_id)` — server-side delegates to [[Record Inventory Disposition]] with all remaining damaged qty → write_off.
- **Deprecation plan:** Drop in Phase 8 cleanup along with the legacy `return_line_resolutions` table + bridge trigger.

---

## Cross-flow patterns

- **Ledger closure:** `_maybe_close_return(return_id)` is called at the end of every customer-ledger and inventory-ledger write. Do not duplicate closure logic in the UI.
- **Recorders vs actions:** `_record_customer_resolution` / `_record_inventory_disposition` are internal (`service_role` only). Never call from client code — always go through a public action wrapper.
- **RPC transactionality:** Every action wrapper is atomic — either every ledger write in the call succeeds or the whole transaction rolls back. Do not chain multiple wrappers client-side when one wrapper already covers the multi-write case (see [[Create Partial Replacement (customer + inventory atomic)]] vs the retired "delivery + then write-off" split).
- **Backward-compat window:** During Phase 7 the bridge trigger `trg_bridge_legacy_resolution_to_dual_ledger` mirrors any legacy `return_line_resolutions` insert into the new tables. Once Phase 8 drops the legacy table, drop the trigger too.

---

## Placeholder — other modules

Fill these in as their flows are touched:

- **Purchase Orders** — PO lifecycle (draft → approved → dispatched → received), RFQ merge, LC allocation, PO amendment
- **Inventory Receivals** — carve-out receival, new-stock receival, landed cost attachment
- **Warehouse Transfers** — issue → in-transit → received
- **Sales Deliveries** — partial delivery, confirm delivery, cancel delivery
- **Payments / Invoices** — record payment, split invoice, credit-note application
- **Contact Centre** — Wati inbound, 3CX call log, task creation, priority queue

Do not remove these rows without filling them in.
