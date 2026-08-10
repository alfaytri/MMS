-- Warehouse Origin Visibility follow-up — inventory-check cancellation.
--
-- The check detail dialog now offers a "Cancel Check" action that abandons an
-- unfinalized check (draft / in_progress / pending_approval) and records the
-- event in inventory_check_log with event_type = 'cancelled'.
--
-- inventory_check_log.event_type is the native enum
-- public.inventory_check_event_type (migration 20260726080000), currently:
--   initialized · user_completed · all_counted · approval_action ·
--   approved · rejected · user_started (added 20260727050000)
-- It has no 'cancelled' member, so the INSERT would abort with
--   invalid input value for enum inventory_check_event_type: "cancelled"
--
-- Fix: one-line ADD VALUE. Mirrors 20260727050000 — no explicit transaction
-- wrapper (ALTER TYPE ... ADD VALUE cannot run inside a BEGIN/COMMIT block on
-- older PG; the value is not used within this migration).

ALTER TYPE public.inventory_check_event_type ADD VALUE IF NOT EXISTS 'cancelled';
