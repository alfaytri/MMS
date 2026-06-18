-- supabase/migrations/20260509120000_customer_phones_addresses.sql

CREATE TABLE customer_phones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone        varchar(20) NOT NULL,
  label        varchar(50),
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_phones_phone_unique UNIQUE (phone)
);

CREATE INDEX idx_customer_phones_customer ON customer_phones(customer_id);
CREATE INDEX idx_customer_phones_phone    ON customer_phones(phone);

-- Add phone_id column to customer_addresses to link addresses to phone numbers
ALTER TABLE customer_addresses
ADD COLUMN phone_id uuid REFERENCES customer_phones(id) ON DELETE CASCADE;

CREATE INDEX idx_customer_addresses_phone ON customer_addresses(phone_id);
