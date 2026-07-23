-- Add cached PDF URL column to sale_deliveries
ALTER TABLE sale_deliveries ADD COLUMN IF NOT EXISTS pdf_url text;

-- Create storage bucket for delivery note PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-note-pdfs', 'delivery-note-pdfs', true, 10485760, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "delivery_note_pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'delivery-note-pdfs');

-- Authenticated upload/update policy
CREATE POLICY "delivery_note_pdfs_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'delivery-note-pdfs');

CREATE POLICY "delivery_note_pdfs_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'delivery-note-pdfs');
