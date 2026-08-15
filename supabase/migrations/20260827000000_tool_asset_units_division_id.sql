-- 20260827000000_tool_asset_units_division_id.sql
-- Division that OWNS a serialized unit. NULL for all existing units — the
-- operator sets each (design §11 Q1: no inference from stock/assignment).
-- assigned_to (the person holding it) is unchanged.
BEGIN;

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);

CREATE INDEX IF NOT EXISTS idx_tool_asset_units_division
  ON public.tool_asset_units(division_id);

COMMENT ON COLUMN public.tool_asset_units.division_id IS
  'Owning division (nullable; operator sets it). Distinct from assigned_to (person holding the unit).';

NOTIFY pgrst, 'reload schema';
COMMIT;
