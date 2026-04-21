-- Fix service-photos storage policies: add DELETE policy, add WITH CHECK to UPDATE

DROP POLICY IF EXISTS "service_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "service_photos_delete" ON storage.objects;

CREATE POLICY "service_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'service-photos')
  WITH CHECK (bucket_id = 'service-photos');

CREATE POLICY "service_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'service-photos');
