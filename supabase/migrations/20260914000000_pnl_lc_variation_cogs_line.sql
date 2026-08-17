-- Profit & Loss: split landed-cost adjustments out of the item COGS streams into
-- a dedicated "LC Variation" line.
--
-- Before: rpc_report_pnl bucketed EVERY cogs_entries row — including
-- source_type = 'landed_cost' / 'landed_cost_reversal' — by the item's category
-- stream (Products / Spare Parts / Consumables / Tools). Landed-cost variances
-- therefore hid inside "Products" (or whichever category the item belonged to).
--
-- After: the COGS breakdown routes landed_cost + landed_cost_reversal into a
-- single "LC Variation" stream (net), leaving the item streams to sale /
-- sale_return / consumption only. Revenue grouping is unchanged (landed-cost
-- rows carry no revenue) and Total COGS / Total Revenue / Gross Profit are
-- byte-for-byte the same — this is a re-bucketing of the same numbers.
--
-- Signature, cash basis, FX and Scrap logic are all unchanged.

CREATE OR REPLACE FUNCTION public.rpc_report_pnl(p_start date, p_end date, p_basis text DEFAULT 'accrual'::text, p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_fx     numeric;
  v_scrap  numeric;
BEGIN
  -- Realized FX from payments settled in the period (both bases). Purchase
  -- payments on a multi-division PO are split by line-value weight; everything
  -- else is attributed to its header division.
  WITH fx_raw AS (
    SELECT
      (COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0)) AS fx,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
      COALESCE(po.id, bl.purchase_order_id) AS po_id
    FROM public.payments p
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    WHERE p.deleted_at IS NULL
      AND p.date BETWEEN p_start AND p_end
  ),
  fx_attr AS (
    -- Purchase payment on a PO with per-division weights → split.
    SELECT w.division_id AS div, fr.fx * w.weight AS fx
    FROM fx_raw fr
    CROSS JOIN LATERAL public._po_division_weights(fr.po_id) w
    UNION ALL
    -- Everything else → header division.
    SELECT fr.hdr_div AS div, fr.fx
    FROM fx_raw fr
    WHERE NOT EXISTS (SELECT 1 FROM public._po_division_weights(fr.po_id))
  )
  SELECT COALESCE(SUM(fx), 0)
    INTO v_fx
  FROM fx_attr
  WHERE public.is_division_visible(div)
    AND (p_division_ids IS NULL OR div = ANY(p_division_ids));

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
    WITH pay_raw AS (
      SELECT
        p.direction,
        COALESCE(p.amount_qar, 0) AS amt,
        COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
        COALESCE(po.id, bl.purchase_order_id) AS po_id
      FROM public.payments p
      LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
      LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
      LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
      LEFT JOIN public.bills bl           ON bl.id = p.bill_id
      WHERE p.deleted_at IS NULL
        AND p.status::text IN ('completed', 'pending', 'processing')
        AND p.date BETWEEN p_start AND p_end
    ),
    pay AS (
      -- Outgoing (purchase) payment on a weighted PO → split by division.
      SELECT pr.direction, w.division_id AS div, pr.amt * w.weight AS amt
      FROM pay_raw pr
      CROSS JOIN LATERAL public._po_division_weights(pr.po_id) w
      WHERE pr.direction = 'outgoing'
      UNION ALL
      -- Incoming payments, and outgoing payments without a weighted PO → header division.
      SELECT pr.direction, pr.hdr_div AS div, pr.amt
      FROM pay_raw pr
      WHERE pr.direction <> 'outgoing'
         OR NOT EXISTS (SELECT 1 FROM public._po_division_weights(pr.po_id))
    ),
    pay_vis AS (
      SELECT direction, amt
      FROM pay
      WHERE public.is_division_visible(div)
        AND (p_division_ids IS NULL OR div = ANY(p_division_ids))
    )
    SELECT jsonb_build_object(
      'basis',    'cash',
      'cash_in',  (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'incoming'),
      'cash_out', (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'outgoing'),
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
        ce.source_type,
        initcap(replace(COALESCE(c.type::text, 'other'), '-', ' ')) AS category_stream,
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
      WHERE ce.source_type IN ('sale', 'sale_return', 'consumption', 'landed_cost', 'landed_cost_reversal')
        AND ce.date BETWEEN p_start AND p_end
        AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
        AND (p_division_ids IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
    ),
    -- Revenue stays grouped by the item's category stream. Landed-cost rows carry
    -- no revenue (no sale line), so this grouping is unchanged by the LC split.
    rev_by_stream AS (
      SELECT category_stream AS stream, SUM(revenue) AS amount
      FROM lines
      GROUP BY category_stream
    ),
    -- COGS pulls landed-cost adjustments out of the item streams into a dedicated
    -- "LC Variation" line (net of landed_cost + landed_cost_reversal). Every other
    -- source type keeps its item-category stream.
    cogs_by_stream AS (
      SELECT
        CASE
          WHEN source_type IN ('landed_cost', 'landed_cost_reversal') THEN 'LC Variation'
          ELSE category_stream
        END AS stream,
        SUM(cogs) AS amount
      FROM lines
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'basis',         'accrual',
      'revenue',       COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(amount, 2)) ORDER BY stream) FROM rev_by_stream), '[]'::jsonb),
      'cogs',          COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(amount, 2)) ORDER BY stream) FROM cogs_by_stream), '[]'::jsonb),
      'revenue_total', COALESCE((SELECT SUM(amount) FROM rev_by_stream), 0),
      'cogs_total',    COALESCE((SELECT SUM(amount) FROM cogs_by_stream), 0),
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

NOTIFY pgrst, 'reload schema';
