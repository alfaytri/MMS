# 07 — Inventory Items

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Inventory catalog, variants, attributes, warranties, and tool asset tables.

---

## `inventory_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `sku` | `text` | YES | `—` |
| `type` | `inventory_type` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `status` | `text` | NO | `'active'::text` |
| `warranty_months` | `integer` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |

**Primary key**: `id`
**Foreign keys**: `inventory_categories_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert inventory_categories` (INSERT); `Internal can select inventory_categories` (SELECT); `Internal can update inventory_categories` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `inventory_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category_id` | `uuid` | NO | `—` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `sku` | `text` | NO | `—` |
| `unit` | `text` | NO | `—` |
| `cost_price` | `numeric` | YES | `0` |
| `markup_percent` | `numeric` | YES | `—` |
| `linked_services_count` | `integer` | YES | `0` |
| `total_stock` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `warranty_months` | `integer` | YES | `—` |
| `status` | `text` | NO | `'active'::text` |
| `sort_order` | `integer` | NO | `0` |
| `brand_group_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_items_brand_group_id_fkey`: `brand_group_id` → `brand_groups` (`id`); `inventory_items_category_id_fkey`: `category_id` → `inventory_categories` (`id`); `inventory_items_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert inventory_items` (INSERT); `Internal can select inventory_items` (SELECT); `Internal can update inventory_items` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `inventory_brand_variants`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `item_id` | `uuid` | NO | `—` |
| `code` | `text` | YES | `—` |
| `cost_price` | `numeric` | YES | `0` |
| `selling_price` | `numeric` | YES | `0` |
| `stock_level` | `integer` | YES | `0` |
| `incoming` | `integer` | YES | `0` |
| `incoming_eta` | `date` | YES | `—` |
| `average_cost` | `numeric` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `status` | `text` | NO | `'active'::text` |
| `sort_order` | `integer` | NO | `0` |
| `brand_id` | `uuid` | YES | `—` |
| `reserved_qty` | `integer` | YES | `0` |

**Primary key**: `id`
**Foreign keys**: `inventory_brand_variants_brand_id_fkey`: `brand_id` → `brands` (`id`); `inventory_brand_variants_created_by_fkey`: `created_by` → `profiles` (`id`); `inventory_brand_variants_item_id_fkey`: `item_id` → `inventory_items` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert inventory_brand_variants` (INSERT); `Internal can select inventory_brand_variants` (SELECT); `Internal can update inventory_brand_variants` (UPDATE); `Internal users can delete inventory brand variants` (DELETE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `inventory_attribute_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category_id` | `uuid` | NO | `—` |
| `attribute_key` | `text` | NO | `—` |
| `label_en` | `text` | NO | `—` |
| `label_ar` | `text` | YES | `—` |
| `sort_order` | `integer` | YES | `0` |
| `options` | `jsonb` | YES | `'[]'::jsonb` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_attribute_definitions_category_id_fkey`: `category_id` → `inventory_categories` (`id`); `inventory_attribute_definitions_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `inventory_attribute_definitions_category_id_attribute_key_key` (`category_id`, `attribute_key`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage attribute definitions` (ALL); `Internal users can read attribute definitions` (SELECT)
**Triggers**: `set_updated_at_attr_defs` → `set_updated_at`

---
## `inventory_item_attributes`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `item_id` | `uuid` | NO | `—` |
| `attribute_key` | `text` | NO | `—` |
| `attribute_value` | `text` | NO | `—` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_item_attributes_created_by_fkey`: `created_by` → `profiles` (`id`); `inventory_item_attributes_item_id_fkey`: `item_id` → `inventory_items` (`id`)
**Unique constraints**: `inventory_item_attributes_item_id_attribute_key_key` (`item_id`, `attribute_key`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage item attributes` (ALL); `Internal users can read item attributes` (SELECT)
**Triggers**: None

---
## `inventory_warranty_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `item_id` | `uuid` | NO | `—` |
| `part_en` | `text` | NO | `—` |
| `part_ar` | `text` | NO | `''::text` |
| `months` | `integer` | NO | `12` |
| `desc_en` | `text` | YES | `—` |
| `desc_ar` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `inventory_warranty_items_created_by_fkey`: `created_by` → `profiles` (`id`); `inventory_warranty_items_item_id_fkey`: `item_id` → `inventory_items` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can delete warranty items` (DELETE); `Internal users can insert warranty items` (INSERT); `Internal users can read warranty items` (SELECT); `Internal users can update warranty items` (UPDATE)
**Triggers**: `set_updated_at` → `set_updated_at`

---
## `tool_asset_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `tool_asset_categories_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can delete tool_asset_categories` (DELETE); `Internal can insert tool_asset_categories` (INSERT); `Internal can select tool_asset_categories` (SELECT); `Internal can update tool_asset_categories` (UPDATE)
**Triggers**: `trg_tool_asset_categories_updated_at` → `set_updated_at`

---
## `tool_asset_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category_id` | `uuid` | NO | `—` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `tracking_mode` | `text` | NO | `'serialized'::text` |
| `sort_order` | `integer` | YES | `0` |
| `brand_group_id` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `tool_asset_items_brand_group_id_fkey`: `brand_group_id` → `brand_groups` (`id`); `tool_asset_items_category_id_fkey`: `category_id` → `tool_asset_categories` (`id`); `tool_asset_items_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can delete tool_asset_items` (DELETE); `Internal can insert tool_asset_items` (INSERT); `Internal can select tool_asset_items` (SELECT); `Internal can update tool_asset_items` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `tool_asset_item_brands`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `item_id` | `uuid` | NO | `—` |
| `brand_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `tool_asset_item_brands_brand_id_fkey`: `brand_id` → `brands` (`id`); `tool_asset_item_brands_created_by_fkey`: `created_by` → `profiles` (`id`); `tool_asset_item_brands_item_id_fkey`: `item_id` → `tool_asset_items` (`id`)
**Unique constraints**: `tool_asset_item_brands_item_id_brand_id_key` (`item_id`, `brand_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage tool asset item brands` (ALL); `Internal users can view tool asset item brands` (SELECT)
**Triggers**: None

---
## `tool_asset_units`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `item_id` | `uuid` | NO | `—` |
| `serial_number` | `text` | YES | `—` |
| `status` | `tool_status` | YES | `'available'::tool_status` |
| `condition` | `tool_condition` | YES | `'Good'::tool_condition` |
| `expiry` | `date` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `brand_id` | `uuid` | YES | `—` |
| `assigned_employee_id` | `uuid` | YES | `—` |
| `assigned_team_id` | `uuid` | YES | `—` |
| `warehouse_id` | `uuid` | YES | `—` |
| `purchase_cost` | `numeric(12,2)` | YES | `0` |
| `receival_item_id` | `uuid` | YES | `—` |
| `received_at` | `timestamp with time zone` | YES | `—` |
| `notes` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `tool_asset_units_assigned_employee_id_fkey`: `assigned_employee_id` → `employees` (`id`); `tool_asset_units_assigned_team_id_fkey`: `assigned_team_id` → `teams` (`id`); `tool_asset_units_brand_id_fkey`: `brand_id` → `brands` (`id`); `tool_asset_units_created_by_fkey`: `created_by` → `profiles` (`id`); `tool_asset_units_item_id_fkey`: `item_id` → `tool_asset_items` (`id`); `tool_asset_units_receival_item_id_fkey`: `receival_item_id` → `receival_items` (`id`); `tool_asset_units_warehouse_id_fkey`: `warehouse_id` → `warehouses` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can delete tool_asset_units` (DELETE); `Internal can insert tool_asset_units` (INSERT); `Internal can select tool_asset_units` (SELECT); `Internal can update tool_asset_units` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
