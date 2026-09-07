-- Atomic schedule deletion (audit follow-up E).
--
-- The client's useDeleteSchedule did four things across separate round-trips:
-- collect affected teams, soft-delete the schedule, delete its assignments, then
-- re-sync each team's active-schedule pointer. A failure partway through could
-- leave a soft-deleted schedule with live assignments, or a team pointing at a
-- deleted schedule. This wraps the whole operation in one transaction.
--
-- It also closes a gap the old client path had: teams that referenced the
-- schedule DIRECTLY via teams.schedule_id but had no assignment row were never
-- re-synced, so their pointer went stale. Here they are collected and re-synced
-- alongside the assignment-linked teams.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_schedule(p_schedule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_team_ids uuid[];
  v_team_id  uuid;
BEGIN
  -- Snapshot every team that references this schedule — via an assignment or a
  -- direct teams.schedule_id pointer — before we remove anything.
  SELECT array_agg(DISTINCT t) INTO v_team_ids
  FROM (
    SELECT team_id AS t FROM public.team_schedule_assignments WHERE schedule_id = p_schedule_id
    UNION
    SELECT id      AS t FROM public.teams                     WHERE schedule_id = p_schedule_id
  ) refs
  WHERE t IS NOT NULL;

  -- Soft-delete the schedule and drop its assignments.
  UPDATE public.schedules SET deleted_at = now() WHERE id = p_schedule_id;
  DELETE FROM public.team_schedule_assignments WHERE schedule_id = p_schedule_id;

  -- Re-point each affected team at its next best active assignment (or NULL when
  -- none remains — which also clears a stale direct pointer).
  IF v_team_ids IS NOT NULL THEN
    FOREACH v_team_id IN ARRAY v_team_ids LOOP
      PERFORM public.sync_team_active_schedule(v_team_id);
    END LOOP;
  END IF;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
