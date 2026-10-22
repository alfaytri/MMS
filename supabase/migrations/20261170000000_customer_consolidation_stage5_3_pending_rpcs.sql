-- Customer consolidation — Stage 5.3: re-point the pending/risk RPCs off service_customers
-- onto the unified customers side. DB-only (callers unaffected):
--   * get_customer_pending_summary resolves phones from customer_phones and accepts EITHER a
--     customers.id OR a (legacy) service_customers.id (bridged), so useCustomerRisk keeps working
--     whether the CC/booking flows have flipped their id-space yet or not.
--   * get_tl_pending_by_customer resolves via customer_phones + customers + customers.is_blocked;
--     the pending-payments UI keys off group_key (not customer_id), so returning a customers id is safe.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.get_customer_pending_summary(p_customer_id uuid)
 RETURNS TABLE(oldest_pending_date timestamp with time zone, total_pending numeric, invoice_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    MIN(ti.created_at)                                              AS oldest_pending_date,
    COALESCE(SUM(ti.total_amount - COALESCE(ti.paid_amount, 0)), 0) AS total_pending,
    COUNT(*)::int                                                   AS invoice_count
  FROM public.tl_invoices ti
  WHERE ti.payment_status IN ('unpaid', 'partial')
    AND (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
    AND ti.customer_phone IN (
      SELECT cp.phone FROM public.customer_phones cp
      WHERE cp.customer_id = p_customer_id
         OR cp.customer_id = (SELECT sc.customer_id FROM public.service_customers sc WHERE sc.id = p_customer_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_tl_pending_by_customer()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(g) ORDER BY g.total_pending DESC)
  INTO result
  FROM (
    SELECT
      grp.group_key,
      grp.customer_id,
      grp.customer_name,
      grp.customer_phone,
      grp.is_blocked,
      CASE WHEN grp.customer_id IS NOT NULL THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', cp.id, 'phone', cp.phone,
                 'is_primary', cp.is_primary, 'label', cp.label
               ) ORDER BY cp.is_primary DESC, cp.created_at), '[]'::jsonb)
        FROM public.customer_phones cp
        WHERE cp.customer_id = grp.customer_id
      ) ELSE jsonb_build_array(jsonb_build_object(
               'id', grp.group_key, 'phone', grp.customer_phone,
               'is_primary', true, 'label', NULL)) END          AS phones,
      grp.total_pending,
      grp.invoice_count,
      grp.oldest_pending_date,
      grp.invoices
    FROM (
      SELECT
        COALESCE(m.customer_id::text,
                 'phone:' || COALESCE(NULLIF(ti.customer_phone, ''), ti.customer_name, ti.id::text))
                                                                 AS group_key,
        m.customer_id                                            AS customer_id,
        COALESCE(c.name, MAX(ti.customer_name), 'Unknown')       AS customer_name,
        MAX(ti.customer_phone)                                   AS customer_phone,
        COALESCE(bool_or(c.is_blocked), false)                   AS is_blocked,
        SUM(ti.total_amount - COALESCE(ti.paid_amount, 0))       AS total_pending,
        COUNT(*)                                                 AS invoice_count,
        MIN(ti.created_at)                                       AS oldest_pending_date,
        jsonb_agg(jsonb_build_object(
          'id',             ti.id,
          'invoice_id',     ti.invoice_number,
          'division_id',    NULL,
          'division_name',  NULL,
          'source_type',    'order',
          'source_id',      ti.order_id,
          'issued_date',    ti.created_at,
          'due_date',       NULL,
          'total_amount',   ti.total_amount,
          'paid_amount',    COALESCE(ti.paid_amount, 0),
          'payment_status', ti.payment_status
        ) ORDER BY ti.created_at ASC)                            AS invoices
      FROM public.tl_invoices ti
      LEFT JOIN LATERAL (
        SELECT cp.customer_id
        FROM public.customer_phones cp
        WHERE cp.phone = ti.customer_phone
        LIMIT 1
      ) m ON true
      LEFT JOIN public.customers c ON c.id = m.customer_id
      WHERE ti.payment_status IN ('unpaid', 'partial')
        AND (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
      GROUP BY
        COALESCE(m.customer_id::text,
                 'phone:' || COALESCE(NULLIF(ti.customer_phone, ''), ti.customer_name, ti.id::text)),
        m.customer_id, c.name, c.is_blocked
    ) grp
  ) g;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;

COMMIT;
