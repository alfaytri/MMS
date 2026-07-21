-- Migration: Add tool_asset_item_id to receival_items
-- Completes the purchase chain: po_line_items → receival_items → return_lines
-- all now track which specific tool/asset was involved.

ALTER TABLE public.receival_items
  ADD COLUMN IF NOT EXISTS tool_asset_item_id uuid;

-- FK constraint — only add if the referenced table exists (staging DB may lack it)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tool_asset_items') THEN
    BEGIN
      ALTER TABLE public.receival_items
        ADD CONSTRAINT receival_items_tool_asset_item_id_fkey
          FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
