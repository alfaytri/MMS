-- Tools & Assets Phase 2 rework — monthly check sessions.
--
-- A formal, dated per-division "check run": initiate -> record each team's tools
-- Good/Bad (linked to the session) -> finalize -> PDF/Excel report of the checked
-- units. One open session per division at a time.

BEGIN;

-- Session table.
CREATE TABLE IF NOT EXISTS public.tool_check_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  uuid NOT NULL REFERENCES public.company_divisions(id),
  initiated_by uuid,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  completed_at timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tool_check_sessions_division ON public.tool_check_sessions (division_id, status);

ALTER TABLE public.tool_check_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tcs_select ON public.tool_check_sessions FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tcs_write ON public.tool_check_sessions FOR ALL TO authenticated
    USING (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'))
    WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Link inspections to a session (ad-hoc inspections keep session_id NULL).
ALTER TABLE public.tool_unit_inspections
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.tool_check_sessions(id);
CREATE INDEX IF NOT EXISTS ix_tool_unit_inspections_session ON public.tool_unit_inspections (session_id);

-- Initiate a check for a division (one open session per division).
CREATE OR REPLACE FUNCTION public.rpc_initiate_tool_check_session(p_division_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to start a check' USING ERRCODE = '42501';
  END IF;
  IF p_division_id IS NULL THEN RAISE EXCEPTION 'division is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.tool_check_sessions WHERE division_id = p_division_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'a check is already in progress for this division';
  END IF;
  INSERT INTO public.tool_check_sessions(division_id, initiated_by)
    VALUES (p_division_id, public._current_user_data_id()) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- Record a condition check (verdict good/bad map to condition Good/Fair; under_repair
-- still supported for compatibility). Gains p_session_id (new arity => DROP+CREATE,
-- rebased on the live body; a 3-arg call resolves to the 4-arg with session NULL).
DROP FUNCTION IF EXISTS public.rpc_record_tool_inspection(uuid, text, text);
CREATE FUNCTION public.rpc_record_tool_inspection(p_unit_id uuid, p_verdict text, p_notes text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  INSERT INTO public.tool_unit_inspections(unit_id, custody_location_id, inspected_by, verdict, notes, session_id)
    VALUES (p_unit_id, v_team, public._current_user_data_id(), p_verdict, NULLIF(p_notes,''), p_session_id)
    RETURNING id INTO v_id;

  IF p_verdict = 'good' THEN
    UPDATE public.tool_asset_units SET condition = 'Good' WHERE id = p_unit_id;
  ELSIF p_verdict = 'bad' THEN
    UPDATE public.tool_asset_units SET condition = 'Fair' WHERE id = p_unit_id;
  ELSE
    UPDATE public.tool_asset_units SET status = 'maintenance' WHERE id = p_unit_id;
  END IF;

  RETURN v_id;
END $function$;

-- Finalize a session.
CREATE OR REPLACE FUNCTION public.rpc_finalize_tool_check_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to finalize a check' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tool_check_sessions SET status = 'completed', completed_at = now()
    WHERE id = p_session_id AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'session % not found or already completed', p_session_id; END IF;
END $function$;

-- Progress: checked (distinct units inspected in this session) / total (in-service
-- units held by the session division's teams).
CREATE OR REPLACE FUNCTION public.get_tool_check_session_progress(p_session_id uuid)
RETURNS TABLE(checked int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT
    (SELECT count(DISTINCT ins.unit_id)::int FROM public.tool_unit_inspections ins WHERE ins.session_id = p_session_id),
    (SELECT count(*)::int
       FROM public.tool_asset_units u
       JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
       JOIN public.tool_check_sessions s ON s.id = p_session_id
      WHERE sc.division_id = s.division_id AND u.status = 'assigned');
$function$;

-- The open (in-progress) session for a division, if any.
CREATE OR REPLACE FUNCTION public.get_open_tool_check_session(p_division_id uuid)
RETURNS TABLE(id uuid, initiated_at timestamptz, initiated_by_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT s.id, s.initiated_at, ud.full_name
  FROM public.tool_check_sessions s
  LEFT JOIN public.user_data ud ON ud.id = s.initiated_by
  WHERE s.division_id = p_division_id AND s.status = 'in_progress'
  ORDER BY s.initiated_at DESC
  LIMIT 1;
$function$;

-- Report: one row per checked unit (latest inspection in the session).
CREATE OR REPLACE FUNCTION public.get_tool_check_session_report(p_session_id uuid)
RETURNS TABLE(item_name text, serial_number text, lifecycle_type text, condition text,
              inspected_at timestamptz, division_name text, session_initiated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT DISTINCT ON (ins.unit_id)
         i.name_en, u.serial_number, u.lifecycle_type::text, u.condition::text, ins.inspected_at,
         cd.name, s.initiated_at
  FROM public.tool_unit_inspections ins
  JOIN public.tool_check_sessions s ON s.id = ins.session_id
  JOIN public.tool_asset_units u ON u.id = ins.unit_id
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = s.division_id
  WHERE ins.session_id = p_session_id
  ORDER BY ins.unit_id, ins.inspected_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.rpc_initiate_tool_check_session(uuid) FROM public;
REVOKE ALL ON FUNCTION public.rpc_record_tool_inspection(uuid, text, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.rpc_finalize_tool_check_session(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_tool_check_session_progress(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_open_tool_check_session(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_tool_check_session_report(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_initiate_tool_check_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_tool_inspection(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_tool_check_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tool_check_session_progress(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_open_tool_check_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tool_check_session_report(uuid) TO authenticated, service_role;

COMMIT;
