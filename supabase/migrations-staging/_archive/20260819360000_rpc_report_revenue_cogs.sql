-- Report 1.2 — Revenue, COGS & Gross Profit, one row per FIFO cost layer.
--
-- Rows = cogs_entries for sales in the period (source_type sale / sale_return),
-- never aggregated, so an SO line fulfilled from two cost layers stays two lines
-- with distinct unit_cost. SECURITY DEFINER + is_division_visible scoping.
--
-- Live-schema facts (verified 2026-08-11):
--   * cogs_entries: qty, unit_cost, total_cost (negative on sale_return),
--     source_type, source_id -> fifo_cost_layers.id (warehouse), sale_order_id,
--     consumer_division_id (selling division), division_id, date.
--   * Sales price: sale_order_lines.unit_price is in ORDER currency → multiply by
--     sale_orders.exchange_rate for QAR (do NOT use raw unit_price). One line per
--     (SO, variant) picked via LATERAL LIMIT 1 to avoid fan-out.
--   * Product hierarchy + barcode as in 1.1.

CREATE OR REPLACE FUNCTION public.rpc_report_revenue_cogs(
  p_start          date,
  p_end            date,
  p_division_ids   uuid[] DEFAULT NULL,
  p_warehouse_ids  uuid[] DEFAULT NULL,
  p_customer_id    uuid   DEFAULT NULL,
  p_category_id    uuid   DEFAULT NULL,
  p_brand_variant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cogs_id          uuid,
  date             date,
  source_type      text,
  customer         text,
  so_no            text,
  sale_order_id    uuid,
  product_type     text,
  category         text,
  product_name     text,
  barcode          text,
  qty              integer,
  unit_cost        numeric,
  total_cost       numeric,
  sales_price      numeric,
  total_sales      numeric,
  gross_profit     numeric,
  margin_pct       numeric,
  division_id      uuid,
  division_name    text,
  warehouse_id     uuid,
  warehouse_name   text,
  brand_variant_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    base.cogs_id, base.date, base.source_type, base.customer, base.so_no, base.sale_order_id,
    base.product_type, base.category, base.product_name, base.barcode,
    base.qty, base.unit_cost, base.total_cost, base.sales_price, base.total_sales,
    (base.total_sales - base.total_cost)                                          AS gross_profit,
    CASE WHEN base.total_sales <> 0
         THEN ((base.total_sales - base.total_cost) / base.total_sales) * 100
         ELSE NULL END                                                            AS margin_pct,
    base.division_id, base.division_name, base.warehouse_id, base.warehouse_name, base.brand_variant_id
  FROM (
    SELECT
      ce.id AS cogs_id, ce.date, ce.source_type,
      cust.name AS customer, so.so_number AS so_no, ce.sale_order_id,
      initcap(replace(COALESCE(c.type::text, ''), '-', ' '))            AS product_type,
      COALESCE(cp.name_en, c.name_en)                                   AS category,
      it.name_en AS product_name, v.code AS barcode,
      ce.qty, ce.unit_cost, ce.total_cost,
      (sol.unit_price * COALESCE(so.exchange_rate, 1))                  AS sales_price,
      (ce.qty * sol.unit_price * COALESCE(so.exchange_rate, 1))         AS total_sales,
      COALESCE(ce.consumer_division_id, ce.division_id)                 AS division_id,
      d.name AS division_name,
      fl.warehouse_id, w.name AS warehouse_name,
      ce.brand_variant_id
    FROM public.cogs_entries ce
    JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
    JOIN public.inventory_items it ON it.id = v.item_id
    LEFT JOIN public.inventory_categories c  ON c.id  = it.category_id
    LEFT JOIN public.inventory_categories cp ON cp.id = c.parent_id
    LEFT JOIN public.sale_orders so   ON so.id = ce.sale_order_id
    LEFT JOIN public.customers cust   ON cust.id = so.customer_id
    LEFT JOIN LATERAL (
      SELECT sol2.unit_price
      FROM public.sale_order_lines sol2
      WHERE sol2.sale_order_id = ce.sale_order_id
        AND sol2.brand_variant_id = ce.brand_variant_id
      LIMIT 1
    ) sol ON true
    LEFT JOIN public.fifo_cost_layers fl ON fl.id = ce.source_id
    LEFT JOIN public.warehouses w ON w.id = fl.warehouse_id
    LEFT JOIN public.company_divisions d ON d.id = COALESCE(ce.consumer_division_id, ce.division_id)
    WHERE ce.source_type IN ('sale', 'sale_return')
      AND ce.date BETWEEN p_start AND p_end
      AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
      AND (p_division_ids   IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
      AND (p_warehouse_ids  IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
      AND (p_customer_id    IS NULL OR so.customer_id = p_customer_id)
      AND (p_category_id    IS NULL OR it.category_id = p_category_id)
      AND (p_brand_variant_id IS NULL OR ce.brand_variant_id = p_brand_variant_id)
  ) base
  ORDER BY base.division_name, base.customer, base.so_no, base.product_name, base.unit_cost;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_revenue_cogs(date, date, uuid[], uuid[], uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_revenue_cogs(date, date, uuid[], uuid[], uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
