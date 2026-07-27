-- ============================================================
-- Section 1.10 — fifo_cost_layers.source_id
--
-- Current gap: only receival-sourced layers have a link back
-- (receival_id FK). Layers with source_type='sale_return',
-- 'adjustment', 'delivery_cancel', 'transfer', etc. only carry
-- the source_type tag — no way to jump to the specific row that
-- created the layer.
--
-- Fix: add a polymorphic source_id column (no FK — target table
-- depends on source_type, mirroring inventory_stock_movements.
-- reference_id). Backfill existing rows best-effort. Update the
-- two non-receival writers (rpc_process_return_restock and
-- apply_adjustment) to set source_id on new layers.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Add the column
-- ------------------------------------------------------------
ALTER TABLE public.fifo_cost_layers
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_fifo_cost_layers_source
  ON public.fifo_cost_layers(source_type, source_id)
  WHERE source_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Backfill — receival case is trivial (copy from receival_id)
-- ------------------------------------------------------------
UPDATE public.fifo_cost_layers
   SET source_id = receival_id
 WHERE source_id IS NULL
   AND source_type = 'receival'
   AND receival_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Backfill — sale_return / po_return / adjustment / delivery_cancel
--    via the paired inventory_stock_movements row that fired at
--    layer-creation time. Match on brand_variant_id + warehouse_id
--    + qty + same-second created_at, keeping only unambiguous hits
--    (one movement, one reference_id).
-- ------------------------------------------------------------
UPDATE public.fifo_cost_layers fcl
   SET source_id = m.reference_id
  FROM (
    SELECT DISTINCT ON (brand_variant_id, warehouse_id, qty, date_trunc('second', created_at))
           brand_variant_id, warehouse_id, qty,
           date_trunc('second', created_at) AS bucket,
           reference_id
    FROM public.inventory_stock_movements
    WHERE reference_id IS NOT NULL
      AND movement_type IN ('sale_return', 'purchase_return', 'adjustment', 'transfer_in', 'inventory_check')
    ORDER BY brand_variant_id, warehouse_id, qty, date_trunc('second', created_at), created_at
  ) m
 WHERE fcl.source_id IS NULL
   AND fcl.source_type IN ('sale_return', 'po_return', 'adjustment', 'delivery_cancel', 'stock_check', 'transfer')
   AND m.brand_variant_id = fcl.brand_variant_id
   AND m.warehouse_id     = fcl.warehouse_id
   AND m.qty              = fcl.qty
   AND m.bucket           = date_trunc('second', fcl.created_at);

-- ------------------------------------------------------------
-- 4. Rewrite rpc_process_return_restock to set source_id on the
--    layer it creates. Everything else preserved verbatim from
--    20260704190000.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return   RECORD;
  v_item     JSONB;
  v_bv_id    UUID;
  v_qty      INT;
  v_cond     TEXT;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, items, restock_warehouse_id, status, restocked_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

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

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_cond = 'good' THEN
      SELECT COALESCE(average_cost, 0) INTO v_avg_cost
      FROM   inventory_brand_variants
      WHERE  id = v_bv_id;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id
      ) VALUES (
        v_bv_id, v_return.restock_warehouse_id, CURRENT_DATE,
        v_qty, v_avg_cost, 0, v_avg_cost, v_qty,
        'sale_return', p_return_id
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_qty,
             updated_at  = now()
      WHERE  id = v_bv_id;

      PERFORM recalc_average_cost(v_bv_id);

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
        v_avg_cost,
        'return',
        p_return_id,
        'Sale return restocked (good)'
      );
    END IF;
  END LOOP;

  UPDATE so_po_returns SET restocked_at = now() WHERE id = p_return_id;
END;
$$;

-- ------------------------------------------------------------
-- 5. Rewrite apply_adjustment to set source_id = adjustment_id
--    on the new layer (increase branch only — decrease uses
--    deduct_fifo_layers which doesn't create a layer).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_adjustment(p_adjustment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj    RECORD;
  v_qty    INT;
  v_bv     RECORD;
BEGIN
  SELECT * INTO v_adj
  FROM inventory_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_adj.status <> 'pending' THEN
    RAISE EXCEPTION 'Adjustment already processed';
  END IF;

  v_qty := ABS(v_adj.qty);

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      'adjustment', p_adjustment_id
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_adj.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_in', v_qty, COALESCE(v_bv.average_cost, 0),
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;

  ELSE
    PERFORM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, TRUE);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_out', -v_qty, ibv.average_cost,
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;
  END IF;

  PERFORM recalc_average_cost(v_adj.brand_variant_id);

  UPDATE inventory_adjustments
  SET status = 'applied', updated_at = now()
  WHERE id = p_adjustment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_adjustment(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
