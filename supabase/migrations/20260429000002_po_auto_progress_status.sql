-- supabase/migrations/20260429000002_po_auto_progress_status.sql

-- 1. Extend the enum (must be committed before use in same session)
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'received';

-- Commit the enum addition so the new value is visible to subsequent statements
-- (PostgreSQL forbids using a new enum value in the same transaction it was added)
COMMIT;

BEGIN;

-- 2. refresh_po_status
CREATE OR REPLACE FUNCTION refresh_po_status(p_po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status  po_status;
  v_total_qar       NUMERIC;
  v_total_paid_qar  NUMERIC;
  v_line_count      INT;
  v_fully_received  INT;
  v_any_received    INT;
  v_new_status      po_status;
BEGIN
  SELECT status, COALESCE(total_qar, 0)
  INTO   v_current_status, v_total_qar
  FROM   purchase_orders
  WHERE  id = p_po_id;

  IF v_current_status IN ('draft', 'pending_approval', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)                                                 AS total_lines,
    COUNT(*) FILTER (WHERE received_qty > 0)                 AS any_received,
    COUNT(*) FILTER (WHERE received_qty >= qty AND qty > 0)  AS fully_received
  INTO v_line_count, v_any_received, v_fully_received
  FROM po_line_items
  WHERE po_id = p_po_id;

  SELECT COALESCE(SUM(amount_qar), 0)
  INTO   v_total_paid_qar
  FROM   payments
  WHERE  source_type = 'purchase_order'
    AND  source_id   = p_po_id
    AND  status NOT IN ('failed', 'refunded');

  v_new_status := v_current_status;

  IF v_current_status = 'approved' AND v_any_received > 0 THEN
    IF v_line_count > 0 AND v_fully_received = v_line_count THEN
      v_new_status := 'received';
    ELSE
      v_new_status := 'partially_received';
    END IF;
  END IF;

  IF v_new_status = 'partially_received'
     AND v_line_count > 0
     AND v_fully_received = v_line_count
  THEN
    v_new_status := 'received';
  END IF;

  IF v_new_status = 'received'
     AND v_total_qar > 0
     AND v_total_paid_qar >= v_total_qar
  THEN
    v_new_status := 'completed';
  END IF;

  IF v_new_status <> v_current_status THEN
    UPDATE purchase_orders
    SET    status     = v_new_status,
           updated_at = now()
    WHERE  id = p_po_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_po_status(UUID) TO authenticated;

-- 3. Patch create_and_approve_receival to call refresh_po_status
CREATE OR REPLACE FUNCTION create_and_approve_receival(
  p_po_id            UUID,
  p_warehouse_id     UUID,
  p_date             DATE,
  p_received_by_name TEXT,
  p_receival_number  TEXT,
  p_notes            TEXT,
  p_items            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receival_id UUID;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_pli_id      UUID;
BEGIN
  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    p_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false)
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, p_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  -- Auto-progress PO status based on received quantities
  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- 4. Backfill existing POs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM   purchase_orders
    WHERE  status NOT IN ('draft', 'pending_approval', 'cancelled')
    ORDER BY created_at
  LOOP
    PERFORM refresh_po_status(r.id);
  END LOOP;
END;
$$;

COMMIT;
