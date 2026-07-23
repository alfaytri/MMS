-- Add cached receipt PDF URL column to receivals
ALTER TABLE receivals ADD COLUMN IF NOT EXISTS receipt_pdf_url text;

-- Create storage bucket for goods receipt PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receival-receipt-pdfs', 'receival-receipt-pdfs', true, 10485760, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "receival_receipt_pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receival-receipt-pdfs');

-- Authenticated upload/update policy
CREATE POLICY "receival_receipt_pdfs_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receival-receipt-pdfs');

CREATE POLICY "receival_receipt_pdfs_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'receival-receipt-pdfs');
