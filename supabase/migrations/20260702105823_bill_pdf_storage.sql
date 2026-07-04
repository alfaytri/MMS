-- Storage bucket for Purchase Bill PDFs (generated via Puppeteer pipeline).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bill-pdfs', 'bill-pdfs', true, 10 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
DECLARE b TEXT := 'bill-pdfs';
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
