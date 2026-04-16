# 03 — Customers

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Customer master data, contact details, addresses, tokens, and subscription linkage.

---

## `customers`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `email` | `text` | YES | `—` |
| `customer_type` | `text` | YES | `'individual'::text` |
| `is_blocked` | `boolean` | YES | `false` |
| `block_reason` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `dibsy_customer_id` | `text` | YES | `—` |
| `language` | `text` | YES | `'ar'::text` |
| `credit_category_id` | `uuid` | YES | `—` |
| `customer_number` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `customers_created_by_fkey`: `created_by` → `profiles` (`id`); `customers_credit_category_id_fkey`: `credit_category_id` → `credit_categories` (`id`)
**Unique constraints**: `customers_customer_number_key` (`customer_number`)
**RLS enabled**: Yes
**Policies**: `Admin can delete customers` (DELETE); `Internal can insert customers` (INSERT); `Internal can select customers` (SELECT); `Internal can update customers` (UPDATE)
**Triggers**: `trg_generate_customer_number` → `generate_customer_number`; `trg_updated_at` → `set_updated_at`

---
## `customer_phones`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `customer_id` | `uuid` | NO | `—` |
| `phone` | `text` | NO | `—` |
| `label` | `text` | NO | `'mobile'::text` |
| `is_primary` | `boolean` | NO | `false` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `customer_phones_created_by_fkey`: `created_by` → `profiles` (`id`); `customer_phones_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: `uq_customer_phones_phone` (`phone`)
**RLS enabled**: Yes
**Policies**: `Internal users can delete customer phones` (DELETE); `Internal users can insert customer phones` (INSERT); `Internal users can update customer phones` (UPDATE); `Internal users can view all customer phones` (SELECT)
**Triggers**: `trg_customer_phones_updated_at` → `set_updated_at`; `trg_ensure_one_primary_phone` → `ensure_one_primary_phone`

---
## `customer_addresses`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `customer_id` | `uuid` | NO | `—` |
| `label` | `text` | NO | `—` |
| `line` | `text` | NO | `—` |
| `type` | `address_type` | NO | `—` |
| `country` | `text` | YES | `'Qatar'::text` |
| `coords_lat` | `numeric` | YES | `—` |
| `coords_lng` | `numeric` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `local_address` | `jsonb` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `customer_addresses_created_by_fkey`: `created_by` → `profiles` (`id`); `customer_addresses_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can delete customer_addresses` (DELETE); `Internal can insert customer_addresses` (INSERT); `Internal can select customer_addresses` (SELECT); `Internal can update customer_addresses` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `mep_projects`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `project_code` | `text` | NO | `—` |
| `pin` | `text` | YES | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `address_id` | `uuid` | NO | `—` |
| `coords_lat` | `numeric` | YES | `—` |
| `coords_lng` | `numeric` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `mep_projects_address_id_fkey`: `address_id` → `customer_addresses` (`id`); `mep_projects_created_by_fkey`: `created_by` → `users` (`id`); `mep_projects_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage mep_projects` (ALL)
**Triggers**: `set_updated_at_mep_projects` → `set_updated_at`

---
## `customer_tokens`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `token` | `text` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `purpose` | `token_purpose` | NO | `—` |
| `related_id` | `text` | YES | `—` |
| `expires_at` | `timestamp with time zone` | YES | `—` |
| `used_at` | `timestamp with time zone` | YES | `—` |
| `metadata` | `jsonb` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `customer_tokens_created_by_fkey`: `created_by` → `profiles` (`id`); `customer_tokens_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: `customer_tokens_token_key` (`token`)
**RLS enabled**: Yes
**Policies**: `Internal can view customer_tokens` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `customer_subscriptions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `customer_id` | `uuid` | NO | `—` |
| `package_id` | `uuid` | NO | `—` |
| `start_date` | `date` | NO | `—` |
| `end_date` | `date` | NO | `—` |
| `auto_renew` | `boolean` | NO | `true` |
| `status` | `subscription_status` | NO | `'pending_payment'::subscription_status` |
| `initial_fee_paid` | `boolean` | NO | `false` |
| `payment_reference` | `text` | YES | `—` |
| `renewed_from` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `cancelled_at` | `timestamp with time zone` | YES | `—` |
| `cancellation_reason` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `customer_subscriptions_created_by_fkey`: `created_by` → `profiles` (`id`); `customer_subscriptions_customer_id_fkey`: `customer_id` → `customers` (`id`); `customer_subscriptions_package_id_fkey`: `package_id` → `subscription_packages` (`id`); `customer_subscriptions_renewed_from_fkey`: `renewed_from` → `customer_subscriptions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `anon_insert_customer_subs` (INSERT); `anon_select_own_customer_subs` (SELECT); `internal_all_customer_subs` (ALL)
**Triggers**: `set_updated_at_customer_subscriptions` → `set_updated_at`

---
## `credit_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `payment_methods` | `text[]` | YES | `'{}'::text[]` |
| `max_amount` | `numeric` | YES | `0` |
| `max_days` | `integer` | YES | `0` |
| `active` | `boolean` | YES | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `credit_categories_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage credit_categories` (ALL); `Internal can select credit_categories` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
