-- Customer consolidation — Stage 1: schema prep (additive, nullable, no behavior change).
-- Extends customer_addresses with the service-side-only fields so one address table can
-- hold everything, and adds a temporary bridge column linking service_customers -> customers
-- (filled in Stage 2). Backward-compatible: nothing reads these yet.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md

-- 1) customer_addresses gains the service-only fields (match service_customer_addresses types).
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS waze_link   text;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS is_geocoded boolean NOT NULL DEFAULT false;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS tags        text[]  NOT NULL DEFAULT '{}'::text[];

-- Flag already-coordinated sales addresses as geocoded (accurate initial state, not a behavior change).
UPDATE customer_addresses SET is_geocoded = true
 WHERE lat IS NOT NULL AND lng IS NOT NULL AND is_geocoded = false;

-- 2) Temporary bridge: service_customers -> customers (null until Stage 2 matches + fills it).
ALTER TABLE service_customers ADD COLUMN IF NOT EXISTS customer_id uuid
  REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_customers_customer_id ON service_customers(customer_id);
