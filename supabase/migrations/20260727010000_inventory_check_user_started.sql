-- ============================================================
-- Section 1.12 — user_started event for inventory-check assignments
--
-- Gap fixed: inventory_check_assignments.started_at was declared
-- but never written; the state machine pending → in_progress →
-- completed was designed but the middle transition was never
-- wired. Assignments jumped straight pending → completed, and the
-- UI's "Counting" badge / in_progress filters rendered a state
-- that never actually happened. There was also no per-user
-- "started counting" event in inventory_check_log.
--
-- Fix: extend save_inventory_check_item_count to accept optional
-- assignment context (assignment_id, profile). On every count-save
-- it also (idempotently) transitions the caller's assignment
-- pending → in_progress, stamps started_at = now(), and inserts a
-- 'user_started' row into inventory_check_log. The gate is a
-- WHERE status='pending', so all subsequent count-saves on the
-- same assignment are no-ops on the transition side.
--
-- Both the assignment update and the log insert happen inside the
-- same function → same transaction → cannot drift. Matches the
-- existing "log + cached columns" audit pattern already in use
-- for inventory_checks.started_at / assignments.completed_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_inventory_check_item_count(
  p_item_id        uuid,
  p_counted_qty    numeric,
  p_variance_type  text,
  p_assignment_id  uuid   DEFAULT NULL,
  p_profile_id     uuid   DEFAULT NULL,
  p_profile_name   text   DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_check_id uuid;
BEGIN
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;

  -- Idempotent assignment transition + log event on first count-save.
  IF p_assignment_id IS NOT NULL THEN
    UPDATE inventory_check_assignments
    SET status     = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE id     = p_assignment_id
      AND status = 'pending'
    RETURNING check_id INTO v_check_id;

    -- Only insert the log row when the UPDATE actually fired
    -- (i.e. the assignment was still pending). v_check_id stays
    -- NULL for the second-and-later save on the same assignment.
    IF v_check_id IS NOT NULL THEN
      INSERT INTO inventory_check_log (
        check_id, event_type, profile_id, profile_name, meta
      ) VALUES (
        v_check_id,
        'user_started',
        p_profile_id,
        p_profile_name,
        jsonb_build_object('assignment_id', p_assignment_id)
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_inventory_check_item_count(uuid, numeric, text, uuid, uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
