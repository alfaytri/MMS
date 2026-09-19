-- 20260919010200_mep_projects_customer_site_status.sql — MEP skeleton 3/7
BEGIN;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS customer_id             uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS site_address            text,
  ADD COLUMN IF NOT EXISTS pin                     text,
  ADD COLUMN IF NOT EXISTS status                  text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS start_date              date,
  ADD COLUMN IF NOT EXISTS expected_completion_date date,
  ADD COLUMN IF NOT EXISTS completion_date         date;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active','on_hold','completed','cancelled'));
CREATE INDEX IF NOT EXISTS projects_customer_idx ON public.projects (customer_id) WHERE customer_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
