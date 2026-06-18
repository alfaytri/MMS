-- supabase/migrations/20260425000010_rpc_approve_warehouse_transfer.sql

BEGIN;

CREATE OR REPLACE FUNCTION approve_warehouse_transfer_inventory(
  p_transfer_id   UUID,
  p_approved_by   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_result    RECORD;
BEGIN
  SELECT from_warehouse_id, to_warehouse_id, date, items, status
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'pending_approval', 'draft') THEN
    RAISE EXCEPTION 'Transfer % already processed with status %', p_transfer_id, v_transfer.status;
  END IF;

  -- Mark as approved
  UPDATE warehouse_transfers
  SET status = 'approved',
      approved_by_name = p_approved_by,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Deduct from source warehouse; p_is_transfer=true skips global stock_level change
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_transfer.from_warehouse_id, v_qty, TRUE);

    -- Create new FIFO layer in destination warehouse at the same weighted cost
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, v_transfer.to_warehouse_id, COALESCE(v_transfer.date, CURRENT_DATE),
      v_qty, v_result.weighted_unit_cost, 0, v_result.weighted_unit_cost, v_qty
    );

    -- Two movement records: out from source, in to destination
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES
    (
      v_transfer.from_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_out', -v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    ),
    (
      v_transfer.to_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_in', v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_warehouse_transfer_inventory(UUID, TEXT) TO authenticated;

COMMIT;
