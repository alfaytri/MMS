-- Drop tables that back features the deploy branch no longer ships.
--
-- Audit trail (grep of src/ + supabase/migrations/ on 2026-07-24):
--   Tables below have zero .from()/.rpc()/join references in application code.
--   Their backing UIs (Teams module, Team-Leader mode, Calendar, Map, Contact
--   Centre reminders, Vehicles admin) were removed on this branch. Related
--   RPCs are dropped in the same migration so the schema doesn't leave
--   broken functions behind.
--
-- Kept intentionally:
--   * tool_asset_units — still used by the Inventory Tools & Assets tab.
--   * warehouse_stock_summary / warehouse_stock_allocations — populated by
--     triggers, read via warehouse_stock_view.
--   * customer_credit_group_approvals / customer_credit_group_requests —
--     used by the shipping credit-group admin.
--
-- Safe to reverse: the previous migration
-- (20260723300000_restore_teams_module_tables.sql) contains the CREATE
-- statements for the team-module tables should this ever need reinstating.

BEGIN;

-- ── 1. Drop functions that reference tables about to disappear ────────
DROP FUNCTION IF EXISTS public.assign_team_leader(uuid, uuid)                                                              CASCADE;
DROP FUNCTION IF EXISTS public.check_is_division_manager(uuid)                                                             CASCADE;
DROP FUNCTION IF EXISTS public.get_date_team_availability(date[], time without time zone, time without time zone)          CASCADE;
DROP FUNCTION IF EXISTS public.get_team_leader_visits(uuid, date)                                                          CASCADE;
DROP FUNCTION IF EXISTS public.swap_visit_team(uuid, uuid)                                                                 CASCADE;
DROP FUNCTION IF EXISTS public.sync_team_active_schedule(uuid)                                                             CASCADE;
DROP FUNCTION IF EXISTS public.upsert_employee_services(uuid, uuid[])                                                      CASCADE;
DROP FUNCTION IF EXISTS public.save_employee(uuid, text, text, text, date, text, text, uuid[])                             CASCADE;
DROP FUNCTION IF EXISTS public.save_employee(uuid, text, text, text, date, text, text, uuid[], uuid)                       CASCADE;
DROP FUNCTION IF EXISTS public.save_employee(uuid, text, text, text, date, text, boolean, boolean, text, uuid[])           CASCADE;
DROP FUNCTION IF EXISTS public.schedule_day_end(jsonb)                                                                     CASCADE;
DROP FUNCTION IF EXISTS public.schedule_day_start(jsonb)                                                                   CASCADE;

-- ── 2. Drop feature tables (CASCADE handles residual FKs / views) ─────
DROP TABLE IF EXISTS public.tool_assignments           CASCADE;
DROP TABLE IF EXISTS public.team_schedule_assignments  CASCADE;
DROP TABLE IF EXISTS public.team_activity_log          CASCADE;
DROP TABLE IF EXISTS public.vehicles                   CASCADE;
DROP TABLE IF EXISTS public.employees                  CASCADE;
DROP TABLE IF EXISTS public.teams                      CASCADE;
DROP TABLE IF EXISTS public.schedules                  CASCADE;

DROP TABLE IF EXISTS public.customer_blocks            CASCADE;
DROP TABLE IF EXISTS public.document_terms             CASCADE;
DROP TABLE IF EXISTS public.notification_config        CASCADE;
DROP TABLE IF EXISTS public.notification_templates     CASCADE;

-- ── 3. Enums that were owned only by the team tables ──────────────────
DROP TYPE IF EXISTS public.employee_status CASCADE;
DROP TYPE IF EXISTS public.team_tag        CASCADE;

COMMIT;
