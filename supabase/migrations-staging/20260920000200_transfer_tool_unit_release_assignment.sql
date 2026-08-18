-- Tools & Assets Phase 1 (ISSUE-8): rpc_transfer_tool_unit releases an open team
-- assignment when the owning division actually changes.
--
-- Rebased verbatim on the live function body (fetched via pg_get_functiondef).
-- Only addition: after the division_id UPDATE, if the division changed, close any
-- open tool_unit_assignments row (release_reason='moved') and clear the pointer —
-- a unit cannot be held by a team in a division it no longer belongs to.
-- Grants are re-asserted (CREATE OR REPLACE preserves them, but we make it explicit).

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_transfer_tool_unit(p_unit_id uuid, p_to_division_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ISSUE-8: a unit can't be held by a team outside its (new) division. If the
  -- division actually changed, release any open team assignment + clear pointer.
  IF p_to_division_id IS DISTINCT FROM v_from THEN
    UPDATE public.tool_unit_assignments
       SET released_at = now(), release_reason = 'moved'
     WHERE unit_id = p_unit_id AND released_at IS NULL;

    UPDATE public.tool_asset_units
       SET current_custody_location_id = NULL
     WHERE id = p_unit_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_transfer_tool_unit(uuid,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_transfer_tool_unit(uuid,uuid,text) TO authenticated, service_role;

COMMIT;
