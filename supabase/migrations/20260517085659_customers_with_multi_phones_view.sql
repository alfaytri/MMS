-- supabase/migrations/20260517085659_customers_with_multi_phones_view.sql
-- Lightweight view used by the "multiple phones" filter on the service-customers
-- page. GROUP BY + HAVING runs server-side; the client only receives a list of
-- UUIDs rather than fetching every phone record for client-side grouping.
--
-- security_invoker = true ensures the view respects the RLS policies of the
-- calling role (authenticated) rather than running as the view owner.

CREATE VIEW public.customers_with_multi_phones
  WITH (security_invoker = true) AS
SELECT customer_id
FROM   public.service_customer_phones
GROUP  BY customer_id
HAVING COUNT(*) > 1;

-- Grant read access to the authenticated role so PostgREST can expose it.
GRANT SELECT ON public.customers_with_multi_phones TO authenticated;
