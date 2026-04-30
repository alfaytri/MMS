-- supabase/migrations/20260425000006500_fix_approve_receival_status_column.sql
-- Adds `status` to the SELECT list so the status guard can fire

BEGIN;

CREATE OR REPLACE FUNCTION approve_receival_inventory(
  p_receival_id UUID,
  p_action      TEXT   -- 'approved' | 'rejected'
)
RETURNS UUID   -- po_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receival   RECORD;
  v_item       RECORD;
  v_bv_ids     UUID[] := '{}';
  v_bv_id      UUID;
BEGIN
  -- Fetch receival header with row lock to prevent concurrent double-approval
  SELECT id, po_id, receival_number, warehouse_id, date, status
  INTO v_receival
  FROM receivals
  WHERE id = p_receival_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', p_receival_id;
  END IF;

  -- Guard against re-approving an already-processed receival
  IF v_receival.status NOT IN ('pending', 'pending_approval', 'draft') THEN
    RAISE EXCEPTION 'Receival % already processed with status %', p_receival_id, v_receival.status;
  END IF;

  -- Update status
  UPDATE receivals SET status = p_action WHERE id = p_receival_id;

  IF p_action = 'rejected' THEN
    -- Roll back received_qty on all non-free po_line_items in one statement
    UPDATE po_line_items pli
    SET received_qty = GREATEST(0, pli.received_qty - ri.qty_received)
    FROM receival_items ri
    WHERE ri.receival_id = p_receival_id
      AND ri.po_line_item_id = pli.id
      AND ri.is_free = FALSE;

    RETURN v_receival.po_id;
  END IF;

  -- APPROVED: create FIFO layers + stock movements + increment stock_level
  FOR v_item IN
    SELECT item_name, sku, qty_received, unit_cost, brand_variant_id
    FROM receival_items
    WHERE receival_id = p_receival_id
      AND is_free = FALSE
      AND brand_variant_id IS NOT NULL
      AND qty_received > 0
  LOOP
    -- FIFO layer
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_item.brand_variant_id, v_receival.warehouse_id, p_receival_id, v_receival.receival_number,
      v_receival.date, v_item.qty_received, v_item.unit_cost, 0, v_item.unit_cost, v_item.qty_received
    );

    -- Increment global stock_level
    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_item.qty_received,
        updated_at  = now()
    WHERE id = v_item.brand_variant_id;

    -- Stock movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_receival.warehouse_id, v_item.brand_variant_id, v_item.item_name, v_item.sku,
      'purchase_receival', v_item.qty_received, v_item.unit_cost, 'receival', p_receival_id
    );

    -- Collect unique brand_variant_ids for average cost recalculation
    IF NOT (v_item.brand_variant_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_item.brand_variant_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for each affected variant
  FOREACH v_bv_id IN ARRAY v_bv_ids
  LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  RETURN v_receival.po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_receival_inventory(UUID, TEXT) TO authenticated;

COMMIT;
