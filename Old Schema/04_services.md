# 04 — Services

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Service catalog, service configuration, reminders, brands, and service-to-item links.

---

## `services`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `parent_id` | `uuid` | YES | `—` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `price` | `numeric` | YES | `—` |
| `emergency_price` | `numeric` | YES | `—` |
| `duration` | `integer` | YES | `—` |
| `workmanship_warranty_months` | `integer` | YES | `—` |
| `status` | `service_status` | YES | `'active'::service_status` |
| `service_type` | `service_type` | YES | `'standard'::service_type` |
| `contract_type` | `contract_type` | YES | `—` |
| `price_unit` | `text` | YES | `—` |
| `spare_parts_included` | `boolean` | YES | `false` |
| `reminder_days` | `integer` | YES | `—` |
| `invoice_text_en` | `text` | YES | `—` |
| `invoice_text_ar` | `text` | YES | `—` |
| `tree_type` | `text` | YES | `'normal'::text` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `photo_url` | `text` | YES | `—` |
| `legacy_service_id` | `text` | YES | `—` |
| `brand_group_id` | `uuid` | YES | `—` |
| `qc_items` | `jsonb` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `division` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `services_brand_group_id_fkey`: `brand_group_id` → `brand_groups` (`id`); `services_created_by_fkey`: `created_by` → `profiles` (`id`); `services_parent_id_fkey`: `parent_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage services` (ALL); `Internal can select services` (SELECT); `Staff can insert services` (INSERT); `Staff can update services` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`; `trg_validate_service_divisions` → `validate_service_division_fks`

---
## `service_components`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | NO | `—` |
| `label_en` | `text` | NO | `—` |
| `label_ar` | `text` | YES | `—` |
| `input_type` | `text` | NO | `—` |
| `min_qty` | `integer` | YES | `1` |
| `max_qty` | `integer` | YES | `10` |
| `is_required` | `boolean` | NO | `true` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_components_created_by_fkey`: `created_by` → `profiles` (`id`); `service_components_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage components` (ALL); `Internal users can read components` (SELECT)
**Triggers**: `trg_updated_at_service_components` → `set_updated_at`

---
## `service_component_options`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `component_id` | `uuid` | NO | `—` |
| `parent_option_id` | `uuid` | YES | `—` |
| `label_en` | `text` | NO | `—` |
| `label_ar` | `text` | YES | `—` |
| `price` | `numeric` | NO | `0` |
| `is_default` | `boolean` | NO | `false` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_component_options_component_id_fkey`: `component_id` → `service_components` (`id`); `service_component_options_created_by_fkey`: `created_by` → `profiles` (`id`); `service_component_options_parent_option_id_fkey`: `parent_option_id` → `service_component_options` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage component options` (ALL); `Internal users can read component options` (SELECT)
**Triggers**: `trg_updated_at_service_component_options` → `set_updated_at`

---
## `service_brands`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | NO | `—` |
| `brand_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_brands_brand_id_fkey`: `brand_id` → `brands` (`id`); `service_brands_created_by_fkey`: `created_by` → `profiles` (`id`); `service_brands_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `service_brands_service_id_brand_id_key` (`service_id`, `brand_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can delete service_brands` (DELETE); `Internal users can insert service_brands` (INSERT); `Internal users can read service_brands` (SELECT)
**Triggers**: None

---
## `brand_service_reliability`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `brand_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | NO | `—` |
| `reliability_factor` | `numeric` | NO | `1.0` |
| `label` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `brand_service_reliability_brand_id_fkey`: `brand_id` → `brands` (`id`); `brand_service_reliability_created_by_fkey`: `created_by` → `profiles` (`id`); `brand_service_reliability_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `brand_service_reliability_brand_id_service_id_key` (`brand_id`, `service_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can delete brand_service_reliability` (DELETE); `Internal users can insert brand_service_reliability` (INSERT); `Internal users can read brand_service_reliability` (SELECT); `Internal users can update brand_service_reliability` (UPDATE)
**Triggers**: `set_brand_service_reliability_updated_at` → `set_updated_at`

---
## `service_duration_matrix`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | NO | `—` |
| `techs` | `integer` | NO | `—` |
| `total_members` | `integer` | NO | `—` |
| `duration_min` | `integer` | NO | `—` |
| `source` | `text` | NO | `'manual'::text` |
| `confidence` | `numeric` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_duration_matrix_created_by_fkey`: `created_by` → `profiles` (`id`); `service_duration_matrix_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `service_duration_matrix_service_id_techs_total_members_key` (`service_id`, `techs`, `total_members`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage duration matrix` (ALL); `Internal users can read duration matrix` (SELECT)
**Triggers**: `trg_updated_at_service_duration_matrix` → `set_updated_at`

---
## `instructions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `type` | `instruction_type` | NO | `—` |
| `content_type` | `instruction_content_type` | YES | `'text'::instruction_content_type` |
| `content_preview` | `text` | YES | `—` |
| `full_content` | `text` | YES | `—` |
| `pdf_file_name` | `text` | YES | `—` |
| `status` | `service_status` | YES | `'active'::service_status` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `file_url` | `text` | YES | `—` |
| `video_url` | `text` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `instructions_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can delete instructions` (DELETE); `Internal can insert instructions` (INSERT); `Internal can select instructions` (SELECT); `Internal can update instructions` (UPDATE)
**Triggers**: `set_instructions_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `service_instructions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `service_id` | `uuid` | NO | `—` |
| `instruction_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `service_id`, `instruction_id`
**Foreign keys**: `service_instructions_created_by_fkey`: `created_by` → `profiles` (`id`); `service_instructions_instruction_id_fkey`: `instruction_id` → `instructions` (`id`); `service_instructions_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage service instructions` (ALL); `Internal users can read service instructions` (SELECT)
**Triggers**: None

---
## `service_inventory`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `service_id` | `uuid` | NO | `—` |
| `item_id` | `uuid` | NO | `—` |
| `quantity` | `integer` | NO | `1` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `link_type` | `text` | NO | `'consumable'::text` |
| `group_label` | `text` | YES | `—` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `service_id`, `item_id`
**Foreign keys**: `service_inventory_created_by_fkey`: `created_by` → `profiles` (`id`); `service_inventory_item_id_fkey`: `item_id` → `inventory_items` (`id`); `service_inventory_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage service inventory` (ALL); `Internal users can read service inventory` (SELECT)
**Triggers**: `set_service_inventory_updated_at` → `set_updated_at`; `trg_service_inventory_count` → `update_linked_services_count`; `trg_validate_service_inventory_link_type` → `validate_service_inventory_link_type`

---
## `service_products`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | NO | `—` |
| `product_category_id` | `uuid` | NO | `—` |
| `is_required` | `boolean` | YES | `true` |
| `brand_selectable_by` | `text` | YES | `'team_leader'::text` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_products_created_by_fkey`: `created_by` → `profiles` (`id`); `service_products_product_category_id_fkey`: `product_category_id` → `inventory_categories` (`id`); `service_products_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `service_products_service_id_product_category_id_key` (`service_id`, `product_category_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage service products` (ALL); `Internal users can read service products` (SELECT)
**Triggers**: `set_updated_at_service_products` → `set_updated_at`

---
## `service_reminder_config`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | NO | `—` |
| `reminder_type` | `text` | NO | `—` |
| `interval_days` | `integer` | NO | `180` |
| `season_start` | `text` | YES | `—` |
| `season_end` | `text` | YES | `—` |
| `batch_size` | `integer` | YES | `50` |
| `merge_window_days` | `integer` | NO | `7` |
| `is_active` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `is_paused` | `boolean` | NO | `false` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `service_reminder_config_created_by_fkey`: `created_by` → `profiles` (`id`); `service_reminder_config_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admins can manage service_reminder_config` (ALL); `Internal users can read service_reminder_config` (SELECT)
**Triggers**: `trg_service_reminder_config_updated_at` → `set_updated_at`

---
## `service_reminder_optouts`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `customer_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | NO | `—` |
| `opted_out_at` | `timestamp with time zone` | NO | `now()` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `service_reminder_optouts_customer_id_fkey`: `customer_id` → `customers` (`id`); `service_reminder_optouts_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `service_reminder_optouts_customer_id_service_id_key` (`customer_id`, `service_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage service_reminder_optouts` (ALL)
**Triggers**: `trg_service_reminder_optouts_updated_at` → `set_updated_at`

---
## `reminder_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `icon` | `text` | YES | `—` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `reminder_categories_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage reminder_categories` (ALL); `Internal can select reminder_categories` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `reminders`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category_id` | `uuid` | NO | `—` |
| `name` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `description` | `text` | YES | `—` |
| `template` | `text` | YES | `—` |
| `channel` | `reminder_channel` | YES | `'Email'::reminder_channel` |
| `timing` | `text` | YES | `—` |
| `status` | `service_status` | YES | `'active'::service_status` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_ids` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `reminders_category_id_fkey`: `category_id` → `reminder_categories` (`id`); `reminders_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert reminders` (INSERT); `Internal can select reminders` (SELECT); `Internal can update reminders` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `brands`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `brands_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can insert brands` (INSERT); `Internal users can read brands` (SELECT); `Internal users can update brands` (UPDATE)
**Triggers**: `set_brands_updated_at` → `set_updated_at`

---
## `brand_groups`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `scope` | `text` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `brand_groups_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can delete brand groups` (DELETE); `Internal users can insert brand groups` (INSERT); `Internal users can update brand groups` (UPDATE); `Internal users can view brand groups` (SELECT)
**Triggers**: `set_brand_groups_updated_at` → `set_updated_at`

---
## `brand_group_members`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `group_id` | `uuid` | NO | `—` |
| `brand_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `brand_group_members_brand_id_fkey`: `brand_id` → `brands` (`id`); `brand_group_members_created_by_fkey`: `created_by` → `profiles` (`id`); `brand_group_members_group_id_fkey`: `group_id` → `brand_groups` (`id`)
**Unique constraints**: `brand_group_members_group_id_brand_id_key` (`group_id`, `brand_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can delete brand group members` (DELETE); `Internal users can insert brand group members` (INSERT); `Internal users can view brand group members` (SELECT)
**Triggers**: None

---
