-- Customer consolidation — Stage 5.7 DESTRUCTIVE DROP. IRREVERSIBLE.
-- Retires service_customers and its satellites. Run ONLY after the embed-removal code is
-- deployed to the eval (prep verified: zero views/functions/code read the service tables;
-- the only remaining references are the 6 FKs handled below). customer data lives entirely
-- on customers/customer_phones/customer_addresses; orders/site_visits/order_quotations are
-- dual-keyed and keep working on customer_id.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

-- 1. Re-point the two EMPTY phone FKs (0 rows) from service_customer_phones to customer_phones,
--    preserving each original ON DELETE rule.
ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_phone_id_fkey;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_phone_id_fkey
  FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id) ON DELETE SET NULL;

ALTER TABLE public.contracts DROP CONSTRAINT contracts_phone_id_fkey;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_phone_id_fkey
  FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id);

-- 2. Drop the retired service_customer_id columns (removes their FKs to service_customers).
--    orders/site_visits/order_quotations/contracts all carry the unified customer_id.
ALTER TABLE public.orders           DROP COLUMN service_customer_id;
ALTER TABLE public.site_visits      DROP COLUMN service_customer_id;
ALTER TABLE public.order_quotations DROP COLUMN service_customer_id;
ALTER TABLE public.contracts        DROP COLUMN service_customer_id;

-- 3. Drop the service tables, child-first.
DROP TABLE public.service_customer_addresses;
DROP TABLE public.service_customer_phones;
DROP TABLE public.service_customers;

COMMIT;
