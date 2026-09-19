-- 20260919010350_mep_milestone_codes.sql — MEP skeleton 2/7
BEGIN;

CREATE TABLE IF NOT EXISTS public.milestone_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  grp           text,
  description   text,
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.user_data(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discipline_id, code)
);
CREATE INDEX IF NOT EXISTS milestone_codes_discipline_idx ON public.milestone_codes (discipline_id);

ALTER TABLE public.milestone_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS milestone_codes_read  ON public.milestone_codes;
DROP POLICY IF EXISTS milestone_codes_write ON public.milestone_codes;
CREATE POLICY milestone_codes_read ON public.milestone_codes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.disciplines d WHERE d.id = discipline_id AND public.is_division_visible(d.division_id)));
CREATE POLICY milestone_codes_write ON public.milestone_codes FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));

CREATE TABLE IF NOT EXISTS public.project_milestone_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id      uuid NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  milestone_code_id uuid NOT NULL REFERENCES public.milestone_codes(id)    ON DELETE RESTRICT,
  created_by        uuid REFERENCES public.user_data(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, milestone_code_id)
);
CREATE INDEX IF NOT EXISTS pmc_milestone_idx ON public.project_milestone_codes (milestone_id);

ALTER TABLE public.project_milestone_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pmc_read  ON public.project_milestone_codes;
DROP POLICY IF EXISTS pmc_write ON public.project_milestone_codes;
CREATE POLICY pmc_read ON public.project_milestone_codes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_milestones pm JOIN public.projects p ON p.id = pm.project_id
                 WHERE pm.id = milestone_id AND public.is_division_visible(p.division_id)));
CREATE POLICY pmc_write ON public.project_milestone_codes FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));

COMMIT;
NOTIFY pgrst, 'reload schema';
