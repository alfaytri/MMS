-- Foreign-currency PO receivals — convert FIFO layer unit_cost to QAR
-- Prior behavior: fifo_cost_layers.unit_cost was seeded directly from the PO
-- line's unit_price, which is in PO currency. For USD/EUR POs this produced
-- mixed-currency numbers and understated QAR inventory cost + COGS.
--
-- New behavior: when PO currency ≠ QAR, unit_cost is multiplied by the PO's
-- initial_exchange_rate before insert into fifo_cost_layers AND into
-- inventory_stock_movements. source_currency + source_exchange_rate audit
-- columns are stamped on the FIFO layer. receival_items.unit_cost stays in
-- the PO currency (as-entered audit).
--
-- Going-forward only per plan §6.2 — historical FIFO layers are NOT backfilled.
-- Source body: 20260724270000_fix_receival_id_uuid_casts.sql (latest live redefinition).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_and_approve_receival(
  p_po_id uuid,
  p_warehouse_id uuid,
  p_date date,
  p_received_by_name text,
  p_receival_number text,
  p_notes text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receival_id UUID;
  v_receival_number TEXT;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_cost_qar    NUMERIC;
  v_pli_id      UUID;
  v_po_currency TEXT;
  v_po_rate     NUMERIC;
BEGIN
  -- Read PO's currency + booked rate once per receival for FIFO conversion
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1)
    INTO v_po_currency, v_po_rate
    FROM public.purchase_orders
   WHERE id = p_po_id;

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    -- Convert to QAR for inventory-valuation rows; receival_items keeps original
    v_cost_qar := v_cost * v_po_rate;

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
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate
    );

    UPDATE inventory_item_brand_variants
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
      'purchase_receival', v_qty, v_cost_qar,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
