-- Drop the legacy per-team working-hours columns (audit follow-up #2).
--
-- teams.schedule_start / schedule_end (integer hours, default 7/17) were a second,
-- redundant source of a team's working hours. Their only consumer — the follow-up
-- availability check (src/app/api/follow-up-requests/route.ts) — now derives hours
-- from the team's active schedule's `days` JSONB (falling back to its division's
-- calendar schedule, then a default window), the same single source the calendar
-- uses. With that consumer migrated these columns are dead, so remove them to keep
-- one source of truth for working hours.
BEGIN;

ALTER TABLE public.teams DROP COLUMN IF EXISTS schedule_start;
ALTER TABLE public.teams DROP COLUMN IF EXISTS schedule_end;

COMMIT;

NOTIFY pgrst, 'reload schema';
