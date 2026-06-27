-- Sales approval state machine.
--
-- Helpers:
--   build_sales_approval_chain(so_id, type, payload) — called by create_sale_order
--   advance_sales_approval(so_id, type)              — moves to next step or confirms SO
--   approve_sales_request(req_id, comment)
--   reject_sales_request(req_id, reason)
--   resubmit_sale_order(so_id)                       — bumps iteration after rejection
BEGIN;

-- ─── build_sales_approval_chain ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.build_sales_approval_chain(
  p_so_id          uuid,
  p_approval_type  approval_type,       -- 'margin' | 'credit'
  p_payload        jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workflow    TEXT;
  v_iteration   INT;
  v_step        RECORD;
  v_role_name   TEXT;
  v_first       BOOLEAN := true;
BEGIN
  v_workflow := CASE p_approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;

  SELECT COALESCE(MAX(iteration), 0) + 1 INTO v_iteration
  FROM   approval_requests
  WHERE  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   workflow_approval_steps was
    JOIN   custom_roles cr ON cr.id = was.role_id
    WHERE  was.workflow   = v_workflow
      AND  was.is_active  = true
      AND  was.archived_at IS NULL
    ORDER  BY was.step_order
  LOOP
    INSERT INTO approval_requests (
      source_type, source_id, approval_type, status,
      requested_by, reason,
      step_role, step_order, is_active, iteration
    ) VALUES (
      'sale_order', p_so_id, p_approval_type, 'pending',
      (p_payload->>'requested_by')::uuid,
      p_payload::text,
      v_step.role_name, v_step.step_order, v_first, v_iteration
    );
    v_first := false;
  END LOOP;
END;
$$;

-- ─── advance_sales_approval ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_sales_approval(
  p_so_id         uuid,
  p_approval_type approval_type
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_iteration  INT;
  v_next_order INT;
  v_all_done   BOOLEAN;
  v_open_other BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_so_id::text || p_approval_type::text));

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   approval_requests
  WHERE  source_id = p_so_id AND approval_type = p_approval_type;

  -- Are all active steps in this chain approved?
  SELECT NOT EXISTS (
    SELECT 1 FROM approval_requests
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  is_active     = true
      AND  status        <> 'approved'
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  -- Activate next step if any
  SELECT MIN(step_order) INTO v_next_order
  FROM   approval_requests
  WHERE  source_id     = p_so_id
    AND  approval_type = p_approval_type
    AND  iteration     = v_iteration
    AND  is_active     = false
    AND  status        = 'pending';

  IF v_next_order IS NOT NULL THEN
    UPDATE approval_requests
    SET    is_active = true
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  step_order    = v_next_order;
    RETURN;
  END IF;

  -- This chain is fully approved. If the OTHER chain still has pending
  -- approvals, the SO must stay in pending_approval. Otherwise → confirmed.
  SELECT EXISTS (
    SELECT 1 FROM approval_requests
    WHERE  source_id     = p_so_id
      AND  approval_type <> p_approval_type
      AND  status        = 'pending'
  ) INTO v_open_other;

  IF NOT v_open_other THEN
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;
END;
$$;

-- ─── approve_sales_request ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_sales_request(
  p_request_id uuid,
  p_comment    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req        RECORD;
  v_profile_id uuid;
  v_full_name  TEXT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  -- Four-eyes guard: same user must not approve two roles in the same iteration
  IF EXISTS (
    SELECT 1 FROM approval_requests
    WHERE  source_id     = v_req.source_id
      AND  approval_type = v_req.approval_type
      AND  iteration     = v_req.iteration
      AND  decided_by    = v_profile_id
      AND  id            <> p_request_id
  ) THEN
    RAISE EXCEPTION 'You have already approved another role on this slip';
  END IF;

  UPDATE approval_requests
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = p_comment
  WHERE  id = p_request_id;

  PERFORM public.advance_sales_approval(v_req.source_id, v_req.approval_type);
END;
$$;

-- ─── reject_sales_request ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_sales_request(
  p_request_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req        RECORD;
  v_profile_id uuid;
  v_full_name  TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  -- Mark this row rejected
  UPDATE approval_requests
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         reason          = p_reason
  WHERE  id = p_request_id;

  -- Mark all sibling pending rows in the same iteration as rejected too
  -- (the salesperson must fix the SO before any further review)
  UPDATE approval_requests
  SET    status   = 'rejected',
         reason   = 'Cancelled — sibling step rejected'
  WHERE  source_id     = v_req.source_id
    AND  approval_type = v_req.approval_type
    AND  iteration     = v_req.iteration
    AND  status        = 'pending'
    AND  id            <> p_request_id;

  -- Bounce SO back to quotation so it can be edited and resubmitted
  UPDATE sale_orders SET status = 'quotation' WHERE id = v_req.source_id;
END;
$$;

-- ─── resubmit_sale_order ────────────────────────────────────────────────────
-- Called when a salesperson resubmits a previously rejected quotation. Re-runs
-- both gates against the SO's current lines and creates new slip rows (with
-- iteration = max + 1) for whichever gates fire.
CREATE OR REPLACE FUNCTION public.resubmit_sale_order(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so              RECORD;
  v_customer        RECORD;
  v_total_qar       NUMERIC;
  v_open_total      NUMERIC;
  v_available       NUMERIC;
  v_exceeds_credit  BOOLEAN := false;
  v_has_below_cost  BOOLEAN := false;
  v_below_cost_lines JSONB := '[]'::jsonb;
  v_profile_id      uuid;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  SELECT c.customer_type, cg.credit_limit
  INTO   v_customer
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  v_total_qar := v_so.total * COALESCE(v_so.exchange_rate, 1);

  -- Margin
  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name, 'unit_price', unit_price, 'avg_cost', avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
  INTO   v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  -- Credit
  IF COALESCE(v_customer.customer_type, 'credit') <> 'cash'
     AND v_customer.credit_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(total), 0) INTO v_open_total
    FROM   sale_orders
    WHERE  customer_id = v_so.customer_id AND status NOT IN ('cancelled')
      AND  deleted_at IS NULL AND id <> p_so_id;
    v_available := v_customer.credit_limit - v_open_total;
    IF v_total_qar > v_available THEN v_exceeds_credit := true; END IF;
  END IF;

  IF v_exceeds_credit OR v_has_below_cost THEN
    UPDATE sale_orders SET status = 'pending_approval' WHERE id = p_so_id;
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit',
        jsonb_build_object('available', GREATEST(v_available,0),
                           'overage',   v_total_qar - COALESCE(v_available, 0),
                           'requested_by', v_profile_id)
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin',
        jsonb_build_object('lines', v_below_cost_lines, 'requested_by', v_profile_id)
      );
    END IF;
  ELSE
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;

  RETURN jsonb_build_object(
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

COMMIT;
