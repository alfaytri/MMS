-- Customer consolidation — Stage 5.7 prep (non-destructive): drop the dual-write triggers and the
-- orphaned create_service_customer RPC now that nothing creates service_customers/satellites or
-- stamps service_customer_id (booking/CC/contracts all create + stamp on the customers side).
-- CASCADE drops the triggers that use each function. Also make contracts.service_customer_id
-- nullable (the contract insert now writes customer_id only; the column is dropped in the 5.7 drop).
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

DROP FUNCTION IF EXISTS public.scp_bridge_customer() CASCADE;          -- Trigger A (service_customer_phones -> customers bridge)
DROP FUNCTION IF EXISTS public.core_set_customer_from_sc() CASCADE;    -- Trigger B (orders/... customer_id from service_customer_id)
DROP FUNCTION IF EXISTS public.sca_mirror_customer_address() CASCADE;  -- Trigger C (service_customer_addresses -> customer_addresses)
DROP FUNCTION IF EXISTS public.create_service_customer(text, text, text) CASCADE;

ALTER TABLE public.contracts ALTER COLUMN service_customer_id DROP NOT NULL;

COMMIT;
