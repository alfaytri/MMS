-- Fix: po_approval_action references ucr.custom_role_id but the column is ucr.role_id
-- This caused "column ucr.custom_role_id does not exist" on force-approve actions.

CREATE OR REPLACE FUNCTION public.po_approval_action(
  p_po_id uuid,
  p_step_id uuid,
  p_approver_email text,
  p_approver_name text,
  p_approver_profile_id uuid,
  p_action text,
  p_comment text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today         DATE := CURRENT_DATE;
  v_now           TIMESTAMPTZ := now();
  v_step          RECORD;
  v_iteration     INT;
  v_po            RECORD;
  v_approved_roles TEXT[] := '{}';
  v_pending_ids   UUID[];
  v_is_owner      BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- ── APPROVE ──────────────────────────────────────────────────────────
  IF p_action = 'approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for approve action';
    END IF;

    SELECT tier_rank, iteration, role, status, is_active
      INTO v_step
      FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;
    IF v_step.status != 'pending' OR v_step.is_active != true THEN
      RAISE EXCEPTION 'Step is not pending/active';
    END IF;

    IF EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id
         AND tier_rank = v_step.tier_rank
         AND iteration = v_step.iteration
         AND status = 'approved'
         AND approved_by = p_approver_email
         AND id != p_step_id
    ) THEN
      RAISE EXCEPTION 'Four-eyes violation: you already approved another role in this tier';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = p_approver_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Approved: ' || v_step.role, p_comment, p_approver_name, 'info');

  -- ── FORCE APPROVE (single step) ─────────────────────────────────────
  ELSIF p_action = 'force_approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for force_approve action';
    END IF;
    IF p_comment IS NULL OR trim(p_comment) = '' THEN
      RAISE EXCEPTION 'A comment is required for force-approve';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.role_id
       WHERE ucr.profile_id = p_approver_profile_id
         AND cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL
    ) INTO v_is_owner;
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = p_approver_email,
      date = v_today, force_approved = true, force_comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Force Approved: ' || v_step.role, p_comment, p_approver_name, 'critical');

  -- ── FORCE APPROVE ALL ────────────────────────────────────────────────
  ELSIF p_action = 'force_approve_all' THEN
    SELECT EXISTS (
      SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.role_id
       WHERE ucr.profile_id = p_approver_profile_id
         AND cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL
    ) INTO v_is_owner;
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
      status = 'approved', approved_by = p_approver_email,
      date = v_today, force_approved = true,
      force_comment = CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END
    WHERE id = ANY(v_pending_ids);

    FOR i IN 1..array_length(v_approved_roles, 1) LOOP
      INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
      VALUES ('purchase_order', p_po_id, 'purchase_orders',
              'Force Approved: ' || v_approved_roles[i],
              CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END,
              p_approver_name, 'critical');
    END LOOP;

  -- ── REJECT (cancel or send-back-to-draft) ───────────────────────────
  ELSIF p_action IN ('reject_cancel', 'reject_draft') THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for reject action';
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'rejected', approved_by = p_approver_email,
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
            p_comment, p_approver_name, 'warning');

    SELECT created_by, po_number INTO v_po
      FROM purchase_orders WHERE id = p_po_id;
    IF v_po.created_by IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, related_id, related_type)
      VALUES (v_po.created_by, 'po_rejected',
              'PO ' || v_po.po_number || ' was rejected by ' || p_approver_email,
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

  -- ── Common post-approve path: clear notifications + advance tier ────
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
                p_approver_name,
                CASE WHEN p_action LIKE 'force%' THEN 'critical' ELSE 'info' END);
      END IF;
    END IF;
  END;

  SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object(
    'ok', true, 'po_status', v_po.status,
    'action', p_action, 'roles', to_jsonb(v_approved_roles)
  );
END;
$$;
