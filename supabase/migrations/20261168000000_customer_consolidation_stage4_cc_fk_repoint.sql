-- Customer consolidation — Stage 4 cutover: re-point Contact Centre's two customer FKs
-- (chat_conversations.customer_id + customer_id_v2) from service_customers to the unified
-- customers table. Both columns are 100% NULL today (0 of ~16,901 conversations carry a
-- customer link), so this is a pure constraint swap — zero rows to migrate, nothing to
-- violate. Preserves ON DELETE SET NULL.
--
-- The CC CRM panel still resolves its customer BY PHONE against service_customers (unchanged);
-- only the stored conversation link moves to customers. App writes are bridged
-- service_customers.id -> customers.id in code (openConversation + WATI/WHAPI/3CX routes).
-- Reads no longer embed through these FK constraints (useLiveConversations / lookup-contact),
-- so this migration and the code deploy do not need a tight ordering window.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

-- Guard: confirm we are on the full-build DB, not a warehouse DB.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'detail_table'
  ) THEN
    RAISE EXCEPTION 'WRONG DB — invoices.detail_table missing; aborting CC FK re-point';
  END IF;
END $guard$;

-- Defensive: refuse if any conversation link is not already a valid customers.id
-- (expected 0 — both columns are NULL). This prevents a silent FK break if data drifted.
DO $check$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM public.chat_conversations cc
  WHERE (cc.customer_id    IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = cc.customer_id))
     OR (cc.customer_id_v2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = cc.customer_id_v2));
  IF bad > 0 THEN
    RAISE EXCEPTION 'Found % chat_conversations rows whose customer link is not a customers.id — bridge/backfill before re-point', bad;
  END IF;
END $check$;

ALTER TABLE public.chat_conversations DROP CONSTRAINT chat_conversations_customer_id_fkey;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.chat_conversations DROP CONSTRAINT chat_conversations_customer_id_v2_fkey;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_customer_id_v2_fkey
  FOREIGN KEY (customer_id_v2) REFERENCES public.customers(id) ON DELETE SET NULL;

COMMIT;
