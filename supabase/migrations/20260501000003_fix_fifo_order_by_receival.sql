-- Fix FIFO depletion order: use receival_number as tiebreaker after date.
-- When multiple receivals share the same date, created_at (DB insert time)
-- does not reliably reflect receival sequence.  receival_number (zero-padded,
-- e.g. RCV-00010) sorts correctly and represents the actual arrival order.

BEGIN;

CREATE OR REPLACE FUNCTION deduct_fifo_layers(
  p_bv_id       UUID,
  p_wh_id       UUID,
  p_qty         INT,
  p_is_transfer BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(total_cost NUMERIC, weighted_unit_cost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r            RECORD;
  remaining    INT := p_qty;
  v_total_cost NUMERIC := 0;
  v_take       INT;
BEGIN
  -- Walk oldest layers first, locking each row before touching it.
  -- receival_number added between date and created_at so same-date receivals
  -- drain in arrival sequence (RCV-00010 before RCV-00011, etc.)
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
    ORDER BY date ASC, receival_number ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    v_total_cost := v_total_cost + (v_take * r.total_unit_cost);
    remaining    := remaining - v_take;
  END LOOP;

  -- Guard: if we couldn't satisfy the full quantity, roll everything back
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  -- Skip global stock_level update for warehouse-to-warehouse transfers
  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  -- Recalculate weighted average after deduction
  PERFORM recalc_average_cost(p_bv_id);

  RETURN QUERY SELECT
    v_total_cost,
    CASE WHEN p_qty = 0 THEN 0::NUMERIC ELSE v_total_cost / p_qty END;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_fifo_layers(UUID, UUID, INT, BOOLEAN) TO authenticated;

COMMIT;
