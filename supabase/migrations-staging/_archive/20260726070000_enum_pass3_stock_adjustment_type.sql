-- Enum Conversion Pass 3 pilot B: stock_adjustments.adjustment_type
--
-- Retypes stock_adjustments.adjustment_type from unconstrained NOT NULL text
-- to a native enum. Writers (CreateAdjustmentPayload, CreateAdjustmentV2Payload
-- in useWarehouseOperations) already emit one of:
--   increase, decrease, set, damage, write_off
-- and a baseline PL/pgSQL branch already checks
--   IF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
-- so those values are well-established.
--
-- Column has no CHECK, no partial indexes, and no DEFAULT — retype is a
-- single ALTER after a pre-flight guard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT adjustment_type, ', ') INTO bad
  FROM public.stock_adjustments
  WHERE adjustment_type NOT IN ('increase', 'decrease', 'set', 'damage', 'write_off');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'stock_adjustments.adjustment_type has unexpected values: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create enum + retype column
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.stock_adjustment_type AS ENUM (
    'increase', 'decrease', 'set', 'damage', 'write_off'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stock_adjustments
  ALTER COLUMN adjustment_type TYPE public.stock_adjustment_type
  USING adjustment_type::public.stock_adjustment_type;

COMMIT;
