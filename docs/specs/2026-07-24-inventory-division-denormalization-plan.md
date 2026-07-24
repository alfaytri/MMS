# Inventory division denormalization (Option B)

**Status:** planning
**Date:** 2026-07-24
**Blocks:** per-division inventory reports, per-division RLS, per-division valuation, division-scoped audit trails

## Goal

Every stock / costing / movement row in the DB carries a `division_id` — no more `JOIN warehouses` in every report just to know which division the row belongs to. Enables:

- Per-division RLS policies (a user in Trading can't read Maintenance movements)
- Fast per-division valuation reports (single-table scan, no join)
- Cleaner audit trails ("show all inventory movements for Maintenance last month")
- Consistent shape for the rest of the codebase (orders, invoices, bills already carry division_id — inventory now matches)

## Scope — 6 tables get `division_id`

| Table | Source of truth for its `division_id` | Nullable? |
|---|---|---|
| `receivals` | `warehouse_id → warehouses.division_id` | Yes (nullable at first — some historical rows might not resolve) |
| `receival_items` | `receival_id → receivals.division_id` | Yes |
| `fifo_cost_layers` | `warehouse_id → warehouses.division_id` | Yes |
| `inventory_stock_movements` | `warehouse_id → warehouses.division_id` | Yes |
| `cogs_entries` | `sale_order_id → sale_orders.division_id` (COGS has no warehouse column) | Yes |
| `warehouse_transfers` | `from_warehouse_id → warehouses.division_id` (convention: "from" division owns the transfer) | Yes |

**Not in scope:**
- `inventory_items`, `inventory_item_brand_variants`, `inventory_categories` — the *catalog* stays cross-division. One SKU serves every division. If you ever need division-scoped catalog, that's Option C (separate plan).

## Design decisions (locked in before coding)

| Decision | Choice | Alternative rejected |
|---|---|---|
| Population method | **BEFORE INSERT trigger** that auto-derives from the source table (warehouse_id → warehouse.division_id, etc.) | Update ~10 RPCs by hand — error-prone, easy to miss one |
| Nullable at first | **Yes** — start `NULL`, backfill, then tighten to NOT NULL in a follow-up | NOT NULL immediately — would break the trigger's failure mode |
| RLS in this plan? | **No** — this plan only prepares the columns. RLS policies are a separate migration once every row has division_id | Bundling — high blast radius, hard to roll back |
| Warehouse transfer convention | `division_id = from_warehouse.division_id` | `to_warehouse.division_id` — for a Trading→Maintenance transfer, "from" wins; the row logically belongs to the source division that's giving stock away |
| Cross-division transfers | Allowed today; keep allowed | Blocking them via CHECK — out of scope, needs business decision |
| Backfill | Included in Phase 1 migration itself (idempotent, single txn) | Separate manual step — risk of forgetting |
| Existing view/RLS breakage | None expected — adding a nullable column is additive | — |

## Phases

Each phase = one migration file. Applied and smoke-tested independently.

### Phase 1 — Add columns + triggers + backfill — ~1 hr

**Migration:** `20260724260000_inventory_add_division_id_and_triggers.sql`

- Add `division_id UUID NULL REFERENCES company_divisions(id)` to all 6 tables
- Add index `(division_id)` on each (partial `WHERE division_id IS NOT NULL` if we want to skip nulls)
- Create 6 trigger functions (one per table), each derives division_id from the appropriate source column
- Attach 6 `BEFORE INSERT` triggers
- Backfill existing rows in the same migration:
  ```sql
  UPDATE receivals r SET division_id = w.division_id
  FROM warehouses w WHERE w.id = r.warehouse_id AND r.division_id IS NULL;
  -- ... same shape for the other 5 tables ...
  ```

**Result:** every row (existing + new) carries `division_id` where the source can be resolved. Rows with no resolvable warehouse (e.g. a `receivals` row with `warehouse_id IS NULL`) stay `division_id IS NULL` — a follow-up query surfaces them for manual cleanup.

**Smoke test:**
1. `SELECT COUNT(*) FILTER (WHERE division_id IS NULL) FROM receivals` — should be 0 (or a small known number of legacy rows)
2. Same query for each of the 6 tables
3. Create a new receival on staging → verify `division_id` auto-populates from the warehouse
4. Create a warehouse-transfer → verify `division_id = from_warehouse.division_id`
5. Complete a sale delivery → verify `cogs_entries.division_id` matches the SO's division_id

**Rollback:** drop the 6 triggers, drop the 6 columns. Fully reversible.

### Phase 2 — Report against division_id — ~2 hr

Existing reports/hooks that filter by division today do so via `JOIN warehouses`. Switch them to use the new column directly — faster, cleaner. Files likely affected:

- `src/hooks/useDashboardStats.ts`
- `src/hooks/useStockValueCogsSummary.ts`
- `src/app/api/warehouse/reports/route.ts`
- `src/hooks/useCogsBreakdown.ts`
- `src/hooks/useDeadStock.ts`

Not urgent — the existing joins still work. Do this opportunistically as reports are touched.

### Phase 3 — Tighten to NOT NULL — ~15 min

Once Phase 1's backfill has cleared to 0 NULLs (verified by monitoring the `WHERE division_id IS NULL` count over a few days):

**Migration:** `20260724260001_inventory_division_id_not_null.sql`

- `ALTER TABLE … ALTER COLUMN division_id SET NOT NULL` on all 6 tables
- Any lingering NULLs need a call — either backfill manually or delete stale rows

**Rollback:** drop NOT NULL — reversible.

### Phase 4 — Per-division RLS (optional, later) — ~2 hr

Only after the columns are trusted. New RLS policies scoped to `user_divisions`:

```sql
CREATE POLICY inventory_stock_movements_div_read ON inventory_stock_movements
FOR SELECT USING (
  division_id IN (SELECT division_id FROM user_divisions WHERE profile_id = auth.uid())
  OR public.is_system_admin(auth.uid())
);
```

Do NOT bundle with Phase 1 — RLS bugs are hard to diagnose. Ship separately once Phase 1–3 are stable.

## Trigger design in detail (for review before I write the SQL)

Each trigger fires `BEFORE INSERT`, only sets division_id if the caller didn't already provide one (so explicit inserts still work), and looks up the derived value:

**Example — receivals:**
```sql
CREATE FUNCTION set_receival_division_id() RETURNS trigger AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.warehouse_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM warehouses WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

Same shape for `fifo_cost_layers` and `inventory_stock_movements` (all keyed off `warehouse_id`).

**`receival_items`** — keyed off `receival_id`:
```sql
SELECT division_id INTO NEW.division_id FROM receivals WHERE id = NEW.receival_id;
```

**`cogs_entries`** — keyed off `sale_order_id`:
```sql
IF NEW.division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
  SELECT division_id INTO NEW.division_id FROM sale_orders WHERE id = NEW.sale_order_id;
END IF;
```

Landed-cost COGS rows (`source_type='landed_cost'`) have no sale_order_id → they stay NULL. That's fine for now; if per-division landed-cost tracking is needed later, add a fallback derivation via `landed_cost_id → landed_costs.receival_id → receivals.division_id`.

**`warehouse_transfers`** — keyed off `from_warehouse_id`:
```sql
IF NEW.division_id IS NULL AND NEW.from_warehouse_id IS NOT NULL THEN
  SELECT division_id INTO NEW.division_id FROM warehouses WHERE id = NEW.from_warehouse_id;
END IF;
```

## Risks

1. **Warehouse's division_id changes.** If Master Data admin moves a warehouse to a different division later, existing rows on `fifo_cost_layers`/`inventory_stock_movements` still carry the OLD division_id (denormalized at insert time). This is correct behavior for reports ("this stock was in Trading when it moved") but may confuse users. Add a note in the master-data UI when reassigning a warehouse.
2. **Cross-division warehouse transfer.** From = Trading, To = Maintenance. The transfer row's `division_id = 'trading'`. But the stock physically ends up in Maintenance. If you want the receiving division to also see the transfer, that's a query concern (union both `from` and `to` divisions), not a column concern.
3. **Trigger fires on every insert.** Adds one `SELECT ... FROM warehouses` per row. Warehouses is a tiny table (probably <20 rows), fully cached. Negligible cost.
4. **Backfill on a large `inventory_stock_movements` table** — could be slow if you have millions of rows. Run in batches (`WHERE created_at > X`) if needed. Right now movements is <10k rows on prod — single-shot is fine.

## Testing checklist

Run on staging after Phase 1:

- [ ] Every row in each of the 6 tables has non-NULL `division_id` (except legacy warehouse-less rows — count them explicitly)
- [ ] New receival → division_id auto-populates
- [ ] New adjustment (movement) → division_id auto-populates  
- [ ] New warehouse-transfer → division_id = from_warehouse's division
- [ ] Complete sale delivery → cogs_entries + inventory_stock_movements both have division_id
- [ ] Explicit INSERT with division_id already set → trigger doesn't override (backward compat)
- [ ] Reports/hooks unchanged still work (joins still valid)

## Success criteria

- Zero row-count regression on existing reports
- `SELECT COUNT(*) FILTER (WHERE division_id IS NULL)` returns 0 on all 6 tables (or a documented number of legacy rows we accept)
- Every new row inserted after this migration has division_id auto-populated
- No RPC changes required in this phase — the trigger absorbs all the work
