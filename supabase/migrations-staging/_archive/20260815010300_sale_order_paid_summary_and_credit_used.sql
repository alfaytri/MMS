-- ─────────────────────────────────────────────────────────────────────────────
-- Fix stale `so_invoices.paid_amount`.
--
-- Two invoice-adjacent tables exist:
--   • public.invoices     — used by AP flows and legacy AR paths.
--   • public.so_invoices  — the AR invoice table generate_invoice_from_so /
--                           rpc_sync_invoice_from_so write to for sale orders.
--
-- The payment-sync triggers (`payments_redirect_to_invoice_fn`,
-- `invoice_recompute_paid_fn`) were written against `public.invoices` only.
-- They never touched `so_invoices.paid_amount`. That column was set at
-- invoice creation and drifts as payments come in — leaving every credit
-- customer looking like they've paid nothing.
--
-- Rather than maintaining two caches with two trigger sets that could go
-- out of sync separately, this migration:
--
--   1. Creates a compute-on-demand view `sale_order_paid_summary` that
--      sums payments per SO across all three source shapes the
--      `SoPaymentDialog` already handles.
--   2. Rewrites `customer_credit_used()` to use the view instead of
--      reading the stale `so_invoices.paid_amount` cache.
--
-- Client code that needs per-SO paid totals (the sales-orders list, the
-- Credit Utilization dialog) will read from the view directly.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. View: sum of payments per SO ────────────────────────────────────
CREATE OR REPLACE VIEW public.sale_order_paid_summary
WITH (security_invoker = on) AS
  SELECT so.id AS sale_order_id,
         COALESCE(SUM(COALESCE(pmt.amount_qar, pmt.amount)), 0) AS paid_qar
    FROM public.sale_orders so
    LEFT JOIN public.so_invoices si ON si.sale_order_id = so.id
    LEFT JOIN public.payments pmt
      ON pmt.deleted_at IS NULL
     AND (
       (pmt.source_type = 'sale_order' AND pmt.source_id = so.id)
       OR (si.id IS NOT NULL AND pmt.source_type = 'invoice' AND pmt.source_id = si.id)
       OR (si.id IS NOT NULL AND pmt.invoice_id = si.id)
     )
   WHERE so.deleted_at IS NULL
   GROUP BY so.id;

COMMENT ON VIEW public.sale_order_paid_summary IS
'Compute-on-demand paid amount per SO. Sums payments across every source
shape the code uses (source_type=sale_order/invoice, invoice_id link),
covering both pre-invoice payments and post-invoice ones. Replaces the
never-updated so_invoices.paid_amount column as the source of truth.';

GRANT SELECT ON public.sale_order_paid_summary TO authenticated, service_role;

-- ── 2. Rewrite customer_credit_used to use the view ────────────────────
CREATE OR REPLACE FUNCTION public.customer_credit_used(
  p_customer_id   uuid,
  p_exclude_so_id uuid DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      GREATEST(
        so.total * COALESCE(so.exchange_rate, 1) - COALESCE(sps.paid_qar, 0),
        0
      )
    ),
    0
  )
  FROM   sale_orders so
  LEFT   JOIN sale_order_paid_summary sps ON sps.sale_order_id = so.id
  WHERE  so.customer_id = p_customer_id
    AND  so.status      NOT IN ('cancelled')
    AND  so.deleted_at  IS NULL
    AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id);
$$;

REVOKE ALL ON FUNCTION public.customer_credit_used(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_credit_used(uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
