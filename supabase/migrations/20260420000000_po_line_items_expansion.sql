-- Extend purchase_orders with all missing columns referenced by the app layer.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms        TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_notes  TEXT,
  ADD COLUMN IF NOT EXISTS payment_milestones   JSONB,
  ADD COLUMN IF NOT EXISTS delivery_terms       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS vendor_notes         TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label       TEXT,
  ADD COLUMN IF NOT EXISTS created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at           TIMESTAMPTZ;

-- Extend po_line_items with all missing columns referenced by the app layer.
ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS brand_variant_id   UUID REFERENCES inventory_brand_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tool_asset_item_id UUID REFERENCES tool_asset_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_qty           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brand_id           UUID;

-- Enable RLS and grant full access to authenticated users (matches project-wide pattern).
ALTER TABLE purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_approvals     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage purchase_orders"
  ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Internal users can manage po_line_items"
  ON po_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Internal users can manage po_approvals"
  ON po_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
