-- Report 2.4 — Profit & Loss. Returns a jsonb statement.
--
-- Accrual (default): Revenue by stream (sale cogs_entries × sale_order_lines
-- price × exchange_rate, QAR) + COGS by stream (cogs_entries.total_cost),
-- streams = inventory_categories.type (Products / Spare Parts / Consumables /
-- Tools). Cash (operator's "pure money in/out"): Revenue = incoming payments,
-- Cost = outgoing payments in the period. Both bases add realized FX
-- (payments.exchange_gain − exchange_loss) and Scrap & Defective (damaged
-- write-offs). Gross Profit = Revenue − COGS + FX − Scrap.
--
-- SECURITY DEFINER + is_division_visible. Payments carry no division_id, so it
-- is derived from the linked sale_order/purchase_order/invoice/bill.
-- NOTE: inventory_damaged_movements has no division_id, so Scrap is a global
-- period figure (not division-split) — surfaced with a caveat in the UI. No
-- write-off movement_type exists yet, so Scrap reads 0 until that flow ships.

CREATE OR REPLACE FUNCTION public.rpc_report_pnl(
  p_start         date,
  p_end           date,
  p_basis         text   DEFAULT 'accrual',
  p_division_ids  uuid[] DEFAULT NULL,
  p_warehouse_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_fx     numeric;
  v_scrap  numeric;
BEGIN
  -- Realized FX from payments settled in the period (both bases).
  SELECT COALESCE(SUM(COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0)), 0)
    INTO v_fx
  FROM public.payments p
  LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
  LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
  LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
  LEFT JOIN public.bills bl           ON bl.id = p.bill_id
  WHERE p.deleted_at IS NULL
    AND p.date BETWEEN p_start AND p_end
    AND public.is_division_visible(COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id))
    AND (p_division_ids IS NULL OR COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) = ANY(p_division_ids));

  -- Scrap & Defective — write-offs in the period (global; table has no division).
  SELECT COALESCE(SUM(dm.qty * dm.unit_cost), 0)
    INTO v_scrap
  FROM public.inventory_damaged_movements dm
  WHERE dm.movement_type IN ('write_off', 'damaged_write_off', 'scrapped')
    AND dm.created_at::date BETWEEN p_start AND p_end;

  IF p_basis = 'cash' THEN
    WITH pay AS (
      SELECT p.direction, COALESCE(p.amount_qar, 0) AS amt
      FROM public.payments p
      LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
      LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
      LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
      LEFT JOIN public.bills bl           ON bl.id = p.bill_id
      WHERE p.deleted_at IS NULL
        AND p.status::text IN ('completed', 'pending', 'processing')
        AND p.date BETWEEN p_start AND p_end
        AND public.is_division_visible(COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id))
        AND (p_division_ids IS NULL OR COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) = ANY(p_division_ids))
    )
    SELECT jsonb_build_object(
      'basis',    'cash',
      'cash_in',  (SELECT COALESCE(SUM(amt), 0) FROM pay WHERE direction = 'incoming'),
      'cash_out', (SELECT COALESCE(SUM(amt), 0) FROM pay WHERE direction = 'outgoing'),
      'fx_net',   v_fx,
      'scrap',    v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'cash_in')::numeric - (v_result->>'cash_out')::numeric + v_fx - v_scrap
    );
  ELSE
    WITH lines AS (
      SELECT
        initcap(replace(COALESCE(c.type::text, 'other'), '-', ' ')) AS stream,
        (ce.qty * COALESCE(sol.unit_price, 0) * COALESCE(so.exchange_rate, 1)) AS revenue,
        ce.total_cost AS cogs
      FROM public.cogs_entries ce
      JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
      JOIN public.inventory_items it ON it.id = v.item_id
      LEFT JOIN public.inventory_categories c ON c.id = it.category_id
      LEFT JOIN public.sale_orders so ON so.id = ce.sale_order_id
      LEFT JOIN LATERAL (
        SELECT sol2.unit_price FROM public.sale_order_lines sol2
        WHERE sol2.sale_order_id = ce.sale_order_id AND sol2.brand_variant_id = ce.brand_variant_id
        LIMIT 1
      ) sol ON true
      LEFT JOIN public.fifo_cost_layers fl ON fl.id = ce.source_id
      WHERE ce.source_type IN ('sale', 'sale_return')
        AND ce.date BETWEEN p_start AND p_end
        AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
        AND (p_division_ids IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
    ),
    by_stream AS (
      SELECT stream, SUM(revenue) AS revenue, SUM(cogs) AS cogs
      FROM lines GROUP BY stream
    )
    SELECT jsonb_build_object(
      'basis',         'accrual',
      'revenue',       COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(revenue, 2)) ORDER BY stream) FROM by_stream), '[]'::jsonb),
      'cogs',          COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(cogs, 2))    ORDER BY stream) FROM by_stream), '[]'::jsonb),
      'revenue_total', COALESCE((SELECT SUM(revenue) FROM by_stream), 0),
      'cogs_total',    COALESCE((SELECT SUM(cogs) FROM by_stream), 0),
      'fx_net',        v_fx,
      'scrap',         v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'revenue_total')::numeric - (v_result->>'cogs_total')::numeric + v_fx - v_scrap
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_pnl(date, date, text, uuid[], uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_pnl(date, date, text, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
