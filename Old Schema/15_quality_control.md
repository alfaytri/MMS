# 15 — Quality Control

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Quality-control checklist, scheduling, scoring, and result tables.

---

## `qc_checklists`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `service_id` | `uuid` | YES | `—` |
| `service_name` | `text` | YES | `—` |
| `is_general` | `boolean` | YES | `false` |
| `label` | `text` | NO | `—` |
| `max_score` | `integer` | YES | `10` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `qc_checklists_created_by_fkey`: `created_by` → `profiles` (`id`); `qc_checklists_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert qc_checklists` (INSERT); `Internal can select qc_checklists` (SELECT); `Internal can update qc_checklists` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `qc_schedule`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `team_id` | `uuid` | NO | `—` |
| `service_name` | `text` | NO | `—` |
| `scheduled_date` | `date` | NO | `—` |
| `status` | `qc_schedule_status` | YES | `'pending'::qc_schedule_status` |
| `priority` | `qc_priority` | YES | `'medium'::qc_priority` |
| `reason` | `text` | YES | `—` |
| `assigned_qc_team_id` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `visit_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `qc_schedule_assigned_qc_team_id_fkey`: `assigned_qc_team_id` → `teams` (`id`); `qc_schedule_created_by_fkey`: `created_by` → `profiles` (`id`); `qc_schedule_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert qc_schedule` (INSERT); `Internal can select qc_schedule` (SELECT); `Internal can update qc_schedule` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `qc_inspection_results`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `schedule_entry_id` | `uuid` | NO | `—` |
| `order_id` | `text` | NO | `—` |
| `team_id` | `uuid` | NO | `—` |
| `qc_team_id` | `uuid` | NO | `—` |
| `date` | `date` | NO | `—` |
| `service_checklist` | `jsonb` | YES | `'[]'::jsonb` |
| `general_checklist` | `jsonb` | YES | `'[]'::jsonb` |
| `total_score` | `integer` | YES | `0` |
| `max_possible_score` | `integer` | YES | `0` |
| `percentage` | `integer` | YES | `0` |
| `notes` | `text` | YES | `—` |
| `images` | `text[]` | YES | `'{}'::text[]` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `qc_inspection_results_created_by_fkey`: `created_by` → `profiles` (`id`); `qc_inspection_results_qc_team_id_fkey`: `qc_team_id` → `teams` (`id`); `qc_inspection_results_schedule_entry_id_fkey`: `schedule_entry_id` → `qc_schedule` (`id`); `qc_inspection_results_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert qc_inspection_results` (INSERT); `Internal can select qc_inspection_results` (SELECT)
**Triggers**: None

---
## `qc_team_scores`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `team_id` | `uuid` | NO | `—` |
| `current_score` | `integer` | YES | `0` |
| `total_inspections` | `integer` | YES | `0` |
| `last_inspection` | `date` | YES | `—` |
| `member_change_date` | `date` | YES | `—` |
| `previous_scores` | `jsonb` | YES | `'[]'::jsonb` |
| `service_history` | `text[]` | YES | `'{}'::text[]` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `qc_team_scores_created_by_fkey`: `created_by` → `profiles` (`id`); `qc_team_scores_division_id_fkey`: `division_id` → `divisions` (`id`); `qc_team_scores_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert qc_team_scores` (INSERT); `Internal can select qc_team_scores` (SELECT); `Internal can update qc_team_scores` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
