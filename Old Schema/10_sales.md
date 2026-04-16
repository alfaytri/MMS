# 10 — Sales

> **Source**: Live public schema snapshot generated from the database on 2026-03-26.

Sales order, delivery, unified returns, and approval tables.

---

## `sale_orders`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `so_number` | `text` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `status` | `sale_order_status` | YES | `'quotation'::sale_order_status` |
| `subtotal` | `numeric` | YES | `0` |
| `tax` | `numeric` | YES | `0` |
| `total` | `numeric` | YES | `0` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `discount_amount` | `numeric` | YES | `0` |
| `discount_label` | `text` | YES | `—` |
| `created_by_name` | `text` | YES | `—` |
| `discount_type` | `text` | YES | `'fixed'::text` |
| `discount_amount_resolved` | `numeric` | YES | `0` |
| `voucher_id` | `uuid` | YES | `—` |
| `campaign_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `sale_orders_created_by_fkey`: `created_by` → `profiles` (`id`); `sale_orders_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: `sale_orders_so_number_key` (`so_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert sale_orders` (INSERT); `Internal can select sale_orders` (SELECT); `Internal can update sale_orders` (UPDATE)
**Triggers**: `set_updated_at_sale_orders` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

**Dropped columns** (2026-03-26): `customer_name`, `phone`, `credit_category_id`, `invoice_id`, `requires_approval`, `approval_status`, `approval_reason` — replaced by relational joins and `approval_requests` table.

---
## `sale_order_lines`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `sale_order_id` | `uuid` | NO | `—` |
| `item_id` | `text` | YES | `—` |
| `item_name` | `text` | NO | `—` |
| `sku` | `text` | YES | `—` |
| `qty` | `integer` | NO | `1` |
| `unit_price` | `numeric` | NO | `0` |
| `total` | `numeric` | NO | `0` |
| `delivered_qty` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `brand_variant_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `sale_order_lines_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `sale_order_lines_created_by_fkey`: `created_by` → `profiles` (`id`); `sale_order_lines_sale_order_id_fkey`: `sale_order_id` → `sale_orders` (`id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert sale_order_lines` (INSERT); `Internal can select sale_order_lines` (SELECT); `Internal can update sale_order_lines` (UPDATE)
**Triggers**: `set_updated_at_sale_order_lines` → `set_updated_at`

---
## `sale_deliveries`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `delivery_number` | `text` | NO | `—` |
| `sale_order_id` | `uuid` | NO | `—` |
| `warehouse_id` | `uuid` | NO | `—` |
| `warehouse_name` | `text` | YES | `—` |
| `date` | `date` | NO | `—` |
| `items` | `jsonb` | NO | `'[]'::jsonb` |
| `status` | `sale_delivery_status` | YES | `'pending'::sale_delivery_status` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `created_by_name` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `sale_deliveries_created_by_fkey`: `created_by` → `profiles` (`id`); `sale_deliveries_sale_order_id_fkey`: `sale_order_id` → `sale_orders` (`id`); `sale_deliveries_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: `sale_deliveries_delivery_number_key` (`delivery_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert sale_deliveries` (INSERT); `Internal can select sale_deliveries` (SELECT); `Internal can update sale_deliveries` (UPDATE)
**Triggers**: `set_updated_at_sale_deliveries` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `returns` (unified)

Replaces `sale_returns` and `order_returns`. Uses `source_type` to distinguish origin.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `return_number` | `text` | NO | `—` |
| `source_type` | `return_source_type` | NO | `—` |
| `source_id` | `uuid` | NO | `—` |
| `date` | `date` | NO | `CURRENT_DATE` |
| `reason` | `text` | NO | `''` |
| `items` | `jsonb` | NO | `'[]'::jsonb` |
| `restock_warehouse_id` | `uuid` | YES | `—` |
| `credit_note_id` | `uuid` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `status` | `return_status` | NO | `'pending'` |
| `division_id` | `uuid` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_by_name` | `text` | YES | `''` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Enums**: `return_source_type` (`sale_order`, `order`); `return_status` (`pending`, `received`, `restocked`, `closed`)
**Primary key**: `id`
**Foreign keys**: `returns_created_by_fkey` → `profiles`; `returns_restock_warehouse_id_fkey` → `warehouses`; `returns_credit_note_id_fkey` → `credit_notes`; `returns_division_id_fkey` → `divisions`
**Unique constraints**: Partial unique index on `return_number` WHERE `deleted_at IS NULL`
**RLS enabled**: Yes
**Policies**: `Internal can select returns` (SELECT); `Internal can insert returns` (INSERT); `Internal can update returns` (UPDATE)
**Triggers**: `trg_returns_updated_at` → `set_updated_at`

---
## `approval_requests`

Polymorphic approval table supporting multi-step approvals for margin and credit limits.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `source_type` | `approval_source_type` | NO | `—` |
| `source_id` | `uuid` | NO | `—` |
| `approval_type` | `approval_type` | NO | `—` |
| `status` | `approval_status` | YES | `'pending'` |
| `requested_by` | `uuid` | YES | `—` |
| `decided_by` | `uuid` | YES | `—` |
| `decided_by_name` | `text` | YES | `—` |
| `reason` | `text` | YES | `—` |
| `comment` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Enums**: `approval_source_type` (`sale_order`, `order`); `approval_type` (`margin`, `credit`); `approval_status` (`pending`, `approved`, `rejected`)
**Primary key**: `id`
**Foreign keys**: `approval_requests_requested_by_fkey` → `profiles`; `approval_requests_decided_by_fkey` → `profiles`
**RLS enabled**: Yes
**Policies**: `Internal can select approval_requests` (SELECT); `Internal can insert approval_requests` (INSERT); `Internal can update approval_requests` (UPDATE)
**Triggers**: `trg_approval_requests_updated_at` → `set_updated_at`

---
