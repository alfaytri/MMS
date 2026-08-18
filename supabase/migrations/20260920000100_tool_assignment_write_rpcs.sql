-- Tools & Assets Phase 1: assign / move / return write RPCs.
--
-- All three are SECURITY DEFINER, gated on inventory.catalog.manage (the exact
-- expression used by guard_tool_unit_division_write), and write the ledger +
-- denormalized pointer atomically. They NEVER change division_id — a unit may
-- only be assigned/moved to a team in its OWN division (tools are division-owned).
-- Cross-division movement is the separate rpc_transfer_tool_unit (extended in
-- 20260920000200 to release an open assignment).

BEGIN;

-- Assign an unheld unit to a team in the unit's OWN division.
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(
  p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to assign tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status INTO v_unit_div, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be assigned'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_team_id; END IF;

  -- Same-division rule, EXCEPT a NULL-division unit has its division ESTABLISHED
  -- from the team on first assignment (operator decision 2026-08-18, ISSUE-9:
  -- units were never backfilled with a division, so the team establishes it).
  IF v_unit_div IS NOT NULL AND v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division assignment blocked: the tool belongs to a different division than this team (use Transfer to change the tool''s division first)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tool_unit_assignments WHERE unit_id = p_unit_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'tool unit is already assigned to a team — move or return it first';
  END IF;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  -- COALESCE keeps an existing division (no change → guard is a no-op) or
  -- establishes it from the team when NULL (guard fires; caller already verified
  -- inventory.catalog.manage above, so guard_tool_unit_division_write passes).
  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_team_id,
        status = 'assigned',
        division_id = COALESCE(division_id, v_team_div)
    WHERE id = p_unit_id;

  RETURN v_id;
END $$;

-- Move a held unit to another team in the SAME division (close + open in one txn).
CREATE OR REPLACE FUNCTION public.rpc_move_tool_unit_to_team(
  p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit_div uuid; v_team_div uuid; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to move tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id INTO v_unit_div FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_to_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team_id; END IF;

  IF v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division move blocked: destination team is in a different division than the tool';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'moved'
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_to_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_to_team_id, status = 'assigned'
    WHERE id = p_unit_id;

  RETURN v_id;
END $$;

-- Return a held unit (no team; back to available).
CREATE OR REPLACE FUNCTION public.rpc_return_tool_unit(
  p_unit_id uuid, p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to return tools' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'returned', notes = COALESCE(p_notes, notes)
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available'
    WHERE id = p_unit_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_unit(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_unit(uuid,text) TO authenticated, service_role;

COMMIT;
