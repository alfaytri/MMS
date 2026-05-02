-- Fix SECURITY DEFINER advisor warnings by recreating views with security_invoker = true.
-- This ensures RLS policies of the *querying* user are enforced, not the view creator's.

DROP VIEW IF EXISTS public.customer_invoices;
DROP VIEW IF EXISTS public.supplier_bills;
DROP VIEW IF EXISTS public.credit_group_customer_counts;

CREATE VIEW public.customer_invoices WITH (security_invoker = true) AS
  SELECT * FROM public.invoices WHERE direction = 'ar';

CREATE VIEW public.supplier_bills WITH (security_invoker = true) AS
  SELECT * FROM public.invoices WHERE direction = 'ap';

CREATE VIEW public.credit_group_customer_counts WITH (security_invoker = true) AS
  SELECT
    credit_group_id,
    COUNT(*)::INT AS customer_count
  FROM   public.customers
  WHERE  credit_group_id IS NOT NULL
  GROUP  BY credit_group_id;

GRANT SELECT ON public.customer_invoices            TO authenticated;
GRANT SELECT ON public.supplier_bills               TO authenticated;
GRANT SELECT ON public.credit_group_customer_counts TO authenticated;
