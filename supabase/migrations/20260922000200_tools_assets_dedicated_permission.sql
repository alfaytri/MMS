-- Tools & Assets: dedicated permission (tools.assets.view / tools.assets.manage)
-- replacing the reused inventory.catalog.* keys. This migration repoints the 5
-- hub WRITE RPCs' in-body gate + the 2 RLS write policies from
-- inventory.catalog.manage -> tools.assets.manage. Each RPC body is the LIVE
-- pg_get_functiondef output with ONLY the permission string swapped (rebase-on-
-- live; verified one occurrence each). View-gating (nav + page) is frontend.
-- NOTE: after this, only system-admins + roles granted tools.assets.manage can
-- run hub actions — grant the new keys in the role editor.

BEGIN;

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
END $function$

;

CREATE OR REPLACE FUNCTION public.rpc_move_tool_unit_to_team(p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
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
END $function$

;

CREATE OR REPLACE FUNCTION public.rpc_return_tool_unit(p_unit_id uuid, p_notes text DEFAULT NULL::text)
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
    SET released_at = now(), release_reason = 'returned', notes = COALESCE(p_notes, notes)
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available'
    WHERE id = p_unit_id;
END $function$

;

CREATE OR REPLACE FUNCTION public.rpc_record_tool_inspection(p_unit_id uuid, p_verdict text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to record inspections' USING errcode = '42501';
  END IF;
  IF p_verdict NOT IN ('good','bad','under_repair') THEN
    RAISE EXCEPTION 'invalid verdict: %', p_verdict;
  END IF;

  SELECT current_custody_location_id, status INTO v_team, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'cannot inspect a retired unit'; END IF;

  INSERT INTO public.tool_unit_inspections(unit_id, custody_location_id, inspected_by, verdict, notes)
    VALUES (p_unit_id, v_team, public._current_user_data_id(), p_verdict, NULLIF(p_notes,''))
    RETURNING id INTO v_id;

  -- §6 mapping (no new enums): good->Good, bad->Fair, under_repair->maintenance.
  IF p_verdict = 'good' THEN
    UPDATE public.tool_asset_units SET condition = 'Good' WHERE id = p_unit_id;
  ELSIF p_verdict = 'bad' THEN
    UPDATE public.tool_asset_units SET condition = 'Fair' WHERE id = p_unit_id;
  ELSE -- under_repair
    UPDATE public.tool_asset_units SET status = 'maintenance' WHERE id = p_unit_id;
  END IF;

  RETURN v_id;
END $function$

;

CREATE OR REPLACE FUNCTION public.rpc_resolve_tool_repair(p_unit_id uuid, p_outcome text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.tool_status;
  v_bv uuid; v_sub uuid; v_wh uuid;
  v_actor uuid; v_actor_name text; v_sa uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING errcode = '42501';
  END IF;
  IF p_outcome NOT IN ('repaired','scrap') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome;
  END IF;

  SELECT status INTO v_status FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is already retired'; END IF;

  IF p_outcome = 'repaired' THEN
    -- Back in service: Good again; assigned if still held by a team, else available.
    UPDATE public.tool_asset_units
      SET condition = 'Good',
          status = CASE WHEN current_custody_location_id IS NOT NULL THEN 'assigned'::public.tool_status
                        ELSE 'available'::public.tool_status END
      WHERE id = p_unit_id;
    RETURN;
  END IF;

  -- ── scrap ──
  v_actor := public._current_user_data_id();
  SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_actor;

  -- 1) Close any open custody ledger row + retire + clear the pointer. (Always.)
  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'scrapped'
    WHERE unit_id = p_unit_id AND released_at IS NULL;
  UPDATE public.tool_asset_units
    SET status = 'retired', current_custody_location_id = NULL
    WHERE id = p_unit_id;

  -- 2) Resolve the unit's stock position + cost from its receival link.
  SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id
    INTO v_bv, v_sub, v_wh
    FROM public.tool_asset_units u
    JOIN public.receival_items ri ON ri.id = u.receival_item_id
    LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
    WHERE u.id = p_unit_id;

  -- 3) If a costed stock position resolves, post a qty-1 write-off through the
  --    EXISTING applier so it hits P&L v_scrap (FIFO-valued). Savepoint-guarded:
  --    a missing FIFO layer / insufficient stock (seed units, ISSUE-2 drift) must
  --    NOT fail the scrap — the unit stays retired, zero value posted.
  IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
    BEGIN
      INSERT INTO public.stock_adjustments
        (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
         reason, status, requested_by, requested_by_name)
      VALUES
        (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
         COALESCE(NULLIF(p_notes,''), 'Tool scrapped'), 'pending_approval', v_actor, v_actor_name)
      RETURNING id INTO v_sa;

      PERFORM public.approve_stock_adjustment_inventory(v_sa, COALESCE(v_actor_name, 'system'));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'scrap: cost write-off skipped for unit % — %', p_unit_id, SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'scrap: unit % has no receival cost layer — retired at zero value', p_unit_id;
  END IF;
END $function$

;

-- RLS write policies (defence-in-depth for direct PostgREST writes) follow the RPC gate.
ALTER POLICY tua_ledger_write ON public.tool_unit_assignments
  USING (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'));

ALTER POLICY tui_write ON public.tool_unit_inspections
  USING (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'));

-- Re-assert grants (CREATE OR REPLACE preserves them; explicit for clarity, no anon).
REVOKE ALL ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_unit(uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_record_tool_inspection(uuid,text,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_resolve_tool_repair(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_unit(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_tool_inspection(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_tool_repair(uuid,text,text) TO authenticated, service_role;

COMMIT;
