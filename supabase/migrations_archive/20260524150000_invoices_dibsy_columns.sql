-- Add Dibsy payment link columns to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dibsy_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS dibsy_checkout_url TEXT;
