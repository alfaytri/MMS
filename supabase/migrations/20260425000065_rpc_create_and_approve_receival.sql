-- supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql
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
BEGIN
  -- Insert receival as approved immediately (no pending_approval step)
  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    p_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    -- Insert receival_item
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

    -- Skip inventory updates for free items or items without variant link
    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    -- FIFO layer (receival_id stored as TEXT per schema)
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

    -- Update PO line item received_qty
    IF v_pli_id IS NOT NULL THEN
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
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    -- Collect distinct brand_variant_ids for average cost recalc
    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for every affected variant
  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
