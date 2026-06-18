-- Add discount support to AP bills (invoices with direction = 'ap').
-- Existing bills get discount_amount = 0 via the column default — no backfill needed.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label  TEXT;
