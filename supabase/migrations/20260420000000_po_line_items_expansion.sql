-- Add missing columns to po_line_items (brand_variant_id, tool_asset_item_id, free_qty, brand_id)
-- and payment_milestones JSONB to purchase_orders.

ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS brand_variant_id UUID REFERENCES inventory_brand_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tool_asset_item_id UUID REFERENCES tool_asset_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brand_id UUID;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_milestones JSONB;
