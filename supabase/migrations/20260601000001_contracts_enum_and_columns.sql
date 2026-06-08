-- Migration 1: Contract module — enums, columns, sequences, RPCs
-- Spec refs: §2.1, §2.2, Amendment 5, Amendment 8, Issue Fix 1

-- ——— 1. EXPAND contract_status ENUM ———
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'manager_review';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'customer_pending';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'expired';

-- ——— 2. NEW COLUMNS ON contracts TABLE ———
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quotation_number TEXT UNIQUE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS building_tree JSONB NOT NULL DEFAULT '{"nodes":[]}';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_doc_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
-- Amendment 5: session-scoped conflict resolution
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS last_saved_session TEXT;

-- ——— 3. UNIQUE CONSTRAINT ON contract_id (Issue Fix 1) ———
-- The initial schema already created contract_id TEXT NOT NULL UNIQUE (unnamed constraint).
-- Only add the named constraint if no unique constraint on contract_id exists yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'contracts'
      AND c.contype = 'u'
      AND a.attname = 'contract_id'
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_contract_id_unique UNIQUE (contract_id);
  END IF;
END;
$$;

-- ——— 4. SEQUENCES FOR ATOMIC ID GENERATION (Issue Fix 1) ———
CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS contract_id_seq START 1;

-- ——— 5. ATOMIC RPC: generate_quotation_number (Issue Fix 1) ———
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(quotation_number, '-', 4) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE quotation_number LIKE 'CTR-Q-' || current_year || '-%';

  PERFORM setval('quotation_number_seq',
    GREATEST(existing_max + 1, nextval('quotation_number_seq')), false);
  next_seq := nextval('quotation_number_seq');

  RETURN 'CTR-Q-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$$;

-- ——— 6. ATOMIC RPC: generate_contract_id (Issue Fix 1) ———
CREATE OR REPLACE FUNCTION generate_contract_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(contract_id, '-', 3) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE contract_id LIKE 'CTR-' || current_year || '-%'
    AND contract_id NOT LIKE 'CTR-Q-%';

  PERFORM setval('contract_id_seq',
    GREATEST(existing_max + 1, nextval('contract_id_seq')), false);
  next_seq := nextval('contract_id_seq');

  RETURN 'CTR-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$$;
