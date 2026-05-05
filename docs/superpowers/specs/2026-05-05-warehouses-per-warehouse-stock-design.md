# Design Spec — Per-Warehouse Stock Visibility
**Date:** 2026-05-05
**Branch:** feature/warehouses
**Status:** Approved

---

## Overview

The MMS warehouse hub currently shows stock as a single global number per item. Warehouse managers cannot see how much each warehouse holds, what each warehouse is worth, or which warehouses need rebalancing via transfers.

The FIFO cost layer system already stores `warehouse_id` on every layer — every receival, delivery, adjustment, and transfer already writes warehouse-scoped FIFO data. This design exposes that latent data through a DB view, maintains warehouse-level counters via trigger, and upgrades the warehouse UI to make per-warehouse visibility a first-class feature.

---

## Goals

- Every warehouse card shows its own accurate item count and total value
- Stock Overview tab supports filtering by warehouse (currently shows "not available")
- Transfer dialog validates source-warehouse stock before submission, with per-row feedback
- Value comparison bar lets managers spot imbalances and initiate transfers in one click
- Zero data duplication — the single source of truth remains `fifo_cost_layers`

---

## Section 1 — Database Layer

### 1.1 `warehouse_stock_view`

A non-materialised DB view over `fifo_cost_layers`, joined to `inventory_brand_variants` for display metadata.

```sql
CREATE OR REPLACE VIEW warehouse_stock_view AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ibv.item_name,
  ibv.brand,
  ibv.sku,
  ibv.unit,
  SUM(f.remaining_qty)                                                        AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END                                                                         AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost)                                    AS total_value
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv ON ibv.id = f.brand_variant_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY f.warehouse_id, f.brand_variant_id,
         ibv.item_name, ibv.brand, ibv.sku, ibv.unit;
```

**Weighted-average cost formula:**

```
avg_cost = Σ(remaining_qty × total_unit_cost) / Σ(remaining_qty)
```

This is the standard FIFO weighted average for remaining stock — the same method used by the global `average_cost` column on `inventory_brand_variants`.

**Index:** The composite index `idx_fifo_warehouse ON fifo_cost_layers(brand_variant_id, warehouse_id)` already exists from migration `20260425000001`. No new index required.

### 1.2 Trigger — `trg_warehouse_stats`

Maintains `warehouses.item_count` and `warehouses.total_value` automatically after every FIFO layer change.

```sql
CREATE OR REPLACE FUNCTION fn_refresh_warehouse_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wh_id UUID;
BEGIN
  -- Covers INSERT, UPDATE, and DELETE
  v_wh_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  IF v_wh_id IS NULL THEN RETURN NULL; END IF;

  UPDATE warehouses
  SET
    item_count  = (
      SELECT COUNT(DISTINCT brand_variant_id)
      FROM   fifo_cost_layers
      WHERE  warehouse_id = v_wh_id AND remaining_qty > 0
    ),
    total_value = (
      SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0)
      FROM   fifo_cost_layers
      WHERE  warehouse_id = v_wh_id AND remaining_qty > 0
    ),
    updated_at  = now()
  WHERE id = v_wh_id;

  RETURN NULL;
END;
$$;

-- Fires on INSERT, UPDATE, and DELETE to handle manual corrections
-- and transaction rollbacks without leaving counters out of sync
CREATE TRIGGER trg_warehouse_stats
AFTER INSERT OR UPDATE OR DELETE ON fifo_cost_layers
FOR EACH ROW EXECUTE FUNCTION fn_refresh_warehouse_stats();
```

**Performance note:** Each trigger call recalculates one warehouse's totals with a two-column GROUP BY over indexed rows. For the scale of a mid-sized inventory (tens of thousands of FIFO rows per warehouse) this is fast. If the table grows to hundreds of thousands of rows per warehouse, the trigger body can be converted to a delta counter approach without changing any application code.

### 1.3 Backfill

The trigger populates `item_count` and `total_value` for all warehouses on first migration run by issuing an `UPDATE fifo_cost_layers SET remaining_qty = remaining_qty WHERE warehouse_id IS NOT NULL` no-op to fire the trigger, or by running the UPDATE directly in the migration.

---

## Section 2 — Data Layer (Hooks)

### 2.1 `useWarehouseStock(warehouseId?: string)`

**Current:** queries `inventory_brand_variants` — global, not warehouse-aware.  
**New:** queries `warehouse_stock_view`.

- When `warehouseId` is provided: `.eq('warehouse_id', warehouseId)` — returns items only in that warehouse.
- When omitted: returns all rows across all warehouses for the company-wide overview.
- Return type shape unchanged (`WarehouseStockItem`) so all existing consumers compile without changes.

### 2.2 `useWarehouses()`

No change. Already returns `item_count` and `total_value` from the `warehouses` table, which the trigger now keeps accurate.

### 2.3 New: `useWarehouseStockSummary(warehouseId: string | null)`

Used exclusively by the transfer dialog for client-side validation.

- Calls `useWarehouseStock(warehouseId)` internally.
- Returns a **`Map<brand_variant_id, qty>`** memoised with `useMemo` so it is not rebuilt on every re-render of the dialog.
- Enabled only when `warehouseId` is non-null.
- Shape: `{ data: Map<string, number>, isLoading: boolean }`

---

## Section 3 — UI Layer

### 3.1 `WhWarehousesTab` — Warehouse cards

**Changes:**
- `item_count` and `total_value` on each card now reflect real per-warehouse numbers (no code change needed; they already read from the `Warehouse` object — the trigger keeps them accurate).
- Add a **"View Stock →"** button (ghost, small) to each card footer. Clicking sets `?tab=stock&warehouse=<id>` in the URL, opening Stock Overview pre-filtered to that warehouse.
- Below the card grid, add a **value comparison bar** — a horizontal bar chart showing each warehouse's `total_value` as a proportional filled segment, labelled with warehouse name and QR amount.
  - Each bar segment is **clickable**: clicking navigates to `?tab=stock&warehouse=<id>`.
  - Tooltip on hover shows exact value and item count.
  - This makes stock imbalances visible at a glance and provides a one-click path to investigate and initiate a transfer.

### 3.2 `WhStockOverviewTab` — Per-warehouse filter

**Changes:**
- Replace the "Per-warehouse stock breakdown is not available" message with a warehouse `<Select>` dropdown.
- Default: **All Warehouses** — shows company-wide stock (existing behaviour).
- When a warehouse is selected: `useWarehouseStock(warehouseId)` filters the table to that warehouse. Summary cards (Total Items, Total Qty, Total Value) update to reflect the selected scope.
- Add a clearly visible **"Clear filter"** pill/button (×) next to the warehouse selector that appears only when a warehouse is selected. This prevents managers from forgetting they are looking at a filtered view — the pill reads *"Viewing: [Warehouse Name] ×"*.
- When navigating from a warehouse card ("View Stock →"), the `warehouse` query param pre-selects the dropdown on mount.

### 3.3 `WhTransferDialog` — Stock validation

**Changes:**
- When source warehouse is selected, load `useWarehouseStockSummary(sourceWarehouseId)`.
- For each item row: display available qty in the source warehouse as a grey helper label, e.g. `Available: 12`.
- **Per-row validation:** if `qty_requested > available_qty`:
  - Highlight the row with a red left border.
  - Show inline text: `"Only X available in [warehouse name]"` in red below the qty input.
  - This is explicit, per-row feedback — not a generic disabled button.
- The **Submit button** is disabled if any row has insufficient stock, with tooltip text: `"Fix quantities above before transferring"`.
- When source warehouse changes, re-validate all rows immediately.

---

## Section 4 — Migration Strategy

Single migration file: `supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql`

Order of operations within the migration:
1. `CREATE OR REPLACE VIEW warehouse_stock_view`
2. `CREATE OR REPLACE FUNCTION fn_refresh_warehouse_stats()`
3. `CREATE TRIGGER trg_warehouse_stats` (with `DROP TRIGGER IF EXISTS` guard)
4. Grant `SELECT` on `warehouse_stock_view` to `authenticated`
5. Backfill: `UPDATE fifo_cost_layers SET remaining_qty = remaining_qty WHERE warehouse_id IS NOT NULL` — no-op that fires `trg_warehouse_stats` for every row, populating `item_count` and `total_value` on all warehouses from existing data

---

## Out of Scope

- `warehouse_manager_log` UI (assignment history) — backend table exists; deferred to a later task
- Per-warehouse FIFO cost history drill-down (e.g. FIFO layer list per warehouse) — deferred
- Rebalance suggestions / automated transfer recommendations — deferred
