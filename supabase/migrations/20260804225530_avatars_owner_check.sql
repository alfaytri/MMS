-- Lock the `avatars` bucket update/delete/insert policies to the file's owner.
--
-- Before this migration, any authenticated user could overwrite or delete
-- ANY other user's avatar because the update/delete policies only checked
-- `bucket_id = 'avatars'` with no ownership predicate.
--
-- Avatar files are stored flat at the bucket root as `<auth_user_id>.<ext>`
-- (see profile/page.tsx handleAvatarUpload). No folder segments, so we can't
-- use `storage.foldername(name)[1]` — instead we match the filename prefix
-- before the first '.' against `auth.uid()`.

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;

-- Insert: user can only create objects whose filename encodes their own uid.
CREATE POLICY "avatars_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

-- Update: user can only overwrite their own avatar row.
-- USING gates the SELECT step of the upsert; WITH CHECK guards the new row
-- shape (blocks a rename to another user's filename).
CREATE POLICY "avatars_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

-- Delete: same ownership predicate.
CREATE POLICY "avatars_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = auth.uid()::text
  );
