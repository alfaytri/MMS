-- supabase/migrations/20260523220001_tl_invoices_fixes.sql
-- Fixup: add UNIQUE constraint to invoice_number and replace private updated_at
-- trigger function with the project-wide set_updated_at() function.

-- 1. Ensure invoice_number is unique (trigger generates unique values, but schema
--    should enforce it independently of trigger execution).
--    Guard: only add if the constraint does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tl_invoices_invoice_number_unique'
      AND conrelid = 'tl_invoices'::regclass
  ) THEN
    ALTER TABLE tl_invoices
      ADD CONSTRAINT tl_invoices_invoice_number_unique UNIQUE (invoice_number);
  END IF;
END;
$$;

-- 2. Drop the private trigger function and rewire the trigger to the shared function.
--    The trigger itself already existed — we just change which function it calls.
DROP TRIGGER IF EXISTS tl_invoices_set_updated_at ON tl_invoices;
CREATE TRIGGER tl_invoices_set_updated_at
  BEFORE UPDATE ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Drop the now-unused private function
DROP FUNCTION IF EXISTS set_tl_invoices_updated_at();
