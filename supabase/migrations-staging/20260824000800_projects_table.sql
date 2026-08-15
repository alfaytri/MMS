-- Virtual Warehouse Projects (Phase 1, Task 1.2) — projects table.
-- A project groups several discipline sub-containers under one user-entered
-- project number (unique per division). Lives in one custody warehouse + one
-- division. Read is division-visible; write behind warehouse.projects.manage.

CREATE TABLE public.projects (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number                text NOT NULL,
  name                          text NOT NULL,
  division_id                   uuid NOT NULL REFERENCES public.company_divisions(id),
  warehouse_id                  uuid NOT NULL REFERENCES public.warehouses(id),
  responsible_person_profile_id uuid REFERENCES public.user_data(id),
  is_active                     boolean NOT NULL DEFAULT true,
  created_by                    uuid REFERENCES public.user_data(id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, project_number)
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_read ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_division_visible(division_id));

CREATE POLICY projects_write ON public.projects
  FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));

NOTIFY pgrst, 'reload schema';
