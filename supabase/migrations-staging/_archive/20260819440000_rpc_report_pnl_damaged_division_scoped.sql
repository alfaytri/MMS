-- Report 2.4 — Profit & Loss: damaged write-offs are now division-scoped.
--
-- Supersedes 20260819410000. Damaged stock now carries a division_id (stamped
-- from the source sub-container / return by the write-path migrations), so the
-- Scrap damaged branch is scoped by dm.division_id exactly like the good branch
-- — dropping the earlier "company-wide, owner/accountant, all-divisions only"
-- special case. Everything else is byte-identical to 410000.
--
-- Legacy damaged_write_off movements with a NULL division_id (pre-2026-08-11)
-- pass is_division_visible(NULL)=true (shown to all) — there are 0 today, so no
-- effect; all new write-offs attribute to their division.

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

  -- Scrap & Defective — canonical write-offs only (approved SA adjustment_type='write_off'),
  -- valued at the cost booked to the movement each produced. Both good and damaged
  -- write-offs are now division + warehouse scoped.
  SELECT
    COALESCE((
      -- Good-pile write-offs: division + warehouse scoped via sub_container -> division.
      SELECT SUM(ABS(sm.qty) * sm.unit_cost)
      FROM public.inventory_stock_movements sm
      JOIN public.stock_adjustments sa ON sa.id = sm.reference_id
      LEFT JOIN public.warehouse_sub_containers wsc ON wsc.id = sm.sub_container_id
      WHERE sm.movement_type::text  = 'adjustment'
        AND sm.reference_type       = 'adjustment'
        AND sa.adjustment_type::text = 'write_off'
        AND sa.status::text          = 'approved'
        AND sm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(wsc.division_id)
        AND (p_division_ids  IS NULL OR wsc.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR sm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
    +
    COALESCE((
      -- Damaged-pile write-offs: division-scoped via the movement's division_id
      -- (stamped from the source sub-container / return at damage time).
      SELECT SUM(dm.qty * dm.unit_cost)
      FROM public.inventory_damaged_movements dm
      WHERE dm.movement_type = 'damaged_write_off'
        AND dm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(dm.division_id)
        AND (p_division_ids  IS NULL OR dm.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR dm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
  INTO v_scrap;

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
