# Session Handover — 2026-08-01

**Read this first.** You are resuming mid-phase on `feature/warehouse-model-v2`. Session ended after **D.12 Task 1** shipped; Tasks 2–5 are queued.

## Resume prompt

Paste this in a fresh conversation:

```
I'm continuing MMS development on feature/warehouse-model-v2.
Read HANDOVER.md, then PROGRESS.md, then start D.12 Task 2 following the mandatory PROGRESS.md update protocol.
```

## What's done and where

### D.12 Task 1 ✅ shipped this session — commit `df988771`

**DB (migration `20260801500000_phase_d12_item_sharing_column.sql`, applied to remote `wkmvjxxmzstsvahuiwsz`):**
- `inventory_items.shared_with_division_ids uuid[] NOT NULL DEFAULT '{}'`
- GIN index `idx_inventory_items_shared_with_division_ids` for future `@>` filter
- NO RLS change. Items are already globally visible; the consumption gate lives on stock-table RLS and stays untouched until Task 3

**Hook (new) — [`src/hooks/useItemStockByDivision.ts`](src/hooks/useItemStockByDivision.ts):**
- Given `itemId`, fetches the item's brand variants, aggregates `warehouse_stock_summary.qty` per division via `warehouse_sub_containers.division_id`
- Returns `Map<division_id, total_qty>`
- Used only by the item-edit dialog today; Task 3 will need similar logic in the cascade picker

**UI — [`src/components/services/inventory/ItemEditDialog.tsx`](src/components/services/inventory/ItemEditDialog.tsx):**
- New collapsible "Access & Sharing" section below Attributes chips
- Default collapsed unless the item already has shares
- Per-division rendering by state:
  - Owner (has stock > 0) → passive green row `Owned · N`, no checkbox
  - Non-owner ticked → checkbox + `Shared` orange badge
  - Non-owner unticked → checkbox + `no stock` grey text
- Payload flows through the existing `useUpdateInventoryItem` mutation (types regen picked up the new column, `shared_with_division_ids` passes through cleanly)

**Types file:** regenerated + DBTable/DBInsert/DBUpdate/AllTables helper aliases re-appended per the standing rule (CLI wipes them on every regen).

**Explicit non-goals of Task 1** (operator agreed after seeing that sharing has no consumption effect yet):
- Sales cascade filter — Task 3
- Master-list filter chips — Task 2
- Shared-from badge — Task 4
- COGS routing — Task 5

## What's next — Task 2 through Task 5

**Do them one at a time, commit between each, wait for user confirmation before starting the next.**

### D.12 Task 2 — Master-list filter chips

**Files:**
- Read: [`src/app/(dashboard)/master-data/inventory/page.tsx`](src/app/(dashboard)/master-data/inventory/page.tsx)
- Read: [`src/components/services/inventory/ItemsListView.tsx`](src/components/services/inventory/ItemsListView.tsx)
- Read: [`src/components/providers/DivisionProvider.tsx`](src/components/providers/DivisionProvider.tsx) — needs `activeDivisionId` to compute "Shared with me"

**Add:**
- Chip row on top of the item list: `All | Owned by my division | Shared with me | Shared by my division`
- `Owned by my division` — items where the active division has stock (join through `warehouse_stock_summary`)
- `Shared with me` — items where `shared_with_division_ids @> ARRAY[active_division_id]` AND active division does NOT own stock (i.e. only accessible via share)
- `Shared by my division` — items where the active division owns stock AND `shared_with_division_ids` is non-empty

**Sizing:** ~1 hook + 1 UI. Half session.

### D.12 Task 3 — Cascade picker division-aware filter

**Files:**
- Read: [`src/components/purchase/CascadeInventorySelector.tsx`](src/components/purchase/CascadeInventorySelector.tsx) — check whether sales uses the same component
- Read: [`src/app/(dashboard)/sales/create-so/page.tsx`](src/app/(dashboard)/sales/create-so/page.tsx) or wherever the SO cascade lives
- Read: `useInventoryTree` in [`src/hooks/useInventoryTree.ts`](src/hooks/useInventoryTree.ts) — this feeds the category tree

**Change:**
- Cascade query filters items to those where **EITHER** (a) active division owns stock via a sub-container OR (b) item's `shared_with_division_ids @> ARRAY[active_division_id]` AND the item has stock somewhere
- Categories with no matching items get hidden (recursive collapse)
- Do NOT change RLS on stock tables in this task — filter client-side in the cascade query; if the caller has RLS to see the stock and the item is either owned or shared, include it

**This is the biggest of the four remaining tasks.** ~1 full session.

### D.12 Task 4 — Shared-from chip in cascade

**Files:**
- Same cascade selector file as Task 3
- Also the brand-variant / item detail rows within the picker

**Add:**
- Small chip next to shared items: `Shared from Maintenance` (division name comes from the sub-container that holds the stock)
- If the item has stock in multiple divisions (e.g. Kitchen has 3 + Maintenance shares 47), show BOTH pools as separate rows in the picker with per-division qty + chip

**Sizing:** small UI change. ~half session.

### D.12 Task 5 — COGS routing

**Files:**
- [`src/hooks/useSaleDeliveries.ts`](src/hooks/useSaleDeliveries.ts) — `useCompleteDelivery`
- `complete_delivery_inventory` RPC in `supabase/migrations/` — search for the most recent version
- `cogs_entries` table shape — check baseline
- `deduct_fifo_layers` RPC

**Change:**
- When Kitchen sells and the FIFO deduction pulls from Maintenance's sub-container, book the cogs_entry to Kitchen (consumer) not Maintenance (owner)
- Cleanest way: add `consumer_division_id` column to `cogs_entries` that defaults to the sub-container's division but can be overridden by the caller
- Complete-delivery RPC passes the SO's division as `consumer_division_id`
- Reports read from `consumer_division_id` for P&L split; `warehouse_sub_containers.division_id` still shows physical location

**This needs careful accounting review before shipping.** Operator explicitly asked for "COGS to Trading" earlier — this is the implementation.

**Sizing:** 1–2 sessions. The RPC change + downstream report queries + tests.

## Key files (for orientation)

| Concern | File |
|---|---|
| Item schema | `supabase/migrations/20240101000000_baseline_schema.sql:8810` |
| D.12 migration | `supabase/migrations/20260801500000_phase_d12_item_sharing_column.sql` |
| Item-edit dialog | `src/components/services/inventory/ItemEditDialog.tsx` |
| Item CRUD hooks | `src/hooks/useInventory.ts` |
| Stock summary (RLS-scoped) | `warehouse_stock_summary` table + `warehouse_stock_view` view |
| Division-scoped stock RLS | `is_sub_container_visible()` helper |
| Cascade picker | `src/components/purchase/CascadeInventorySelector.tsx` |
| Active division | `src/components/providers/DivisionProvider.tsx` + `useActiveDivision` hook |

## Rules to keep following (from CLAUDE.md + memory)

- **Commit policy:** never commit until user confirms working
- **PROGRESS.md protocol:** on task start → update `🔄 In Progress`, commit PROGRESS alone. On task complete → commit code, update PROGRESS+security-audit-log, commit docs alone. See CLAUDE.md.
- **Types regen:** after `supabase gen types`, re-append `DBTable/DBInsert/DBUpdate/AllTables` helper aliases (CLI wipes them)
- **Dropdown UUID guard:** never render raw UUIDs — always resolve to a name
- **Side-by-side dropdowns:** hierarchical selects render side-by-side, never as flyout submenus
- **No browser tools:** never test UI via browser MCP — ask user to check manually
- **No build:** don't run `next build` unless explicitly asked
- **EOD daily rule:** append each task to `EOD/EOD-YYYY-MM-DD.md` after completion
- **Memory:** read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md` at start of every session

## Full session recap (2026-08-01)

Shipped end-to-end:

1. **D.8** — category → sub-container default routing
2. **D.10** — Stock Overview/Value composite keys + two-level tooltips
3. **D.6.b cleanup** — retire archived repair warehouses via repoint-and-delete
4. **D.11** — Damaged Stock source sub-container on all three tabs
5. **D.13** — unify damaged movements into Warehouses → Movements + drop separate Movements tab
6. **Flow Visualizer Phase A** — 103 flows in a self-contained `docs/flows-visualizer.html`
7. **Flow Visualizer Phase B** — 5 static example fixtures with input/writes/UI-after
8. **D.12 Task 1** — cross-division item sharing metadata + item-edit "Access & Sharing" section (this handover picks up here)

Branch is 60+ commits ahead of `origin/feature/warehouse-model-v2`. No PR yet; user has been operating in a long-running feature branch. Continue on same branch unless instructed.

## When Task 5 (or the whole D.12) is done

Consider proposing:
- Codex review of the whole D.12 phase
- User E2E verification session (cross-division sale, cross-division P&L check)
- Then push + open PR to `main`

## Parked / deferred

- **Phase E** (drop legacy `division_id` on stock tables + `warehouses.division_id`) — deferred multi-week per plan doc, needs operator confirmation of D.6–D.13 in production
- **Pre-existing tsc errors sweep** — 7 files (DivisionProvider, WhWarehousesTab, SendForRepairDialog, useRepairVendors, useSendDamagedForRepair, useWarehouseOperations, arabic-names) — surfaced when D.8's types regen cleaned up a stale banner line; unrelated to any active phase
- **URL sync** for the damaged-stock page's "View damaged movements" deep link so it pre-selects Stream=Damaged
- **Dead code:** `useDamagedMovements` hook in `useDamagedStockOverview.ts` — no callers after D.13
- **Flow Visualizer polish:** tighten the table-extractor noise filter (some enum values render as tables); author more fixtures in `docs/flow-examples.json`

---

Good luck. This is a good stopping point — Task 1 is complete on its own, the rest can be shipped incrementally at any pace.
