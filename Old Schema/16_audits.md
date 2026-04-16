# 16 — Audits & Integrations

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Audit, notification trail, sync, webhook, and QuickBooks mapping tables.

---

## `activity_log`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `action` | `text` | NO | `—` |
| `details` | `text` | YES | `—` |
| `entity_type` | `text` | NO | `—` |
| `entity_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `performer_name` | `text` | YES | `—` |
| `old_data` | `jsonb` | YES | `—` |
| `new_data` | `jsonb` | YES | `—` |
| `ip_address` | `text` | YES | `—` |
| `severity` | `text` | YES | `—` |
| `module` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `activity_log_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert activity_log` (INSERT); `Internal can select activity_log` (SELECT)
**Triggers**: None

---
## `notification_trail`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `notification_type` | `text` | NO | `—` |
| `notification_label` | `text` | NO | `—` |
| `category` | `notification_category` | NO | `—` |
| `channel` | `notification_channel` | NO | `—` |
| `recipient_name` | `text` | NO | `—` |
| `recipient_phone` | `text` | NO | `—` |
| `trigger_type` | `notification_trigger` | NO | `—` |
| `trigger_detail` | `text` | YES | `—` |
| `order_id` | `text` | YES | `—` |
| `status` | `notification_status` | NO | `—` |
| `error_message` | `text` | YES | `—` |
| `message_preview` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `provider` | `text` | YES | `—` |
| `external_message_id` | `text` | YES | `—` |
| `delivery_status` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `notification_trail_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert notification_trail` (INSERT); `Internal can select notification_trail` (SELECT)
**Triggers**: None

---
## `sync_state`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `text` | NO | `'singleton'::text` |
| `last_3cx_sync_at` | `timestamp with time zone` | YES | `'2020-01-01 00:00:00+00'::timestamp with time zone` |
| `last_wati_sync_at` | `timestamp with time zone` | YES | `'2020-01-01 00:00:00+00'::timestamp with time zone` |
| `last_whapi_sync_at` | `timestamp with time zone` | YES | `'2020-01-01 00:00:00+00'::timestamp with time zone` |
| `created_at` | `timestamp with time zone` | YES | `now()` |
| `updated_at` | `timestamp with time zone` | YES | `now()` |

**Primary key**: `id`
**Foreign keys**: None
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage sync_state` (ALL)
**Triggers**: `trg_sync_state_updated_at` → `set_updated_at`

---
## `webhook_logs`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `source` | `text` | NO | `—` |
| `event_type` | `text` | YES | `—` |
| `payload` | `jsonb` | NO | `—` |
| `status_code` | `integer` | YES | `—` |
| `processed` | `boolean` | YES | `false` |
| `error_message` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `webhook_logs_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can view webhook_logs` (SELECT)
**Triggers**: None

---
## `qb_accounts`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `qb_id` | `text` | NO | `—` |
| `name` | `text` | NO | `—` |
| `acct_num` | `text` | YES | `—` |
| `account_type` | `text` | NO | `—` |
| `account_sub_type` | `text` | YES | `—` |
| `classification` | `text` | NO | `—` |
| `fully_qualified_name` | `text` | YES | `—` |
| `active` | `boolean` | NO | `true` |
| `current_balance` | `numeric` | YES | `—` |
| `qb_company` | `text` | NO | `'alfaytri'::text` |
| `synced_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: None
**Unique constraints**: `qb_accounts_qb_id_qb_company_key` (`qb_id`, `qb_company`)
**RLS enabled**: Yes
**Policies**: `Admin can manage qb_accounts` (ALL); `Anon can read qb_accounts` (SELECT); `Authenticated users can read qb_accounts` (SELECT); `Internal can select qb_accounts` (SELECT)
**Triggers**: None

---
## `qb_division_mappings`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `division` | `text` | NO | `—` |
| `mapping_type` | `text` | NO | `—` |
| `mapping_key` | `text` | YES | `—` |
| `qb_account_id` | `uuid` | YES | `—` |
| `qb_item_id` | `uuid` | YES | `—` |
| `qb_company` | `text` | NO | `'alfaytri'::text` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `qb_division_mappings_qb_account_id_fkey`: `qb_account_id` → `qb_accounts` (`id`); `qb_division_mappings_qb_item_id_fkey`: `qb_item_id` → `qb_items` (`id`)
**Unique constraints**: `qb_division_mappings_division_mapping_type_mapping_key_qb_c_key` (`division`, `mapping_type`, `mapping_key`, `qb_company`)
**RLS enabled**: Yes
**Policies**: `Admin can manage qb_division_mappings` (ALL); `Anon can read qb_division_mappings` (SELECT); `Authenticated users can read qb_division_mappings` (SELECT); `Internal can select qb_division_mappings` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `qb_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `qb_id` | `text` | NO | `—` |
| `name` | `text` | NO | `—` |
| `type` | `text` | YES | `—` |
| `income_account_ref` | `text` | YES | `—` |
| `expense_account_ref` | `text` | YES | `—` |
| `active` | `boolean` | NO | `true` |
| `qb_company` | `text` | NO | `'alfaytri'::text` |
| `synced_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: None
**Unique constraints**: `qb_items_qb_id_qb_company_key` (`qb_id`, `qb_company`)
**RLS enabled**: Yes
**Policies**: `Admin can manage qb_items` (ALL); `Anon can read qb_items` (SELECT); `Authenticated users can read qb_items` (SELECT); `Internal can select qb_items` (SELECT)
**Triggers**: None

---
