# Session Handover — 2026-08-02 (Phase E in flight)

**Read this first.** Phase E (drop legacy `division_id` on stock tables + `warehouses.division_id`) is nearly done. All four migrations are **applied to staging**, all code changes are **staged locally but NOT committed** (per commit-only-on-confirmation policy). Operator verified two flows end-to-end (DEL-00034 same-division + DEL-00036 D.12 cross-division shared) and confirmed the PO Receive warehouse dropdown works after the PostgREST embed fix. **Four flows still pending smoke test** before commit + push.

## Resume prompt

Paste this in a fresh conversation:

```
I'm continuing MMS work on feature/warehouse-model-v2. Phase E is
mid-flight — migrations applied to staging, code staged, 2 flows
verified, 4 more to walk. Read HANDOVER.md, then continue from
the "Immediate next steps" section.
```

## Where we are

Phase E is the design's final cleanup: drops the denormalized `division_id` column from every stock-carrying table + `warehouses.division_id` itself. Post-Phase-E:
- Warehouses belong to a **company**, not a division.
- Per-division stock lives in **`warehouse_sub_containers`** only.
- Division is derived per-row from `sub_container_id → warehouse_sub_containers.division_id`.

### DB — 4 migrations applied to staging `mwvblpgbgxipvrevkeff` (do NOT re-run)

| File | Purpose |
|---|---|
| `20260810000100_phase_e_rpc_rewrites.sql` | Rewrites 6 of 9 RPCs surfaced by the sweep. 3 more (`cancel_delivery_inventory`, `complete_delivery_inventory`, `create_and_approve_receival`) needed zero changes — they only read `sale_orders.division_id` / `purchase_orders.division_id` (which stay) and never stamped `division_id` on stock rows explicitly (the trigger did). |
| `20260810000200_phase_e_drop_division_scope_policies.sql` | Drops every `division_scope_*_r` RESTRICTIVE policy on the 7 stock tables + `warehouses` itself. Parallel `sub_container_scope_*_r` policies (Phase C.3) already cover the same access surface. On `warehouses`, permissive `Internal users can (view|insert|update|delete)` policies (all `true`) remain — a net-loosening for writes, matches design intent. |
| `20260810000300_phase_e_drop_division_sync_triggers.sql` | Drops 6 sync-triggers + 4 trigger functions with `CASCADE`. Also caught a stray `trg_receivals_set_division` on `receivals` (surfaced during first apply attempt). |
| `20260810000400_phase_e_drop_division_id_columns.sql` | Drops `division_id` from `fifo_cost_layers`, `inventory_stock_movements`, `warehouse_stock_allocations`, `stock_adjustments`, `receival_items`, `warehouse_transfer_items`, `warehouse_transfers`, `warehouses`. Three tables (`warehouse_stock_allocations`, `stock_adjustments`, `warehouse_transfer_items`) turned out to never have had the column — the `IF EXISTS` swallowed those. |

### 6 RPC rewrites (surgical, no behavior change beyond removing division_id touches)

1. **`approve_stock_adjustment_inventory`** — dead-code `warehouses.division_id` fallback removed; adjustments always ship with sub_container_id post-D.4.
2. **`create_stock_adjustment_v2`** — same fallback removed; `p_sub_container_id` now required.
3. **`rpc_process_return_restock`** — dropped the 3rd-level warehouse-based fallback in the division cascade + removed `division_id` from the `INSERT INTO fifo_cost_layers`.
4. **`rpc_create_partial_replacement`** — same 3rd-level cascade drop.
5. **`rpc_send_damaged_for_repair`** — derives source division from `return_line → so_po_returns.division_id` instead of `warehouses.division_id`. Removed `division_id` from `INSERT INTO warehouse_transfers`.
6. **`rpc_return_damaged_from_repair`** — derives destination division via the disposition's return chain. Removed `division_id` from both `INSERT INTO warehouse_transfers` branches (good + writeoff).

### App-side — staged locally, NOT committed

`git status` at handover:

```
 M src/app/(dashboard)/purchase/returns/page.tsx
 M src/app/api/warehouse/reports/route.ts
 M src/components/providers/DivisionProvider.tsx
 M src/components/purchase/wh/WhWarehousesTab.tsx
 M src/components/warehouse/SendForRepairDialog.tsx
 M src/hooks/useRepairVendors.ts
 M src/hooks/useReturnLineSources.ts
 M src/hooks/useSendDamagedForRepair.ts
 M src/hooks/useWarehouses.ts
 M src/types/database.types.ts
?? supabase/migrations/20260810000100_phase_e_rpc_rewrites.sql
?? supabase/migrations/20260810000200_phase_e_drop_division_scope_policies.sql
?? supabase/migrations/20260810000300_phase_e_drop_division_sync_triggers.sql
?? supabase/migrations/20260810000400_phase_e_drop_division_id_columns.sql
```

**File-by-file:**

- **`src/hooks/useWarehouses.ts`** — Two changes:
  1. Removed the `company_divisions(name)` embed from the SELECT. It relied on the `warehouses.division_id → company_divisions.id` FK which Phase E dropped, so PostgREST 400s. `division_name` on the returned type is now always `null` — every consumer of it already falls through to null-safe rendering.
  2. Made the `warehouse_sub_container_totals` breakdown fetch non-fatal — the whole warehouse list used to disappear if that view errored, killing the PO Receive dropdown. Now it degrades to empty breakdowns with a console warning.
- **`src/hooks/useReturnLineSources.ts`** — dropped the `warehouses.division_id` fallback in the display-label chain. When we don't have a fallback division we now pick any active sub of the warehouse — best-effort label; write-side correctness lives in the RPC.
- **`src/app/api/warehouse/reports/route.ts`** — derives `resolvedDivisionId` from any active sub-container of the picked warehouse (was: `warehouses.division_id`).
- **`src/app/(dashboard)/purchase/returns/page.tsx`** — **Feature, not just a Phase-E fix.** Filters both the existing-returns list AND the "Purchase Order" picker in the New Return dialog by active-division match on the PO's `division_id`. Pre-fix, cross-division POs rendered but their detail fetches errored under RLS. Adds `useActiveDivision` + `divisionMatchesPo` helper. Stats memo also honors the filter.
- **`src/hooks/useSendDamagedForRepair.ts`** — `p_notes` payload switched from `?? null` to `?? undefined` (regen tightened the RPC arg type).
- **`src/components/providers/DivisionProvider.tsx`** — two `set_active_division` RPC calls cast `null`/`string | null` to `string` (regen tightened the arg type).
- **`src/components/purchase/wh/WhWarehousesTab.tsx`** — `Select.onValueChange` handler guards against `null` (base-ui type widened).
- **`src/components/warehouse/SendForRepairDialog.tsx`** — same `onValueChange` guard.
- **`src/hooks/useRepairVendors.ts`** — insert payload cast because the D.6.b trigger stamps `sub_container_id` on the row but the Insert type treats it as required.
- **`src/types/database.types.ts`** — regen'd; 4 division_id FKs vanished (verified via `grep -c "*_division_id_fkey"`).

## What's NOT done — the smoke loop

Operator has verified:
- ✅ **DEL-00034** — same-division delivery. `cogs_entries.consumer_division_id = Kitchen`, `sub_container.division = Maintenance` (D.12 cross-division shared path preserved).
- ✅ **DEL-00036** — post-share delivery. `consumer_division_id = Kitchen`, `sub_container.division = Kitchen`.
- ✅ **PO Receive warehouse dropdown** — populates after the embed fix.

Operator still to walk (per the D.4-style smoke checklist):

1. **PO Returns cross-division filter** — switch active division to one that doesn't own PO-2026-07-004 → PO should not appear on `/purchase/returns` (list + picker). Switch back → reappears.
2. **PO receival end-to-end** — receive into a warehouse → `fifo_cost_layers` gets the new row with `sub_container_id`, no "column division_id does not exist" error.
3. **Stock adjustment** — create + approve. Sub-container picker required; adjustment stamps `sub_container_id`. Approve should not fall through to the removed `warehouses.division_id` branch.
4. **Sale return restock** — Good-condition return → new `fifo_cost_layers` row without `division_id` column, sub-container-scoped.
5. **Send-for-repair + return-from-repair** — full damaged-side flow. `warehouse_transfers` row no longer has `division_id`.

If any RPC raises "column division_id does not exist" or "relation warehouse_xxx has no fkey ..." — that's a Phase E miss. Paste the exact error text; the fix is usually another `pg_get_functiondef` fetch + one-line delta.

## Immediate next steps (in order)

1. **Walk the remaining 5 flows above on staging.** Fix any errors that surface before proceeding.
2. **Commit + push in two batches:**
   - Code + migrations: `git add supabase/migrations/2026081000010{0,200,300,400}_phase_e_*.sql src/hooks/*.ts src/components/*.tsx src/app/**/*.tsx src/app/**/*.ts src/types/database.types.ts` → single commit `feat(db): Phase E — drop legacy division_id from stock tables + warehouses`. Include both co-authors.
   - PROGRESS.md separately, per protocol: move the D.14 wrap-up In Progress row to Completed, add a Phase E entry + security-audit row, set In Progress to "Codex review + PR to `main`". Commit alone.
3. **Append to EOD-2026-08-02.md** as item #7 (D.14 was #6).
4. **Refresh HANDOVER.md.**
5. **`git push origin feature/warehouse-model-v2`**.

## Rules to keep following

- **Commit policy:** never commit until operator confirms working. Phase E is 2 of 6 flows confirmed.
- **PROGRESS.md protocol:** task complete → commit code, update PROGRESS + security audit, commit docs alone.
- **Function bodies from live DB:** every RPC in Mig A was sourced from `pg_get_functiondef`, not from a stale migration file, per `feedback_rewrite_functions_from_live_db`.
- **Types regen:** always strip CLI stderr leaks + re-append helper aliases.
- **No browser tools / no build:** stick to typecheck + operator manual verification.
- **EOD:** append every completed task; finalize on "EOD" with blockers.

## Deferred / parked (unchanged)

- **D.6.b prod migration catch-up** — staging is many migrations ahead of prod: D.6.a/D.6.b, D.7, D.8, D.9, D.10, D.11, D.13, D.12 (3 migs), D.14 (1 mig), Phase E (4 migs). Plan the push as one operation after Codex clears the branch.
- **Codex review of the whole `feature/warehouse-model-v2` branch** — 80+ commits ahead of origin at push time.
- **Pre-existing tsc errors** — 3 baseline errors (2 `InventoryCheck` casts at `useWarehouseOperations.ts:892,1214`; 1 `arabic-names.ts:34` cast). Every Phase E-caused error was fixed; these three predate the phase.
- **Follow-up UX polish** — the cascade picker's "N in stock" chip on the SO create page shows `stock_level - reserved_qty` tenant-wide, not per-division. Different concern from Phase E; consider a division-scoped stock hint in a later phase.
- **`useDamagedMovements` dead export** in `useDamagedStockOverview.ts`.
- **URL sync** for the damaged-stock page's `stream=damaged` deep link.
- **Flow Visualizer polish.**

## Full session recap (2026-08-02 into overnight)

Shipped end-to-end this session:

1. **D.12 Tasks 1–5 wrap-up.** Task 5 (COGS routing to consumer division) verified on DEL-00033 (Kitchen consumes Maintenance shared stock via Birkat) — commits `d627bba9` + `fbdbf58b`.
2. **UI polish pair.** Strip number-input spinners globally + accept credit-only partial payments (`Amount = 0` when store credit contributes) — commit `6ea98b9f`.
3. **D.14 Bulk Excel import.** exceljs writer with in-cell dropdowns for Type/Unit/Warehouse-Sub-container composites, variable-depth Category N columns, advisory dropdowns on categories (accept free text for new ones), `inventory_items.default_sub_container_id` + `default_warehouse_id` stamped on import — commits `a417720f` + `a74519b6` + `dfc37832`.
4. **Phase E** — this session's finale. All migrations applied, all code staged. Two flows verified, four pending smoke.

Branch is many commits ahead of `origin/feature/warehouse-model-v2` (last push landed `de81570d`, current HEAD `dfc37832`, plus uncommitted Phase E on top). Push once Phase E's smoke completes.

---

Phase E's last mile: 5 smoke walks, 2 commits, 1 push. Then the whole `feature/warehouse-model-v2` branch is ready for Codex + PR to `main`.
