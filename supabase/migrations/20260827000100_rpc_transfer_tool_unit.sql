-- 20260827000100_rpc_transfer_tool_unit.sql
-- Unit-level transfer for serialized tools: moves tool_asset_units.division_id
-- (the OWNING division) between divisions. assigned_to (the person holding
-- the unit) is deliberately left untouched — division owns, person holds,
-- and those are independent fields (see 20260827000000).
--
-- Column names confirmed live (2026-08-27, mwvblpgbgxipvrevkeff):
--   tool_asset_units(id uuid, division_id uuid, assigned_to uuid, ...)
--   company_divisions(id uuid, name text, ...)
-- _user_has_permission(p_profile_id uuid, p_permission text) and
-- _current_user_data_id() confirmed live (pg_get_functiondef).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_transfer_tool_unit(
  p_unit_id uuid,
  p_to_division_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from uuid;
BEGIN
  IF NOT _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_to_division_id IS NULL THEN
    RAISE EXCEPTION 'target division required';
  END IF;

  SELECT division_id INTO v_from FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit % not found', p_unit_id;
  END IF;

  -- Division owns, person holds: division_id moves, assigned_to is preserved.
  UPDATE public.tool_asset_units
     SET division_id = p_to_division_id
   WHERE id = p_unit_id;
END;
$$;

-- Self-contained grants (mirrors 20260825000400): revoke the implicit PUBLIC
-- execute grant, then explicitly grant only to authenticated + service_role.
-- No anon grant — this is an internal inventory-management action.
REVOKE ALL ON FUNCTION public.rpc_transfer_tool_unit(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_transfer_tool_unit(uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
