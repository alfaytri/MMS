# 13 — Warehouse Management

> **Source**: Live public schema snapshot generated from the database on 2026-03-26.

Warehouses, stock transfers, adjustments, inventory checks, and manager assignment log.

---

## `warehouses`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `location` | `text` | YES | `—` |
| `warehouse_type` | `text` | NO | `'central'` |
| `team_id` | `uuid` | YES | `—` |
| `manager_id` | `uuid` | YES | `—` |
| `item_count` | `integer` | YES | `0` |
| `total_value` | `numeric` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `warehouses_created_by_fkey`: `created_by` → `profiles` (`id`); `warehouses_manager_id_fkey`: `manager_id` → `employees` (`id`); `warehouses_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can delete warehouses` (DELETE); `Internal can insert warehouses` (INSERT); `Internal can select warehouses` (SELECT); `Internal can update warehouses` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`; `trg_auto_create_team_vehicle_warehouse` on `teams` AFTER INSERT → auto-creates a vehicle warehouse for each new team

**`warehouse_type` values**: `central` (main storage), `local` (smaller warehouse near teams), `team_vehicle` (mobile micro-warehouse in team vehicle)

---
## `warehouse_transfers`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `transfer_number` | `text` | NO | `—` |
| `from_warehouse_id` | `uuid` | NO | `—` |
| `to_warehouse_id` | `uuid` | NO | `—` |
| `status` | `transfer_status` | YES | `'pending'::transfer_status` |
| `created_by_user` | `uuid` | YES | `—` |
| `created_by_name` | `text` | YES | `—` |
| `approved_by` | `text` | YES | `—` |
| `approved_by_name` | `text` | YES | `—` |
| `date` | `date` | NO | `—` |
| `approved_date` | `date` | YES | `—` |
| `items` | `jsonb` | NO | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `warehouse_transfers_created_by_user_fkey`: `created_by_user` → `profiles` (`id`); `warehouse_transfers_from_warehouse_id_fkey`: `from_warehouse_id` → `warehouses` (`id`); `warehouse_transfers_to_warehouse_id_fkey`: `to_warehouse_id` → `warehouses` (`id`)
**Unique constraints**: `warehouse_transfers_transfer_number_key` (`transfer_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert warehouse_transfers` (INSERT); `Internal can select warehouse_transfers` (SELECT); `Internal can update warehouse_transfers` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `warehouse_manager_log`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `warehouse_id` | `uuid` | NO | `—` |
| `manager_id` | `uuid` | NO | `—` |
| `assigned_at` | `timestamp with time zone` | NO | `now()` |
| `removed_at` | `timestamp with time zone` | YES | `—` |
| `assigned_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `warehouse_manager_log_assigned_by_fkey`: `assigned_by` → `profiles` (`id`); `warehouse_manager_log_manager_id_fkey`: `manager_id` → `employees` (`id`); `warehouse_manager_log_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can insert warehouse manager log` (INSERT); `Internal users can update warehouse manager log` (UPDATE); `Internal users can view warehouse manager log` (SELECT)
**Triggers**: `set_warehouse_manager_log_updated_at` → `set_updated_at`

---
## `stock_adjustments`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `warehouse_id` | `uuid` | NO | `—` |
| `brand_variant_id` | `uuid` | NO | `—` |
| `adjustment_type` | `text` | NO | `—` |
| `qty` | `numeric` | NO | `—` |
| `reason` | `text` | NO | `—` |
| `notes` | `text` | YES | `—` |
| `photo_urls` | `text[]` | YES | `—` |
| `status` | `text` | NO | `'pending_approval'::text` |
| `requested_by` | `uuid` | YES | `—` |
| `requested_by_name` | `text` | YES | `—` |
| `approved_by` | `uuid` | YES | `—` |
| `approved_by_name` | `text` | YES | `—` |
| `approved_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `stock_adjustments_approved_by_fkey`: `approved_by` → `profiles` (`id`); `stock_adjustments_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `stock_adjustments_created_by_fkey`: `created_by` → `profiles` (`id`); `stock_adjustments_requested_by_fkey`: `requested_by` → `profiles` (`id`); `stock_adjustments_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can create adjustments` (INSERT); `Internal users can update adjustments` (UPDATE); `Internal users can view adjustments` (SELECT)
**Triggers**: `set_stock_adjustments_updated_at` → `set_updated_at`

---
## `inventory_checks`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `check_number` | `text` | NO | `—` |
| `warehouse_id` | `uuid` | NO | `—` |
| `warehouse_name` | `text` | NO | `''::text` |
| `status` | `text` | NO | `'draft'::text` |
| `submitted_by` | `uuid` | YES | `—` |
| `submitted_by_name` | `text` | YES | `—` |
| `submitted_at` | `timestamp with time zone` | YES | `—` |
| `reviewed_by` | `uuid` | YES | `—` |
| `reviewed_by_name` | `text` | YES | `—` |
| `reviewed_at` | `timestamp with time zone` | YES | `—` |
| `review_notes` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_checks_created_by_fkey`: `created_by` → `profiles` (`id`); `inventory_checks_reviewed_by_fkey`: `reviewed_by` → `profiles` (`id`); `inventory_checks_submitted_by_fkey`: `submitted_by` → `profiles` (`id`); `inventory_checks_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage inventory_checks` (ALL)
**Triggers**: `set_inventory_checks_updated_at` → `set_updated_at`

---
## `inventory_check_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `check_id` | `uuid` | NO | `—` |
| `brand_variant_id` | `uuid` | NO | `—` |
| `item_name` | `text` | NO | `—` |
| `brand` | `text` | NO | `—` |
| `sku` | `text` | YES | `—` |
| `system_qty` | `numeric` | NO | `0` |
| `counted_qty` | `numeric` | YES | `—` |
| `is_counted` | `boolean` | NO | `false` |
| `variance` | `numeric` | YES | `(COALESCE(counted_qty, (0)::numeric) - system_qty)` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `inventory_check_items_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `inventory_check_items_check_id_fkey`: `check_id` → `inventory_checks` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage inventory_check_items` (ALL)
**Triggers**: `set_inventory_check_items_updated_at` → `set_updated_at`

---
