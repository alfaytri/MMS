-- supabase/migrations/20260428000005_customer_type_invoice_type.sql
-- Adds strict customer_type values (cash|credit) and invoice_type to invoices.
-- CRITICAL: backfill happens BEFORE the constraint so no rows are rejected.

BEGIN;

-- 1a. Backfill credit customers (have a credit group).
UPDATE customers
SET    customer_type = 'credit'
WHERE  credit_group_id IS NOT NULL
  AND  (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- 1b. Backfill cash customers (no credit group).
UPDATE customers
SET    customer_type = 'cash'
WHERE  credit_group_id IS NULL
  AND  (customer_type IS NULL OR customer_type NOT IN ('cash', 'credit'));

-- 2. Add CHECK constraint. NULL explicitly allowed so any legacy code path
--    that omits customer_type on INSERT doesn't crash (app treats NULL as credit).
ALTER TABLE customers
  ADD CONSTRAINT customers_type_check
  CHECK (customer_type IN ('cash', 'credit') OR customer_type IS NULL);

-- 3. Add invoice_type to invoices (NOT NULL, default credit so existing rows are valid).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'credit'
  CHECK (invoice_type IN ('cash', 'credit'));

-- 4. Backfill existing AR invoices from their linked customer.
--    COALESCE handles any customer still NULL → treat as credit.
UPDATE invoices i
SET    invoice_type = COALESCE(c.customer_type, 'credit')
FROM   customers c
WHERE  i.customer_id = c.id
  AND  i.direction   = 'ar';

COMMIT;
