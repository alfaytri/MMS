-- Customer consolidation — Stage 5.1: DB foundation for retiring service_customers.
-- Additive, zero behavior change: add customers.is_blocked for the unified block model.
-- The CC panel's block flow + the customer_blocks FK re-point ride with 5.4 (the panel
-- id-flip), because blockCustomer still writes a service id until then.
-- No data to migrate (all service_customers.is_blocked = false).
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- Carry any existing service-side block state across the bridge (currently none).
UPDATE public.customers c
   SET is_blocked = true
  FROM public.service_customers sc
 WHERE sc.customer_id = c.id AND sc.is_blocked = true;

COMMIT;
