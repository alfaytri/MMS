-- Add entity_type column to customers table
-- Values: 'individual' | 'business'
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS entity_type text
    DEFAULT 'individual'
    CHECK (entity_type IN ('individual', 'business'));

-- Set all existing customers to 'individual'
UPDATE customers SET entity_type = 'individual' WHERE entity_type IS NULL;
