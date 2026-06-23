-- ─────────────────────────────────────────────────────────────────────────────
-- Order Confirmation PDF — storage + per-order URL column
--
-- 1. orders.confirmation_pdf_url  TEXT  → public URL of the generated PDF for
--    this order's booking confirmation. NULL means "needs generating".
--    Reset to NULL whenever the order is edited in a way that invalidates the
--    PDF (handled in application code alongside the existing confirmation_sent_at
--    reset).
--
-- 2. Storage bucket `booking-confirmations` → public-read so WATI can fetch the
--    URL without auth. Service-role writes only (Next.js API route).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_pdf_url TEXT;

COMMENT ON COLUMN public.orders.confirmation_pdf_url IS
  'Public URL of the generated booking-confirmation PDF. NULL = needs (re)generating. Resets whenever confirmation_sent_at is reset.';

-- Bucket — id and name must match the path we reference from API routes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-confirmations',
  'booking-confirmations',
  true,                         -- public read
  10 * 1024 * 1024,             -- 10 MB cap per file
  ARRAY['application/pdf']      -- PDFs only
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies — anyone can read (public), only service role writes
-- (anon/auth keys can't insert — protects against client-side tampering with
-- the canonical confirmation PDF).
DO $$
BEGIN
  -- Public read
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'booking_confirmations_public_read'
  ) THEN
    CREATE POLICY "booking_confirmations_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'booking-confirmations');
  END IF;

  -- Service-role insert (no anon/auth INSERT policy = locked down)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'booking_confirmations_service_write'
  ) THEN
    CREATE POLICY "booking_confirmations_service_write"
      ON storage.objects FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = 'booking-confirmations');
  END IF;

  -- Service-role update (so regenerating the PDF can overwrite the same key)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'booking_confirmations_service_update'
  ) THEN
    CREATE POLICY "booking_confirmations_service_update"
      ON storage.objects FOR UPDATE
      TO service_role
      USING (bucket_id = 'booking-confirmations')
      WITH CHECK (bucket_id = 'booking-confirmations');
  END IF;
END$$;
