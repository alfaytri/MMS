-- SO-level drill-down for Product Profitability KPI cards.
-- Returns an array of sale orders with nested line items,
-- showing revenue, COGS, and profit at both SO and line level.
-- Uses ce.qty (not sol.qty) for revenue to avoid overcounting
-- when multiple FIFO layers exist per SO line.

CREATE OR REPLACE FUNCTION public.rpc_profitability_drilldown(
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start and end dates are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date must be >= start date';
  END IF;

  RETURN COALESCE((
    WITH line_data AS (
      SELECT
        ce.sale_order_id,
        ce.brand_variant_id,
        SUM(ce.qty)::numeric                              AS qty,
        SUM(ce.qty * sol.unit_price)                      AS line_revenue,
        SUM(ce.total_cost)                                AS line_cogs,
        SUM(ce.qty * sol.unit_price) - SUM(ce.total_cost) AS line_profit,
        sol.unit_price,
        (array_agg(sol.item_name ORDER BY sol.created_at DESC))[1] AS item_name,
        (array_agg(sol.sku       ORDER BY sol.created_at DESC))[1] AS sku
      FROM cogs_entries ce
      JOIN sale_order_lines sol
        ON sol.sale_order_id  = ce.sale_order_id
       AND sol.brand_variant_id = ce.brand_variant_id
      WHERE ce.date >= p_start_date
        AND ce.date <= p_end_date
        AND ce.sale_order_id IS NOT NULL
      GROUP BY ce.sale_order_id, ce.brand_variant_id, sol.unit_price
    ),
    so_agg AS (
      SELECT
        ld.sale_order_id,
        so.so_number,
        so.created_at::date              AS order_date,
        COALESCE(c.name, 'Walk-in')      AS customer_name,
        COUNT(*)::int                    AS item_count,
        SUM(ld.line_revenue)             AS revenue,
        SUM(ld.line_cogs)                AS cogs,
        SUM(ld.line_profit)              AS profit,
        CASE WHEN SUM(ld.line_revenue) = 0 THEN NULL
             ELSE ROUND((SUM(ld.line_profit) / SUM(ld.line_revenue)) * 100, 2)
        END                              AS margin_pct,
        jsonb_agg(
          jsonb_build_object(
            'brand_variant_id', ld.brand_variant_id,
            'item_name',        ld.item_name,
            'sku',              ld.sku,
            'qty',              ld.qty,
            'unit_price',       ld.unit_price,
            'revenue',          ld.line_revenue,
            'cogs',             ld.line_cogs,
            'profit',           ld.line_profit
          ) ORDER BY ld.line_cogs DESC
        ) AS lines
      FROM line_data ld
      JOIN sale_orders so ON so.id = ld.sale_order_id
      LEFT JOIN customers c ON c.id = so.customer_id
      GROUP BY ld.sale_order_id, so.so_number, so.created_at, c.name
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'sale_order_id', sale_order_id,
        'so_number',     so_number,
        'order_date',    order_date,
        'customer_name', customer_name,
        'item_count',    item_count,
        'revenue',       revenue,
        'cogs',          cogs,
        'profit',        profit,
        'margin_pct',    margin_pct,
        'lines',         lines
      ) ORDER BY cogs DESC
    )
    FROM so_agg
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_profitability_drilldown(date, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
