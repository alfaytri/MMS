-- LC-COGS Attribution — Aggregate RPC for the Stock Value tab.
-- DELIBERATELY NOT added to warehouse_stock_view (would degrade every dropdown query).

BEGIN;

CREATE OR REPLACE FUNCTION get_stock_value_cogs_summary(p_brand_variant_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  brand_variant_id      UUID,
  sold_at_sale_total    NUMERIC,
  lc_adjustments_total  NUMERIC,
  lc_adjustment_count   INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_lc AS (
    SELECT
      brand_variant_id,
      landed_cost_id,
      SUM(total_cost) AS lc_net_total
    FROM cogs_entries
    WHERE landed_cost_id IS NOT NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id, landed_cost_id
    HAVING SUM(total_cost) <> 0
  ),
  lc_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(lc_net_total), 0)        AS lc_adjustments_total,
      COUNT(DISTINCT landed_cost_id)::INT   AS lc_adjustment_count
    FROM per_lc
    GROUP BY brand_variant_id
  ),
  sale_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(total_cost), 0) AS sold_at_sale_total
    FROM cogs_entries
    WHERE landed_cost_id IS NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id
  )
  SELECT
    bv.id                                          AS brand_variant_id,
    COALESCE(sale_agg.sold_at_sale_total, 0)       AS sold_at_sale_total,
    COALESCE(lc_agg.lc_adjustments_total, 0)       AS lc_adjustments_total,
    COALESCE(lc_agg.lc_adjustment_count, 0)        AS lc_adjustment_count
  FROM inventory_brand_variants bv
  LEFT JOIN sale_agg ON sale_agg.brand_variant_id = bv.id
  LEFT JOIN lc_agg   ON lc_agg.brand_variant_id   = bv.id
  WHERE (p_brand_variant_ids IS NULL OR bv.id = ANY(p_brand_variant_ids))
    AND (
      COALESCE(sale_agg.sold_at_sale_total, 0) <> 0
      OR COALESCE(lc_agg.lc_adjustments_total, 0) <> 0
    );
$$;

GRANT EXECUTE ON FUNCTION get_stock_value_cogs_summary(UUID[]) TO authenticated;

COMMIT;
