-- STAGING-ONLY: restore `tool_asset_items` so the purchase chain
-- (po_line_items → receival_items → return_lines / sale_delivery_lines
-- → sale_order_lines) can actually FK to it.
--
-- Background:
-- • `tool_asset_items` was dropped from staging on 2026-07-13 as part of
--   the "not needed for inventory build" cleanup.
-- • But the tool-asset purchase-chain feature is active in prod. Since
--   2026-07-21, migrations have been adding `tool_asset_item_id` columns
--   to PO/receival/return/sale-delivery/sale-order line-item tables,
--   guarding the FK with `IF EXISTS (tool_asset_items)` so staging
--   wouldn't blow up.
-- • The result: those FK constraints exist in prod but NOT in staging.
--   Staging can write dangling tool_asset_item_id values with no target.
--
-- This restores the item catalog table AND retro-fits the deferred FK
-- constraints. Units / assignments are not restored — the purchase chain
-- only needs items.
--
-- NO matching migration in `supabase/migrations/` (prod). Prod already
-- has this table; only staging needs to catch up.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tool_asset_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  name_en    text NOT NULL,
  name_ar    text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tool_asset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tool_asset_items"
  ON public.tool_asset_items TO authenticated USING (true) WITH CHECK (true);

-- Retro-add the FK constraints that the guarded prod migrations skipped
-- on staging because the target table wasn't there.

DO $$ BEGIN
  ALTER TABLE public.po_line_items
    ADD CONSTRAINT po_line_items_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.po_version_lines
    ADD CONSTRAINT po_version_lines_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.receival_items
    ADD CONSTRAINT receival_items_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sale_delivery_lines
    ADD CONSTRAINT sale_delivery_lines_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.return_lines
    ADD CONSTRAINT return_lines_tool_asset_item_id_fkey
      FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
