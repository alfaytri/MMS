# Session Handover — 2026-08-02 (Phase E smoke in progress)

**Read this first.** Phase E code + DB migrations are **committed and staged-applied**. The last 4 commits on `feature/warehouse-model-v2` are Phase E (`3ed6f61a`, `85f0fcd5`, `4db6abae`, `a43a18be`). What remains is the smoke walk on staging, plus a small batch of follow-up fixes surfaced during that walk (uncommitted, waiting on operator "working" before commit).

## Resume prompt

Paste this in a fresh conversation:

```
I'm continuing MMS work on feature/warehouse-model-v2. Phase E migrations
and code are shipped; smoke walk is 3-of-7 flows confirmed. Four fixes
surfaced during the walk are staged locally, uncommitted. Read
HANDOVER.md, then continue from "Immediate next steps".
```

## Where we are

Phase E dropped the denormalized `division_id` column from every stock-carrying table + `warehouses.division_id`. Post-Phase-E:
- Warehouses belong to a **company**, not a division.
- Per-division stock lives in **`warehouse_sub_containers`** only.
- Division is derived per-row from `sub_container_id → warehouse_sub_containers.division_id`.

### DB — 4 migrations applied to staging `mwvblpgbgxipvrevkeff`

| File | Purpose |
|---|---|
| `20260810000100_phase_e_rpc_rewrites.sql` | Rewrites 6 RPCs (`approve_stock_adjustment_inventory`, `create_stock_adjustment_v2`, `rpc_process_return_restock`, `rpc_create_partial_replacement`, `rpc_send_damaged_for_repair`, `rpc_return_damaged_from_repair`). 3 more (`cancel_delivery_inventory`, `complete_delivery_inventory`, `create_and_approve_receival`) needed zero changes — they only read `sale_orders.division_id` / `purchase_orders.division_id` (which stay) and never stamped `division_id` on stock rows explicitly (the trigger did). |
| `20260810000200_phase_e_drop_division_scope_policies.sql` | Drops every `division_scope_*_r` RESTRICTIVE policy on 7 stock tables + `warehouses`. Parallel `sub_container_scope_*_r` policies (Phase C.3) already cover the same access surface. |
| `20260810000300_phase_e_drop_division_sync_triggers.sql` | Drops 6 sync-triggers + 4 trigger functions with `CASCADE`. Also caught a stray `trg_receivals_set_division` on `receivals`. |
| `20260810000400_phase_e_drop_division_id_columns.sql` | Drops `division_id` from `fifo_cost_layers`, `inventory_stock_movements`, `warehouse_stock_allocations`, `stock_adjustments`, `receival_items`, `warehouse_transfer_items`, `warehouse_transfers`, `warehouses`. Three of those tables never had the column — `IF EXISTS` swallowed them. |

## Phase E smoke walk — current status (3 of 7 confirmed)

| # | Flow | Status | Evidence |
|---|---|---|---|
| 1 | **DEL-00034** — same-division delivery | ✅ Verified | `cogs_entries.consumer_division_id = Kitchen`, `sub_container.division = Maintenance` (D.12 shared path preserved) |
| 2 | **DEL-00036** — post-share delivery | ✅ Verified | `consumer_division_id = Kitchen`, `sub_container.division = Kitchen` |
| 3 | **PO Receive warehouse dropdown** | ✅ Verified | Populates after the `useWarehouses` embed fix |
| 4 | **Inventory Check** (IC-2026-00005 / Birkat Alawamer / Kitchen) | ✅ Verified | Reconciliation showed count variance rows (`+33`, `-5`); Pending Approval landed on `field_rp` with no Phase-E-shaped errors |
| 5 | **PO Returns cross-division filter** | ⏳ Pending | Switch active division off PO-2026-07-004's owner → PO should disappear from `/purchase/returns` list AND New Return picker. Switch back → reappears. |
| 6 | **PO receival end-to-end** | ⏳ Pending | Receive stock into a warehouse → new `fifo_cost_layers` row with `sub_container_id`. No "column division_id does not exist" error. |
| 7 | **Stock adjustment** (create + approve) | ⏳ Pending | Sub-container picker required. Approve must not fall through to the removed `warehouses.division_id` branch. |
| 8 | **Sale return restock** | ⏳ Pending | Good-condition return → new `fifo_cost_layers` row without `division_id` column, sub-container-scoped. |
| 9 | **Send-for-repair + return-from-repair** | ⏳ Pending | Full damaged-side flow. Resulting `warehouse_transfers` row has no `division_id`. |

If any RPC raises `column division_id does not exist` or `relation warehouse_xxx has no fkey ...` — that's a Phase E miss. Paste the exact error; the fix is usually another `pg_get_functiondef` fetch + one-line delta.

## Follow-up fixes surfaced during smoke — STAGED, NOT COMMITTED

Operator noted three UI/scoping gaps during the smoke walk. All four items below were fixed in this session and are waiting on "working" before commit.

### 1. FIFO layers table — sub-container column
**Symptom:** Cost-layer expander on an inventory item showed only the warehouse name ("Birkat Alawamer Warehouse"). Operator needs to see the source sub-container too.

**Files:**
- `src/hooks/useInventory.ts` — `useFifoLayers` query extended to embed `warehouse_sub_containers:sub_container_id(name)` alongside the existing `warehouses(name)` join. `FifoLayer` type gains `sub_container_id` + `sub_container_name`. Mapper reads `row.warehouse_sub_containers?.name`.
- `src/components/services/inventory/FifoLayersTable.tsx` — Warehouse cell now renders as a two-line cell: warehouse name on top, sub-container name underneath in muted `text-[10px]`. Falls back to `—` when warehouse_name is null.

### 2. PO create cascade — filter by active division
**Symptom:** With Kitchen active, the "Category…" dropdown on `/purchase/create-po` still listed Maintenance-only items (AC Unit, Water Heater, etc.).

**Root cause:** `CascadeInventorySelector` has a `filterByActiveDivision` prop that's opt-in. It was wired on sales (`SoLineItemsEditor`, `ReplacementDeliveryDialog`) but not on purchase.

**Design rationale** for the opt-in original: POs are placed *before* stock exists, so buying for another division was historically allowed. Operator explicitly asked for the filter on PO too — POs should be scoped to the active division just like SOs.

**File:** `src/components/purchase/PoLineItemsEditor.tsx` — added `filterByActiveDivision` prop to the `<CascadeInventorySelector>` render at line ~234. Nothing else needed (the cascade already handles the filter internally via `useCascadeAccessibleItems`).

### 3. `/purchase/orders` list + stat cards — scope to active division
**Symptom:** PO-2026-07-004 (Kitchen) was visible under Maintenance on the PO list. Admin bypasses RLS so all divisions' POs surface unless the client filters.

**File:** `src/app/(dashboard)/purchase/orders/page.tsx`
- Imported `useActiveDivision`.
- `filtered` memo prepends a division predicate: `!activeDivisionId || o.division_id == null || o.division_id === activeDivisionId`. Legacy null-division POs always show; "All Divisions" shows everything.
- `stats` memo uses the same predicate so the four cards match the list below.
- Mirrors the `divisionMatchesPo` pattern from `/purchase/returns`.

### 4. PROGRESS.md + EOD updated
- PROGRESS.md `## ✅ Completed` gets a new top entry describing the four fixes + Inv Check verified. Phase E smoke ledger now records 3-of-7 flows confirmed.
- EOD-2026-08-02.md gets item #7 covering the same.

`git status` at handover:

```
 M src/app/(dashboard)/purchase/orders/page.tsx
 M src/app/(dashboard)/purchase/returns/page.tsx        [pre-existing, separate work]
 M src/components/purchase/POReturnDetailDialog.tsx     [pre-existing, separate work]
 M src/components/purchase/PoLineItemsEditor.tsx
 M src/components/purchase/PoReturnsTab.tsx             [pre-existing, separate work]
 M src/components/purchase/ReceivalFormDialog.tsx       [pre-existing, separate work]
 M src/components/sales/SaleReturnDetailDialog.tsx      [pre-existing, separate work]
 M src/components/services/inventory/FifoLayersTable.tsx
 M src/hooks/useInventory.ts
 M src/hooks/usePurchaseReturns.ts                      [pre-existing, separate work]
 M PROGRESS.md
 M EOD/EOD-2026-08-02.md
```

The 5 files tagged `[pre-existing, separate work]` were already modified when this session started — they touch returns/receival dialogs and are NOT part of Phase E or these four fixes. Leave them for their own commit.

## Immediate next steps (in order)

1. **Operator verifies the four fixes on staging:**
   - FIFO layer table shows warehouse + sub-container two-line cell.
   - PO create with Kitchen active hides Maintenance-only categories.
   - `/purchase/orders` list + stat cards collapse to active-division POs; "All Divisions" restores.
   - Inventory Check still opens and completes (regression check — the Phase E RPC touched adjustments, not IC).
2. **Walk the remaining 5 Phase E smoke flows** (rows 5–9 above). Fix any errors that surface.
3. **Commit the four fixes** — code first, PROGRESS.md + EOD alone after, per protocol:
   ```
   git add src/hooks/useInventory.ts src/components/services/inventory/FifoLayersTable.tsx \
           src/components/purchase/PoLineItemsEditor.tsx src/app/\(dashboard\)/purchase/orders/page.tsx
   git commit -m "feat(ui): FIFO sub-container column + division-scoped PO surfaces"
   git add PROGRESS.md EOD/EOD-2026-08-02.md
   git commit -m "docs: update PROGRESS.md — Phase E smoke follow-ups + Inv Check verified"
   ```
4. **Deal with the 5 pre-existing modified files** — their own review/commit, separate from Phase E.
5. **`git push origin feature/warehouse-model-v2`** once all remaining smoke flows land.
6. **Codex review** of the whole branch.
7. **PR to `main`**.
8. **Prod migration catch-up** — one big push of D.6.a → Phase E migrations after Codex clears.

## Rules to keep following

- **Commit policy:** never commit until operator confirms working.
- **PROGRESS.md protocol:** task complete → commit code, update PROGRESS + security audit, commit docs alone.
- **Function bodies from live DB:** every RPC in Mig A was sourced from `pg_get_functiondef`, not from a stale migration file.
- **Types regen:** always strip CLI stderr leaks + re-append helper aliases.
- **No browser tools / no build:** stick to typecheck + operator manual verification.
- **EOD:** append every completed task; finalize on "EOD" with blockers.

## Deferred / parked

- **D.6.b prod migration catch-up** — staging is many migrations ahead of prod: D.6.a/D.6.b, D.7, D.8, D.9, D.10, D.11, D.13, D.12 (3 migs), D.14 (1 mig), Phase E (4 migs). Push as one operation after Codex clears.
- **Codex review of the whole `feature/warehouse-model-v2` branch** — many commits ahead of origin at push time.
- **Pre-existing tsc errors** — 3 baseline errors (2 `InventoryCheck` casts at `useWarehouseOperations.ts:892,1214`; 1 `arabic-names.ts:34` cast). Every Phase-E-caused error was fixed; these three predate the phase.
- **Follow-up UX polish** — the cascade picker's "N in stock" chip on the SO create page still shows tenant-wide stock, not per-division. Consider a division-scoped stock hint in a later phase.
- **`useDamagedMovements` dead export** in `useDamagedStockOverview.ts`.
- **URL sync** for the damaged-stock page's `stream=damaged` deep link.
- **Flow Visualizer polish.**

## Session recap so far

Shipped end-to-end on `feature/warehouse-model-v2` this session:

1. **D.12 Tasks 1–5** — sharing metadata, master-list filter chips, cascade division filter, "Shared from" chips, COGS consumer-division routing. Verified on DEL-00033.
2. **UI polish pair** — number-input spinner strip + credit-only partial payments (commit `6ea98b9f`).
3. **D.14 Bulk Excel import** — exceljs writer with dropdowns, variable-depth category columns, routing defaults stamped on import (commits `a417720f`, `a74519b6`, `dfc37832`).
4. **Phase E** — 4 migrations applied, 6 RPCs rewritten, 8 code files updated. Committed in `3ed6f61a` + `85f0fcd5` + `4db6abae` + `a43a18be`.
5. **Phase E smoke follow-ups** — 4 fixes staged (this file, section above). Waiting on operator confirm.

Branch is many commits ahead of `origin/feature/warehouse-model-v2` (last push `de81570d`, current HEAD `a43a18be` + 4 uncommitted follow-up fixes on top). Push once all 7 smoke flows land.

---

Phase E's last mile: 5 more smoke walks, 1 commit for the follow-up fixes, 1 commit for docs, then push. Then the whole `feature/warehouse-model-v2` branch is ready for Codex + PR to `main`.
