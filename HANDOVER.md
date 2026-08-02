# Session Handover — 2026-08-02 (D.12 wrap-up)

**Read this first.** Phase D.12 is fully shipped on `feature/warehouse-model-v2` — all five tasks (metadata + item-edit sharing, master-list chips, cascade division-filter, Shared-from chip, COGS routing to consumer division) are committed. Staging is caught up. **Nothing is left to build for D.12.** What's left is: (1) a same-division delivery regression sweep, (2) Codex review of the D.12 diff as one batch, (3) push branch + PR to `main`, (4) prod migration catch-up.

## Resume prompt

Paste this in a fresh conversation:

```
I'm continuing MMS work on feature/warehouse-model-v2.
Read HANDOVER.md, then PROGRESS.md. D.12 is fully shipped and verified on
staging. Next: (1) run a same-division delivery regression sweep to make
sure the pre-D.12 flow still works, (2) send the D.12 diff to Codex for a
single-batch review, (3) push the branch and open a PR to main, (4) plan
the prod migration catch-up (D.6–D.11 + D.12's three migrations still
behind on prod).
```

## What shipped today

D.12 was closed end-to-end this session. Commits on `feature/warehouse-model-v2`:

| Commit | Task | Summary |
|---|---|---|
| `a7fe1530` | D.12 T2 | master-list filter chips (`useItemDivisionMembership` + chip row + tree prune) |
| `aea22ad3` | D.12 T3 | cascade picker division-aware filter + Create-SO/PO Division mirror |
| `7308ed28` | D.12 T4 | Shared-from chip in cascade picker (item + variant rows) |
| `d627bba9` | D.12 T5 | COGS routing to consumer division — 3 migrations + app-side dialogs + hooks |
| `6ea98b9f` | polish | strip number-input spinners; allow credit-only partial payments |
| `de8b8132` / `dbdba508` / `00a96b46` / `fbdbf58` | docs | PROGRESS.md updates per protocol |

### T5 verification anchor — DEL-00033 on staging

Kitchen SO-00019 consumed Maintenance's shared Split AC via Birkat Alawamer Warehouse. `cogs_entries` row confirmed:

- `consumer_division_id = Kitchen` ✓ (SO's division — where the P&L books)
- `division_id = Kitchen` ✓ (legacy column, trigger-mirrored — existing reports keep working)
- `source_id → fifo_cost_layers.sub_container_id → warehouse_sub_containers.division_id = Maintenance` ✓ (physical trace preserved)

If any of those come back different on a later delivery, the trigger or the RPC has regressed.

## What's left before the branch merges to main

### 1. Same-division / non-shared delivery regression sweep

Pick any pending SO on a division whose item is NOT shared. Create + complete the delivery. Confirm:
- Sub-container picker still auto-selects the SO division's own sub-container.
- `cogs_entries.consumer_division_id` equals the SO's division (should always — no code path leaves it null on new inserts).
- The unshared-item cross-division guard still raises when you try to deliver from a wrong-division sub-container for an item that's NOT shared.

### 2. Codex review — D.12 as one batch

Run Codex against the full D.12 diff on this branch (Tasks 1–5). The three migrations from T5 add DB-level surface — pay attention to:
- `complete_delivery_inventory`'s cross-division guard (only relaxes when EVERY delivered line's item is shared to SO's division — the `count(*) FILTER (WHERE NOT is_shared)` pattern).
- The two `SECURITY DEFINER` RPCs (`get_warehouse_names`, `get_warehouse_sub_containers`) — confirm `search_path = public, pg_catalog` and no credential leak in the return payload.
- The mirror trigger `set_consumer_division_from_sale_order` — should stamp on INSERT only, not on every UPDATE.

### 3. Push + PR

```bash
git push -u origin feature/warehouse-model-v2
gh pr create --title "feat(sales): Phase D.12 — cross-division sharing + COGS routing to consumer division" --body …
```

Branch is many commits ahead of origin — first push will be large.

### 4. Prod migration catch-up

Staging is fully caught up. Prod is behind on D.6–D.11 *and* now D.12's three new migrations:

- `20260802000800_phase_d12_cogs_consumer_division.sql`
- `20260802000900_phase_d12_get_warehouse_names_rpc.sql`
- `20260802001000_phase_d12_sub_container_lookup_and_create_delivery.sql`

Plan the migration push as one operation once D.6–D.13 have had their agreed-upon soak period on staging and Codex has cleared the batch.

## Rules to keep following

- **Commit policy:** never commit until operator confirms working.
- **PROGRESS.md protocol:** task complete → commit code, update PROGRESS + security audit, commit docs alone.
- **Types regen:** always strip CLI stderr leaks (top AND bottom) before re-appending the DBTable / DBInsert / DBUpdate / AllTables helper aliases.
- **Dropdown UUID guard:** never render raw UUIDs — always resolve to a name. `get_warehouse_names` + `get_warehouse_sub_containers` RPCs are the cross-division resolution pattern.
- **No browser tools:** never test UI via browser MCP — ask operator to check manually.
- **No build:** don't run `next build` unless explicitly asked.
- **EOD daily rule:** append each completed task to `EOD/EOD-YYYY-MM-DD.md`.

## Deferred / parked

- **Phase E** (drop legacy `division_id` on stock tables + `warehouses.division_id`) — deferred multi-week per plan doc, needs operator confirmation of D.6–D.13 in production.
- **Pre-existing tsc errors sweep** — 2 remaining `InventoryCheck` cast errors in `useWarehouseOperations.ts` at lines 892 and 1214 (unrelated to any active phase). Sweep together with the D.8 backlog.
- **`useDamagedMovements` dead export** in `useDamagedStockOverview.ts`.
- **URL sync** for the damaged-stock page's `stream=damaged` deep link.
- **Flow Visualizer polish.**

---

D.12 shipped. Branch is ready for review + PR.
