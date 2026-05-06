-- supabase/migrations/20260506090000_add_dibsy_payment_fields.sql
-- Adds Dibsy payment tracking fields to customer_subscriptions

ALTER TABLE customer_subscriptions
  ADD COLUMN IF NOT EXISTS dibsy_payment_id   text,
  ADD COLUMN IF NOT EXISTS dibsy_checkout_url text;

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_dibsy_payment_id
  ON customer_subscriptions (dibsy_payment_id)
  WHERE dibsy_payment_id IS NOT NULL;
