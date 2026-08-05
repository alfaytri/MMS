-- Enforce server-side size + MIME on 4 legacy buckets that previously had
-- neither. Client-side checks (file.size, accept="image/*") are trivially
-- bypassed by a direct storage API call, so a server-side cap is the
-- only real defense against oversized or unexpected file types.
--
-- Aligns with the existing per-dialog client caps (all 10 MB). MIME lists
-- match what the app actually accepts today:
--
--   inventory-item-photos   → images only (JPG/PNG/WebP)
--   adjustment-photos       → images only (JPG/PNG/WebP)
--   consumption-attachments → images + PDF (evidence attachments)
--   customer-credit-docs    → images + PDF (CR / ID scans / signed forms)

UPDATE storage.buckets
SET
  file_size_limit     = 10 * 1024 * 1024,
  allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'inventory-item-photos';

UPDATE storage.buckets
SET
  file_size_limit     = 10 * 1024 * 1024,
  allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'adjustment-photos';

UPDATE storage.buckets
SET
  file_size_limit     = 10 * 1024 * 1024,
  allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'consumption-attachments';

UPDATE storage.buckets
SET
  file_size_limit     = 10 * 1024 * 1024,
  allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'customer-credit-docs';
