-- supabase/migrations/20260425000002_rpc_recalc_average_cost.sql

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
    AND remaining_qty > 0;

  UPDATE inventory_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION recalc_average_cost(UUID) TO authenticated;

COMMIT;
