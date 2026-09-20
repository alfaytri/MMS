-- search_customers gains p_sales_only: when TRUE, restrict to Sales customers
-- (is_sales_customer). Default FALSE returns the whole list (Projects / Orders /
-- Contact-Centre). The arg list changes, so DROP + CREATE + re-grant. The output
-- row also carries is_sales_customer for callers that want to show the tag.
DROP FUNCTION IF EXISTS public.search_customers(text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION public.search_customers(
  p_query       text    DEFAULT NULL::text,
  p_only_active boolean DEFAULT false,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0,
  p_sales_only  boolean DEFAULT false
) RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public'
AS $function$
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
      AND  (NOT p_sales_only  OR c.is_sales_customer)
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
      AND  (NOT p_sales_only  OR c.is_sales_customer)
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
      CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type,
      c.entity_type,
      (c.block_reason IS NOT NULL) AS is_blocked,
      c.is_active,
      c.is_sales_customer,
      c.credit_group_id,
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
$function$;

REVOKE ALL     ON FUNCTION public.search_customers(text, boolean, integer, integer, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.search_customers(text, boolean, integer, integer, boolean) TO   authenticated, service_role;
