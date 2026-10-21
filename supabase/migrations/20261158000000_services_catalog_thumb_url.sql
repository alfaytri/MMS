-- ─────────────────────────────────────────────────────────────────────────────
-- services.catalog_thumb_url — small WebP derivative of the catalog photo.
--
-- The service picker renders a flat search list that can show dozens of catalog
-- photos at once, and the invoice PDF embeds one per line as base64. Neither
-- can afford the original upload (up to 5 MB). The upload path now writes a
-- ~200px WebP beside the full image and records its URL here; both readers use
-- this column, and `catalog_image_url` stays the full-size original shown in
-- the service edit dialog.
--
-- Nullable: every existing service predates this and has no thumbnail. A NULL
-- here means "no photo to show", which the picker renders as no image slot at
-- all (design §6.1).
--
-- TARGET: Dev DB (wkmvjxxmzstsvahuiwsz) only.
-- STAGING MIRROR DELIBERATELY SKIPPED: `services` is an excluded module —
-- supabase/migrations-staging/_archive/20260713200000_staging_cleanup_drop_excluded_modules.sql
-- drops the table — so this file has nothing to apply against on staging/prod.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS catalog_thumb_url text;

COMMENT ON COLUMN public.services.catalog_thumb_url IS
  'Public URL of the ~200px WebP derivative of catalog_image_url, at '
  'service-photos/catalog/{id}_thumb.webp. Written by the service edit dialog '
  'alongside the full image. NULL when the service has no photo.';
