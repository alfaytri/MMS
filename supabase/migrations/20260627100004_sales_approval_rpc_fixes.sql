-- Sales approval RPC fixes (follow-up to 20260627100003).
--
-- 1. build_sales_approval_chain — hard-fail if no active steps exist for the
--    workflow, so a misconfigured chain doesn't strand the SO in pending_approval.
-- 2. reject_sales_request — cascade message goes into `comment`, not `reason`,
--    so each sibling row preserves its original trigger payload for audit.
-- 3. resubmit_sale_order — recompute total directly from sale_order_lines so
--    margin and credit gates can't disagree if sale_orders.total is stale;
--    also add the v_profile_id IS NULL guard used by the other RPCs.
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
  v_inserted    INT     := 0;
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
    v_first    := false;
    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'No active approval chain configured for workflow %. Configure steps in Master Data → User Roles → Approval Chain Management before submitting this sale order.', v_workflow;
  END IF;
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
  -- (the salesperson must fix the SO before any further review).
  -- Cancellation message goes into `comment` so the original trigger payload
  -- in `reason` is preserved on every sibling row for audit history.
  UPDATE approval_requests
  SET    status  = 'rejected',
         comment = 'Cancelled — sibling step rejected'
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
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  SELECT c.customer_type, cg.credit_limit
  INTO   v_customer
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  -- Compute total directly from lines to avoid any drift with sale_orders.total
  SELECT COALESCE(SUM(total), 0) INTO v_total_qar
  FROM   sale_order_lines
  WHERE  sale_order_id = p_so_id;
  v_total_qar := v_total_qar * COALESCE(v_so.exchange_rate, 1);

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
