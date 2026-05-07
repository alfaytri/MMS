-- swap_visit_team: atomically validates eligibility and reassigns a visit's team.
-- Returns jsonb: { success: true } or { success: false, error: 'reason' }
CREATE OR REPLACE FUNCTION public.swap_visit_team(
  p_assignment_id  uuid,
  p_new_team_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id        uuid;
  v_scheduled_date  date;
  v_time_slot       text;
  v_duration        text;
  v_time_conflict   int;
  v_performer       text;
BEGIN
  -- 1. Fetch the assignment being swapped
  SELECT order_id, scheduled_date, time_slot, duration
  INTO   v_order_id, v_scheduled_date, v_time_slot, v_duration
  FROM   public.order_team_assignments
  WHERE  id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- 2. Ensure new team is not a QC team
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_new_team_id AND is_qc = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'QC teams cannot be assigned via calendar swap');
  END IF;

  -- 3. Check time conflict: only block when BOTH visits have time slots that actually overlap.
  --    If either visit has no time_slot, skip the conflict check —
  --    no-time visits are considered flexible and never block a timed assignment.
  SELECT COUNT(*) INTO v_time_conflict
  FROM   public.order_team_assignments
  WHERE  team_id        = p_new_team_id
    AND  id            <> p_assignment_id
    AND  scheduled_date = v_scheduled_date
    AND  v_time_slot IS NOT NULL
    AND  time_slot IS NOT NULL
    AND  time_slot::time <
         CASE WHEN v_duration ~ '^\d+$'
              THEN v_time_slot::time + (v_duration::int * interval '1 hour')
              ELSE v_time_slot::time + interval '2 hours'
         END
    AND (
         CASE WHEN duration ~ '^\d+$'
              THEN time_slot::time + (duration::int * interval '1 hour')
              ELSE time_slot::time + interval '2 hours'
         END
        ) > v_time_slot::time;

  IF v_time_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time conflict with existing visit');
  END IF;

  -- 4. Perform the swap
  UPDATE public.order_team_assignments
  SET    team_id = p_new_team_id
  WHERE  id      = p_assignment_id;

  -- 5. Write audit log
  SELECT COALESCE(raw_user_meta_data->>'full_name', email, 'unknown')
  INTO   v_performer
  FROM   auth.users
  WHERE  id = auth.uid();

  INSERT INTO public.activity_log
    (entity_type, entity_id, action, module, performer_name, new_data)
  VALUES
    ('order_team_assignment', p_assignment_id, 'team_swapped', 'calendar',
     v_performer,
     jsonb_build_object('new_team_id', p_new_team_id, 'order_id', v_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_visit_team(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.swap_visit_team IS
  'Atomically validates eligibility and reassigns an order_team_assignment to a new team. Returns { success, error? }.';
