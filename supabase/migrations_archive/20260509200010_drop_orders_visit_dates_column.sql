-- Drop the legacy visit_dates JSONB column from orders.
-- All data was backfilled into order_visit_dates in migration 20260509200000.
-- Safe to drop after smoke-testing the new normalized table.
ALTER TABLE orders DROP COLUMN IF EXISTS visit_dates;
