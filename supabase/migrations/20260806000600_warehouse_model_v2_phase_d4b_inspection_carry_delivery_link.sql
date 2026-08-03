-- Warehouse Model v2 — Phase D.4.b hotfix 3
-- rpc_complete_return_inspection: when splitting an inspection line into good
-- and damaged replacement lines, carry over sale_delivery_line_id so the split
-- rows keep their provenance. Without this, the restock RPC hard-fails on the
-- new lines because their delivery link is NULL. Also relax the
-- p_restock_warehouse_id requirement — it's now informational (restock derives
-- warehouse + sub-container per-line from the delivery source).

CREATE OR REPLACE FUNCTION public.rpc_complete_return_inspection(
  p_return_id uuid,
  p_splits jsonb,
  p_restock_warehouse_id uuid
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

  -- p_restock_warehouse_id is now informational only. Restock scope is derived
  -- per-line from the delivery source (D.4.b). Leaving the arg for backwards
  -- compatibility; NULL is accepted.

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
  END IF;

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

    v_seen_lines := array_append(v_seen_lines, v_line.id);

    -- Carry sale_delivery_line_id + receival_item_id across the split so
    -- provenance follows the derived good/damaged rows into downstream flows
    -- (rpc_process_return_restock, rpc_create_partial_replacement).
    IF v_split.good_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.good_qty, 'good', NULL,
        v_line.sale_delivery_line_id, v_line.receival_item_id
      );
    END IF;

    IF v_split.damaged_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.damaged_qty, 'damaged',
        COALESCE(v_split.condition_notes, v_line.condition_notes),
        v_line.sale_delivery_line_id, v_line.receival_item_id
      );
    END IF;

    DELETE FROM return_lines WHERE id = v_line.id;
  END LOOP;

  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % still has % inspection line(s) not covered by the splits',
      v_return.return_number, v_pending_insp;
  END IF;

  UPDATE so_po_returns
  SET    restock_warehouse_id = p_restock_warehouse_id,
         status               = 'received',
         updated_at           = now()
  WHERE  id = p_return_id;
END;
$function$;
