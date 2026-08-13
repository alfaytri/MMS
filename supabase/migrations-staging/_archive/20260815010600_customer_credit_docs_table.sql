-- Move credit documents off `customers` into a dedicated table.
--
-- The columns `cr_url`, `establishment_id_url`, `signed_credit_form_url`
-- and their `*_uploaded_at` siblings polluted the master-data customer
-- row with per-document state. New shape:
--
--   customer_credit_docs (
--     id           uuid  PK
--     customer_id  uuid  FK customers ON DELETE CASCADE
--     doc_type     text  {'cr' | 'establishment_id' | 'signed_credit_form'}
--     file_url     text  storage path
--     UNIQUE (customer_id, doc_type)
--   )
--
-- No `uploaded_at` timestamp — the operator asked to drop that. If we
-- ever add renewal reminders, they'll go in a separate audit table.
--
-- Backfill: move every non-null URL off customers into the new table,
-- then drop the six legacy columns.

BEGIN;

-- ── 1. New table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_credit_docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  doc_type    text NOT NULL,
  file_url    text NOT NULL,
  CONSTRAINT customer_credit_docs_doc_type_check
    CHECK (doc_type IN ('cr', 'establishment_id', 'signed_credit_form')),
  CONSTRAINT customer_credit_docs_unique_per_type
    UNIQUE (customer_id, doc_type)
);

CREATE INDEX IF NOT EXISTS customer_credit_docs_customer_id_idx
  ON public.customer_credit_docs(customer_id);

ALTER TABLE public.customer_credit_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_credit_docs_read  ON public.customer_credit_docs;
DROP POLICY IF EXISTS customer_credit_docs_write ON public.customer_credit_docs;

CREATE POLICY customer_credit_docs_read  ON public.customer_credit_docs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY customer_credit_docs_write ON public.customer_credit_docs
  FOR ALL    TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.customer_credit_docs IS
'Credit-related documents attached to a customer (CR, Establishment ID,
Signed Credit Form). One row per (customer, doc_type). Replaces the
three legacy *_url columns previously on the customers table.';

-- ── 2. Backfill from customers ─────────────────────────────────────────
INSERT INTO public.customer_credit_docs (customer_id, doc_type, file_url)
SELECT id, 'cr', cr_url
  FROM public.customers
 WHERE cr_url IS NOT NULL AND cr_url <> ''
ON CONFLICT (customer_id, doc_type) DO NOTHING;

INSERT INTO public.customer_credit_docs (customer_id, doc_type, file_url)
SELECT id, 'establishment_id', establishment_id_url
  FROM public.customers
 WHERE establishment_id_url IS NOT NULL AND establishment_id_url <> ''
ON CONFLICT (customer_id, doc_type) DO NOTHING;

INSERT INTO public.customer_credit_docs (customer_id, doc_type, file_url)
SELECT id, 'signed_credit_form', signed_credit_form_url
  FROM public.customers
 WHERE signed_credit_form_url IS NOT NULL AND signed_credit_form_url <> ''
ON CONFLICT (customer_id, doc_type) DO NOTHING;

-- ── 3. Drop old storage-cleanup triggers (they reference the columns) ─
DROP TRIGGER IF EXISTS cleanup_customer_docs_after_delete ON public.customers;
DROP TRIGGER IF EXISTS cleanup_customer_docs_after_update ON public.customers;
DROP FUNCTION IF EXISTS public.trg_cleanup_customer_docs_after_delete();
DROP FUNCTION IF EXISTS public.trg_cleanup_customer_docs_after_update();

-- ── 4. Drop the legacy columns ─────────────────────────────────────────
ALTER TABLE public.customers DROP COLUMN IF EXISTS cr_url;
ALTER TABLE public.customers DROP COLUMN IF EXISTS establishment_id_url;
ALTER TABLE public.customers DROP COLUMN IF EXISTS signed_credit_form_url;
ALTER TABLE public.customers DROP COLUMN IF EXISTS cr_uploaded_at;
ALTER TABLE public.customers DROP COLUMN IF EXISTS establishment_id_uploaded_at;
ALTER TABLE public.customers DROP COLUMN IF EXISTS signed_credit_form_uploaded_at;

-- ── 5. Storage-cleanup trigger on the new table ────────────────────────
-- Same contract as the old customers triggers, but keyed on the docs table.
CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('customer-credit-docs', OLD.file_url, 'customer_credit_docs', OLD.id::text);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.file_url IS DISTINCT FROM NEW.file_url AND OLD.file_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.file_url, 'customer_credit_docs', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_customer_credit_docs_after_delete ON public.customer_credit_docs;
CREATE TRIGGER cleanup_customer_credit_docs_after_delete
  AFTER DELETE ON public.customer_credit_docs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_credit_docs_after_delete();

DROP TRIGGER IF EXISTS cleanup_customer_credit_docs_after_update ON public.customer_credit_docs;
CREATE TRIGGER cleanup_customer_credit_docs_after_update
  AFTER UPDATE OF file_url ON public.customer_credit_docs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_credit_docs_after_update();

-- ── 4. RPC: atomic save of a customer's credit-doc set ────────────────
-- Client passes {cr, establishment_id, signed_credit_form}. RPC replaces
-- the customer's existing docs with the incoming set — DELETEs any row
-- whose doc_type isn't in the payload, UPSERTs the rest.
CREATE OR REPLACE FUNCTION public.save_customer_credit_docs(
  p_customer_id uuid,
  p_docs        jsonb  -- [{"doc_type":"cr","file_url":"…"}, …]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_types_kept text[];
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'save_customer_credit_docs: customer_id is required';
  END IF;

  v_types_kept := ARRAY(
    SELECT d->>'doc_type'
      FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
     WHERE COALESCE(NULLIF(d->>'file_url', ''), NULL) IS NOT NULL
  );

  -- Remove any doc_type no longer in the payload.
  DELETE FROM public.customer_credit_docs
   WHERE customer_id = p_customer_id
     AND NOT (doc_type = ANY (v_types_kept));

  -- Upsert the rest.
  INSERT INTO public.customer_credit_docs (customer_id, doc_type, file_url)
  SELECT p_customer_id,
         d->>'doc_type',
         d->>'file_url'
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE COALESCE(NULLIF(d->>'file_url', ''), NULL) IS NOT NULL
  ON CONFLICT (customer_id, doc_type)
  DO UPDATE SET file_url = EXCLUDED.file_url;
END $$;

REVOKE ALL ON FUNCTION public.save_customer_credit_docs(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_customer_credit_docs(uuid, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
