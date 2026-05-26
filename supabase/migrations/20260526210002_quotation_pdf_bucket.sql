-- Create quotation-pdfs storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('quotation-pdfs', 'quotation-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload (INSERT) quotation PDFs
CREATE POLICY "Authenticated users can upload quotation PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-pdfs');

-- Authenticated users can overwrite (UPDATE) quotation PDFs on re-send
CREATE POLICY "Authenticated users can update quotation PDFs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'quotation-pdfs');

-- Public read access (PDFs are sent to external customers via WhatsApp)
CREATE POLICY "Public can read quotation PDFs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'quotation-pdfs');
