# 06 — Promotions & Subscriptions

> **Source**: Live public schema snapshot generated from the database on 2026-03-25 (updated).

Campaigns, rules, vouchers, discounts, and subscription package tables.

---

## `promotion_campaigns`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `description` | `text` | YES | `—` |
| `start_date` | `date` | NO | `—` |
| `end_date` | `date` | NO | `—` |
| `status` | `campaign_status` | YES | `'scheduled'::campaign_status` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `division_ids` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `promotion_campaigns_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage promotion_campaigns` (ALL); `Internal can insert promotion_campaigns` (INSERT); `Internal can select promotion_campaigns` (SELECT); `Internal can update promotion_campaigns` (UPDATE)
**Triggers**: `set_updated_at_promotion_campaigns` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `promotion_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `campaign_id` | `uuid` | NO | `—` |
| `type` | `promotion_rule_type` | NO | `—` |
| `service_ids` | `uuid[]` | YES | `—` |
| `discount_percent` | `numeric` | YES | `—` |
| `discount_amount` | `numeric` | YES | `—` |
| `free_service_id` | `uuid` | YES | `—` |
| `description` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `discount_target` | `text` | NO | `'service'::text` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `promotion_rules_campaign_id_fkey`: `campaign_id` → `promotion_campaigns` (`id`); `promotion_rules_created_by_fkey`: `created_by` → `profiles` (`id`); `promotion_rules_free_service_id_fkey`: `free_service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can delete promotion_rules` (DELETE); `Internal can insert promotion_rules` (INSERT); `Internal can select promotion_rules` (SELECT); `Internal can update promotion_rules` (UPDATE)
**Triggers**: `set_updated_at_promotion_rules` → `set_updated_at`; `trg_validate_promotion_discount_target` → `validate_promotion_discount_target`

---
## `vouchers`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `code` | `text` | NO | `—` |
| `campaign_id` | `uuid` | NO | `—` |
| `type` | `voucher_type` | YES | `'single_use'::voucher_type` |
| `usage_limit` | `integer` | YES | `—` |
| `usage_count` | `integer` | YES | `0` |
| `min_order_value` | `numeric` | YES | `—` |
| `max_discount` | `numeric` | YES | `—` |
| `is_active` | `boolean` | YES | `true` |
| `expires_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `vouchers_campaign_id_fkey`: `campaign_id` → `promotion_campaigns` (`id`); `vouchers_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `vouchers_code_key` (`code`)
**RLS enabled**: Yes
**Policies**: `Internal can delete vouchers` (DELETE); `Internal can insert vouchers` (INSERT); `Internal can select vouchers` (SELECT); `Internal can update vouchers` (UPDATE)
**Triggers**: `set_updated_at_vouchers` → `set_updated_at`; `set_vouchers_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `business_customer_discounts`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `entity_type` | `text` | NO | `—` |
| `entity_name` | `text` | YES | `—` |
| `discount_percent` | `numeric` | NO | `—` |
| `service_ids` | `uuid[]` | YES | `'{}'::uuid[]` |
| `requires_work_id` | `boolean` | NO | `true` |
| `work_id_label` | `text` | YES | `'Work ID'::text` |
| `contract_id` | `uuid` | YES | `—` |
| `is_active` | `boolean` | NO | `true` |
| `start_date` | `date` | YES | `—` |
| `end_date` | `date` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `contract_copy_url` | `text` | YES | `—` |
| `work_id_example_url` | `text` | YES | `—` |
| `division_ids` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `business_customer_discounts_contract_id_fkey`: `contract_id` → `contracts` (`id`); `business_customer_discounts_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can delete business discounts` (DELETE); `Internal users can insert business discounts` (INSERT); `Internal users can read business discounts` (SELECT); `Internal users can update business discounts` (UPDATE)
**Triggers**: `set_updated_at_business_customer_discounts` → `set_updated_at`; `trg_bcd_updated_at` → `set_updated_at`

---
## `subscription_packages`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `description` | `text` | YES | `—` |
| `discount_percent` | `numeric(5,2)` | NO | `0` |
| `initial_fee` | `numeric(10,2)` | NO | `0` |
| `duration_months` | `integer` | NO | `12` |
| `priority_response` | `priority_response` | NO | `'none'::priority_response` |
| `auto_renew_default` | `boolean` | NO | `true` |
| `sort_order` | `integer` | NO | `0` |
| `is_active` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `response_hours` | `integer` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `subscription_packages_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `internal_insert_packages` (INSERT); `internal_select_packages` (SELECT); `internal_update_packages` (UPDATE); `public_select_active_packages` (SELECT)
**Triggers**: `set_updated_at_subscription_packages` → `set_updated_at`

---
## `subscription_package_services`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `package_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `subscription_package_services_package_id_fkey`: `package_id` → `subscription_packages` (`id`); `subscription_package_services_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `subscription_package_services_package_id_service_id_key` (`package_id`, `service_id`)
**RLS enabled**: Yes
**Policies**: `internal_delete_pkg_services` (DELETE); `internal_insert_pkg_services` (INSERT); `internal_select_pkg_services` (SELECT); `public_select_pkg_services` (SELECT)
**Triggers**: None

---
## `subscription_usage_log`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `subscription_id` | `uuid` | NO | `—` |
| `order_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | NO | `—` |
| `service_name` | `text` | NO | `—` |
| `original_amount` | `numeric(10,2)` | NO | `—` |
| `discount_amount` | `numeric(10,2)` | NO | `—` |
| `final_amount` | `numeric(10,2)` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `subscription_usage_log_order_id_fkey`: `order_id` → `orders` (`id`); `subscription_usage_log_service_id_fkey`: `service_id` → `services` (`id`); `subscription_usage_log_subscription_id_fkey`: `subscription_id` → `customer_subscriptions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `anon_select_usage_log` (SELECT); `internal_all_usage_log` (ALL)
**Triggers**: None

---
