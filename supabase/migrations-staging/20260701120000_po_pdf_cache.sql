-- Purchase Order PDF cache — pdf_url column, storage bucket, invalidation triggers
-- Mirrors the sales PDF cache pattern from 20260627101900.

-- ── 1. Column ──────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;
COMMENT ON COLUMN public.purchase_orders.pdf_url IS
  'Public URL of the generated PO PDF. NULL = needs (re)generating.';

-- ── 2. Storage bucket ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('po-pdfs', 'po-pdfs', true, 10 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies — public read, service-role write/update
DO $$
DECLARE b TEXT := 'po-pdfs';
BEGIN
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
END$$;

-- ── 3. Invalidation trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn()
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

DROP TRIGGER IF EXISTS purchase_orders_invalidate_pdf_cache ON public.purchase_orders;
CREATE TRIGGER purchase_orders_invalidate_pdf_cache
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn();

-- Cascade from po_line_items: any insert/update/delete nulls the parent PO pdf_url
CREATE OR REPLACE FUNCTION public.po_line_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF v_po_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.purchase_orders
     SET pdf_url = NULL
   WHERE id = v_po_id
     AND pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS po_line_items_cascade_pdf_invalidation ON public.po_line_items;
CREATE TRIGGER po_line_items_cascade_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.po_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.po_line_items_invalidate_parent_pdf_fn();
