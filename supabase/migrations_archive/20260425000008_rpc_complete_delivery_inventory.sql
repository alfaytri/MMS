-- supabase/migrations/20260425000008_rpc_complete_delivery_inventory.sql

BEGIN;

CREATE OR REPLACE FUNCTION complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
BEGIN
  -- Fetch delivery header with row lock to prevent concurrent completions
  SELECT warehouse_id, date, items, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  -- Mark as delivered
  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  -- Process each item in the JSONB array
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty_delivered')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Deduct FIFO — raises EXCEPTION if insufficient stock (rolls back whole tx)
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_wh_id, v_qty, false);

    -- COGS entry
    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date
    ) VALUES (
      v_bv_id, p_delivery_id, p_so_id,
      v_qty, v_result.weighted_unit_cost, v_result.total_cost, v_date
    );

    -- Stock movement (negative qty = outbound)
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      'sale_delivery', -v_qty, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;

COMMIT;
