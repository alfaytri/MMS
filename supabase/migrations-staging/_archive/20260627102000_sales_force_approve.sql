-- ─────────────────────────────────────────────────────────────────────────────
-- Force-approve for sales approval slips (Owner only).
--
-- Mirrors the PO `useForceApproveAllSteps` flow but inside one RPC:
--   force_approve_sales_request(p_so_id, p_approval_type, p_comment)
--
--   1. Caller must hold the Owner approval slot (custom_role.name='Owner',
--      is_approval_slot=true).
--   2. For the latest iteration of the (so, approval_type) slip, every
--      pending row is marked approved with `force_approved=true` and the
--      owner stamped as the decider.
--   3. `advance_sales_approval` is invoked so the state machine confirms the
--      SO when both chains are clear.
--
-- Also adds `force_approved` / `force_comment` columns to approval_requests
-- so a reader can tell at a glance which slips were bypassed.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS force_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_comment  TEXT;

COMMENT ON COLUMN public.approval_requests.force_approved IS
  'TRUE when the row was approved via force_approve_sales_request (Owner bypass) rather than the normal per-step flow.';
COMMENT ON COLUMN public.approval_requests.force_comment IS
  'Optional Owner-supplied justification recorded at force-approve time.';

CREATE OR REPLACE FUNCTION public.force_approve_sales_request(
  p_so_id          uuid,
  p_approval_type  approval_type,    -- 'margin' | 'credit'
  p_comment        text DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_is_owner    BOOLEAN;
  v_iteration   INT;
  v_count       INT;
BEGIN
  -- ── Caller identity ───────────────────────────────────────────────
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- ── Owner gate ────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  -- ── Latest iteration for this slip ────────────────────────────────
  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   approval_requests
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  -- ── Bulk-approve every pending row in this iteration ──────────────
  UPDATE approval_requests
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = COALESCE(comment, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         is_active       = true
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type
    AND  iteration     = v_iteration
    AND  status        = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this slip';
  END IF;

  -- ── Advance the chain (confirms the SO if both chains are clear) ──
  PERFORM public.advance_sales_approval(p_so_id, p_approval_type);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.force_approve_sales_request(uuid, approval_type, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_approve_sales_request(uuid, approval_type, text) TO authenticated;

COMMIT;
