-- 20260919010450_mep_project_milestones_label_nullable.sql — MEP Phase 2 prerequisite fix
-- Root cause: the Task-4 reshape (20260919010300) added `name` to
-- project_milestones and backfilled it from `label`, and dropped every
-- UNIQUE constraint that referenced `label`, but left `label` NOT NULL in
-- place. rpc_upsert_project_milestone (Task 6, 20260919010500) inserts by
-- `name`, never sets `label`, so every insert blows up on a not-null
-- violation until this is relaxed. Purely additive: only relaxes a
-- constraint, touches no existing rows. The old add_project_milestone RPC
-- (still used by the pre-Task-6 MilestoneManager UI) keeps populating
-- `label` explicitly on its own insert path, so it is unaffected.
BEGIN;

ALTER TABLE public.project_milestones ALTER COLUMN label DROP NOT NULL;

COMMIT;
NOTIFY pgrst, 'reload schema';
