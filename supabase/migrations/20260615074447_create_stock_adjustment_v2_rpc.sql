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
  v_id           UUID;
  v_needs_brand  BOOLEAN := p_adjustment_type IN ('damage','write_off');
  v_step_order   INTEGER := 0;
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

  v_step_order := 1;
  INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
  VALUES (v_id, v_step_order, 'accounting_manager', 'Accounting Manager');

  v_step_order := v_step_order + 1;
  INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
  VALUES (v_id, v_step_order, 'inventory_manager', 'Inventory Manager');

  v_step_order := v_step_order + 1;
  INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
  VALUES (v_id, v_step_order, 'responsible_person', 'Responsible Person');

  IF v_needs_brand THEN
    v_step_order := v_step_order + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_step_order, 'brand_manager', 'Brand Manager');
  END IF;

  v_step_order := v_step_order + 1;
  INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
  VALUES (v_id, v_step_order, 'owner', 'Owner');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_stock_adjustment_v2 TO authenticated;

COMMIT;
