-- Add 'customer-unavailable' to the order_status enum so team leaders
-- can escalate order visits the same way they do site visits.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'customer-unavailable';

-- Add completion tracking columns to orders (matching site_visits)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;
