-- Section 2B: rewrite rpc_process_return_restock to reverse exact FIFO/COGS.
--
-- OLD behaviour (broken — referenced non-existent v_return.items JSONB):
--   would have restocked all 'good' units into ONE fresh FIFO layer stamped
--   at the variant's current weighted-avg cost.
--
-- NEW behaviour (Option C + damaged tracking):
--   • For each return_lines row with condition = 'good':
--       - Look up the per-layer cogs_entries rows for
--         (sale_order_id = so_po_returns.source_id, brand_variant_id).
--         Thanks to Section 10 these exist one-per-consumed-FIFO-layer.
--       - Walk them in insertion order (date, unit_cost, id).
--       - For each source layer, take min(cogs.qty, qty_remaining):
--           * Insert a new fifo_cost_layers row at cogs.unit_cost,
--             stamped today, source_type='sale_return'.
--           * Insert a REVERSING cogs_entries row (negative qty, negative
--             total, same unit_cost, source_type='sale_return', same
--             sale_order_id/sale_delivery_id/division_id as the source).
--           * Insert one inventory_stock_movements row per source-layer
--             chunk (movement_type='sale_return', qty positive).
--       - Bump stock_level by total good qty; recalc_average_cost().
--   • For each return_lines row with condition != 'good' (damaged etc):
--       - Same per-layer walk to preserve historical unit_cost accuracy.
--       - Insert inventory_stock_movements rows with
--         movement_type='sale_return_damaged', qty per source-layer chunk,
--         unit_cost = original sale unit_cost.
--       - Do NOT create fifo layers; do NOT change stock_level; do NOT
--         reverse COGS. Damaged units are visible in the movement ledger
--         only.
--
-- Guardrails:
--   • FOR UPDATE lock on so_po_returns.
--   • Idempotent via restocked_at IS NOT NULL early return.
--   • Requires status = 'restocked' precondition (set by caller).
--   • Raises if return qty exceeds sum of matched cogs qty for a line
--     (over-return / no delivery COGS available).
--   • Applies to sale-order returns only (source_type = 'sale_order').
--     Purchase-order returns use a different RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return         RECORD;
  v_line           RECORD;
  v_cogs           RECORD;
  v_qty_remaining  INT;
  v_qty_this_chunk NUMERIC;
  v_total_good     INT;
  v_available_qty  NUMERIC;
BEGIN
  ----------------------------------------------------------------
  -- 1. Load and lock the return; idempotency + precondition
  ----------------------------------------------------------------
  SELECT id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN; -- already processed
  END IF;

  IF v_return.status <> 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  END IF;

  IF v_return.source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  END IF;

  IF v_return.restock_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Return % has no restock_warehouse_id set', p_return_id;
  END IF;

  ----------------------------------------------------------------
  -- 2. Process each return line
  ----------------------------------------------------------------
  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
  LOOP
    -- Pre-check: sum of available cogs qty for this line
    SELECT COALESCE(SUM(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;  -- only positive (original) rows, ignore prior reversals

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

    ----------------------------------------------------------------
    -- 2a. Walk the per-layer cogs rows in FIFO consumption order
    ----------------------------------------------------------------
    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      FROM   cogs_entries
      WHERE  sale_order_id = v_return.source_id
        AND  brand_variant_id = v_line.brand_variant_id
        AND  qty > 0
      ORDER  BY date ASC, unit_cost ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_this_chunk := LEAST(v_cogs.qty, v_qty_remaining);

      IF v_line.condition = 'good' THEN
        -- New FIFO layer at the ORIGINAL consumed unit_cost
        INSERT INTO fifo_cost_layers (
          brand_variant_id, warehouse_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          source_type, source_id, division_id
        ) VALUES (
          v_line.brand_variant_id,
          v_return.restock_warehouse_id,
          CURRENT_DATE,
          v_qty_this_chunk,
          v_cogs.unit_cost,
          0,
          v_cogs.unit_cost,
          v_qty_this_chunk,
          'sale_return',
          p_return_id,
          v_return.division_id
        );

        -- Reversing (negative) COGS entry
        INSERT INTO cogs_entries (
          brand_variant_id, sale_delivery_id, sale_order_id,
          qty, unit_cost, total_cost, date,
          source_type, division_id, notes
        ) VALUES (
          v_line.brand_variant_id,
          v_cogs.sale_delivery_id,
          v_cogs.sale_order_id,
          -v_qty_this_chunk,
          v_cogs.unit_cost,
          -(v_qty_this_chunk * v_cogs.unit_cost),
          CURRENT_DATE,
          'sale_return',
          v_return.division_id,
          'Reversed by return ' || v_return.return_number
        );

        -- Stock movement (per source-layer chunk)
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost,
          reference_type, reference_id, notes
        ) VALUES (
          v_return.restock_warehouse_id,
          v_line.brand_variant_id,
          v_line.item_name,
          NULLIF(v_line.sku, ''),
          'sale_return',
          v_qty_this_chunk,
          v_cogs.unit_cost,
          'return',
          p_return_id,
          'Sale return restocked (good) — ' || v_return.return_number
        );

      ELSE
        -- Damaged / non-good: track only, no restock, no COGS reversal
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost,
          reference_type, reference_id, notes
        ) VALUES (
          v_return.restock_warehouse_id,
          v_line.brand_variant_id,
          v_line.item_name,
          NULLIF(v_line.sku, ''),
          'sale_return_damaged',
          v_qty_this_chunk,
          v_cogs.unit_cost,
          'return',
          p_return_id,
          CASE
            WHEN v_line.condition_notes IS NOT NULL AND v_line.condition_notes <> ''
            THEN 'Sale return damaged (' || v_line.condition || ') — ' || v_return.return_number || ' — ' || v_line.condition_notes
            ELSE 'Sale return ' || v_line.condition || ' — ' || v_return.return_number
          END
        );
      END IF;

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      -- Should be unreachable given the pre-check above, but defensive.
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;

    ----------------------------------------------------------------
    -- 2b. If line was 'good', bump stock_level and recalc avg cost
    ----------------------------------------------------------------
    IF v_line.condition = 'good' THEN
      UPDATE inventory_item_brand_variants
      SET    stock_level = stock_level + v_line.qty,
             updated_at  = now()
      WHERE  id = v_line.brand_variant_id;

      PERFORM recalc_average_cost(v_line.brand_variant_id);
    END IF;
  END LOOP;

  ----------------------------------------------------------------
  -- 3. Mark restocked
  ----------------------------------------------------------------
  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION rpc_process_return_restock(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
