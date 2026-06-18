-- supabase/migrations/20260426000001_fix_received_qty_for_unlinked_items.sql
--
-- BUG: create_and_approve_receival skips received_qty update when brand_variant_id IS NULL
-- because the UPDATE sits after the CONTINUE WHEN guard.  Items with no variant link
-- (tool-asset items, plain-text items) are received successfully but the PO line's
-- received_qty stays 0 — so the Receive tab shows "Received: 0" forever.
--
-- FIX: move the received_qty increment BEFORE the CONTINUE WHEN so it always fires
-- for non-free items regardless of variant linkage.
--
-- DATA FIX: recalculate received_qty for every po_line_item from the actual approved
-- receival_items to correct historical rows created by the buggy function.

BEGIN;

-- ── 1. Recalculate received_qty from ground truth ─────────────────────────────
-- Sum qty_received across all approved receivals for each po_line_item.
-- Safe to run multiple times (idempotent).

UPDATE po_line_items pli
SET received_qty = COALESCE((
  SELECT SUM(ri.qty_received)
  FROM receival_items ri
  JOIN receivals r ON r.id = ri.receival_id
  WHERE ri.po_line_item_id = pli.id
    AND ri.is_free = FALSE
    AND r.status = 'approved'
), 0);

-- ── 2. Replace create_and_approve_receival with fixed version ─────────────────

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

    -- Always track received_qty on the PO line for non-free items,
    -- regardless of whether a brand_variant_id is linked.
    IF NOT v_is_free AND v_pli_id IS NOT NULL AND v_qty > 0 THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    -- Inventory updates (FIFO, stock_level, movements) require a variant link.
    CONTINUE WHEN v_is_free OR v_bv_id IS NULL OR v_qty <= 0;

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

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
