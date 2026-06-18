-- Create a public Supabase Storage bucket for chat attachment uploads.
-- Files are keyed by conversation_id/timestamp_filename so they are easy to audit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  26214400,   -- 25 MB limit
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/3gpp','video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/ogg','audio/mpeg','audio/mp4','audio/aac',
    'image/webp'  -- stickers
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload and read
CREATE POLICY "authenticated upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "public read chat attachments"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'chat-attachments');
