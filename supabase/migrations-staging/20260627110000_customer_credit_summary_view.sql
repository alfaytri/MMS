-- ─────────────────────────────────────────────────────────────────────────────
-- View: customer_credit_summary
--
-- One row per customer with everything the UI / API needs to render "credit
-- remaining" without computing it client-side. Reads through
-- customer_credit_used() so it stays consistent with the SO-creation gate —
-- pay an invoice, the next read returns the new available number.
--
-- Note: `customers.credit_limit` is a legacy per-customer override that some
-- older rows still use. The credit_groups.credit_limit is the canonical source
-- for credit customers today, so we prefer that and fall back to the legacy
-- column when the customer isn't in a credit group.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.customer_credit_summary AS
SELECT
  c.id                                              AS customer_id,
  c.name                                            AS customer_name,
  c.name_ar                                         AS customer_name_ar,
  c.customer_type                                   AS customer_type,
  c.is_blocked                                      AS is_blocked,
  c.credit_group_id                                 AS credit_group_id,
  cg.name                                           AS credit_group_name,
  -- credit_limit: 0 for cash customers, else group limit, else legacy column
  CASE
    WHEN c.customer_type = 'cash' THEN 0
    WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
    ELSE COALESCE(c.credit_limit, 0)
  END                                               AS credit_limit,
  -- live computed used amount via the shared helper
  public.customer_credit_used(c.id, NULL)           AS credit_used,
  -- available = limit - used (never below 0; nothing is negative credit)
  GREATEST(
    CASE
      WHEN c.customer_type = 'cash' THEN 0
      WHEN cg.credit_limit IS NOT NULL THEN cg.credit_limit
      ELSE COALESCE(c.credit_limit, 0)
    END
    - public.customer_credit_used(c.id, NULL),
    0
  )                                                 AS credit_available,
  -- utilization 0..100 (NULL when limit is 0 to avoid divide-by-zero)
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

COMMENT ON VIEW public.customer_credit_summary IS
  'Live per-customer credit utilization. credit_used is computed from outstanding AR invoices + uninvoiced open SOs; pay an invoice and the row reflects it on the next read.';

GRANT SELECT ON public.customer_credit_summary TO authenticated, service_role;
