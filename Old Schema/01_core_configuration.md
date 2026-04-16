# 01 — Core Configuration

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Core configuration and shared setup tables.

---

## `companies`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name_en` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `cr_number` | `text` | YES | `—` |
| `vat_id` | `text` | YES | `—` |
| `default_currency` | `character varying(3)` | NO | `'QAR'::character varying` |
| `default_tax_rate` | `numeric` | NO | `0` |
| `logo_url` | `text` | YES | `—` |
| `address_en` | `text` | YES | `—` |
| `address_ar` | `text` | YES | `—` |
| `is_active` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `companies_created_by_fkey`: `created_by` → `users` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can insert companies` (INSERT); `Admin can update companies` (UPDATE); `Internal users can read companies` (SELECT)
**Triggers**: `trg_companies_updated_at` → `set_updated_at`

---
## `divisions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `slug` | `text` | NO | `—` |
| `name` | `text` | NO | `—` |
| `short_name` | `text` | YES | `—` |
| `color` | `text` | NO | `'#2563eb'::text` |
| `css_classes` | `text` | YES | `—` |
| `company_name_en` | `text` | YES | `—` |
| `company_name_ar` | `text` | YES | `—` |
| `address_en` | `text` | YES | `—` |
| `address_ar` | `text` | YES | `—` |
| `logo_url` | `text` | YES | `—` |
| `stamp_url` | `text` | YES | `—` |
| `is_active` | `boolean` | NO | `true` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `footer_motto` | `text` | YES | `—` |
| `default_currency` | `character varying(3)` | NO | `'QAR'::character varying` |
| `default_tax_rate` | `numeric` | NO | `0` |
| `company_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `divisions_company_id_fkey`: `company_id` → `companies` (`id`); `divisions_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `divisions_slug_key` (`slug`)
**RLS enabled**: Yes
**Policies**: `Admin can delete divisions` (DELETE); `Admin can insert divisions` (INSERT); `Admin can update divisions` (UPDATE); `Internal users can read divisions` (SELECT)
**Triggers**: `trg_divisions_updated_at` → `set_updated_at`

---
## `app_settings`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `key` | `text` | NO | `—` |
| `value` | `jsonb` | NO | `'{}'::jsonb` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `updated_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `app_settings_updated_by_fkey`: `updated_by` → `profiles` (`id`)
**Unique constraints**: `app_settings_key_key` (`key`)
**RLS enabled**: Yes
**Policies**: `Admin can insert app_settings` (INSERT); `Admin can update app_settings` (UPDATE); `Internal users can read app_settings` (SELECT)
**Triggers**: `trg_app_settings_updated_at` → `set_updated_at`

---
## `document_terms`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `document_type` | `text` | NO | `—` |
| `content_ar` | `text` | NO | `''::text` |
| `content_en` | `text` | NO | `''::text` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `document_terms_created_by_fkey`: `created_by` → `profiles` (`id`); `document_terms_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage document_terms` (ALL); `Internal can select document_terms` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `reason_lists`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category` | `text` | NO | `—` |
| `label` | `text` | NO | `—` |
| `active` | `boolean` | YES | `true` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `division_ids` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `reason_lists_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admin can manage reason_lists` (ALL); `Internal can select reason_lists` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `pricing_factors`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `category` | `text` | NO | `—` |
| `label` | `text` | NO | `—` |
| `label_ar` | `text` | YES | `—` |
| `factor` | `numeric` | NO | `1.0` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `pricing_factors_created_by_fkey`: `created_by` → `profiles` (`id`); `pricing_factors_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can delete pricing_factors` (DELETE); `Internal users can insert pricing_factors` (INSERT); `Internal users can read pricing_factors` (SELECT); `Internal users can update pricing_factors` (UPDATE)
**Triggers**: `set_pricing_factors_updated_at` → `set_updated_at`

---
## `notification_config`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `slug` | `text` | NO | `—` |
| `label` | `text` | NO | `—` |
| `label_ar` | `text` | YES | `—` |
| `category` | `text` | NO | `—` |
| `trigger_type` | `text` | NO | `—` |
| `timing_description` | `text` | YES | `—` |
| `template_slug` | `text` | NO | `—` |
| `is_active` | `boolean` | NO | `true` |
| `requires_portal` | `boolean` | NO | `false` |
| `portal_purpose` | `text` | YES | `—` |
| `has_media_followup` | `boolean` | NO | `false` |
| `media_description` | `text` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `notification_config_created_by_fkey`: `created_by` → `profiles` (`id`); `notification_config_template_slug_fkey`: `template_slug` → `notification_templates` (`slug`)
**Unique constraints**: `notification_config_slug_key` (`slug`)
**RLS enabled**: Yes
**Policies**: `Admins can manage notification_config` (ALL); `Internal users can read notification_config` (SELECT)
**Triggers**: `trg_notification_config_updated_at` → `set_updated_at`

---
## `notification_templates`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `slug` | `text` | NO | `—` |
| `wati_template_name` | `text` | NO | `''::text` |
| `description` | `text` | YES | `—` |
| `media_type` | `text` | NO | `'none'::text` |
| `has_buttons` | `boolean` | NO | `false` |
| `button_type` | `text` | YES | `—` |
| `button_url_suffix_param` | `text` | YES | `—` |
| `param_count` | `integer` | NO | `0` |
| `param_names` | `jsonb` | YES | `'[]'::jsonb` |
| `is_active` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `notification_templates_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `notification_templates_slug_key` (`slug`)
**RLS enabled**: Yes
**Policies**: `Admins can manage notification_templates` (ALL); `Internal users can read notification_templates` (SELECT)
**Triggers**: `trg_notification_templates_updated_at` → `set_updated_at`

---
