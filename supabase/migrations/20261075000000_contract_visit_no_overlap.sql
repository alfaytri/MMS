-- Team Scheduling — double-booking guard.
--
-- A team cannot be placed on two overlapping contract visits on the same day.
-- btree_gist lets team_id equality + a from→to range overlap live in one GiST
-- exclusion constraint. Partial (fully-timed, non-completed) so unscheduled and
-- historical rows never conflict; NULL times are ignored by exclusion anyway.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- from < to: reject invalid ranges cleanly (and keep the tsrange below valid).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contract_visit_time_order') THEN
    ALTER TABLE public.contract_visits
      ADD CONSTRAINT chk_contract_visit_time_order
      CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time);
  END IF;
END $$;

-- No two active (non-completed) contract visits for the same team may overlap
-- in time on the same day.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_visit_no_team_overlap') THEN
    ALTER TABLE public.contract_visits
      ADD CONSTRAINT contract_visit_no_team_overlap
      EXCLUDE USING gist (
        team_id WITH =,
        tsrange((scheduled_date + start_time), (scheduled_date + end_time)) WITH &&
      )
      WHERE (team_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND completed IS NOT TRUE);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
