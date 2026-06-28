-- Change payments.method and credit_notes.refund_method from payment_method enum to text.
-- The app now uses the payment_methods table (slug column) as the source of truth,
-- so the enum is too restrictive and rejects new slugs like "cdc".

-- 1. Convert payments.method from enum to text
ALTER TABLE payments
  ALTER COLUMN method TYPE text USING method::text;

-- 2. Convert credit_notes.refund_method from enum to text
ALTER TABLE credit_notes
  ALTER COLUMN refund_method TYPE text USING refund_method::text;

-- 3. Drop the enum since it is no longer referenced by any column
DROP TYPE IF EXISTS payment_method;
