-- damaged_qty and restocked_at columns were already applied in a partial run.
-- This migration adds the extended movement_type constraint and the restock RPC.

-- ─── 1. damaged_qty column (idempotent) ─────────────────────────────────────
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS damaged_qty INT NOT NULL DEFAULT 0;

-- ─── 2. restocked_at on returns (idempotent) ─────────────────────────────────
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS restocked_at TIMESTAMPTZ;

-- ─── 3. Extend movement_type CHECK constraint ────────────────────────────────
-- Includes all existing types plus sale_return and sale_return_damaged
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
    'sale_return_damaged'
  ));

-- ─── 4. rpc_process_return_restock ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_process_return_restock(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_cond    TEXT;
BEGIN
  SELECT id, items, restock_warehouse_id, status, restocked_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  -- Idempotency: skip if inventory was already processed
  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);
    v_cond  := LOWER(COALESCE(v_item->>'condition', ''));

    -- Skip items with no inventory link or zero quantity
    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_cond = 'good' THEN
      -- Return good stock to sellable inventory
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
        'sale_return',
        v_qty,
        0,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF v_cond = 'damaged' THEN
      -- Track damaged stock separately — does not go back to sellable inventory
      UPDATE inventory_brand_variants
      SET    damaged_qty = damaged_qty + v_qty
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
        'sale_return_damaged',
        v_qty,
        0,
        'return',
        p_return_id,
        'Damaged item from sale return — awaiting assessment'
      );
    END IF;
  END LOOP;

  -- Stamp so a second call is a no-op
  UPDATE returns SET restocked_at = now() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql;
