-- Cache the generated invoice PDF URL to skip re-render on repeat views.
ALTER TABLE public.tl_invoices
  ADD COLUMN IF NOT EXISTS pdf_url text;

-- Public read-only bucket for Orders invoice PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tl-invoice-pdfs', 'tl-invoice-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read from this bucket (URLs are unguessable, contain the
-- invoice number). Service-role writes are already allowed via the
-- service key bypass, no explicit policy needed for INSERT.
DROP POLICY IF EXISTS "tl_invoice_pdfs_public_read" ON storage.objects;
CREATE POLICY "tl_invoice_pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tl-invoice-pdfs');
