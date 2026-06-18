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
  v_prev_pending  INTEGER;
  v_remaining     INTEGER;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
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

  -- Ensure no earlier step is still pending or rejected
  SELECT COUNT(*) INTO v_prev_pending
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  step_order < v_step.step_order
    AND  status <> 'approved';

  IF v_prev_pending > 0 THEN
    RAISE EXCEPTION 'Cannot action this step until all earlier steps are approved';
  END IF;

  -- Update the actioned step
  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = p_profile_id,
         profile_name = COALESCE(p_profile_name, profile_name),
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    -- Auto-reject all remaining pending steps to avoid dangling rows
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    -- Mark parent as rejected
    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by       = p_profile_id,
           approved_by_name  = p_profile_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  -- Approved path — check if there are any pending steps left
  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    -- Final step approved — delegate to the legacy RPC which:
    --   1. Sets stock_adjustments.status = 'approved' + approved_by fields
    --   2. Commits the actual inventory mutation (FIFO layers, movements, etc.)
    -- Do NOT set status here — the legacy RPC handles it.
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
