-- supabase/migrations/20260524010000_payment_methods_link_flag.sql
-- Adds requires_payment_link flag to payment_methods to distinguish online payment
-- methods (which create a Dibsy link) from manual-collect methods (PDC, POS, etc.)
-- Also adds UNIQUE constraint on tl_invoices.visit_id to prevent duplicate invoices.

-- ── payment_methods: requires_payment_link column ────────────────────────────
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS requires_payment_link boolean NOT NULL DEFAULT false;

-- Only "Online Payment" creates a Dibsy link
UPDATE payment_methods
  SET requires_payment_link = true
  WHERE slug = 'online_payment';

-- ── tl_invoices: unique visit (prevent duplicate invoices) ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tl_invoices_visit_id_unique'
      AND conrelid = 'tl_invoices'::regclass
  ) THEN
    ALTER TABLE tl_invoices
      ADD CONSTRAINT tl_invoices_visit_id_unique UNIQUE (visit_id);
  END IF;
END;
$$;
