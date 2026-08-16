-- VWh Projects Phase 2 — Task 2.1: project_milestones table
-- A milestone is a user-labelled cost tag under a discipline bucket
-- (a warehouse_sub_containers row). Spend-per-milestone = tagged consumption
-- cost (see Task 2.3 rpc_post_consumption rewrite). RLS: read = division-visible
-- via the parent sub-container; write behind warehouse.projects.manage.
CREATE TABLE public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_data(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_container_id, label)
);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read ON public.project_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouse_sub_containers sc
                 WHERE sc.id = sub_container_id AND public.is_division_visible(sc.division_id)));
CREATE POLICY pm_write ON public.project_milestones FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));
NOTIFY pgrst, 'reload schema';
