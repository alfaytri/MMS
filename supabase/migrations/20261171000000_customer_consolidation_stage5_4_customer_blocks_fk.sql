-- Customer consolidation — Stage 5.4: re-point customer_blocks.customer_id FK from
-- service_customers to the unified customers (ON DELETE CASCADE preserved). The CC block
-- flow (useCustomerData.blockCustomer) now writes a customers.id, so this must move with it.
-- customer_blocks is empty (0 rows) → zero-risk constraint swap.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

-- Defensive: refuse if any customer_blocks row isn't already a customers.id (expect 0 rows).
DO $check$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.customer_blocks cb
   WHERE cb.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = cb.customer_id);
  IF bad > 0 THEN
    RAISE EXCEPTION 'customer_blocks has % rows not keyed to customers.id — backfill before re-point', bad;
  END IF;
END $check$;

ALTER TABLE public.customer_blocks DROP CONSTRAINT customer_blocks_customer_id_fkey;
ALTER TABLE public.customer_blocks ADD CONSTRAINT customer_blocks_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

COMMIT;
