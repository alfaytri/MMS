-- search_customers RPC still SELECTs customers.customer_type, which was
-- dropped in 20260724170001. Rewrite it to derive customer_type from
-- credit_group_id so existing callers keep receiving the field they expect.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_customers(
  p_query        text    DEFAULT NULL,
  p_only_active  boolean DEFAULT false,
  p_limit        int     DEFAULT 50,
  p_offset       int     DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_norm    text := NULLIF(BTRIM(COALESCE(p_query, '')), '');
  v_pattern text := CASE WHEN v_norm IS NULL THEN NULL
                         ELSE '%' || REPLACE(REPLACE(v_norm, '\', '\\'), '%', '\%') || '%'
                    END;
  v_total   bigint;
  v_rows    jsonb;
BEGIN
  WITH matched AS (
    SELECT DISTINCT c.id
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
  )
  SELECT COUNT(*) INTO v_total FROM matched;

  WITH matched AS (
    SELECT DISTINCT c.id, c.name
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
    ORDER BY c.name
    LIMIT  GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_agg(row)
  INTO   v_rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.email,
      -- customer_type is derived from credit_group_id (column was dropped
      -- 2026-07-24). NULL group → 'cash'; any group → 'credit'.
      CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type,
      c.entity_type,
      c.is_blocked,
      c.is_active,
      c.credit_group_id,
      c.cr_url,
      c.establishment_id_url,
      c.signed_credit_form_url,
      (
        SELECT jsonb_build_object(
                 'name',                  cg.name,
                 'credit_limit',          cg.credit_limit,
                 'default_payment_terms', cg.default_payment_terms
               )
        FROM   public.credit_groups cg
        WHERE  cg.id = c.credit_group_id
      ) AS credit_groups,
      COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object('phone', cp.phone, 'is_primary', cp.is_primary)
                  ORDER BY cp.is_primary DESC
                )
         FROM   public.customer_phones cp
         WHERE  cp.customer_id = c.id),
        '[]'::jsonb
      ) AS customer_phones
    FROM   matched m
    JOIN   public.customers c ON c.id = m.id
    ORDER  BY m.name
  ) AS row;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows, '[]'::jsonb),
    'total_count', v_total
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
