-- 20260919010000_mep_disciplines_division_prefix.sql
-- MEP skeleton 1/7 — make disciplines division-scoped + add prefix.
BEGIN;

ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id),
  ADD COLUMN IF NOT EXISTS prefix      text,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.user_data(id),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Backfill: existing disciplines are all MEP's. Resolve the MEP division.
DO $mig$
DECLARE v_div uuid;
BEGIN
  SELECT id INTO v_div FROM public.company_divisions
   WHERE is_active AND (name ILIKE 'MEP' OR short_name ILIKE 'MEP' OR slug ILIKE 'mep')
   ORDER BY name LIMIT 1;
  IF v_div IS NULL THEN
    RAISE EXCEPTION 'MEP division not found in company_divisions — adjust the name match before applying';
  END IF;
  UPDATE public.disciplines SET division_id = v_div WHERE division_id IS NULL;
  UPDATE public.disciplines SET prefix = 'P' WHERE prefix IS NULL AND name ILIKE 'Plumbing';
  UPDATE public.disciplines SET prefix = 'E' WHERE prefix IS NULL AND name ILIKE 'Electrical';
  UPDATE public.disciplines SET prefix = 'A' WHERE prefix IS NULL AND name ILIKE 'Automation';
END $mig$;

ALTER TABLE public.disciplines ALTER COLUMN division_id SET NOT NULL;

-- Uniqueness moves from global name → per division.
ALTER TABLE public.disciplines DROP CONSTRAINT IF EXISTS disciplines_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS disciplines_division_name_key   ON public.disciplines (division_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS disciplines_division_prefix_key ON public.disciplines (division_id, prefix) WHERE prefix IS NOT NULL;

-- RLS: read was USING(true); scope it to the division.
DROP POLICY IF EXISTS disciplines_read ON public.disciplines;
CREATE POLICY disciplines_read ON public.disciplines
  FOR SELECT TO authenticated USING (public.is_division_visible(division_id));
-- write policy (warehouse.projects.manage) already exists; leave as-is.

COMMIT;
NOTIFY pgrst, 'reload schema';
