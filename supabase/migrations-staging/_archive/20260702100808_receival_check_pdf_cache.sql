-- Receival Check PDF cache — per-receival PDF only.
-- Blank check sheets never cache (running totals shift with each new receival).

-- ── 1. Cache column ────────────────────────────────────────────────────────
ALTER TABLE public.receivals
  ADD COLUMN IF NOT EXISTS check_sheet_pdf_url TEXT;

COMMENT ON COLUMN public.receivals.check_sheet_pdf_url IS
  'Public URL of the generated Receival Check PDF. NULL = needs (re)generating.';

-- ── 2. Storage bucket ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receival-check-pdfs', 'receival-check-pdfs', true, 10 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 3. Storage policies ────────────────────────────────────────────────────
DO $$
DECLARE b TEXT := 'receival-check-pdfs';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname = b||'_public_read'
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
      b||'_public_read', b
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname = b||'_service_write'
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = %L)',
      b||'_service_write', b
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname = b||'_service_update'
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO service_role USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
      b||'_service_update', b, b
    );
  END IF;
END$$;

-- ── 4. Invalidation trigger on receivals UPDATE ─────────────────────────────
CREATE OR REPLACE FUNCTION public.receivals_invalidate_check_pdf_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.check_sheet_pdf_url := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receivals_invalidate_check_pdf ON public.receivals;
CREATE TRIGGER receivals_invalidate_check_pdf
  BEFORE UPDATE ON public.receivals
  FOR EACH ROW EXECUTE FUNCTION public.receivals_invalidate_check_pdf_fn();

-- ── 5. Cascade from receival_items → null parent URL ────────────────────────
CREATE OR REPLACE FUNCTION public.receival_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_receival_id UUID;
BEGIN
  v_receival_id := COALESCE(NEW.receival_id, OLD.receival_id);
  IF v_receival_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.receivals
     SET check_sheet_pdf_url = NULL
   WHERE id = v_receival_id
     AND check_sheet_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS receival_items_cascade_check_pdf_invalidation ON public.receival_items;
CREATE TRIGGER receival_items_cascade_check_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.receival_items
  FOR EACH ROW EXECUTE FUNCTION public.receival_items_invalidate_parent_pdf_fn();

-- ── 6. RPC to persist cache URL without tripping invalidation ───────────────
CREATE OR REPLACE FUNCTION public.set_receival_check_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.receivals SET check_sheet_pdf_url = p_url WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_receival_check_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_receival_check_pdf_url(UUID, TEXT) TO service_role;
