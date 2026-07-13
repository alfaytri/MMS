-- ─────────────────────────────────────────────────────────────────────────────
-- Sales PDF cache — URL columns + storage buckets + invalidation triggers
--
-- Background: @react-pdf/renderer crashes on Next 15 because Next ships React
-- 19-canary which doesn't expose `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`.
-- Migrating SO Quotation / AR Invoice / Credit-Debit Note PDFs to the same
-- Puppeteer + HTML pipeline used by `orders.confirmation_pdf_url`.
--
-- For each document we:
--   1. Add `<doc>_pdf_url TEXT` to the parent row.
--   2. Create a public storage bucket (read-only for anon; service-role writes).
--   3. Install a BEFORE-UPDATE trigger on the parent that nulls the URL on any
--      data change, EXCEPT when the API route is writing the URL itself
--      (signalled via the `app.skip_pdf_invalidation` GUC).
--   4. For SO + AR Invoice (which have separate line-item tables), install an
--      AFTER-INSERT/UPDATE/DELETE trigger on the line table that nulls the
--      parent URL — credit_notes stores lines inline as jsonb so no cascade.
--
-- Why a GUC and not a "URL-only column compare": columns evolve over time, and
-- enumerating every other column in the trigger predicate is brittle. The GUC
-- approach is explicit and survives schema changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ──────────────────────────────────────────────────────────────

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS quotation_pdf_url TEXT;
COMMENT ON COLUMN public.sale_orders.quotation_pdf_url IS
  'Public URL of the generated SO quotation PDF. NULL = needs (re)generating.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;
COMMENT ON COLUMN public.invoices.pdf_url IS
  'Public URL of the generated invoice PDF (AR direction). NULL = needs (re)generating.';

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;
COMMENT ON COLUMN public.credit_notes.pdf_url IS
  'Public URL of the generated credit/debit note PDF. NULL = needs (re)generating.';

-- ── 2. Storage buckets ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('quotation-pdfs',   'quotation-pdfs',   true, 10 * 1024 * 1024, ARRAY['application/pdf']),
  ('invoice-pdfs',     'invoice-pdfs',     true, 10 * 1024 * 1024, ARRAY['application/pdf']),
  ('credit-note-pdfs', 'credit-note-pdfs', true, 10 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies — public read, service-role write/update (matches the
-- booking-confirmations bucket pattern).
DO $$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['quotation-pdfs', 'invoice-pdfs', 'credit-note-pdfs'] LOOP
    -- Public read
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = b || '_public_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
        b || '_public_read', b
      );
    END IF;

    -- Service-role insert
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = b || '_service_write'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = %L)',
        b || '_service_write', b
      );
    END IF;

    -- Service-role update (overwrite cached file on regeneration)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = b || '_service_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE TO service_role USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
        b || '_service_update', b, b
      );
    END IF;
  END LOOP;
END$$;

-- ── 3. Invalidation trigger functions ───────────────────────────────────────

-- The API route's PDF cache writer wraps its UPDATE in
--   SET LOCAL app.skip_pdf_invalidation = 'true';
-- so the trigger lets the URL through.

CREATE OR REPLACE FUNCTION public.sale_orders_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.quotation_pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoices_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_notes_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$$;

-- Cascade from line tables: any insert/update/delete of an SO line nulls the
-- parent SO's quotation PDF URL. Same for invoice_line_items → invoices.
CREATE OR REPLACE FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_so_id UUID;
BEGIN
  v_so_id := COALESCE(NEW.sale_order_id, OLD.sale_order_id);
  IF v_so_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.sale_orders
     SET quotation_pdf_url = NULL
   WHERE id = v_so_id
     AND quotation_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.invoices
     SET pdf_url = NULL
   WHERE id = v_invoice_id
     AND pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 4. Triggers ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS sale_orders_invalidate_pdf_cache  ON public.sale_orders;
CREATE TRIGGER       sale_orders_invalidate_pdf_cache
  BEFORE UPDATE ON public.sale_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_orders_invalidate_pdf_cache_fn();

DROP TRIGGER IF EXISTS invoices_invalidate_pdf_cache  ON public.invoices;
CREATE TRIGGER       invoices_invalidate_pdf_cache
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_invalidate_pdf_cache_fn();

DROP TRIGGER IF EXISTS credit_notes_invalidate_pdf_cache  ON public.credit_notes;
CREATE TRIGGER       credit_notes_invalidate_pdf_cache
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.credit_notes_invalidate_pdf_cache_fn();

DROP TRIGGER IF EXISTS sale_order_lines_cascade_pdf_invalidation  ON public.sale_order_lines;
CREATE TRIGGER       sale_order_lines_cascade_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.sale_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn();

DROP TRIGGER IF EXISTS invoice_line_items_cascade_pdf_invalidation  ON public.invoice_line_items;
CREATE TRIGGER       invoice_line_items_cascade_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn();
