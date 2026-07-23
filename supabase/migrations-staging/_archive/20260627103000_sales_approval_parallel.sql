-- ─────────────────────────────────────────────────────────────────────────────
-- Switch sales approval chains from SEQUENTIAL → PARALLEL.
--
-- Old behaviour: build_sales_approval_chain marked only the first step as
-- is_active=true; advance_sales_approval promoted the next step on each
-- approval. Approvers had to act in order (step_order asc), and the queue
-- only surfaced the slip to the role currently holding the active step.
--
-- New behaviour: every step in a new chain is is_active=true from the start.
-- Any approver whose role is listed in the chain can act at any time, in any
-- order. The chain completes when every active row in the latest iteration
-- has been approved.
--
-- Backfill: existing pending rows are flipped to is_active=true so today's
-- in-flight slips become visible to every relevant approver immediately.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Rebuild the chain-builder to activate every step at creation ─────────
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
      v_step.role_name, v_step.step_order,
      true,                                   -- ⬅ every step active in parallel
      v_iteration
    );
  END LOOP;
END;
$$;

-- ── 2. Simplify advance_sales_approval — no sequential activation needed ────
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
  FROM   approval_requests
  WHERE  source_id = p_so_id AND approval_type = p_approval_type;

  -- Has every step in this chain (latest iteration) been approved?
  SELECT NOT EXISTS (
    SELECT 1 FROM approval_requests
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  status        <> 'approved'
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  -- Chain fully cleared. If the OTHER chain still has pending rows, hold the
  -- SO in pending_approval; otherwise promote to confirmed.
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

-- ── 3. Backfill: flip every in-flight pending row to is_active=true ─────────
UPDATE public.approval_requests
SET    is_active = true
WHERE  source_type = 'sale_order'
  AND  status     = 'pending'
  AND  is_active  = false;

COMMIT;
