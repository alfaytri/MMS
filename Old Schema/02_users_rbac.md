# 02 — Users & RBAC

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Authentication-adjacent profile data, roles, and phone line permissions.

---

## `profiles`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `auth_user_id` | `uuid` | NO | `—` |
| `user_type` | `user_type` | NO | `'internal'::user_type` |
| `full_name` | `text` | NO | `—` |
| `full_name_ar` | `text` | YES | `—` |
| `phone` | `text` | YES | `—` |
| `email` | `text` | YES | `—` |
| `avatar_url` | `text` | YES | `—` |
| `is_active` | `boolean` | YES | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `cx_extension` | `text` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `profiles_auth_user_id_fkey`: `auth_user_id` → `users` (`id`); `profiles_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: `profiles_auth_user_id_key` (`auth_user_id`)
**RLS enabled**: Yes
**Policies**: `Admins can manage all profiles` (ALL); `Admins can read all profiles` (SELECT); `Users can create own profile` (INSERT); `Users can read own profile` (SELECT); `Users can update own profile` (UPDATE)
**Triggers**: `trg_profiles_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `custom_roles`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `description` | `text` | YES | `—` |
| `color` | `text` | YES | `'bg-primary/15 text-primary border-primary/30'::text` |
| `permissions` | `text[]` | NO | `'{}'::text[]` |
| `is_system` | `boolean` | YES | `false` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `custom_roles_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: `custom_roles_name_key` (`name`)
**RLS enabled**: Yes
**Policies**: `Admins can manage custom_roles` (ALL); `Internal users can view custom_roles` (SELECT)
**Triggers**: `set_custom_roles_updated_at` → `set_updated_at`

---
## `user_custom_roles`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `profile_id` | `uuid` | NO | `—` |
| `role_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `user_custom_roles_created_by_fkey`: `created_by` → `profiles` (`id`); `user_custom_roles_profile_id_fkey`: `profile_id` → `profiles` (`id`); `user_custom_roles_role_id_fkey`: `role_id` → `custom_roles` (`id`)
**Unique constraints**: `user_custom_roles_profile_id_role_id_key` (`profile_id`, `role_id`)
**RLS enabled**: Yes
**Policies**: `Admins can manage user_custom_roles` (ALL); `Internal users can view user_custom_roles` (SELECT)
**Triggers**: None

---
## `user_divisions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `profile_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | NO | `—` |

**Primary key**: `id`
**Foreign keys**: `user_divisions_created_by_fkey`: `created_by` → `profiles` (`id`); `user_divisions_division_id_fkey`: `division_id` → `divisions` (`id`); `user_divisions_profile_id_fkey`: `profile_id` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admins can manage user_divisions` (ALL); `Internal users can view user_divisions` (SELECT)
**Triggers**: None

---
## `phone_lines_3cx`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `label` | `text` | NO | `—` |
| `number` | `text` | NO | `—` |
| `is_emergency` | `boolean` | NO | `false` |
| `cx_dn` | `text` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |
| `is_active` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `phone_lines_3cx_division_id_fkey`: `division_id` → `divisions` (`id`); `phone_lines_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Admins can delete phone lines` (DELETE); `Admins can insert phone lines` (INSERT); `Admins can update phone lines` (UPDATE); `Internal users can read phone lines` (SELECT)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `phone_line_permissions_3cx`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `profile_id` | `uuid` | NO | `—` |
| `phone_line_id` | `uuid` | NO | `—` |
| `can_call` | `boolean` | NO | `true` |
| `can_receive` | `boolean` | NO | `true` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `user_phone_line_permissions_created_by_fkey`: `created_by` → `profiles` (`id`); `user_phone_line_permissions_phone_line_id_fkey`: `phone_line_id` → `phone_lines_3cx` (`id`); `user_phone_line_permissions_profile_id_fkey`: `profile_id` → `profiles` (`id`)
**Unique constraints**: `user_phone_line_permissions_profile_id_phone_line_id_key` (`profile_id`, `phone_line_id`)
**RLS enabled**: Yes
**Policies**: `Admins can manage line permissions` (ALL); `Internal users can view line permissions` (SELECT)
**Triggers**: `trg_user_phone_line_permissions_updated_at` → `set_updated_at`

---
