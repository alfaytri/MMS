-- 20260919010400_mep_consumption_project_code_fks.sql — MEP skeleton 5/7
BEGIN;
ALTER TABLE public.consumption_entries
  ADD COLUMN IF NOT EXISTS project_id        uuid REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS milestone_code_id uuid REFERENCES public.milestone_codes(id);
ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS project_id        uuid REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS milestone_code_id uuid REFERENCES public.milestone_codes(id);

-- Backfill project_id from the consumer pool sub-container.
UPDATE public.consumption_entries ce
   SET project_id = sc.project_id
  FROM public.warehouse_sub_containers sc
 WHERE ce.consumer_sub_container_id = sc.id AND ce.project_id IS NULL AND sc.project_id IS NOT NULL;
UPDATE public.cogs_entries c
   SET project_id = sc.project_id
  FROM public.warehouse_sub_containers sc
 WHERE c.consumer_sub_container_id = sc.id AND c.project_id IS NULL AND sc.project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cogs_entries_project_idx        ON public.cogs_entries (project_id)        WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cogs_entries_milestone_code_idx ON public.cogs_entries (milestone_code_id) WHERE milestone_code_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
