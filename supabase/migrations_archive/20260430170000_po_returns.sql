-- 1. Extend enums
ALTER TYPE return_source_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'dispatched';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'supplier_confirmed';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Extend movement_type CHECK (drop and recreate — same pattern as prior migrations)
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment',
    'receival_edit',
    'free_receival',
    'sale_return',
    'sale_return_damaged',
    'purchase_return',
    'purchase_return_cancelled'
  ));

-- 3. Idempotency guard column
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- 4. RPC: deduct inventory when PO return is dispatched
CREATE OR REPLACE FUNCTION rpc_process_po_return_dispatch(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
BEGIN
  SELECT id, items, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level - v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: reverse inventory when a dispatched PO return is cancelled
CREATE OR REPLACE FUNCTION rpc_cancel_po_return_dispatch(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
BEGIN
  SELECT id, items, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level + v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return_cancelled',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
