-- Drop legacy per-customer credit override columns. The credit_groups table
-- is the canonical source for credit_limit; live "credit available" is
-- computed by customer_credit_used() and surfaced through the
-- customer_credit_summary view.
--
-- Dropped:
--   * customers.credit_limit    — legacy override, no frontend writes
--   * customers.credit_balance  — was mutated only by increment_credit_balance
--   * public.increment_credit_balance(uuid, numeric)
--
-- The customer_credit_summary view is recreated without the credit_limit
-- fallback branch. Store-credit resolution on credit notes no longer touches
-- a stored balance — the credit note itself (resolution_type = 'store_credit')
-- is the record of truth; the frontend will derive a running balance when
-- needed.

BEGIN;

-- customer_credit_summary depends on customers.credit_limit — drop first.
DROP VIEW IF EXISTS public.customer_credit_summary;

DROP FUNCTION IF EXISTS public.increment_credit_balance(uuid, numeric);

ALTER TABLE public.customers
  DROP COLUMN IF EXISTS credit_limit,
  DROP COLUMN IF EXISTS credit_balance;

-- Rebuild the summary view without the legacy fallback. customer_type stays
-- for now (Batch B removes it) — everything else references credit_groups.
CREATE OR REPLACE VIEW public.customer_credit_summary AS
SELECT
  c.id                                              AS customer_id,
  c.name                                            AS customer_name,
  c.name_ar                                         AS customer_name_ar,
  c.customer_type                                   AS customer_type,
  c.is_blocked                                      AS is_blocked,
  c.credit_group_id                                 AS credit_group_id,
  cg.name                                           AS credit_group_name,
  CASE
    WHEN c.customer_type = 'cash' OR c.credit_group_id IS NULL THEN 0
    ELSE COALESCE(cg.credit_limit, 0)
  END                                               AS credit_limit,
  public.customer_credit_used(c.id, NULL)           AS credit_used,
  GREATEST(
    CASE
      WHEN c.customer_type = 'cash' OR c.credit_group_id IS NULL THEN 0
      ELSE COALESCE(cg.credit_limit, 0)
    END
    - public.customer_credit_used(c.id, NULL),
    0
  )                                                 AS credit_available,
  CASE
    WHEN COALESCE(
           CASE WHEN c.customer_type = 'cash' OR c.credit_group_id IS NULL THEN 0
                ELSE COALESCE(cg.credit_limit, 0) END,
           0) = 0
      THEN NULL
    ELSE LEAST(
      ROUND(
        public.customer_credit_used(c.id, NULL)
        / NULLIF(CASE
                   WHEN c.customer_type = 'cash' OR c.credit_group_id IS NULL THEN 0
                   ELSE COALESCE(cg.credit_limit, 0)
                 END, 0)
        * 100, 1),
      100
    )
  END                                               AS credit_utilization_pct
FROM   public.customers c
LEFT   JOIN public.credit_groups cg ON cg.id = c.credit_group_id;

COMMENT ON VIEW public.customer_credit_summary IS
  'Live per-customer credit utilization. credit_limit sourced only from credit_groups (legacy customers.credit_limit was dropped 2026-07-24). credit_used is computed from outstanding AR invoices + uninvoiced open SOs.';

GRANT SELECT ON public.customer_credit_summary TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
