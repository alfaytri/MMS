-- Teams & employees integrity fixes (audit 2026-09-06):
--   #1 archive_team          — releasing a team's members/vehicles + clearing its
--      leader when it is archived, so archiving a staffed team no longer strands
--      its members (active members return to the unassigned pool).
--   #2 clear_stale_team_leader trigger — whenever an employee leaves a team or is
--      archived, drop any teams.leader_id still pointing at them → no ghost
--      leaders (a person shown as leader of a team they no longer belong to).
--   #3/#4 create_employee     — insert the employee + skills in ONE transaction so
--      creation can't half-commit (no duplicate-on-retry), and phone is passed
--      through (NOT NULL) rather than null.
BEGIN;

-- ── #1: atomic team archive that releases its resources ──────────────────────
CREATE OR REPLACE FUNCTION public.archive_team(p_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Release members: detach from the team; active members return to the
  -- unassigned pool. Non-active statuses (vacation/archived) are preserved.
  UPDATE public.employees
     SET team_id = NULL,
         status  = CASE WHEN status = 'active' THEN 'unassigned'::employee_status ELSE status END
   WHERE team_id = p_team_id;

  -- Release vehicles held by the team.
  UPDATE public.vehicles SET team_id = NULL WHERE team_id = p_team_id;

  -- Archive the team and clear its (now-detached) leader pointer.
  UPDATE public.teams SET deleted_at = now(), leader_id = NULL WHERE id = p_team_id;
END;
$function$;

-- ── #2: keep teams.leader_id from dangling ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_stale_team_leader()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Drop leader_id from any team this employee led but is no longer an active
  -- member of (moved to another team, unassigned, or archived).
  UPDATE public.teams
     SET leader_id = NULL
   WHERE leader_id = NEW.id
     AND (id IS DISTINCT FROM NEW.team_id OR NEW.status = 'archived');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clear_stale_team_leader ON public.employees;
CREATE TRIGGER trg_clear_stale_team_leader
  AFTER UPDATE OF team_id, status ON public.employees
  FOR EACH ROW
  WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.clear_stale_team_leader();

-- ── #3 / #4: atomic employee creation ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_employee(
  p_name text, p_phone text, p_nationality text, p_join_date text,
  p_avatar_url text, p_division_id uuid, p_service_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.employees (name, phone, nationality, join_date, status, avatar_url, division_id)
  VALUES (
    p_name,
    p_phone,                                             -- NOT NULL; '' when the form leaves it blank
    NULLIF(p_nationality, ''),
    COALESCE(NULLIF(p_join_date, '')::date, CURRENT_DATE),
    'unassigned'::employee_status,
    NULLIF(p_avatar_url, ''),
    p_division_id
  )
  RETURNING id INTO v_id;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO public.employee_services (employee_id, service_id)
    SELECT DISTINCT v_id, sid FROM unnest(p_service_ids) AS sid;
  END IF;

  RETURN v_id;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
