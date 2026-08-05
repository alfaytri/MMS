-- Enum Conversion Pass 3 pilot D: payments.source_type
--
-- Converts payments.source_type from unconstrained nullable text to a
-- nullable native enum. Every write path in the app + triggers already
-- emits one of {sale_order, purchase_order, invoice, bill}; this migration
-- brings the DB type into sync so accidental typos are caught by Postgres.
--
-- Nullability is preserved — some payment rows legitimately have a
-- NULL source_type (legacy rows before the source_type/source_id columns
-- existed).
--
-- Column has no CHECK constraint, no partial indexes with text-literal
-- predicates, and no DEFAULT to worry about. Triggers that assign
-- 'invoice'::text via `NEW.source_type := 'invoice'` continue to work
-- via PL/pgSQL's implicit text→enum cast.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight: every non-NULL value must fit the target enum set
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT source_type, ', ') INTO bad
  FROM public.payments
  WHERE source_type IS NOT NULL
    AND source_type NOT IN ('sale_order', 'purchase_order', 'invoice', 'bill');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'payments.source_type has unexpected values: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create enum + retype column
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.payment_source_type AS ENUM ('sale_order', 'purchase_order', 'invoice', 'bill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ALTER COLUMN source_type TYPE public.payment_source_type USING source_type::public.payment_source_type;

COMMIT;
