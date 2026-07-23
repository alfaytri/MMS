-- Migration: Add tool_asset_item_id to sale_delivery_lines and return_lines
-- Reviewer feedback: "sale_order_lines has brand_variant_id AND tool_asset_item_id,
--   but delivery/return lines only have brand_variant_id"

-- sale_delivery_lines: add tool_asset_item_id
ALTER TABLE public.sale_delivery_lines
  ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;

-- return_lines: add tool_asset_item_id
ALTER TABLE public.return_lines
  ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;

-- FK constraints — only add if the referenced table exists (staging DBs may lack it)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tool_asset_items') THEN
    BEGIN
      ALTER TABLE public.sale_delivery_lines
        ADD CONSTRAINT sale_delivery_lines_tool_asset_item_id_fkey
          FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.return_lines
        ADD CONSTRAINT return_lines_tool_asset_item_id_fkey
          FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
