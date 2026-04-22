-- supabase/migrations/20260422000002_extend_payments_activity_log.sql
-- Extends the payments and activity_log tables so the PO module can use them.
-- Also fixes the purchase_orders.created_by FK (was wrongly referencing auth.users
-- instead of profiles).

-- ── 1. payments ───────────────────────────────────────────────────────────────
-- The original payments table was designed for field-service invoices and has
-- payment_id (NOT NULL UNIQUE) and invoice_id (NOT NULL). Neither applies to
-- PO or Sale-Order payments, so we relax both constraints and add the generic
-- source-tracking columns the app layer already expects.

ALTER TABLE payments
  ALTER COLUMN invoice_id  DROP NOT NULL,
  ALTER COLUMN payment_id  DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_type    TEXT,
  ADD COLUMN IF NOT EXISTS source_id      UUID,
  ADD COLUMN IF NOT EXISTS supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_qar     NUMERIC,
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_source ON payments(source_type, source_id);

-- ── 2. activity_log ───────────────────────────────────────────────────────────
-- The original activity_log had only action/details/entity_type/entity_id.
-- The app layer uses module, severity, performer_name, old_data, new_data,
-- ip_address for the purchase-orders audit trail.

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS module         TEXT,
  ADD COLUMN IF NOT EXISTS severity       TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS performer_name TEXT,
  ADD COLUMN IF NOT EXISTS old_data       JSONB,
  ADD COLUMN IF NOT EXISTS new_data       JSONB,
  ADD COLUMN IF NOT EXISTS ip_address     TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);

-- ── 3. purchase_orders.created_by — fix FK target ─────────────────────────────
-- Migration 20260420000000 added created_by referencing auth.users(id), but
-- the app layer stores profiles.id there (a different UUID namespace).
-- Drop the old FK and add a correct one targeting profiles.

DO $$ BEGIN
  ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_created_by_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_created_by_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
