-- ─────────────────────────────────────────────────────────────────────────────
-- Retire the compatibility views from 20260627112000.
--
-- That migration renamed five tables and created same-name views so the ~20
-- existing PL/pgSQL functions that referenced the old names kept compiling
-- and running. This migration takes the second step: every dependent function
-- is recreated with the NEW table names, and the compat views are dropped.
-- After this runs, only the four real renamed tables remain
-- (sale_order_approvals, approval_workflow_steps, po_approval_chains,
-- po_approval_chain_tiers, service_edit_requests) — no more aliases.
--
-- Function-by-function rewrite covers:
--   approval_requests        → sale_order_approvals     (8 functions)
--   workflow_approval_steps  → approval_workflow_steps  (9 functions)
--   service_change_requests  → service_edit_requests    (7 functions)
-- (some functions touch more than one of these, so the counts overlap.)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SALES APPROVAL FAMILY — uses sale_order_approvals                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- set_approval_request_decided_at — trigger that stamps decided_at when status
-- moves off 'pending'. Trigger itself was created against approval_requests;
-- we re-attach it to sale_order_approvals below.
CREATE OR REPLACE FUNCTION public.set_approval_request_decided_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
    NEW.decided_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_requests_decided_at ON public.sale_order_approvals;
CREATE TRIGGER trg_approval_requests_decided_at
  BEFORE UPDATE ON public.sale_order_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_approval_request_decided_at();

-- The generic updated_at trigger was attached to the old name; reattach.
DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON public.sale_order_approvals;
CREATE TRIGGER trg_approval_requests_updated_at
  BEFORE UPDATE ON public.sale_order_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- build_sales_approval_chain — parallel-chain version (was 20260627103000)
CREATE OR REPLACE FUNCTION public.build_sales_approval_chain(
  p_so_id          uuid,
  p_approval_type  approval_type,
  p_payload        jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workflow    TEXT;
  v_iteration   INT;
  v_step        RECORD;
BEGIN
  v_workflow := CASE p_approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;

  SELECT COALESCE(MAX(iteration), 0) + 1 INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles cr ON cr.id = was.role_id
    WHERE  was.workflow   = v_workflow
      AND  was.is_active  = true
      AND  was.archived_at IS NULL
    ORDER  BY was.step_order
  LOOP
    INSERT INTO sale_order_approvals (
      source_type, source_id, approval_type, status,
      requested_by, reason,
      step_role, step_order, is_active, iteration
    ) VALUES (
      'sale_order', p_so_id, p_approval_type, 'pending',
      (p_payload->>'requested_by')::uuid,
      p_payload::text,
      v_step.role_name, v_step.step_order,
      true,
      v_iteration
    );
  END LOOP;
END;
$$;

-- advance_sales_approval — parallel-chain version
CREATE OR REPLACE FUNCTION public.advance_sales_approval(
  p_so_id         uuid,
  p_approval_type approval_type
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_iteration  INT;
  v_all_done   BOOLEAN;
  v_open_other BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_so_id::text || p_approval_type::text));

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id = p_so_id AND approval_type = p_approval_type;

  SELECT NOT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  status        <> 'approved'
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type <> p_approval_type
      AND  status        = 'pending'
  ) INTO v_open_other;

  IF NOT v_open_other THEN
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;
END;
$$;

-- approve_sales_request — role+scope guard version (was 20260627100005)
CREATE OR REPLACE FUNCTION public.approve_sales_request(
  p_request_id uuid,
  p_comment    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = v_req.source_id
      AND  approval_type = v_req.approval_type
      AND  iteration     = v_req.iteration
      AND  decided_by    = v_profile_id
      AND  id            <> p_request_id
  ) THEN
    RAISE EXCEPTION 'You have already approved another role on this slip';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = p_comment
  WHERE  id = p_request_id;

  PERFORM public.advance_sales_approval(v_req.source_id, v_req.approval_type);
END;
$$;

-- reject_sales_request — role+scope guard version
CREATE OR REPLACE FUNCTION public.reject_sales_request(
  p_request_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required to reject this approval step';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         reason          = p_reason
  WHERE  id = p_request_id;

  UPDATE sale_order_approvals
  SET    status   = 'rejected',
         reason   = 'Cancelled — sibling step rejected'
  WHERE  source_id     = v_req.source_id
    AND  approval_type = v_req.approval_type
    AND  iteration     = v_req.iteration
    AND  status        = 'pending'
    AND  id            <> p_request_id;

  UPDATE sale_orders SET status = 'quotation' WHERE id = v_req.source_id;
END;
$$;

-- force_approve_sales_request — Owner bypass (was 20260627102000)
CREATE OR REPLACE FUNCTION public.force_approve_sales_request(
  p_so_id          uuid,
  p_approval_type  approval_type,
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
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

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

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  UPDATE sale_order_approvals
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

  PERFORM public.advance_sales_approval(p_so_id, p_approval_type);

  RETURN v_count;
END;
$$;

-- log_sales_approval_decision — activity-log trigger (was 20260627105000)
CREATE OR REPLACE FUNCTION public.log_sales_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action  TEXT;
  v_details TEXT;
BEGIN
  IF NEW.source_type <> 'sale_order' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status      THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' AND NEW.force_approved THEN
    v_action := format('Sales Approval Force-Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSIF NEW.status = 'approved' THEN
    v_action := format('Sales Approval Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSE
    v_action := format('Sales Approval Rejected — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  END IF;

  v_details := jsonb_build_object(
    'approval_type', NEW.approval_type,
    'step_role',     NEW.step_role,
    'iteration',     NEW.iteration,
    'comment',       NULLIF(NEW.comment, ''),
    'reason',        CASE WHEN NEW.status = 'rejected' THEN NEW.reason ELSE NULL END,
    'force',         NEW.force_approved
  )::text;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id,
    performer_name, severity, details
  ) VALUES (
    v_action,
    'sale_orders',
    'sale_order',
    NEW.source_id,
    NEW.decided_by_name,
    CASE
      WHEN NEW.status = 'rejected'        THEN 'warning'
      WHEN NEW.force_approved              THEN 'critical'
      ELSE                                       'info'
    END,
    v_details
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sales_approval_decision ON public.sale_order_approvals;
CREATE TRIGGER trg_log_sales_approval_decision
  AFTER UPDATE ON public.sale_order_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sales_approval_decision();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. WORKFLOW STEP ADMIN — uses approval_workflow_steps                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- add_workflow_step — legacy variant (was 20260627100006)
CREATE OR REPLACE FUNCTION public.add_workflow_step(
  p_workflow         text,
  p_role_name        text,
  p_role_desc        text DEFAULT ''::text,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

-- add_workflow_step_for_role — current variant
CREATE OR REPLACE FUNCTION public.add_workflow_step_for_role(
  p_workflow         text,
  p_role_id          uuid,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

-- update_workflow_step_conditions (was 20260619120000)
CREATE OR REPLACE FUNCTION public.update_workflow_step_conditions(
  p_step_id         UUID,
  p_is_conditional  BOOLEAN,
  p_condition_types TEXT[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE approval_workflow_steps
  SET is_conditional  = p_is_conditional,
      condition_types = CASE
        WHEN p_is_conditional THEN COALESCE(p_condition_types, ARRAY[]::TEXT[])
        ELSE ARRAY[]::TEXT[]
      END
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

-- archive_workflow_step (baseline)
CREATE OR REPLACE FUNCTION public.archive_workflow_step(p_step_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'Owner'
      AND cr.is_approval_slot = true
      AND cr.deleted_at IS NULL
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only owners can archive approval chain steps';
  END IF;

  UPDATE approval_workflow_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

-- toggle_workflow_step (baseline)
CREATE OR REPLACE FUNCTION public.toggle_workflow_step(p_step_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE approval_workflow_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

-- update_workflow_step_role (baseline)
CREATE OR REPLACE FUNCTION public.update_workflow_step_role(p_step_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name TEXT;
BEGIN
  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  UPDATE approval_workflow_steps
  SET role_id    = p_role_id,
      step_label = v_role_name
  WHERE id = p_step_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

-- build_inv_check_approval_chain (baseline)
CREATE OR REPLACE FUNCTION public.build_inv_check_approval_chain(
  p_has_damage_or_writeoff boolean DEFAULT false,
  p_has_variance boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_steps JSONB;
BEGIN
  IF NOT p_has_variance THEN
    SELECT jsonb_agg(jsonb_build_object(
      'step_order', 1,
      'step_role',  step_key,
      'step_label', step_label
    ))
    INTO v_steps
    FROM approval_workflow_steps
    WHERE workflow = 'inv_check'
      AND step_key = 'inventory_manager'
      AND is_active = true
      AND archived_at IS NULL;

    RETURN COALESCE(v_steps, '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'step_order', rn,
      'step_role',  step_key,
      'step_label', step_label
    ) ORDER BY rn
  )
  INTO v_steps
  FROM (
    SELECT step_key, step_label,
           ROW_NUMBER() OVER (ORDER BY step_order) AS rn
    FROM   approval_workflow_steps
    WHERE  workflow = 'inv_check'
      AND  is_active = true
      AND  archived_at IS NULL
      AND  (
        NOT is_conditional
        OR (is_conditional AND p_has_damage_or_writeoff)
      )
  ) sub;

  RETURN COALESCE(v_steps, '[]'::jsonb);
END;
$$;

-- create_stock_adjustment_v2 (baseline)
CREATE OR REPLACE FUNCTION public.create_stock_adjustment_v2(
  p_warehouse_id uuid,
  p_brand_variant_id uuid,
  p_adjustment_type text,
  p_qty numeric,
  p_reason text,
  p_notes text,
  p_photo_urls text[],
  p_requested_by uuid,
  p_requested_by_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id   UUID;
  v_step RECORD;
  v_ord  INT := 0;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name, created_by
  ) VALUES (
    p_warehouse_id, p_brand_variant_id, p_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes,''), COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by, p_requested_by_name, p_requested_by
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$$;

-- user_can_action_adjustment_step (baseline)
CREATE OR REPLACE FUNCTION public.user_can_action_adjustment_step(
  p_profile_id uuid,
  p_step_role text,
  p_warehouse_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    OR (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_field_rps
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

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SERVICE EDIT REQUESTS — uses service_edit_requests                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- approve_service_change (baseline) — long body, only table refs change
CREATE OR REPLACE FUNCTION public.approve_service_change(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_profile_id    UUID;
  v_req           RECORD;
  v_live          RECORD;
  v_key           TEXT;
  v_old_val       TEXT;
  v_live_val      TEXT;
  v_new_service_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  CASE v_req.change_type
    WHEN 'edit' THEN
      SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Service no longer exists'; END IF;

      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
        IF v_old_val IS DISTINCT FROM v_live_val THEN
          RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
            v_key, v_old_val, v_live_val;
        END IF;
      END LOOP;

      UPDATE services SET
        name_en           = CASE WHEN v_req.changes ? 'name_en'           THEN v_req.changes->'name_en'->>'new'                   ELSE name_en           END,
        name_ar           = CASE WHEN v_req.changes ? 'name_ar'           THEN v_req.changes->'name_ar'->>'new'                   ELSE name_ar           END,
        code              = CASE WHEN v_req.changes ? 'code'              THEN v_req.changes->'code'->>'new'                      ELSE code              END,
        price             = CASE WHEN v_req.changes ? 'price'             THEN (v_req.changes->'price'->>'new')::NUMERIC           ELSE price             END,
        emergency_price   = CASE WHEN v_req.changes ? 'emergency_price'   THEN (v_req.changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price   END,
        discount          = CASE WHEN v_req.changes ? 'discount'          THEN (v_req.changes->'discount'->>'new')::NUMERIC        ELSE discount          END,
        duration          = CASE WHEN v_req.changes ? 'duration'          THEN (v_req.changes->'duration'->>'new')::INT            ELSE duration          END,
        warranty          = CASE WHEN v_req.changes ? 'warranty'          THEN (v_req.changes->'warranty'->>'new')::INT            ELSE warranty          END,
        status            = CASE WHEN v_req.changes ? 'status'            THEN (v_req.changes->'status'->>'new')::service_status   ELSE status            END,
        item_kind         = CASE WHEN v_req.changes ? 'item_kind'         THEN v_req.changes->'item_kind'->>'new'                  ELSE item_kind         END,
        pricing_mode      = CASE WHEN v_req.changes ? 'pricing_mode'      THEN v_req.changes->'pricing_mode'->>'new'               ELSE pricing_mode      END,
        discount_scope    = CASE WHEN v_req.changes ? 'discount_scope'    THEN v_req.changes->'discount_scope'->>'new'             ELSE discount_scope    END,
        invoice_text_en   = CASE WHEN v_req.changes ? 'invoice_text_en'   THEN v_req.changes->'invoice_text_en'->>'new'            ELSE invoice_text_en   END,
        invoice_text_ar   = CASE WHEN v_req.changes ? 'invoice_text_ar'   THEN v_req.changes->'invoice_text_ar'->>'new'            ELSE invoice_text_ar   END,
        catalog_image_url = CASE WHEN v_req.changes ? 'catalog_image_url' THEN v_req.changes->'catalog_image_url'->>'new'          ELSE catalog_image_url END,
        updated_at        = now()
      WHERE id = v_req.service_id;

    WHEN 'add' THEN
      v_new_service_id := gen_random_uuid();
      BEGIN
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code,
          price, emergency_price, duration, warranty,
          status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement
        ) VALUES (
          v_new_service_id,
          (v_req.changes->'parent_id'->>'new')::UUID,
          v_req.changes->'tree_type'->>'new',
          0,
          v_req.division,
          v_req.changes->'name_en'->>'new',
          v_req.changes->'name_ar'->>'new',
          v_req.changes->'code'->>'new',
          (v_req.changes->'price'->>'new')::NUMERIC,
          (v_req.changes->'emergency_price'->>'new')::NUMERIC,
          (v_req.changes->'duration'->>'new')::INT,
          (v_req.changes->'warranty'->>'new')::INT,
          COALESCE(v_req.changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_req.changes ? 'category' AND v_req.changes->'category'->>'new' IS NOT NULL
               THEN (v_req.changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'service_type' AND v_req.changes->'service_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'contract_type' AND v_req.changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_req.changes->'item_kind'->>'new',
          v_req.changes->'pricing_mode'->>'new',
          v_req.changes->'discount_scope'->>'new',
          v_req.changes->'invoice_text_en'->>'new',
          v_req.changes->'invoice_text_ar'->>'new',
          v_req.changes->'photo_requirement'->>'new'
        );
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'A service with this name already exists in this division. Reject this request instead.';
      END;
      UPDATE service_edit_requests SET service_id = v_new_service_id WHERE id = p_request_id;

    WHEN 'delete' THEN
      IF EXISTS (
        SELECT 1 FROM order_services os
        JOIN orders o ON o.id = os.order_id
        WHERE os.service_id = v_req.service_id
          AND o.status NOT IN ('completed', 'cancelled')
          AND o.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot delete: service has active orders. Reject this request instead.';
      END IF;
      UPDATE services
      SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
      WHERE id = v_req.service_id;

  END CASE;

  UPDATE service_edit_requests
  SET status = 'approved', reviewed_by = v_profile_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'service_id', COALESCE(v_new_service_id, v_req.service_id));
END;
$_$;

-- reject_service_change (baseline)
CREATE OR REPLACE FUNCTION public.reject_service_change(p_request_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE service_edit_requests
  SET
    status           = 'rejected',
    reviewed_by      = v_profile_id,
    reviewed_at      = now(),
    rejection_reason = trim(p_reason),
    updated_at       = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- submit_service_change (baseline) — large body, only INSERT INTO service_change_requests changed
CREATE OR REPLACE FUNCTION public.submit_service_change(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id     UUID;
  v_has_approve    BOOLEAN;
  v_has_manage     BOOLEAN;
  v_service_id     UUID;
  v_change_type    service_change_type;
  v_changes        JSONB;
  v_division       TEXT[];
  v_tree_type      TEXT;
  v_parent_id      UUID;
  v_has_pending    BOOLEAN;
  v_new_id         UUID;
  v_needs_approval BOOLEAN := false;
  v_key            TEXT;
  v_approval_fields TEXT[] := ARRAY['name_en', 'name_ar', 'price', 'emergency_price', 'status'];
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  v_has_approve := _user_has_permission(v_profile_id, 'master_data.services.approve');
  v_has_manage  := _user_has_permission(v_profile_id, 'master_data.services.manage');

  IF NOT v_has_manage THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.manage required';
  END IF;

  v_service_id  := (p_payload->>'service_id')::UUID;
  v_change_type := (p_payload->>'change_type')::service_change_type;
  v_changes     := p_payload->'changes';
  v_tree_type   := p_payload->>'tree_type';
  v_parent_id   := (p_payload->>'parent_id')::UUID;

  SELECT COALESCE(array_agg(elem::TEXT), '{}')
  INTO v_division
  FROM jsonb_array_elements_text(p_payload->'division') AS elem;

  IF v_change_type IN ('add', 'delete') THEN
    v_needs_approval := true;
  ELSIF v_change_type = 'edit' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
      IF v_key = ANY(v_approval_fields) THEN
        v_needs_approval := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_has_approve OR NOT v_needs_approval THEN
    CASE v_change_type
      WHEN 'add' THEN
        v_new_id := gen_random_uuid();
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code, legacy_service_id,
          price, emergency_price, discount, price_unit,
          duration, warranty, status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement,
          catalog_image_url, brands_supported, includes_notes,
          spare_parts, qc_checklist, instructions, reminder_days,
          booking_time_matrix, inventory_items, components, qc_items
        ) VALUES (
          v_new_id, v_parent_id, v_tree_type, 0, v_division,
          v_changes->'name_en'->>'new',
          v_changes->'name_ar'->>'new',
          v_changes->'code'->>'new',
          v_changes->'legacy_service_id'->>'new',
          (v_changes->'price'->>'new')::NUMERIC,
          (v_changes->'emergency_price'->>'new')::NUMERIC,
          (v_changes->'discount'->>'new')::NUMERIC,
          v_changes->'price_unit'->>'new',
          (v_changes->'duration'->>'new')::INT,
          (v_changes->'warranty'->>'new')::INT,
          COALESCE(v_changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_changes ? 'category' AND v_changes->'category'->>'new' IS NOT NULL
               THEN (v_changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_changes ? 'service_type' AND v_changes->'service_type'->>'new' IS NOT NULL
               THEN (v_changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_changes ? 'contract_type' AND v_changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_changes->'item_kind'->>'new',
          v_changes->'pricing_mode'->>'new',
          v_changes->'discount_scope'->>'new',
          v_changes->'invoice_text_en'->>'new',
          v_changes->'invoice_text_ar'->>'new',
          v_changes->'photo_requirement'->>'new',
          v_changes->'catalog_image_url'->>'new',
          COALESCE((v_changes->'brands_supported'->>'new')::INT, 0),
          COALESCE((v_changes->'includes_notes'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'spare_parts'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'qc_checklist'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'instructions'->>'new')::BOOLEAN, false),
          (v_changes->'reminder_days'->>'new')::INT,
          CASE WHEN v_changes ? 'booking_time_matrix' THEN v_changes->'booking_time_matrix'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'inventory_items'     THEN v_changes->'inventory_items'->'new'     ELSE NULL END,
          CASE WHEN v_changes ? 'components'          THEN v_changes->'components'->'new'          ELSE NULL END,
          CASE WHEN v_changes ? 'qc_items'            THEN v_changes->'qc_items'->'new'            ELSE NULL END
        );
        v_service_id := v_new_id;

      WHEN 'edit' THEN
        UPDATE services SET
          name_en           = CASE WHEN v_changes ? 'name_en'           THEN v_changes->'name_en'->>'new'                    ELSE name_en           END,
          name_ar           = CASE WHEN v_changes ? 'name_ar'           THEN v_changes->'name_ar'->>'new'                    ELSE name_ar           END,
          code              = CASE WHEN v_changes ? 'code'              THEN v_changes->'code'->>'new'                       ELSE code              END,
          legacy_service_id = CASE WHEN v_changes ? 'legacy_service_id' THEN v_changes->'legacy_service_id'->>'new'          ELSE legacy_service_id END,
          price             = CASE WHEN v_changes ? 'price'             THEN (v_changes->'price'->>'new')::NUMERIC            ELSE price             END,
          emergency_price   = CASE WHEN v_changes ? 'emergency_price'   THEN (v_changes->'emergency_price'->>'new')::NUMERIC  ELSE emergency_price   END,
          discount          = CASE WHEN v_changes ? 'discount'          THEN (v_changes->'discount'->>'new')::NUMERIC         ELSE discount          END,
          price_unit        = CASE WHEN v_changes ? 'price_unit'        THEN v_changes->'price_unit'->>'new'                  ELSE price_unit        END,
          duration          = CASE WHEN v_changes ? 'duration'          THEN (v_changes->'duration'->>'new')::INT             ELSE duration          END,
          warranty          = CASE WHEN v_changes ? 'warranty'          THEN (v_changes->'warranty'->>'new')::INT             ELSE warranty          END,
          status            = CASE WHEN v_changes ? 'status'            THEN (v_changes->'status'->>'new')::service_status    ELSE status            END,
          service_type      = CASE WHEN v_changes ? 'service_type'      THEN (v_changes->'service_type'->>'new')::service_type ELSE service_type     END,
          contract_type     = CASE WHEN v_changes ? 'contract_type'     THEN
                                CASE WHEN v_changes->'contract_type'->>'new' IS NOT NULL
                                     THEN (v_changes->'contract_type'->>'new')::contract_type
                                     ELSE NULL END                                                                            ELSE contract_type     END,
          item_kind         = CASE WHEN v_changes ? 'item_kind'         THEN v_changes->'item_kind'->>'new'                   ELSE item_kind         END,
          pricing_mode      = CASE WHEN v_changes ? 'pricing_mode'      THEN v_changes->'pricing_mode'->>'new'                ELSE pricing_mode      END,
          discount_scope    = CASE WHEN v_changes ? 'discount_scope'    THEN v_changes->'discount_scope'->>'new'              ELSE discount_scope    END,
          invoice_text_en   = CASE WHEN v_changes ? 'invoice_text_en'   THEN v_changes->'invoice_text_en'->>'new'             ELSE invoice_text_en   END,
          invoice_text_ar   = CASE WHEN v_changes ? 'invoice_text_ar'   THEN v_changes->'invoice_text_ar'->>'new'             ELSE invoice_text_ar   END,
          photo_requirement = CASE WHEN v_changes ? 'photo_requirement' THEN v_changes->'photo_requirement'->>'new'           ELSE photo_requirement END,
          catalog_image_url = CASE WHEN v_changes ? 'catalog_image_url' THEN v_changes->'catalog_image_url'->>'new'           ELSE catalog_image_url END,
          brands_supported  = CASE WHEN v_changes ? 'brands_supported'  THEN (v_changes->'brands_supported'->>'new')::INT  ELSE brands_supported  END,
          includes_notes    = CASE WHEN v_changes ? 'includes_notes'    THEN (v_changes->'includes_notes'->>'new')::BOOLEAN    ELSE includes_notes    END,
          spare_parts       = CASE WHEN v_changes ? 'spare_parts'       THEN (v_changes->'spare_parts'->>'new')::BOOLEAN       ELSE spare_parts       END,
          qc_checklist      = CASE WHEN v_changes ? 'qc_checklist'      THEN (v_changes->'qc_checklist'->>'new')::BOOLEAN      ELSE qc_checklist      END,
          instructions      = CASE WHEN v_changes ? 'instructions'      THEN (v_changes->'instructions'->>'new')::BOOLEAN      ELSE instructions      END,
          reminder_days     = CASE WHEN v_changes ? 'reminder_days'     THEN (v_changes->'reminder_days'->>'new')::INT         ELSE reminder_days     END,
          updated_at        = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

      WHEN 'delete' THEN
        IF EXISTS (
          SELECT 1 FROM order_services os
          JOIN orders o ON o.id = os.order_id
          WHERE os.service_id = v_service_id
            AND o.status NOT IN ('completed', 'cancelled')
            AND o.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Cannot delete: service has active orders';
        END IF;
        UPDATE services
        SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

    END CASE;

    INSERT INTO activity_log (action, module, entity_type, entity_id, details)
    VALUES (
      'services/service-' || v_change_type || 'd',
      'services',
      'service',
      v_service_id,
      jsonb_build_object('change_type', v_change_type, 'applied_by', v_profile_id)::TEXT
    );

    RETURN jsonb_build_object('action', 'applied', 'id', v_service_id);

  ELSE
    IF v_service_id IS NOT NULL THEN
      SELECT has_pending_change INTO v_has_pending FROM services WHERE id = v_service_id;
      IF v_has_pending THEN
        RAISE EXCEPTION 'This service already has a pending change awaiting approval';
      END IF;
    END IF;

    INSERT INTO service_edit_requests (service_id, division, change_type, changes, requested_by)
    VALUES (v_service_id, v_division, v_change_type, v_changes, v_profile_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('action', 'pending', 'id', v_new_id);
  END IF;
END;
$$;

-- update_pending_service_change (baseline)
CREATE OR REPLACE FUNCTION public.update_pending_service_change(
  p_request_id uuid,
  p_new_changes jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can update this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  UPDATE service_edit_requests
  SET changes = p_new_changes, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- withdraw_service_change (baseline)
CREATE OR REPLACE FUNCTION public.withdraw_service_change(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  DELETE FROM service_edit_requests WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- sync_service_pending_lock (baseline trigger fn)
CREATE OR REPLACE FUNCTION public.sync_service_pending_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_edit_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
END;
$$;

-- auto_reject_pending_on_service_delete (baseline trigger fn)
CREATE OR REPLACE FUNCTION public.auto_reject_pending_on_service_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_edit_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now(),
        updated_at = now()
    WHERE service_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. Drop the compatibility views                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP VIEW IF EXISTS public.approval_requests;
DROP VIEW IF EXISTS public.workflow_approval_steps;
DROP VIEW IF EXISTS public.approval_chains;
DROP VIEW IF EXISTS public.approval_chain_tiers;
DROP VIEW IF EXISTS public.service_change_requests;

-- Tell PostgREST to reload its schema cache so the API stops advertising the
-- old names.
NOTIFY pgrst, 'reload schema';

COMMIT;
