-- supabase/migrations/20260420000001_po_versions.sql

-- Track current version number on every PO.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;

-- Frozen snapshot of every submitted PO version.
CREATE TABLE IF NOT EXISTS po_versions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  version_number       INT NOT NULL,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id          TEXT NOT NULL,
  supplier_name        TEXT NOT NULL,
  currency             TEXT NOT NULL,
  exchange_rate        NUMERIC NOT NULL,
  subtotal             NUMERIC NOT NULL,
  discount_amount      NUMERIC NOT NULL DEFAULT 0,
  discount_label       TEXT,
  payment_terms        TEXT,
  payment_terms_notes  TEXT,
  payment_milestones   JSONB,
  delivery_terms       TEXT,
  delivery_terms_notes TEXT,
  expected_delivery    DATE,
  vendor_notes         TEXT,
  line_items           JSONB NOT NULL,
  UNIQUE (po_id, version_number)
);

ALTER TABLE po_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage po_versions"
  ON po_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
