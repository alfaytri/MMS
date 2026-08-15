-- Multi-division PO (Phase 2) — money-out per-division attribution (Option B: report-only).
--
-- Phase 1/2 route each PO line's STOCK into its own division, so the inventory-
-- driven reports (product cost, COGS, accrual P&L inventory side) already split
-- correctly. The MONEY-OUT side did not: a mixed PO's bill carries a single
-- header division_id, so Accounts Payable and the P&L purchase-payment side
-- attributed the whole bill/payment to the PO's primary division.
--
-- This migration allocates the money-out figures per division PRO-RATA BY LINE
-- VALUE, entirely inside the report functions. No bill/payment row is changed —
-- storage is untouched; only the reads expand a mixed PO's bill/payment into
-- per-division rows. The split ratio comes from one source of truth:
-- _po_division_weights(po_id).
--
-- Live bodies were sourced via pg_get_functiondef; only the attribution logic
-- changes. Everything else (FX sum, scrap, accrual revenue/COGS) is preserved
-- verbatim.

-- ---------------------------------------------------------------------------
-- 1. Source of truth: a PO's per-division share of its line value.
--    Returns one row per division that has non-zero line value on the PO, with
--    weight = that division's line value / the PO's total (division-tagged) line
--    value. Weights sum to exactly 1. Returns NO rows when the PO has no usable
--    line-division breakdown (all lines NULL-division or zero value, or the PO
--    id is NULL) — callers then fall back to the header division.
--
--    SECURITY INVOKER: safe to expose. Called from the SECURITY DEFINER reports
--    below, where it runs with the definer's privileges and therefore sees all
--    lines (the reports do their own is_division_visible filtering). A direct
--    call by `authenticated` is RLS-limited to that user's own rows — harmless.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._po_division_weights(p_po_id uuid)
 RETURNS TABLE(division_id uuid, weight numeric)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH vals AS (
    SELECT li.division_id AS div, SUM(COALESCE(li.total_price, 0)) AS v
    FROM public.po_line_items li
    WHERE li.po_id = p_po_id
      AND li.division_id IS NOT NULL
    GROUP BY li.division_id
    HAVING SUM(COALESCE(li.total_price, 0)) > 0
  ),
  tot AS (SELECT SUM(v) AS t FROM vals)
  SELECT vals.div, vals.v / tot.t
  FROM vals, tot
  WHERE tot.t > 0;
$function$;

REVOKE ALL ON FUNCTION public._po_division_weights(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Accounts Payable — expand each bill into per-division rows.
--    A bill linked to a PO with a line-division breakdown is split pro-rata by
--    line value; amount and paid are each allocated with the rounding residual
--    assigned to the largest-weight division so the per-division rows tie back
--    to the bill total EXACTLY (no lost/created cents). Bills with no usable
--    breakdown (manual bills, single-division POs, legacy) emit one row on the
--    bill's own division_id — identical to the previous behaviour.
--
--    Visibility + the p_division_ids filter now key on the ALLOCATED division,
--    so a mixed PO's Trading slice is visible to a Trading viewer (previously
--    the whole bill was pinned to the header division only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_report_accounts_payable(p_division_ids uuid[] DEFAULT NULL::uuid[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(bill_no text, supplier text, po_no text, po_id uuid, issued_date date, due_date date, amount numeric, paid numeric, due numeric, po_currency text, po_amount numeric, status text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.bill_no, r.supplier, r.po_no, r.po_id, r.issued_date, r.due_date,
         r.amount, r.paid, r.due, r.po_currency, r.po_amount, r.status, r.division_id, r.division_name
  FROM (
    SELECT
      b.bill_number AS bill_no,
      s.name        AS supplier,
      po.po_number  AS po_no,
      b.purchase_order_id AS po_id,
      b.issued_date,
      b.due_date,
      a.amount                              AS amount,
      a.paid                                AS paid,
      (a.amount - a.paid)                   AS due,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE NULL END AS po_currency,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' AND COALESCE(po.exchange_rate, 0) > 0
           THEN round(a.amount / po.exchange_rate, 2) ELSE NULL END                             AS po_amount,
      CASE
        WHEN b.payment_status = 'paid' OR (a.amount - a.paid) <= 0 THEN 'Paid'
        WHEN b.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      a.division_id,
      d.name AS division_name
    FROM public.bills b
    LEFT JOIN public.suppliers s        ON s.id  = b.supplier_id
    LEFT JOIN public.purchase_orders po ON po.id = b.purchase_order_id
    CROSS JOIN LATERAL (
      -- Per-division allocation of THIS bill.
      WITH w AS (
        SELECT dw.division_id, dw.weight
        FROM public._po_division_weights(b.purchase_order_id) dw
      ),
      ranked AS (
        SELECT division_id, weight,
               row_number() OVER (ORDER BY weight DESC, division_id) AS rn
        FROM w
      ),
      base AS (
        SELECT rn, division_id,
               round(COALESCE(b.total_amount, 0) * weight, 2) AS amt_r,
               round(COALESCE(b.paid_amount,  0) * weight, 2) AS paid_r
        FROM ranked
      ),
      resid AS (
        SELECT COALESCE(b.total_amount, 0) - COALESCE(SUM(amt_r),  0) AS amt_res,
               COALESCE(b.paid_amount,  0) - COALESCE(SUM(paid_r), 0) AS paid_res
        FROM base
      )
      SELECT base.division_id,
             base.amt_r  + CASE WHEN base.rn = 1 THEN resid.amt_res  ELSE 0 END AS amount,
             base.paid_r + CASE WHEN base.rn = 1 THEN resid.paid_res ELSE 0 END AS paid
      FROM base CROSS JOIN resid
      UNION ALL
      -- Fallback: no line-division breakdown → whole bill on its own division.
      SELECT b.division_id, COALESCE(b.total_amount, 0), COALESCE(b.paid_amount, 0)
      WHERE NOT EXISTS (SELECT 1 FROM w)
    ) a
    LEFT JOIN public.company_divisions d ON d.id = a.division_id
    WHERE public.is_division_visible(a.division_id)
      AND (p_division_ids IS NULL OR a.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR b.issued_date >= p_from)
      AND (p_to   IS NULL OR b.issued_date <= p_to)
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.bill_no;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Profit & Loss — split purchase-payment attribution per division.
--    Two payment-derived figures attributed by the header division before:
--      * v_fx  — realized FX on settled payments (feeds BOTH accrual & cash).
--      * cash_out — outgoing (purchase) payments (cash basis only).
--    Both now split a purchase payment across the PO's divisions pro-rata by
--    line value; incoming (sales) payments and everything without a weighted PO
--    keep the header-division attribution. Accrual revenue/COGS and scrap are
--    unchanged (already physical-/sale-driven).
-- ---------------------------------------------------------------------------
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

NOTIFY pgrst, 'reload schema';
