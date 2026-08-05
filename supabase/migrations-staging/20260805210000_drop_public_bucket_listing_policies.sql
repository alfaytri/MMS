-- Fix Supabase database-linter WARN 0025_public_bucket_allows_listing.
--
-- These 13 buckets are configured with `public: true` on storage.buckets,
-- which makes Supabase's /storage/v1/object/public/<bucket>/<path> endpoint
-- serve files without any policy check. The `_public_read` policies below
-- were additionally granting a broad SELECT on storage.objects — that
-- SELECT enables `supabase.storage.from(...).list()` to enumerate every
-- filename in the bucket, leaking business info (customer names, invoice
-- IDs, etc.) even to unauthenticated clients.
--
-- Dropping the policies keeps public URL access working (that path
-- bypasses storage.objects RLS) while blocking directory listing.
-- Verified: `grep 'storage.from(...).list('` returns zero hits in src/.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "bill-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "booking_confirmations_public_read" ON storage.objects;
DROP POLICY IF EXISTS "credit-note-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "delivery_note_pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "division_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "inventory_item_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "po-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "quotation-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "receival-check-pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "receival_receipt_pdfs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "return_pdfs_public_read" ON storage.objects;
