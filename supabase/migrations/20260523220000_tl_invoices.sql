-- supabase/migrations/20260523220000_tl_invoices.sql
-- Creates tl_invoices: team-leader field invoices, separate from the AR/AP invoices table.

-- ── Sequence for invoice numbers ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS tl_invoice_seq START 1;

-- ── Table ─────────────────────────────────────────────────────────────────────
-- NOTE: visit_id is intentionally NOT a FK because TL visits are a logical concept
-- unified across order_team_assignments, contract_visits, and site_visit_team_assignments.
-- The visit_id stores the source assignment row UUID (from the get_team_leader_visits RPC).
CREATE TABLE IF NOT EXISTS tl_invoices (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number     text        NOT NULL UNIQUE,
  visit_id           uuid        NOT NULL,
  order_id           text,
  customer_name      text        NOT NULL,
  customer_phone     text,
  items              jsonb       NOT NULL DEFAULT '[]',
  subtotal           numeric     NOT NULL DEFAULT 0,
  discount_amount    numeric     NOT NULL DEFAULT 0,
  total_amount       numeric     NOT NULL DEFAULT 0,
  payment_method_id  uuid        REFERENCES payment_methods(id),
  payment_status     text        NOT NULL DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid', 'paid')),
  dibsy_payment_id   text,
  dibsy_checkout_url text,
  notes              text,
  created_by         uuid        REFERENCES profiles(id),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- ── Auto-generate invoice_number before insert ────────────────────────────────
CREATE OR REPLACE FUNCTION generate_tl_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.invoice_number := 'TL-' ||
    EXTRACT(YEAR FROM now())::text || '-' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tl_invoice_number_trigger ON tl_invoices;
CREATE TRIGGER tl_invoice_number_trigger
  BEFORE INSERT ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_tl_invoice_number();

-- ── updated_at trigger (uses project-wide set_updated_at function) ────────────
DROP TRIGGER IF EXISTS tl_invoices_set_updated_at ON tl_invoices;
CREATE TRIGGER tl_invoices_set_updated_at
  BEFORE UPDATE ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tl_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read tl_invoices" ON tl_invoices;
CREATE POLICY "Authenticated users can read tl_invoices"
  ON tl_invoices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert tl_invoices" ON tl_invoices;
CREATE POLICY "Authenticated users can insert tl_invoices"
  ON tl_invoices FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update tl_invoices" ON tl_invoices;
CREATE POLICY "Authenticated users can update tl_invoices"
  ON tl_invoices FOR UPDATE TO authenticated USING (true);
