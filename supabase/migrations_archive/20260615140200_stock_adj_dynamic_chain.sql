BEGIN;

CREATE OR REPLACE FUNCTION create_stock_adjustment_v2(
  p_warehouse_id      UUID,
  p_brand_variant_id  UUID,
  p_adjustment_type   TEXT,
  p_qty               NUMERIC,
  p_reason            TEXT,
  p_notes             TEXT,
  p_photo_urls        TEXT[],
  p_requested_by      UUID,
  p_requested_by_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    FROM   workflow_approval_steps
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

COMMIT;
