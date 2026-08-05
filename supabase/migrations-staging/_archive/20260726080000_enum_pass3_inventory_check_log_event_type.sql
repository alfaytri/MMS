-- Enum Conversion Pass 3 pilot C: inventory_check_log.event_type
--
-- Retypes inventory_check_log.event_type from unconstrained NOT NULL text
-- to a native enum. All 6 writer sites in useWarehouseOperations and both
-- readers (EventIcon + eventLabel in WhInventoryCheckDetail.tsx) agree on
-- the same vocabulary:
--   initialized       — check just started
--   user_completed    — one counter finished their assignment
--   all_counted       — every counter done, moved to approval
--   approval_action   — approver clicked approve/reject on a step
--   approved          — chain finalised as approved
--   rejected          — chain finalised as rejected
--
-- No vocabulary redesign needed — the spec's alternative names
-- (started/assignment_completed/item_counted/submitted) are not in code.
--
-- Column has no CHECK, no partial indexes, and no DEFAULT.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT event_type, ', ') INTO bad
  FROM public.inventory_check_log
  WHERE event_type NOT IN (
    'initialized', 'user_completed', 'all_counted',
    'approval_action', 'approved', 'rejected'
  );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_check_log.event_type has unexpected values: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create enum + retype column
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.inventory_check_event_type AS ENUM (
    'initialized', 'user_completed', 'all_counted',
    'approval_action', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inventory_check_log
  ALTER COLUMN event_type TYPE public.inventory_check_event_type
  USING event_type::public.inventory_check_event_type;

COMMIT;
