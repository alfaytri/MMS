-- Create two Supabase Storage buckets that the app uploads to but that were
-- never created by a migration:
--
--   1. division-assets  — company logos + division logos/stamps
--      (src/components/master-data/CompanyFormDialog.tsx,
--       src/components/master-data/DivisionFormDialog.tsx)
--
--   2. lc-bills — vendor bill scans attached to landed-cost line items
--      (src/app/(dashboard)/purchase/landed-costs/page.tsx,
--       src/hooks/useLandedCosts.ts)
--
-- Symptom on staging: uploads returned {statusCode:"404", code:"NoSuchBucket"}
-- so company logos, division stamps, and LC bill attachments all failed.

BEGIN;

-- ── division-assets ─────────────────────────────────────────────────────────
-- Public: logos + stamps are embedded into vendor-facing PDFs (POs, invoices,
-- delivery notes) that are also served from public buckets. Keeping this
-- bucket public matches the rest of the branded-asset pipeline and avoids
-- signing every logo request in a PDF generator.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'division-assets',
  'division-assets',
  true,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "division_assets_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'division-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "division_assets_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'division-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "division_assets_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'division-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "division_assets_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'division-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── lc-bills ────────────────────────────────────────────────────────────────
-- Private: vendor bill scans contain vendor pricing / commercial-sensitive
-- data. The app mints short-lived signed URLs (useLandedCosts.useBillSignedUrls)
-- for viewing, so read-through the bucket only needs authenticated access.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lc-bills',
  'lc-bills',
  false,
  10 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "lc_bills_auth_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'lc-bills');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lc_bills_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'lc-bills');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lc_bills_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'lc-bills');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "lc_bills_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'lc-bills');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
