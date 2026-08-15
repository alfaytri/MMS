-- 20260826000000_inventory_categories_tool_tracking_mode.sql
-- Per-category tool tracking mode. Meaningful ONLY when type='tools':
--   serialized = one tool_asset_units row per physical unit (current behavior)
--   bulk       = full qty machinery (variants/FIFO/pools) like a consumable
-- Default 'serialized' => zero behavior change for every existing tool category.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_tracking_mode') THEN
    CREATE TYPE public.tool_tracking_mode AS ENUM ('serialized', 'bulk');
  END IF;
END $$;

ALTER TABLE public.inventory_categories
  ADD COLUMN IF NOT EXISTS tool_tracking_mode public.tool_tracking_mode NOT NULL DEFAULT 'serialized';

COMMENT ON COLUMN public.inventory_categories.tool_tracking_mode IS
  'Meaningful only when type=''tools''. serialized => tool_asset_units per unit; bulk => qty/FIFO/pools like consumables. Ignored for products/spare-parts/consumables.';

NOTIFY pgrst, 'reload schema';
COMMIT;
