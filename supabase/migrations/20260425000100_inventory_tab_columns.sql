-- supabase/migrations/20260425000100_inventory_tab_columns.sql

-- inventory_categories
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- inventory_brand_variants
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point INT NOT NULL DEFAULT 0;
