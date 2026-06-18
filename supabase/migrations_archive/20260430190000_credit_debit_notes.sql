-- supabase/migrations/20260430190000_credit_debit_notes.sql

-- 1. Make invoice_id and customer_name nullable (debit notes have neither)
ALTER TABLE credit_notes
  ALTER COLUMN invoice_id   DROP NOT NULL,
  ALTER COLUMN customer_name DROP NOT NULL;

-- 2. Add new columns
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS note_type         TEXT    NOT NULL DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS source_return_id  UUID    REFERENCES returns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name     TEXT,
  ADD COLUMN IF NOT EXISTS original_total    NUMERIC,
  ADD COLUMN IF NOT EXISTS new_total         NUMERIC;

-- 3. Backfill existing rows
UPDATE credit_notes SET note_type = 'credit' WHERE note_type IS NULL;

-- 4. Index for the type switcher query
CREATE INDEX IF NOT EXISTS idx_credit_notes_type ON credit_notes(note_type);
