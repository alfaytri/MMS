-- Fix: average cost was including free FIFO layers (total_unit_cost = 0),
-- which deflated avg cost below the true purchase price and masked pricing losses.
-- Now excludes zero-cost layers so avg cost reflects only paid inventory.

BEGIN;

CREATE OR REPLACE FUNCTION recalc_average_cost(p_bv_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT
    CASE
      WHEN SUM(remaining_qty) = 0 THEN 0
      ELSE SUM(remaining_qty * total_unit_cost) / SUM(remaining_qty)
    END
  INTO v_avg
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_bv_id
    AND remaining_qty > 0
    AND total_unit_cost > 0;  -- exclude free/zero-cost layers

  UPDATE inventory_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION recalc_average_cost(UUID) TO authenticated;

-- Re-run for all brand variants that have any FIFO layer remaining
-- so existing data is corrected immediately.
DO $$
DECLARE
  v_bv_id UUID;
BEGIN
  FOR v_bv_id IN
    SELECT DISTINCT brand_variant_id
    FROM fifo_cost_layers
    WHERE remaining_qty > 0
  LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;
END;
$$;

COMMIT;
