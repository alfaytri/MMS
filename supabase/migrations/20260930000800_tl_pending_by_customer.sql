-- Pending Payments, rebuilt on ORDER invoices (tl_invoices), grouped by customer.
--
-- The /invoices/pending-payments page previously read finance so_invoices via
-- get_customer_pending_balances. Per product intent it should track the ORDER
-- invoices (tl_invoices / SINV). tl_invoices carry only a customer_name +
-- customer_phone snapshot (no customer_id), so we resolve the real service
-- customer by matching the snapshot phone to service_customer_phones. Invoices
-- whose phone matches nothing are grouped under a synthetic phone/name key so
-- they still surface (customer_id stays null).
BEGIN;

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
      -- phones: real list from service_customer_phones when matched, else the
      -- single snapshot phone off the invoice.
      CASE WHEN grp.customer_id IS NOT NULL THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', scp.id, 'phone', scp.phone,
                 'is_primary', scp.is_primary, 'label', scp.label
               ) ORDER BY scp.is_primary DESC, scp.created_at), '[]'::jsonb)
        FROM public.service_customer_phones scp
        WHERE scp.customer_id = grp.customer_id
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
        COALESCE(sc.name, MAX(ti.customer_name), 'Unknown')      AS customer_name,
        MAX(ti.customer_phone)                                   AS customer_phone,
        COALESCE(bool_or(sc.is_blocked), false)                  AS is_blocked,
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
        SELECT scp.customer_id
        FROM public.service_customer_phones scp
        WHERE scp.phone = ti.customer_phone
        LIMIT 1
      ) m ON true
      LEFT JOIN public.service_customers sc ON sc.id = m.customer_id
      WHERE ti.payment_status IN ('unpaid', 'partial')
        AND (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
      GROUP BY
        COALESCE(m.customer_id::text,
                 'phone:' || COALESCE(NULLIF(ti.customer_phone, ''), ti.customer_name, ti.id::text)),
        m.customer_id, sc.name, sc.is_blocked
    ) grp
  ) g;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
