-- P&L COGS drill-down — per-entry breakdown behind the "Total COGS" line,
-- mirroring the "details" affordance already on Exchange Gain / Loss.
--
-- Scope matches rpc_report_pnl's accrual COGS EXACTLY so the rows reconcile with
-- the P&L Total COGS: source_type IN (sale, sale_return, landed_cost,
-- landed_cost_reversal), same date filter, same division scope
-- (COALESCE(consumer_division_id, division_id)) and warehouse scope
-- (fl.warehouse_id via ce.source_id). One row per cogs_entry.
--
-- Read-only report function. SECURITY DEFINER + is_division_visible; execute
-- revoked from PUBLIC and granted to authenticated (same posture as
-- rpc_report_revenue_cogs / rpc_report_pnl_fx_detail).

CREATE OR REPLACE FUNCTION public.rpc_report_pnl_cogs_detail(
  p_start         date,
  p_end           date,
  p_division_ids  uuid[] DEFAULT NULL,
  p_warehouse_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  cogs_id       uuid,
  date          date,
  source_type   text,
  stream        text,
  item_name     text,
  code          text,
  reference     text,
  counterparty  text,
  qty           integer,
  unit_cost     numeric,
  total_cost    numeric,
  division_id   uuid,
  division_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ce.id                                                        AS cogs_id,
    ce.date                                                      AS date,
    ce.source_type                                               AS source_type,
    initcap(replace(COALESCE(c.type::text, 'other'), '-', ' '))  AS stream,
    it.name_en                                                   AS item_name,
    v.code                                                       AS code,
    COALESCE(so.so_number, lc.lc_number)                         AS reference,
    cust.name                                                    AS counterparty,
    ce.qty                                                       AS qty,
    ce.unit_cost                                                 AS unit_cost,
    ce.total_cost                                                AS total_cost,
    COALESCE(ce.consumer_division_id, ce.division_id)            AS division_id,
    d.name                                                       AS division_name
  FROM public.cogs_entries ce
  JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
  JOIN public.inventory_items it ON it.id = v.item_id
  LEFT JOIN public.inventory_categories c   ON c.id  = it.category_id
  LEFT JOIN public.sale_orders so           ON so.id = ce.sale_order_id
  LEFT JOIN public.customers cust           ON cust.id = so.customer_id
  LEFT JOIN public.landed_costs lc          ON lc.id = ce.landed_cost_id
  LEFT JOIN public.fifo_cost_layers fl      ON fl.id = ce.source_id
  LEFT JOIN public.company_divisions d      ON d.id  = COALESCE(ce.consumer_division_id, ce.division_id)
  WHERE ce.source_type IN ('sale', 'sale_return', 'landed_cost', 'landed_cost_reversal')
    AND ce.date BETWEEN p_start AND p_end
    AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
    AND (p_division_ids  IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
    AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
  ORDER BY ce.date, it.name_en, ce.source_type;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_pnl_cogs_detail(date, date, uuid[], uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_pnl_cogs_detail(date, date, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
