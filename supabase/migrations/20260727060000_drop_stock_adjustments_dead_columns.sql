-- Section 1.18 — Drop 3 dead columns on stock_adjustments
--
-- Audit outcome:
--   * deleted_at        — soft-delete scaffolding, no writer, no reader
--                         anywhere. If a cancel-SA flow is ever built it
--                         would extend status to include 'cancelled'
--                         (existing filter tabs) rather than wire a
--                         soft-delete filter into every read.
--   * created_by  (FK)  — always equal to requested_by (both RPCs pass
--                         p_requested_by / v_approver_id to both slots).
--                         source_check_id already tells us "manual vs
--                         check-generated" definitively — created_by
--                         adds no information beyond requested_by.
--   * approved_by (FK)  — never written on approve (only approved_by_name
--                         is), written on reject (line 809 of the
--                         baseline action_stock_adjustment_step). Never
--                         read anywhere. The canonical approver already
--                         lives on the last-approved row of
--                         stock_adjustment_approvals — the parent-row
--                         copy is a broken denormalization cache.
--
-- Same pass: rewrite the three RPCs that referenced these columns so
-- the drops don't leave dangling INSERT/UPDATE column lists.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rewrite RPCs to stop referencing the dead columns
-- ---------------------------------------------------------------------------

-- action_stock_adjustment_step — drop `approved_by = p_profile_id` from the
-- reject-branch UPDATE. Everything else unchanged.
CREATE OR REPLACE FUNCTION public.action_stock_adjustment_step(
  p_step_id      uuid,
  p_action       text,
  p_profile_id   uuid,
  p_profile_name text,
  p_notes        text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_step          RECORD;
  v_warehouse_id  UUID;
  v_remaining     INTEGER;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile is required to action an approval step';
  END IF;

  IF p_action = 'rejected' AND COALESCE(TRIM(p_notes), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting an approval step';
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

  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  IF NOT user_can_action_adjustment_step(p_profile_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = p_profile_id,
         profile_name = COALESCE(p_profile_name, profile_name),
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    -- approved_by dropped in Section 1.18 — never read anywhere; the
    -- canonical rejector already lives on the step row above.
    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by_name  = p_profile_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM approve_stock_adjustment_inventory(
      p_adjustment_id => v_step.adjustment_id,
      p_approved_by   => p_profile_name
    );
    RETURN 'chain_completed';
  END IF;

  RETURN 'step_approved';
END;
$$;

-- create_stock_adjustment_v2 — drop `created_by` from the INSERT column
-- list (was always set = p_requested_by; redundant per Section 1.18 audit).
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
    requested_by, requested_by_name
  ) VALUES (
    p_warehouse_id,
    p_brand_variant_id,
    p_adjustment_type::public.stock_adjustment_type,
    p_qty,
    p_reason,
    NULLIF(p_notes,''),
    COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by,
    p_requested_by_name
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

-- apply_inventory_check_adjustments — drop `created_by` from the SA-generation
-- INSERT column list.
CREATE OR REPLACE FUNCTION public.apply_inventory_check_adjustments(p_check_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_check          RECORD;
  v_item           RECORD;
  v_variance       NUMERIC;
  v_adj_type       text;
  v_adj_qty        NUMERIC;
  v_check_number   text;
  v_approver_id    uuid;
  v_approver_name  text;
  v_new_adj_id     uuid;
  v_step           RECORD;
  v_ord            INT;
BEGIN
  -- Lock and validate the check
  SELECT id, warehouse_id, status, check_number
  INTO v_check
  FROM inventory_checks
  WHERE id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  v_check_number := v_check.check_number;

  -- Freeze system_qty_at_close (still needed for the audit trail)
  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  -- Pick the check's final approver as the SA requester
  SELECT profile_id, profile_name
  INTO v_approver_id, v_approver_name
  FROM inventory_check_approvals
  WHERE check_id = p_check_id
    AND status = 'approved'
  ORDER BY step_order DESC
  LIMIT 1;

  v_approver_name := COALESCE(v_approver_name, 'System (check ' || v_check_number || ')');

  -- Generate one SA per non-zero variance line
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty,
           variance, variance_type
    FROM inventory_check_items
    WHERE check_id = p_check_id
      AND is_counted = true
      AND variance IS NOT NULL
      AND variance <> 0
  LOOP
    v_variance := v_item.variance;
    v_adj_qty  := ABS(v_variance);

    IF v_variance > 0 THEN
      v_adj_type := 'increase';
    ELSIF v_item.variance_type IN ('damage', 'write_off') THEN
      v_adj_type := v_item.variance_type;
    ELSE
      v_adj_type := 'decrease';
    END IF;

    -- created_by dropped in Section 1.18 (always equalled requested_by).
    INSERT INTO public.stock_adjustments (
      warehouse_id, brand_variant_id, adjustment_type, qty,
      reason, notes, photo_urls, status,
      requested_by, requested_by_name,
      source_check_id, source_check_item_id
    ) VALUES (
      v_check.warehouse_id,
      v_item.brand_variant_id,
      v_adj_type::public.stock_adjustment_type,
      v_adj_qty,
      'Auto-generated from inventory check ' || v_check_number,
      'Counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
        || ' (variance ' || v_variance || ')',
      '{}'::text[],
      'pending_approval',
      v_approver_id,
      v_approver_name,
      p_check_id,
      v_item.id
    )
    RETURNING id INTO v_new_adj_id;

    -- Build the SA's approval chain from approval_workflow_steps
    v_ord := 0;
    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   approval_workflow_steps
      WHERE  workflow = 'stock_adj'
        AND  is_active = true
        AND  archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT (v_adj_type = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;

      v_ord := v_ord + 1;
      INSERT INTO stock_adjustment_approvals (
        adjustment_id, step_order, step_role, step_label
      ) VALUES (
        v_new_adj_id, v_ord, v_step.step_key, v_step.step_label
      );
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow — cannot auto-generate SA from check %', v_check_number;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop the FK constraints on the dead FK columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_approved_by_fkey,
  DROP CONSTRAINT IF EXISTS stock_adjustments_created_by_fkey;

-- ---------------------------------------------------------------------------
-- 3. Drop the three dead columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.stock_adjustments
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS approved_by;

COMMIT;

NOTIFY pgrst, 'reload schema';
