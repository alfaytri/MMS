-- Root cause: fifo_cost_layers.receival_id was migrated from TEXT to UUID
-- (likely during 20260715100000_normalize_schema.sql), but several RPCs
-- still write `v_receival_id::TEXT` into it — which now throws
--   "column receival_id is of type uuid but expression is of type text"
-- on every receival.
--
-- Rewriting the affected RPCs to remove the ::TEXT casts. Also
-- re-enabling the 8 triggers we temporarily disabled while diagnosing.

BEGIN;

-- ─── 1. create_and_approve_receival — drop the ::TEXT cast ──────────────

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
  v_pli_id      UUID;
BEGIN
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
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
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

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$$;

-- ─── 2. Re-enable the 8 triggers we disabled during diagnosis ───────────

ALTER TABLE public.fifo_cost_layers          ENABLE TRIGGER trg_create_tool_units_on_receival;
ALTER TABLE public.fifo_cost_layers          ENABLE TRIGGER trg_remove_tool_placeholders_on_layer_delete;
ALTER TABLE public.receivals                 ENABLE TRIGGER trg_receivals_set_division;
ALTER TABLE public.receival_items            ENABLE TRIGGER trg_receival_items_set_division;
ALTER TABLE public.fifo_cost_layers          ENABLE TRIGGER trg_fifo_cost_layers_set_division;
ALTER TABLE public.inventory_stock_movements ENABLE TRIGGER trg_inventory_stock_movements_set_division;
ALTER TABLE public.cogs_entries              ENABLE TRIGGER trg_cogs_entries_set_division;
ALTER TABLE public.warehouse_transfers       ENABLE TRIGGER trg_warehouse_transfers_set_division;

NOTIFY pgrst, 'reload schema';

COMMIT;
