-- VWh Projects Phase 2 — Task 2.2: milestone_id on consumption + cogs
-- milestone_id is the operator's choice at posting (nullable — consuming with no
-- milestone stays valid). cogs_entries.milestone_id is COPIED from the consumption
-- header by rpc_post_consumption (Task 2.3), mirroring the existing
-- consumer_sub_container_id / consumer_division_id denormalization, so the spend
-- report (Task 4.1) is a plain SUM. ON DELETE SET NULL keeps history if a
-- milestone is later removed.
ALTER TABLE public.consumption_entries
  ADD COLUMN milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries
  ADD COLUMN milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL;
CREATE INDEX cogs_entries_milestone_idx ON public.cogs_entries (milestone_id) WHERE milestone_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
