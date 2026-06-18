-- Make stock adjustment approval steps parallel — any role-holder can action
-- their step at any time, regardless of whether earlier steps are still pending.
-- The chain completes only when ALL steps are approved; rejection on any step
-- still ends the chain immediately and auto-rejects remaining pending steps.

BEGIN;

CREATE OR REPLACE FUNCTION action_stock_adjustment_step(
  p_step_id      UUID,
  p_action       TEXT,
  p_profile_id   UUID,
  p_profile_name TEXT,
  p_notes        TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step          RECORD;
  v_warehouse_id  UUID;
  v_remaining     INTEGER;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile is required to action an approval step';
  END IF;

  SELECT *
  INTO   v_step
  FROM   stock_adjustment_approvals
  WHERE  id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval step not found';
  END IF;

  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Step is not pending (current status: %)', v_step.status;
  END IF;

  -- Look up the parent warehouse for the field_rp check inside the gate
  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  -- Role gate: caller must hold the role required for this step
  IF NOT user_can_action_adjustment_step(p_profile_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  -- NOTE: No ordering check — steps can be approved in any order. The chain
  -- only finalizes when every step is approved.

  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = p_profile_id,
         profile_name = COALESCE(p_profile_name, profile_name),
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by       = p_profile_id,
           approved_by_name  = p_profile_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  -- Approved path — finalize only when every step is approved
  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM approve_stock_adjustment_inventory(
      p_adjustment_id => v_step.adjustment_id,
      p_approved_by   => p_profile_name
    );
    RETURN 'chain_completed';
  END IF;

  RETURN 'step_approved';
END;
$$;

GRANT EXECUTE ON FUNCTION action_stock_adjustment_step TO authenticated;

COMMIT;
