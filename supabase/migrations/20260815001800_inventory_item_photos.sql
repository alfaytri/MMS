-- Inventory Item Photos phase — Task 1 of 8
--
-- Adds `image_url` to inventory_items + a PUBLIC storage bucket for the
-- photos. Public because:
--   * Every item-picker surface renders <img src={image_url}>; a signed-
--     URL per row × N pickers would be needless latency + churn.
--   * Content is product catalog photos — not confidential.
--
-- Path convention: `<yyyy>/<mm>/<item-id-or-pending>/<ts>-<name>`. Uploads
-- from the item add flow (no id yet) land under `pending/…`; occasional
-- garbage from cancelled creates will be swept by a later cron (out of
-- scope for this phase).
--
-- Plan: docs/plans/2026-08-03-inventory-item-photos.md.
-- Prior migration: 20260815001700_consumption_edit_workflow_groups_check.sql.

BEGIN;

-- ── 1. Column ────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.inventory_items.image_url IS
'Public URL of the item''s catalog photo (Supabase Storage bucket
inventory-item-photos). NULL means no photo — UI renders a Package icon
placeholder. Item-level, not brand-variant-level (variant-level photos
are out of scope for this phase).';

-- ── 2. Public bucket ─────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-item-photos', 'inventory-item-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ── 3. Storage RLS ───────────────────────────────────────────────────────
--
-- Read: public (anon + authenticated). That's what "public" bucket means
-- but the RLS policy still has to be spelled out — Storage doesn't infer
-- from `buckets.public` for the SELECT policy.

CREATE POLICY "inventory_item_photos_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'inventory-item-photos');

CREATE POLICY "inventory_item_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-item-photos');

CREATE POLICY "inventory_item_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'inventory-item-photos')
  WITH CHECK (bucket_id = 'inventory-item-photos');

CREATE POLICY "inventory_item_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-item-photos');

NOTIFY pgrst, 'reload schema';

COMMIT;
