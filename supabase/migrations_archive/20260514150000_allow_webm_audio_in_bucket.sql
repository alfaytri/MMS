-- Add audio/webm to the chat-attachments bucket's allowed MIME types.
-- Browser MediaRecorder produces audio/webm for voice notes, which was
-- being rejected with 400 because the bucket only allowed ogg/mpeg/mp4/aac.
-- Also add video/webm and audio/wav for completeness.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/3gpp','video/quicktime','video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/webm','audio/wav',
  'image/webp'
]
WHERE id = 'chat-attachments';
