# 11 — Purchase & Procurement

> **Source**: Live public schema snapshot generated from the database on 2026-03-26.

Purchase orders, suppliers, receivals, shipments, and landed costs.

---

## `purchase_orders`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `po_number` | `text` | NO | `—` |
| `supplier_id` | `text` | NO | `—` |
| `supplier_name` | `text` | NO | `—` |
| `status` | `po_status` | YES | `'draft'::po_status` |
| `currency` | `text` | YES | `'QAR'::text` |
| `exchange_rate` | `numeric` | YES | `1` |
| `subtotal` | `numeric` | YES | `0` |
| `total_qar` | `numeric` | YES | `0` |
| `created_date` | `date` | NO | `—` |
| `expected_delivery` | `date` | YES | `—` |
| `approval_level` | `integer` | YES | `1` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `payment_terms` | `text` | YES | `—` |
| `payment_terms_notes` | `text` | YES | `—` |
| `delivery_terms` | `text` | YES | `—` |
| `delivery_terms_notes` | `text` | YES | `—` |
| `vendor_notes` | `text` | YES | `—` |
| `discount_amount` | `numeric` | YES | `0` |
| `discount_label` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `purchase_orders_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `purchase_orders_po_number_key` (`po_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert purchase_orders` (INSERT); `Internal can select purchase_orders` (SELECT); `Internal can update purchase_orders` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `po_line_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `po_id` | `uuid` | NO | `—` |
| `item_name` | `text` | NO | `—` |
| `sku` | `text` | YES | `—` |
| `qty` | `integer` | NO | `—` |
| `received_qty` | `integer` | YES | `0` |
| `unit` | `text` | NO | `—` |
| `unit_price` | `numeric` | NO | `—` |
| `total_price` | `numeric` | NO | `—` |
| `fifo_layers` | `jsonb` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `brand_variant_id` | `uuid` | YES | `—` |
| `tool_asset_item_id` | `uuid` | YES | `—` |
| `brand_id` | `uuid` | YES | `—` |
| `free_qty` | `integer` | NO | `0` |

**Primary key**: `id`
**Foreign keys**: `po_line_items_brand_id_fkey`: `brand_id` → `brands` (`id`); `po_line_items_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `po_line_items_created_by_fkey`: `created_by` → `profiles` (`id`); `po_line_items_po_id_fkey`: `po_id` → `purchase_orders` (`id`); `po_line_items_tool_asset_item_id_fkey`: `tool_asset_item_id` → `tool_asset_items` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert po_line_items` (INSERT); `Internal can select po_line_items` (SELECT); `Internal can update po_line_items` (UPDATE)
**Triggers**: None

---
## `po_approvals`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `po_id` | `uuid` | NO | `—` |
| `role` | `approval_role` | NO | `—` |
| `status` | `approval_status` | YES | `'pending'::approval_status` |
| `approved_by` | `text` | YES | `—` |
| `date` | `date` | YES | `—` |
| `comment` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `po_approvals_po_id_fkey`: `po_id` → `purchase_orders` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert po_approvals` (INSERT); `Internal can select po_approvals` (SELECT); `Internal can update po_approvals` (UPDATE)
**Triggers**: None

---
## `suppliers`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `category` | `text` | YES | `—` |
| `contact_name` | `text` | YES | `—` |
| `phone` | `text` | YES | `—` |
| `email` | `text` | YES | `—` |
| `address` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `is_active` | `boolean` | YES | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `suppliers_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can insert suppliers` (INSERT); `Internal users can update suppliers` (UPDATE); `Internal users can view suppliers` (SELECT)
**Triggers**: `trg_suppliers_updated_at` → `set_updated_at`

---
## `receivals`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `receival_number` | `text` | NO | `—` |
| `po_id` | `uuid` | NO | `—` |
| `warehouse_id` | `uuid` | NO | `—` |
| `received_by` | `uuid` | YES | `—` |
| `received_by_name` | `text` | YES | `—` |
| `date` | `date` | NO | `—` |
| `status` | `receival_status` | YES | `'pending_approval'::receival_status` |
| `landed_cost_id` | `uuid` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `receivals_created_by_fkey`: `created_by` → `profiles` (`id`); `receivals_po_id_fkey`: `po_id` → `purchase_orders` (`id`); `receivals_received_by_fkey`: `received_by` → `employees` (`id`); `receivals_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: `receivals_receival_number_key` (`receival_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert receivals` (INSERT); `Internal can select receivals` (SELECT); `Internal can update receivals` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `receival_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `receival_id` | `uuid` | NO | `—` |
| `po_line_item_id` | `uuid` | YES | `—` |
| `item_name` | `text` | NO | `—` |
| `sku` | `text` | YES | `—` |
| `qty_received` | `integer` | NO | `—` |
| `unit_cost` | `numeric` | NO | `—` |
| `is_free` | `boolean` | YES | `false` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `brand_variant_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `receival_items_brand_variant_id_fkey`: `brand_variant_id` → `inventory_brand_variants` (`id`); `receival_items_created_by_fkey`: `created_by` → `profiles` (`id`); `receival_items_po_line_item_id_fkey`: `po_line_item_id` → `po_line_items` (`id`); `receival_items_receival_id_fkey`: `receival_id` → `receivals` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert receival_items` (INSERT); `Internal can select receival_items` (SELECT); `Internal can update receival_items` (UPDATE)
**Triggers**: None

---
## `shipments`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `tracking_number` | `text` | NO | `—` |
| `po_id` | `uuid` | NO | `—` |
| `receival_id` | `uuid` | YES | `—` |
| `mode` | `shipment_mode` | NO | `—` |
| `carrier` | `text` | NO | `—` |
| `status` | `shipment_status` | YES | `'booked'::shipment_status` |
| `origin` | `text` | YES | `—` |
| `destination` | `text` | YES | `—` |
| `etd` | `date` | YES | `—` |
| `eta` | `date` | YES | `—` |
| `events` | `jsonb` | YES | `'[]'::jsonb` |
| `archived` | `boolean` | YES | `false` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `shipments_created_by_fkey`: `created_by` → `profiles` (`id`); `shipments_po_id_fkey`: `po_id` → `purchase_orders` (`id`); `shipments_receival_id_fkey`: `receival_id` → `receivals` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert shipments` (INSERT); `Internal can select shipments` (SELECT); `Internal can update shipments` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `landed_costs`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `lc_number` | `text` | NO | `—` |
| `description` | `text` | YES | `—` |
| `total_amount` | `numeric` | YES | `0` |
| `currency` | `text` | YES | `'QAR'::text` |
| `lines` | `jsonb` | YES | `'[]'::jsonb` |
| `attached_receival_ids` | `uuid[]` | YES | `'{}'::uuid[]` |
| `attached_po_ids` | `uuid[]` | YES | `'{}'::uuid[]` |
| `all_items_sold` | `boolean` | YES | `false` |
| `date` | `date` | NO | `—` |
| `item_allocations` | `jsonb` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `voided_at` | `timestamp with time zone` | YES | `—` |
| `voided_reason` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `landed_costs_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `landed_costs_lc_number_key` (`lc_number`)
**RLS enabled**: Yes
**Policies**: `Internal can insert landed_costs` (INSERT); `Internal can select landed_costs` (SELECT); `Internal can update landed_costs` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
