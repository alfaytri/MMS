-- Fix: free receival items were skipped from inventory entirely.
-- Free items (is_free=true) must still update stock_level, create a FIFO layer
-- (at cost=0), and record a stock movement. Only the PO line item received_qty
-- update is skipped for free items, since they may not be on the PO.
BEGIN;

CREATE OR REPLACE FUNCTION create_and_approve_receival(
  p_po_id            UUID,
  p_warehouse_id     UUID,
  p_date             DATE,
  p_received_by_name TEXT,
  p_receival_number  TEXT,
  p_notes            TEXT,
  p_items            JSONB   -- [{po_line_item_id, item_name, sku, qty_received, unit_cost, is_free, brand_variant_id}]
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
  v_is_free     BOOLEAN;
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

    v_bv_id   := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty     := (v_item->>'qty_received')::INT;
    v_cost    := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id  := NULLIF(v_item->>'po_line_item_id', '')::UUID;
    v_is_free := COALESCE((v_item->>'is_free')::BOOLEAN, false);

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost, v_is_free
    );

    -- Skip inventory if no variant linked or zero qty
    CONTINUE WHEN v_bv_id IS NULL OR v_qty <= 0;

    -- Free items always land at cost 0
    IF v_is_free THEN v_cost := 0; END IF;

    -- FIFO layer
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, p_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    -- Increment global stock_level
    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    -- Update PO line item received_qty only for non-free items
    IF NOT v_is_free AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    -- Stock movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      CASE WHEN v_is_free THEN 'free_receival' ELSE 'purchase_receival' END,
      v_qty, v_cost,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
