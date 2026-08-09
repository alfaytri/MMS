-- Harden PO approval authorization (security).
--
-- Findings (live-confirmed on staging 2026-08-09):
--   #1 CRITICAL — po_approval_action trusted client-supplied identity
--      (p_approver_email / p_approver_name / p_approver_profile_id) and never
--      used auth.uid(); any authenticated user could force-approve as the Owner
--      by passing the Owner's profile_id.
--   #3 CRITICAL — the `approve` branch had no role-membership check.
--   #4 IMPORTANT — the reject branch had no role check.
--   #2 CRITICAL — po_approvals had ALL/authenticated/USING(true) + full CRUD
--      grants to authenticated AND anon; anyone could `UPDATE po_approvals SET
--      status='approved'` directly, bypassing the RPC.
--
-- This migration:
--   1. Rewrites po_approval_action to derive the acting identity from
--      auth.uid() server-side (the p_approver_* params are now IGNORED — kept
--      only for signature/client compatibility) and to enforce role checks:
--        * approve  → caller must hold the step's role
--        * reject   → caller must hold the step's role
--        * force_*  → caller must actually hold the Owner approval-slot role
--      approved_by / activity-log performer / notification text all use the
--      real caller now, not client input. Four-eyes, advisory lock, activity
--      log, notifications, and the parallel-approval completion flip are
--      preserved exactly. Step lookups add `AND po_id = p_po_id` so a step id
--      can't be actioned against a mismatched PO.
--   2. Revokes the direct UPDATE grant on po_approvals from `authenticated`
--      (no client code UPDATEs it directly — verified; all status changes go
--      through this SECURITY DEFINER RPC, which bypasses RLS) and strips all
--      grants from `anon`. This closes the direct-forge exploit.
--
-- NOT changed here (intentional / deferred):
--   * Parallel approval (all steps active from the start; PO completes when all
--     are approved regardless of tier order) stays — it is by design.
--   * Direct INSERT/DELETE on po_approvals by `authenticated` remains (the PO
--     submit/resubmit/edit flows insert+delete steps client-side). Constraining
--     those to the PO owner (ownership policy or RPC-routing) + segregation-of-
--     duties policy (block creator self-approval / one-identity-all-tiers) are a
--     Phase 2 follow-up — they are business-rule changes, handled separately.

CREATE OR REPLACE FUNCTION public.po_approval_action(
  p_po_id uuid,
  p_step_id uuid,
  p_approver_email text,      -- IGNORED (spoofable) — identity comes from auth.uid()
  p_approver_name text,       -- IGNORED
  p_approver_profile_id uuid, -- IGNORED
  p_action text,
  p_comment text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today          DATE := CURRENT_DATE;
  v_now            TIMESTAMPTZ := now();
  v_step           RECORD;
  v_iteration      INT;
  v_po             RECORD;
  v_approved_roles TEXT[] := '{}';
  v_pending_ids    UUID[];
  v_is_owner       BOOLEAN;
  -- Real caller identity, derived from the JWT. Never trust the p_approver_* args.
  v_uid            UUID := auth.uid();
  v_profile_id     UUID;
  v_email          TEXT;
  v_name           TEXT;
  v_roles          TEXT[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, email, full_name
    INTO v_profile_id, v_email, v_name
    FROM user_data WHERE auth_user_id = v_uid;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for the authenticated user';
  END IF;
  v_name := COALESCE(NULLIF(trim(v_name), ''), v_email);

  -- Caller's approval-slot role names (e.g. 'Owner', 'Purchase Manager').
  SELECT COALESCE(array_agg(cr.name), '{}')
    INTO v_roles
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
   WHERE ucr.profile_id = v_profile_id
     AND cr.is_approval_slot = true
     AND cr.deleted_at IS NULL;
  v_is_owner := ('Owner' = ANY(v_roles));

  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- ── APPROVE ──────────────────────────────────────────────────────────
  IF p_action = 'approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for approve action';
    END IF;

    SELECT tier_rank, iteration, role, status, is_active
      INTO v_step
      FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;
    IF v_step.status != 'pending' OR v_step.is_active != true THEN
      RAISE EXCEPTION 'Step is not pending/active';
    END IF;

    -- AUTHZ: the caller must actually hold this step's approval role.
    IF NOT (v_step.role = ANY(v_roles)) THEN
      RAISE EXCEPTION 'You do not hold the "%" approval role', v_step.role;
    END IF;

    IF EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id
         AND tier_rank = v_step.tier_rank
         AND iteration = v_step.iteration
         AND status = 'approved'
         AND approved_by = v_email
         AND id != p_step_id
    ) THEN
      RAISE EXCEPTION 'Four-eyes violation: you already approved another role in this tier';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Approved: ' || v_step.role, p_comment, v_name, 'info');

  -- ── FORCE APPROVE (single step) ─────────────────────────────────────
  ELSIF p_action = 'force_approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for force_approve action';
    END IF;
    IF p_comment IS NULL OR trim(p_comment) = '' THEN
      RAISE EXCEPTION 'A comment is required for force-approve';
    END IF;

    -- AUTHZ: the REAL caller must be an Owner (not a claimed profile_id).
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, force_approved = true, force_comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Force Approved: ' || v_step.role, p_comment, v_name, 'critical');

  -- ── FORCE APPROVE ALL ────────────────────────────────────────────────
  ELSIF p_action = 'force_approve_all' THEN
    -- AUTHZ: the REAL caller must be an Owner.
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT array_agg(id), array_agg(role)
      INTO v_pending_ids, v_approved_roles
      FROM po_approvals
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true;

    IF v_pending_ids IS NULL OR array_length(v_pending_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'No pending steps to force-approve';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, force_approved = true,
      force_comment = CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END
    WHERE id = ANY(v_pending_ids);

    FOR i IN 1..array_length(v_approved_roles, 1) LOOP
      INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
      VALUES ('purchase_order', p_po_id, 'purchase_orders',
              'Force Approved: ' || v_approved_roles[i],
              CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END,
              v_name, 'critical');
    END LOOP;

  -- ── REJECT (cancel or send-back-to-draft) ───────────────────────────
  ELSIF p_action IN ('reject_cancel', 'reject_draft') THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for reject action';
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    -- AUTHZ: the caller must hold this step's role to reject through it.
    IF NOT (v_step.role = ANY(v_roles)) THEN
      RAISE EXCEPTION 'You do not hold the "%" approval role', v_step.role;
    END IF;

    UPDATE po_approvals SET
      status = 'rejected', approved_by = v_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    UPDATE po_approvals SET status = 'rejected'
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true AND id != p_step_id;

    IF p_action = 'reject_cancel' THEN
      UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id;
    ELSE
      UPDATE purchase_orders SET status = 'draft' WHERE id = p_po_id;
    END IF;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            CASE WHEN p_action = 'reject_cancel'
              THEN 'Rejected by ' || v_step.role || ' — PO Cancelled'
              ELSE 'Rejected by ' || v_step.role || ' — Sent Back to Draft'
            END,
            p_comment, v_name, 'warning');

    SELECT created_by, po_number INTO v_po
      FROM purchase_orders WHERE id = p_po_id;
    IF v_po.created_by IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, related_id, related_type)
      VALUES (v_po.created_by, 'po_rejected',
              'PO ' || v_po.po_number || ' was rejected by ' || v_email,
              p_po_id, 'purchase_order');
    END IF;

    UPDATE notifications SET read_at = v_now
     WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true, 'po_status',
      CASE WHEN p_action = 'reject_cancel' THEN 'cancelled' ELSE 'draft' END,
      'action', p_action, 'roles', to_jsonb(v_approved_roles)
    );

  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  -- ── Common post-approve path: clear notifications + advance/complete ──
  UPDATE notifications SET read_at = v_now
   WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

  DECLARE
    v_adv_iteration INT;
    v_next_rank     INT;
    v_all_done      BOOLEAN;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM purchase_orders WHERE id = p_po_id AND status = 'pending_approval'
    ) THEN
      SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
      RETURN jsonb_build_object('ok', true, 'po_status', v_po.status, 'action', p_action, 'roles', to_jsonb(v_approved_roles));
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_adv_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT NOT EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = true AND status != 'approved'
    ) INTO v_all_done;

    IF v_all_done THEN
      SELECT MIN(tier_rank) INTO v_next_rank
        FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = false AND status = 'pending';

      IF v_next_rank IS NOT NULL THEN
        UPDATE po_approvals SET is_active = true
         WHERE po_id = p_po_id AND iteration = v_adv_iteration AND tier_rank = v_next_rank;
      ELSE
        UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;

        SELECT created_by, po_number INTO v_po FROM purchase_orders WHERE id = p_po_id;
        IF v_po.created_by IS NOT NULL THEN
          INSERT INTO notifications (profile_id, type, title, related_id, related_type)
          VALUES (v_po.created_by, 'po_approved',
                  'PO ' || v_po.po_number || ' has been fully approved',
                  p_po_id, 'purchase_order');
        END IF;

        INSERT INTO activity_log (entity_type, entity_id, module, action, performer_name, severity)
        VALUES ('purchase_order', p_po_id, 'purchase_orders',
                CASE WHEN p_action LIKE 'force%' THEN 'PO Fully Approved (Force)' ELSE 'PO Fully Approved' END,
                v_name,
                (CASE WHEN p_action LIKE 'force%' THEN 'critical' ELSE 'info' END)::audit_severity);
      END IF;
    END IF;
  END;

  SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object(
    'ok', true, 'po_status', v_po.status,
    'action', p_action, 'roles', to_jsonb(v_approved_roles)
  );
END;
$function$;

-- ── #2: lock down direct writes on po_approvals ─────────────────────────────
-- Status changes flow only through po_approval_action (SECURITY DEFINER, so it
-- bypasses RLS/grants). No client code UPDATEs po_approvals directly. Revoke the
-- direct UPDATE + TRUNCATE grant from authenticated so the forge-via-UPDATE path
-- is gone; strip all grants from anon (it never legitimately touches this table).
REVOKE UPDATE, TRUNCATE ON public.po_approvals FROM authenticated;
REVOKE ALL ON public.po_approvals FROM anon;
