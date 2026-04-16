# 05 — Teams & Employees

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Team, employee, vehicle, schedule, and tracking tables.

---

## `teams`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `vehicle_id` | `uuid` | YES | `—` |
| `schedule_id` | `uuid` | YES | `—` |
| `leader_id` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `whapi_phone` | `text` | YES | `—` |
| `phone` | `text` | NO | `''::text` |
| `traccar_device_id` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `name_ar` | `text` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |
| `is_emergency` | `boolean` | NO | `false` |
| `is_qc` | `boolean` | NO | `false` |

**Primary key**: `id`
**Foreign keys**: `teams_created_by_fkey`: `created_by` → `profiles` (`id`); `teams_division_id_fkey`: `division_id` → `divisions` (`id`); `teams_leader_id_fkey`: `leader_id` → `employees` (`id`); `teams_schedule_id_fkey`: `schedule_id` → `schedules` (`id`); `teams_traccar_device_id_fkey`: `traccar_device_id` → `traccar_devices` (`id`); `teams_vehicle_id_fkey`: `vehicle_id` → `vehicles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert teams` (INSERT); `Internal can select teams` (SELECT); `Internal can update teams` (UPDATE)
**Triggers**: `trg_teams_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `employees`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `phone` | `text` | YES | `—` |
| `status` | `employee_status` | YES | `'active'::employee_status` |
| `team_id` | `uuid` | YES | `—` |
| `avatar` | `text` | YES | `—` |
| `join_date` | `date` | NO | `—` |
| `nationality` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `site_visit_order` | `boolean` | NO | `false` |
| `site_visit_quotation` | `boolean` | NO | `false` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `profile_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `employees_created_by_fkey`: `created_by` → `profiles` (`id`); `employees_profile_id_fkey`: `profile_id` → `profiles` (`id`); `fk_employee_team`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert employees` (INSERT); `Internal can select employees` (SELECT); `Internal can update employees` (UPDATE)
**Triggers**: `trg_employees_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `employee_services`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `employee_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `employee_services_created_by_fkey`: `created_by` → `profiles` (`id`); `employee_services_employee_id_fkey`: `employee_id` → `employees` (`id`); `employee_services_service_id_fkey`: `service_id` → `services` (`id`)
**Unique constraints**: `employee_services_employee_id_service_id_key` (`employee_id`, `service_id`)
**RLS enabled**: Yes
**Policies**: `Internal full access on employee_services` (ALL)
**Triggers**: None

---
## `vehicles`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `type` | `vehicle_type` | NO | `—` |
| `plate` | `text` | NO | `—` |
| `team_id` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `traccar_device_id` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `fk_vehicle_team`: `team_id` → `teams` (`id`); `vehicles_created_by_fkey`: `created_by` → `profiles` (`id`); `vehicles_traccar_device_id_fkey`: `traccar_device_id` → `traccar_devices` (`id`)
**Unique constraints**: `vehicles_plate_unique` (`plate`)
**RLS enabled**: Yes
**Policies**: `Internal can insert vehicles` (INSERT); `Internal can select vehicles` (SELECT); `Internal can update vehicles` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`; `trg_vehicles_updated_at` → `set_updated_at`

---
## `schedules`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `days` | `jsonb` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `schedules_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert schedules` (INSERT); `Internal can select schedules` (SELECT); `Internal can update schedules` (UPDATE)
**Triggers**: `trg_schedules_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `team_schedule_assignments`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `team_id` | `uuid` | NO | `—` |
| `schedule_id` | `uuid` | NO | `—` |
| `start_date` | `date` | NO | `—` |
| `end_date` | `date` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `team_schedule_assignments_created_by_fkey`: `created_by` → `profiles` (`id`); `team_schedule_assignments_schedule_id_fkey`: `schedule_id` → `schedules` (`id`); `team_schedule_assignments_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can delete team_schedule_assignments` (DELETE); `Internal can insert team_schedule_assignments` (INSERT); `Internal can select team_schedule_assignments` (SELECT); `Internal can update team_schedule_assignments` (UPDATE)
**Triggers**: `trg_team_schedule_assignments_updated_at` → `set_updated_at`; `trg_updated_at` → `set_updated_at`

---
## `team_live_locations`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `visit_id` | `uuid` | NO | `—` |
| `team_id` | `uuid` | NO | `—` |
| `lat` | `numeric` | NO | `—` |
| `lng` | `numeric` | NO | `—` |
| `accuracy` | `numeric` | YES | `—` |
| `heading` | `numeric` | YES | `—` |
| `speed` | `numeric` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `team_live_locations_created_by_fkey`: `created_by` → `profiles` (`id`); `team_live_locations_visit_id_fkey`: `visit_id` → `visits` (`id`); `team_live_locations_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: `uq_team_live_loc_visit_team` (`visit_id`, `team_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert team_live_locations` (INSERT); `Internal can select team_live_locations` (SELECT); `Internal can update team_live_locations` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `visit_timeline_events`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `visit_id` | `uuid` | NO | `—` |
| `team_id` | `uuid` | NO | `—` |
| `event_type` | `text` | NO | `—` |
| `event_time` | `timestamp with time zone` | NO | `now()` |
| `lat` | `numeric` | YES | `—` |
| `lng` | `numeric` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `visit_timeline_events_created_by_fkey`: `created_by` → `profiles` (`id`); `visit_timeline_events_visit_id_fkey`: `visit_id` → `visits` (`id`); `visit_timeline_events_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can insert timeline events` (INSERT); `Internal users can view timeline events` (SELECT)
**Triggers**: None

---
## `traccar_devices`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `traccar_device_id` | `text` | NO | `—` |
| `device_type` | `text` | NO | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `traccar_devices_created_by_fkey`: `created_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can delete traccar_devices` (DELETE); `Internal users can insert traccar_devices` (INSERT); `Internal users can read traccar_devices` (SELECT); `Internal users can update traccar_devices` (UPDATE)
**Triggers**: `trg_traccar_devices_updated_at` → `set_updated_at`; `trg_validate_traccar_device_type` → `validate_traccar_device_type`

---
