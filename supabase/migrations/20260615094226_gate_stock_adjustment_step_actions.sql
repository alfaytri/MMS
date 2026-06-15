-- Role-gating for stock adjustment approval steps.
--
-- Maps each step_role to the existing identity systems:
--   accounting_manager  → approval_role_assignments.role = 'accountant'
--   inventory_manager   → custom_roles permission 'warehouse.adjustment.approve'
--   responsible_person  → warehouse_field_rps row for THIS warehouse
--   brand_manager       → approval_role_assignments.role = 'brand_manager'
--   owner               → approval_role_assignments.role = 'owner'
--
-- Admin custom role bypasses all gates (escalation / override).

BEGIN;

CREATE OR REPLACE FUNCTION user_can_action_adjustment_step(
  p_profile_id   UUID,
  p_step_role    TEXT,
  p_warehouse_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin override
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    OR CASE p_step_role
      WHEN 'accounting_manager' THEN EXISTS (
        SELECT 1 FROM approval_role_assignments
        WHERE  profile_id = p_profile_id
          AND  role = 'accountant'
          AND  deleted_at IS NULL
      )
      WHEN 'inventory_manager' THEN EXISTS (
        SELECT 1
        FROM   user_custom_roles ucr
        JOIN   custom_roles cr ON cr.id = ucr.role_id
        WHERE  ucr.profile_id = p_profile_id
          AND  cr.deleted_at IS NULL
          AND  'warehouse.adjustment.approve' = ANY(cr.permissions)
      )
      WHEN 'responsible_person' THEN EXISTS (
        SELECT 1 FROM warehouse_field_rps
        WHERE  profile_id = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
      WHEN 'brand_manager' THEN EXISTS (
        SELECT 1 FROM approval_role_assignments
        WHERE  profile_id = p_profile_id
          AND  role = 'brand_manager'
          AND  deleted_at IS NULL
      )
      WHEN 'owner' THEN EXISTS (
        SELECT 1 FROM approval_role_assignments
        WHERE  profile_id = p_profile_id
          AND  role = 'owner'
          AND  deleted_at IS NULL
      )
      ELSE false
    END
$$;

GRANT EXECUTE ON FUNCTION user_can_action_adjustment_step TO authenticated;

-- Replace action_stock_adjustment_step to enforce the gate at the top.
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
  v_prev_pending  INTEGER;
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

  -- Look up the parent warehouse for the per-warehouse field_rp check
  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  -- Role gate: caller must hold the role required for this step
  IF NOT user_can_action_adjustment_step(p_profile_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  -- Ordering gate: no earlier step may still be pending or rejected
  SELECT COUNT(*) INTO v_prev_pending
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  step_order < v_step.step_order
    AND  status <> 'approved';

  IF v_prev_pending > 0 THEN
    RAISE EXCEPTION 'Cannot action this step until all earlier steps are approved';
  END IF;

  -- Apply the action to this step
  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = p_profile_id,
         profile_name = COALESCE(p_profile_name, profile_name),
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    -- Auto-reject every remaining pending step in this chain
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

  -- Approved path
  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    -- Final step — let the legacy inventory RPC set parent status AND
    -- commit the FIFO mutation. Do not pre-set status here.
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
