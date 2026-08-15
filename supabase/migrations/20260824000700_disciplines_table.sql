-- Virtual Warehouse Projects (Phase 1, Task 1.1) — disciplines lookup.
-- A managed, company-wide list of disciplines (Plumbing, Electrical, Automation, …)
-- that projects draw from. Read for all authenticated; write behind
-- warehouse.projects.manage (system-admin roles bypass via is_system_admin).

CREATE TABLE public.disciplines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY disciplines_read ON public.disciplines
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY disciplines_write ON public.disciplines
  FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));

INSERT INTO public.disciplines (name, sort_order) VALUES
  ('Plumbing', 1),
  ('Electrical', 2),
  ('Automation', 3);

NOTIFY pgrst, 'reload schema';
