-- supabase/migrations/20260421000001_services_additions.sql

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_image_url text,
  ADD COLUMN IF NOT EXISTS legacy_service_id text,
  ADD COLUMN IF NOT EXISTS qc_items          jsonb;

-- Partial index — active service lookups skip archived rows without full scans
CREATE INDEX IF NOT EXISTS idx_services_active
  ON services (tree_type, deleted_at)
  WHERE deleted_at IS NULL;

-- Storage bucket for catalog images
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "service_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "service_photos_update" ON storage.objects;

CREATE POLICY "service_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-photos');

CREATE POLICY "service_photos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'service-photos');

CREATE POLICY "service_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'service-photos');
