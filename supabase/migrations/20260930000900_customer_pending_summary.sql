-- One-customer pending summary, for showing a customer's risk tier on surfaces
-- that have a customer_id but not the pending date (order booking, contact-centre
-- card). Resolves the customer's phones → unpaid order invoices, same predicate
-- as get_tl_pending_by_customer.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_pending_summary(p_customer_id uuid)
 RETURNS TABLE(oldest_pending_date timestamptz, total_pending numeric, invoice_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    MIN(ti.created_at)                                          AS oldest_pending_date,
    COALESCE(SUM(ti.total_amount - COALESCE(ti.paid_amount, 0)), 0) AS total_pending,
    COUNT(*)::int                                               AS invoice_count
  FROM public.tl_invoices ti
  WHERE ti.payment_status IN ('unpaid', 'partial')
    AND (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
    AND ti.customer_phone IN (
      SELECT scp.phone FROM public.service_customer_phones scp WHERE scp.customer_id = p_customer_id
    );
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
