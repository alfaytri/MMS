-- Tools & Assets Phase 2 rework — a tool becomes "Used" on RETURN, not on assign.
--
-- Operator correction (2026-08-19): a freshly-created tool that is assigned for the
-- first time is still NEW — assigning it to a team does not wear it out. It becomes
-- USED only when it comes back from a team (release_reason='returned' — it has
-- completed a deployment). Repaired is still auto-set on a usable return-from-repair,
-- and the unit editor keeps a manual Type override (for tools handed out before the app).

BEGIN;

-- 1) Assign no longer touches lifecycle_type (rebased on the live body — only the
--    final UPDATE's SET list drops the new->used bump).
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to assign tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status INTO v_unit_div, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be assigned'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_team_id; END IF;

  IF v_unit_div IS NOT NULL AND v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division assignment blocked: the tool belongs to a different division than this team (use Transfer to change the tool''s division first)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tool_unit_assignments WHERE unit_id = p_unit_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'tool unit is already assigned to a team — move or return it first';
  END IF;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_team_id,
        status = 'assigned',
        division_id = COALESCE(division_id, v_team_div)
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;

-- 2) Return marks a NEW tool as USED (it completed a deployment). Rebased on live —
--    the final UPDATE gains the new->used advance.
CREATE OR REPLACE FUNCTION public.rpc_return_tool_unit(p_unit_id uuid, p_notes text DEFAULT NULL::text, p_to_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to return tools' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'returned',
        notes = COALESCE(p_notes, notes),
        returned_to_warehouse_id = p_to_warehouse_id
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available',
        lifecycle_type = CASE WHEN lifecycle_type = 'new' THEN 'used'::public.tool_lifecycle_type ELSE lifecycle_type END
    WHERE id = p_unit_id;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_unit(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_unit(uuid, text, uuid) TO authenticated, service_role;

-- 3) Re-backfill (staging test data; new-prod has 0 units): a unit flipped to 'used'
--    by the old assign rule but NEVER returned is really still 'new'. Units that were
--    actually returned stay 'used'; 'repaired' + manual overrides are untouched.
UPDATE public.tool_asset_units u
   SET lifecycle_type = 'new'
 WHERE u.lifecycle_type = 'used'
   AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.release_reason = 'returned');

COMMIT;
