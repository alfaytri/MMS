-- Virtual Warehouse Projects (Phase 1, Task 1.3) — link sub-containers to a
-- project + discipline. A discipline bucket = a warehouse_sub_containers row with
-- both set. Legacy custody sub-containers keep both NULL (left as-is). One
-- sub-container per (project, discipline) via the partial unique index.

ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN project_id    uuid REFERENCES public.projects(id)    ON DELETE RESTRICT,
  ADD COLUMN discipline_id uuid REFERENCES public.disciplines(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX warehouse_sub_containers_project_discipline_uq
  ON public.warehouse_sub_containers (project_id, discipline_id)
  WHERE project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
