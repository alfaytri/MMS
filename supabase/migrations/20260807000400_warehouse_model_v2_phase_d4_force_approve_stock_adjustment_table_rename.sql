-- Warehouse Model v2 — Phase D.4 hotfix
-- `force_approve_stock_adjustment` still referenced the pre-2026-07-24
-- table name `profiles` (renamed to `user_data`; compat view dropped).
-- Every Owner-triggered Force Approve on the Stock Adjustment page
-- failed with `relation "profiles" does not exist`.
--
-- Same class as the C.1 hotfix batch that swept the warehouse-side
-- functions and the D.3 `approve_stock_adjustment_inventory` rename
-- hotfix — RENAME TABLE does not rewrite existing function bodies.
--
-- Body sourced live via pg_get_functiondef 2026-08-01. Only delta: swap
-- `profiles` → `user_data`. Everything else preserved verbatim.

CREATE OR REPLACE FUNCTION public.force_approve_stock_adjustment(
  p_adjustment_id uuid,
  p_comment       text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile_id  uuid;
  v_full_name   text;
  v_is_owner    boolean;
  v_status      text;
  v_count       INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

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

  PERFORM public.approve_stock_adjustment_inventory(
    p_adjustment_id => p_adjustment_id,
    p_approved_by   => v_full_name
  );

  RETURN v_count;
END;
$function$;
