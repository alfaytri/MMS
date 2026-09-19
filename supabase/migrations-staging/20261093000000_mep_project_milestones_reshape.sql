-- 20260919010300_mep_project_milestones_reshape.sql — MEP skeleton 4/7
BEGIN;
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS project_id   uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS milestone_no int,
  ADD COLUMN IF NOT EXISTS name         text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS amount       numeric,
  ADD COLUMN IF NOT EXISTS status       text;

-- Backfill project_id from the pool sub-container; name from label.
UPDATE public.project_milestones pm
   SET project_id = sc.project_id
  FROM public.warehouse_sub_containers sc
 WHERE pm.sub_container_id = sc.id AND pm.project_id IS NULL AND sc.project_id IS NOT NULL;
UPDATE public.project_milestones SET name = label WHERE name IS NULL AND label IS NOT NULL;

-- The pool is no longer the parent.
ALTER TABLE public.project_milestones ALTER COLUMN sub_container_id DROP NOT NULL;

-- Uniqueness: one milestone_no per (project, discipline).
DROP INDEX IF EXISTS public.project_milestones_sub_disc_label_key;
ALTER TABLE public.project_milestones DROP CONSTRAINT IF EXISTS project_milestones_sub_container_id_label_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_milestones_proj_disc_no_key
  ON public.project_milestones (project_id, discipline_id, milestone_no) WHERE milestone_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON public.project_milestones (project_id);

-- RLS: read via project division (add; keep existing sub-container policy for back-compat).
DROP POLICY IF EXISTS pm_read_project ON public.project_milestones;
CREATE POLICY pm_read_project ON public.project_milestones FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_division_visible(p.division_id)));
COMMIT;
NOTIFY pgrst, 'reload schema';
