-- Add RLS policies for the order-attachments storage bucket.
-- The bucket is private; without policies every upload/download returns 400.
-- Authenticated users (agents) may upload and read any attachment.

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-attachments', 'order-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth users can upload order attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "auth users can read order attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'order-attachments');

CREATE POLICY "auth users can delete order attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'order-attachments');
