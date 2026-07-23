-- Roll back 20260723180000_drop_tool_asset_items_and_columns.sql.
--
-- Reason: the drop broke the master-data Tools & Assets UI + Team tool
-- assignment feature, which still use useToolAssetItems / useToolAssetUnits
-- hooks. Migrating those features to inventory_items / inventory_brand_variants
-- is out of scope for the current tools→inventory merge plan.
--
-- Restores:
--   • tool_asset_items table (empty — staging had zero rows)
--   • tool_asset_units table (empty — never restored after 2026-07-13 drop)
--   • six tool_asset_item_id columns on the purchase chain + their FKs
--
-- Idempotent — every step uses IF NOT EXISTS / duplicate_object guards.

BEGIN;

-- 1. Recreate tool_asset_items (same shape as 20260722160000_restore).
CREATE TABLE IF NOT EXISTS public.tool_asset_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  name_en     text NOT NULL,
  name_ar     text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.tool_asset_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage tool_asset_items"
    ON public.tool_asset_items TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Recreate tool_asset_units (used by team↔tool assignments).
CREATE TABLE IF NOT EXISTS public.tool_asset_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid REFERENCES public.tool_asset_items(id) ON DELETE CASCADE,
  serial_number text,
  brand         text,
  condition     text DEFAULT 'Good',
  status        text DEFAULT 'available',
  expiry        date,
  assigned_to   uuid,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.tool_asset_units ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage tool_asset_units"
    ON public.tool_asset_units TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Re-add the six tool_asset_item_id columns to the purchase chain.
ALTER TABLE public.po_line_items       ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;
ALTER TABLE public.po_version_lines    ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;
ALTER TABLE public.receival_items      ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;
ALTER TABLE public.return_lines        ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;
ALTER TABLE public.sale_order_lines    ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;
ALTER TABLE public.sale_delivery_lines ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;

-- 4. Re-add the FKs (guarded — duplicate_object if a prior migration already
--    re-created them on this DB).
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
  ALTER TABLE public.return_lines
    ADD CONSTRAINT return_lines_tool_asset_item_id_fkey
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

COMMIT;
