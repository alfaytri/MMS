-- Fix: customer_credit_summary was created WITHOUT security_invoker,
-- which bypasses RLS on the underlying customers table.
-- Any authenticated user could read every customer's credit data.
-- Re-create with security_invoker = true so RLS is enforced per-caller.

CREATE OR REPLACE VIEW public.customer_credit_summary
  WITH (security_invoker = true)
AS
SELECT
  c.id                                              AS customer_id,
  c.name                                            AS customer_name,
  c.name_ar                                         AS customer_name_ar,
  c.customer_type                                   AS customer_type,
  c.is_blocked                                      AS is_blocked,
  c.credit_group_id                                 AS credit_group_id,
  cg.name                                           AS credit_group_name,
  CASE
    WHEN c.customer_type = 'cash' THEN 0
    WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
    ELSE COALESCE(c.credit_limit, 0)
  END                                               AS credit_limit,
  public.customer_credit_used(c.id, NULL)           AS credit_used,
  GREATEST(
    CASE
      WHEN c.customer_type = 'cash' THEN 0
      WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
      ELSE COALESCE(c.credit_limit, 0)
    END
    - public.customer_credit_used(c.id, NULL),
    0
  )                                                 AS credit_available,
  CASE
    WHEN COALESCE(
           CASE WHEN c.customer_type = 'cash' THEN 0
                WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
                ELSE COALESCE(c.credit_limit, 0) END,
           0) = 0
      THEN NULL
    ELSE LEAST(
      ROUND(
        public.customer_credit_used(c.id, NULL)
        / NULLIF(CASE
                   WHEN c.customer_type = 'cash' THEN 0
                   WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
                   ELSE COALESCE(c.credit_limit, 0)
                 END, 0)
        * 100, 1),
      100
    )
  END                                               AS credit_utilization_pct
FROM   public.customers c
LEFT   JOIN public.credit_groups cg ON cg.id = c.credit_group_id;

GRANT SELECT ON public.customer_credit_summary TO authenticated, service_role;
