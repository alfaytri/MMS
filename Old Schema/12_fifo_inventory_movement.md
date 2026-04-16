# 12 — FIFO, Inventory Movement & COGS

> **Source**: Live public schema snapshot generated from the database on 2026-03-26.

FIFO costing layers, stock movement ledger, and COGS financial ledger.

---

## `fifo_cost_layers`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `brand_variant_id` | `uuid` | NO | `—` |
| `receival_id` | `text` | YES | `—` |
| `receival_number` | `text` | YES | `—` |
| `date` | `date` | NO | `—` |
| `qty` | `integer` | NO | `—` |
| `unit_cost` | `numeric` | NO | `—` |
| `landed_cost_per_unit` | `numeric` | YES | `0` |
| `total_unit_cost` | `numeric` | NO | `—` |
| `remaining_qty` | `integer` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `warehouse_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `fifo_cost_layers_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `fifo_cost_layers_created_by_fkey`: `created_by` → `profiles` (`id`); `fifo_cost_layers_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert fifo_cost_layers` (INSERT); `Internal can select fifo_cost_layers` (SELECT); `Internal can update fifo_cost_layers` (UPDATE)
**Triggers**: None

---
## `inventory_stock_movements`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `brand_variant_id` | `uuid` | NO | `—` |
| `movement_type` | `text` | NO | `—` |
| `reference_type` | `text` | YES | `—` |
| `reference_id` | `uuid` | YES | `—` |
| `qty` | `integer` | NO | `—` |
| `unit_cost` | `numeric` | YES | `—` |
| `note` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `warehouse_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_stock_movements_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `inventory_stock_movements_created_by_fkey`: `created_by` → `profiles` (`id`); `inventory_stock_movements_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can insert stock movements` (INSERT); `Internal users can view stock movements` (SELECT)
**Triggers**: `trg_stock_movements_updated_at` → `set_updated_at`

---

## `cogs_entries`

Append-only financial ledger for Cost of Goods Sold. Separate from `inventory_stock_movements` (operational) — this table tracks **cost recognition** for accounting/audit purposes.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `entry_date` | `date` | NO | `CURRENT_DATE` |
| `source_type` | `text` | NO | `—` |
| `source_id` | `uuid` | NO | `—` |
| `brand_variant_id` | `uuid` | YES | `—` |
| `qty` | `integer` | NO | `0` |
| `unit_cost` | `numeric` | NO | `0` |
| `total_cost` | `numeric` | NO | `0` |
| `warehouse_id` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `cogs_entries_brand_variant_id_fkey` → `inventory_brand_variants`; `cogs_entries_warehouse_id_fkey` → `warehouses`; `cogs_entries_division_id_fkey` → `divisions`; `cogs_entries_created_by_fkey` → `profiles`
**RLS enabled**: Yes
**Policies**: `Internal can select cogs_entries` (SELECT); `Internal can insert cogs_entries` (INSERT) — **No UPDATE/DELETE** (append-only)
**Indexes**: `idx_cogs_entries_entry_date`, `idx_cogs_entries_source`, `idx_cogs_entries_division`, `idx_cogs_entries_brand_variant`

**`source_type` values**: `sale_delivery`, `order_invoice`, `stock_adjustment`, `unallocated_lc`

---
