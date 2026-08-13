-- Two fixes:
--
-- 1. Reshape customer_credit_docs from long-format (3 rows/customer) to
--    wide-format (1 row/customer with three URL columns). Cleaner in the
--    dashboard and makes single-row updates easier.
--
-- 2. Fix search_customers — still SELECTs c.cr_url / c.establishment_id_url
--    / c.signed_credit_form_url which were dropped in
--    20260815010600. Front-end got 400s on every RPC call. Rewrite to
--    drop those fields (client uses useCustomerCreditDocs when it needs them).

BEGIN;

-- ── 1. Pivot customer_credit_docs to wide format ──────────────────────
-- Drop the long-format storage triggers first (they'll be recreated below).
DROP TRIGGER IF EXISTS cleanup_customer_credit_docs_after_delete ON public.customer_credit_docs;
DROP TRIGGER IF EXISTS cleanup_customer_credit_docs_after_update ON public.customer_credit_docs;
DROP FUNCTION IF EXISTS public.trg_cleanup_customer_credit_docs_after_delete();
DROP FUNCTION IF EXISTS public.trg_cleanup_customer_credit_docs_after_update();

CREATE TABLE IF NOT EXISTS public.customer_credit_docs_new (
  customer_id            uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  cr_url                 text,
  establishment_id_url   text,
  signed_credit_form_url text
);

-- Pivot existing long-format rows into one row per customer.
INSERT INTO public.customer_credit_docs_new (
  customer_id, cr_url, establishment_id_url, signed_credit_form_url
)
SELECT customer_id,
       MAX(file_url) FILTER (WHERE doc_type = 'cr'),
       MAX(file_url) FILTER (WHERE doc_type = 'establishment_id'),
       MAX(file_url) FILTER (WHERE doc_type = 'signed_credit_form')
  FROM public.customer_credit_docs
 GROUP BY customer_id;

-- Swap tables.
DROP TABLE public.customer_credit_docs;
ALTER TABLE public.customer_credit_docs_new RENAME TO customer_credit_docs;

ALTER TABLE public.customer_credit_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_credit_docs_read  ON public.customer_credit_docs;
DROP POLICY IF EXISTS customer_credit_docs_write ON public.customer_credit_docs;

CREATE POLICY customer_credit_docs_read  ON public.customer_credit_docs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY customer_credit_docs_write ON public.customer_credit_docs
  FOR ALL    TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.customer_credit_docs IS
'Credit-related documents attached to a customer (CR, Establishment ID,
Signed Credit Form). One row per customer — wide-format columns replace
the earlier long-format (doc_type, file_url) pair.';

-- ── 2. Storage-cleanup triggers on the wide table ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url,                 'customer_credit_docs', OLD.customer_id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url,   'customer_credit_docs', OLD.customer_id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customer_credit_docs', OLD.customer_id::text);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.cr_url IS DISTINCT FROM NEW.cr_url AND OLD.cr_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  IF OLD.establishment_id_url IS DISTINCT FROM NEW.establishment_id_url AND OLD.establishment_id_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  IF OLD.signed_credit_form_url IS DISTINCT FROM NEW.signed_credit_form_url AND OLD.signed_credit_form_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cleanup_customer_credit_docs_after_delete
  AFTER DELETE ON public.customer_credit_docs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_credit_docs_after_delete();

CREATE TRIGGER cleanup_customer_credit_docs_after_update
  AFTER UPDATE OF cr_url, establishment_id_url, signed_credit_form_url ON public.customer_credit_docs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_credit_docs_after_update();

-- ── 3. Reshape save_customer_credit_docs RPC ──────────────────────────
-- Accepts the same jsonb payload the client already sends, but writes ONE
-- upsert per customer (NULL columns for missing doc_types).
CREATE OR REPLACE FUNCTION public.save_customer_credit_docs(
  p_customer_id uuid,
  p_docs        jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cr text;
  v_es text;
  v_sg text;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'save_customer_credit_docs: customer_id is required';
  END IF;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_cr
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'cr'
   LIMIT 1;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_es
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'establishment_id'
   LIMIT 1;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_sg
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'signed_credit_form'
   LIMIT 1;

  -- If every URL is NULL, delete the row rather than leaving an all-NULL shell.
  IF v_cr IS NULL AND v_es IS NULL AND v_sg IS NULL THEN
    DELETE FROM public.customer_credit_docs WHERE customer_id = p_customer_id;
    RETURN;
  END IF;

  INSERT INTO public.customer_credit_docs (customer_id, cr_url, establishment_id_url, signed_credit_form_url)
  VALUES (p_customer_id, v_cr, v_es, v_sg)
  ON CONFLICT (customer_id) DO UPDATE
    SET cr_url                 = EXCLUDED.cr_url,
        establishment_id_url   = EXCLUDED.establishment_id_url,
        signed_credit_form_url = EXCLUDED.signed_credit_form_url;
END $$;

REVOKE ALL ON FUNCTION public.save_customer_credit_docs(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_customer_credit_docs(uuid, jsonb) TO authenticated, service_role;

-- ── 4. Fix search_customers — remove dropped column refs ──────────────
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
      CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type,
      c.entity_type,
      (c.block_reason IS NOT NULL) AS is_blocked,
      c.is_active,
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
$$;

-- ── 5. Fix useCreditGroupApprovals nested-select target ───────────────
-- The hook joins `customers(..., customer_credit_docs(doc_type, file_url))`.
-- With the new wide table there's no doc_type column. Since PostgREST joins
-- on FK, we can rely on the join returning the row's three URL columns.
-- Hook code will pick them up directly from customer_credit_docs.{cr_url,…}
-- (handled in the follow-up code commit).

COMMIT;

NOTIFY pgrst, 'reload schema';
