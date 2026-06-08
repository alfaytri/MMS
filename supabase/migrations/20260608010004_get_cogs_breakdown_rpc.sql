-- LC-COGS Attribution — RPC returning the per-LC breakdown for the tooltip.

BEGIN;

CREATE OR REPLACE FUNCTION get_cogs_breakdown(p_brand_variant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sold_at_sale  NUMERIC;
  v_lc_list       JSONB;
  v_total         NUMERIC;
BEGIN
  -- Sale-time COGS total (rows with no landed_cost_id)
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_sold_at_sale
    FROM cogs_entries
   WHERE brand_variant_id = p_brand_variant_id
     AND landed_cost_id IS NULL;

  -- Per-LC net total. Original + any reversal pair cancels to zero — filter out.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lc_id',       lc.id,
        'lc_number',   lc.lc_number,
        'applied_at',  lc.applied_at,
        'total_cost',  agg.net_total
      )
      ORDER BY lc.applied_at NULLS LAST
    ),
    '[]'::JSONB
  )
  INTO v_lc_list
  FROM (
    SELECT landed_cost_id, SUM(total_cost) AS net_total
      FROM cogs_entries
     WHERE brand_variant_id = p_brand_variant_id
       AND landed_cost_id  IS NOT NULL
     GROUP BY landed_cost_id
    HAVING SUM(total_cost) <> 0
  ) agg
  JOIN landed_costs lc ON lc.id = agg.landed_cost_id;

  v_total := v_sold_at_sale + COALESCE(
    (SELECT SUM((entry->>'total_cost')::NUMERIC) FROM jsonb_array_elements(v_lc_list) AS entry),
    0
  );

  RETURN jsonb_build_object(
    'sold_at_sale',    v_sold_at_sale,
    'lc_adjustments',  v_lc_list,
    'total',           v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_cogs_breakdown(UUID) TO authenticated;

COMMIT;
