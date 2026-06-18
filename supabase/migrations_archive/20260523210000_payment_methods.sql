-- supabase/migrations/20260523210000_payment_methods.sql
-- Creates the payment_methods master-data table used across all payment dialogs.

CREATE TABLE IF NOT EXISTS payment_methods (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read payment_methods" ON payment_methods;
CREATE POLICY "Authenticated users can read payment_methods"
  ON payment_methods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert payment_methods" ON payment_methods;
CREATE POLICY "Authenticated users can insert payment_methods"
  ON payment_methods FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update payment_methods" ON payment_methods;
CREATE POLICY "Authenticated users can update payment_methods"
  ON payment_methods FOR UPDATE TO authenticated USING (true);

-- Seed with default methods
INSERT INTO payment_methods (name, slug, sort_order) VALUES
  ('Cash',            'cash',            1),
  ('Online Payment',  'online_payment',  2),
  ('Bank Transfer',   'bank_transfer',   3),
  ('PDC',             'pdc',             4),
  ('CDC',             'cdc',             5),
  ('POS',             'pos',             6),
  ('Pay Later',       'pay_later',       7)
ON CONFLICT (slug) DO NOTHING;
