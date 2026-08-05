-- Stock Adjustment approval — strict role gating + Owner Force Approve
--
-- Before: user_can_action_adjustment_step gave any 'Admin' role unlimited
-- approve rights on any step. Result: an Owner who also holds Admin could
-- silently approve field_rp's step, defeating the whole per-role chain.
--
-- After:
--   1. Admin bypass removed from user_can_action_adjustment_step. Only the
--      exact role holder (or the field RP for the specific warehouse) can
--      action the step.
--   2. New Owner-only RPC force_approve_stock_adjustment(p_adjustment_id,
--      p_comment) bulk-approves every pending step + applies the inventory
--      change in one go, marking each row force_approved=true so the audit
--      trail distinguishes bypass approvals from normal ones.
--   3. force_approved + force_comment columns added on
--      stock_adjustment_approvals to record the bypass.
--
-- Mirrors the sales-side force_approve_sales_request pattern
-- (20260627102000).

BEGIN;

-- ── 1. Force-approve columns ──────────────────────────────────────────

ALTER TABLE public.stock_adjustment_approvals
  ADD COLUMN IF NOT EXISTS force_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_comment  text;

COMMENT ON COLUMN public.stock_adjustment_approvals.force_approved IS
  'TRUE when the row was approved via force_approve_stock_adjustment (Owner bypass) rather than the normal per-step flow.';

-- ── 2. Strict role gating — drop Admin bypass ─────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_action_adjustment_step(
  p_profile_id uuid,
  p_step_role text,
  p_warehouse_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_responsible_persons
        WHERE  profile_id   = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
    )
    OR (
      p_step_role <> 'responsible_person'
      AND EXISTS (
        SELECT 1
        FROM   approval_workflow_steps was
        JOIN   user_custom_roles      ucr ON ucr.role_id = was.role_id
        WHERE  was.workflow    = 'stock_adj'
          AND  was.step_key    = p_step_role
          AND  was.archived_at IS NULL
          AND  ucr.profile_id  = p_profile_id
      )
    )
$$;

-- ── 3. Owner-only bulk force-approve ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.force_approve_stock_adjustment(
  p_adjustment_id uuid,
  p_comment       text DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id  uuid;
  v_full_name   text;
  v_is_owner    boolean;
  v_status      text;
  v_count       INT;
BEGIN
  -- Caller identity
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Owner gate
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  -- The adjustment must still be pending
  SELECT status INTO v_status
  FROM   stock_adjustments
  WHERE  id = p_adjustment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment is not pending_approval (current: %)', v_status;
  END IF;

  -- Bulk-approve every remaining pending row
  UPDATE stock_adjustment_approvals
  SET    status          = 'approved',
         profile_id      = v_profile_id,
         profile_name    = v_full_name,
         action_at       = now(),
         notes           = COALESCE(notes, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), '')
  WHERE  adjustment_id = p_adjustment_id
    AND  status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this adjustment';
  END IF;

  -- Apply the inventory change (same path the last-step approver hits)
  PERFORM public.approve_stock_adjustment_inventory(
    p_adjustment_id => p_adjustment_id,
    p_approved_by   => v_full_name
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.force_approve_stock_adjustment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_approve_stock_adjustment(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
