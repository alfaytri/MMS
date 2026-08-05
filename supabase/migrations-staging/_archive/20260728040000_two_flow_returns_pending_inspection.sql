-- Two-flow sale returns: Direct + Inspection.
--
-- Direct return: creator classifies each variant as good/damaged split at
-- creation time. Multiple return_lines rows per variant (one per
-- condition). Restock proceeds as normal via rpc_process_return_restock.
--
-- Inspection return: creator marks all lines as condition='inspection'.
-- Return sits in status='pending_inspection' until a physical check is
-- done, then rpc_complete_return_inspection replaces each inspection
-- line with the actual good/damaged split (multiple return_lines rows
-- per variant if both), assigns the restock warehouse, and moves status
-- back to 'received'. Normal restock flow then runs.
--
-- This migration:
--   1. Adds 'pending_inspection' to the return_status enum.
--   2. Guards rpc_process_return_restock — refuses if any line still
--      has condition='inspection' (safety net; app-level status guard
--      already prevents restocking a pending_inspection return, but the
--      RPC guard means direct SQL / accidental status flip can't slip
--      inspection lines through).
--   3. Adds rpc_complete_return_inspection.

BEGIN;

------------------------------------------------------------------
-- 1. Extend return_status enum
------------------------------------------------------------------
ALTER TYPE public.return_status ADD VALUE IF NOT EXISTS 'pending_inspection' BEFORE 'received';

COMMIT;

-- ADD VALUE cannot share a transaction with functions that use the new
-- label (Postgres locks the enum before commit). Run the rest in a
-- fresh transaction now that the enum has the new label committed.

BEGIN;

------------------------------------------------------------------
-- 2. Guard rpc_process_return_restock against unresolved inspection
------------------------------------------------------------------
-- Full CREATE OR REPLACE preserving all Section 2B behaviour, plus a
-- new pre-check: if any return_lines row has condition='inspection',
-- raise instead of processing. This keeps the ledger honest — an
-- inspection return can only reach the restock code path AFTER
-- rpc_complete_return_inspection has replaced its inspection lines
-- with good/damaged lines.

CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_line            RECORD;
  v_cogs            RECORD;
  v_qty_remaining   INT;
  v_qty_this_chunk  NUMERIC;
  v_available_qty   NUMERIC;
  v_pending_insp    INT;
BEGIN
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
    RETURN;
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

  -- NEW: refuse if any line still needs inspection
  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
  LOOP
    SELECT COALESCE(SUM(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

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
        -- damaged (or any non-good/non-inspection): track only
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
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;

    IF v_line.condition = 'good' THEN
      UPDATE inventory_item_brand_variants
      SET    stock_level = stock_level + v_line.qty,
             updated_at  = now()
      WHERE  id = v_line.brand_variant_id;

      PERFORM recalc_average_cost(v_line.brand_variant_id);
    END IF;
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION rpc_process_return_restock(uuid) TO authenticated;

------------------------------------------------------------------
-- 3. rpc_complete_return_inspection
------------------------------------------------------------------
-- Replaces each inspection line with good + damaged rows per the
-- caller-supplied split, assigns restock_warehouse_id, and moves status
-- pending_inspection → received. From there the normal
-- pending → received → restocked transitions apply.
--
-- p_splits shape:
--   [
--     { "return_line_id": "<uuid>", "good_qty": N, "damaged_qty": M,
--       "condition_notes": "..." },
--     ...
--   ]
-- Requires: N + M == original inspection line qty. condition_notes is
-- optional and copied onto the damaged replacement row only (informative).

CREATE OR REPLACE FUNCTION public.rpc_complete_return_inspection(
  p_return_id             uuid,
  p_splits                jsonb,
  p_restock_warehouse_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return         RECORD;
  v_split          RECORD;
  v_line           RECORD;
  v_seen_lines     UUID[] := ARRAY[]::UUID[];
  v_pending_insp   INT;
BEGIN
  SELECT id, status, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.status <> 'pending_inspection' THEN
    RAISE EXCEPTION 'Return % must be status=pending_inspection to complete inspection (got %)',
      v_return.return_number, v_return.status;
  END IF;

  IF p_restock_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Restock warehouse is required to complete inspection';
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
  END IF;

  -- Iterate splits: validate + replace each inspection line
  FOR v_split IN
    SELECT
      (elem->>'return_line_id')::uuid   AS line_id,
      COALESCE((elem->>'good_qty')::int, 0)     AS good_qty,
      COALESCE((elem->>'damaged_qty')::int, 0)  AS damaged_qty,
      NULLIF(elem->>'condition_notes', '')      AS condition_notes
    FROM jsonb_array_elements(p_splits) AS elem
  LOOP
    SELECT * INTO v_line
    FROM   return_lines
    WHERE  id = v_split.line_id
      AND  return_id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return line % not found on return %', v_split.line_id, v_return.return_number;
    END IF;

    IF v_line.condition <> 'inspection' THEN
      RAISE EXCEPTION 'Return line % is not an inspection line (condition=%)',
        v_line.id, v_line.condition;
    END IF;

    IF v_split.good_qty < 0 OR v_split.damaged_qty < 0 THEN
      RAISE EXCEPTION 'Return line %: good_qty and damaged_qty must be non-negative', v_line.id;
    END IF;

    IF (v_split.good_qty + v_split.damaged_qty) <> v_line.qty THEN
      RAISE EXCEPTION 'Return line %: good_qty (%) + damaged_qty (%) must equal original qty (%)',
        v_line.id, v_split.good_qty, v_split.damaged_qty, v_line.qty;
    END IF;

    -- Track which lines we processed (for the "all lines split" check below)
    v_seen_lines := array_append(v_seen_lines, v_line.id);

    -- Insert replacement rows first (at most 2), then delete the original
    IF v_split.good_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.good_qty, 'good', NULL
      );
    END IF;

    IF v_split.damaged_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.damaged_qty, 'damaged',
        COALESCE(v_split.condition_notes, v_line.condition_notes)
      );
    END IF;

    DELETE FROM return_lines WHERE id = v_line.id;
  END LOOP;

  -- Every inspection line must have been in the splits
  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % still has % inspection line(s) not covered by the splits',
      v_return.return_number, v_pending_insp;
  END IF;

  -- Assign the restock warehouse and advance status to 'received'
  UPDATE so_po_returns
  SET    restock_warehouse_id = p_restock_warehouse_id,
         status               = 'received',
         updated_at           = now()
  WHERE  id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_complete_return_inspection(uuid, jsonb, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
