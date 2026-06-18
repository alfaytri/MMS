-- supabase/migrations/20260614205613_adjustment_photos_bucket.sql
-- Bucket for stock adjustment evidence photos uploaded from WhAdjustmentDialog.
-- Private — files are served via signed URLs (see WhAdjustmentDialog.tsx).
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('adjustment-photos', 'adjustment-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "adjustment_photos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'adjustment-photos');

CREATE POLICY "adjustment_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'adjustment-photos');

CREATE POLICY "adjustment_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'adjustment-photos')
  WITH CHECK (bucket_id = 'adjustment-photos');

CREATE POLICY "adjustment_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'adjustment-photos');

COMMIT;
