-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seed return-specific reason categories + common reasons
-- 2. Add pdf_url column to returns table for cached PDF
-- 3. Create return-pdfs storage bucket
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Add sale_return and po_return categories ─────────────────────────────────
INSERT INTO public.reason_list_categories (slug, label, sort_order) VALUES
  ('sale_return', 'Sale Return', 25),
  ('po_return',   'PO Return',   26)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed common sale return reasons ──────────────────────────────────────────
INSERT INTO public.reason_lists (category, label, sort_order, active) VALUES
  ('sale_return', 'Defective Product',      10, true),
  ('sale_return', 'Wrong Item Shipped',     20, true),
  ('sale_return', 'Damaged in Transit',     30, true),
  ('sale_return', 'Customer Changed Mind',  40, true),
  ('sale_return', 'Not as Described',       50, true),
  ('sale_return', 'Warranty Claim',         60, true),
  ('sale_return', 'Duplicate Order',        70, true)
ON CONFLICT DO NOTHING;

-- ── Seed common PO return reasons ────────────────────────────────────────────
INSERT INTO public.reason_lists (category, label, sort_order, active) VALUES
  ('po_return', 'Defective from Manufacturer', 10, true),
  ('po_return', 'Wrong Item Received',         20, true),
  ('po_return', 'Damaged in Transit',          30, true),
  ('po_return', 'Quality Issue',               40, true),
  ('po_return', 'Specification Mismatch',      50, true),
  ('po_return', 'Expired Product',             60, true),
  ('po_return', 'Overshipment',                70, true)
ON CONFLICT DO NOTHING;

-- ── Add pdf_url column to returns table ──────────────────────────────────────
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS pdf_url text;

COMMIT;

-- ── Storage bucket (outside transaction — DDL on storage schema) ─────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('return-pdfs', 'return-pdfs', true, 10485760, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "return_pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'return-pdfs');

CREATE POLICY "return_pdfs_auth_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'return-pdfs');

CREATE POLICY "return_pdfs_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'return-pdfs');
