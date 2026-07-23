-- Schema cleanup pass on the deploy branch:
--   1. Drop company_divisions.calendar_schedule_id — its target
--      (public.schedules) was dropped in 20260724000000, so the FK
--      already CASCADEd but the column itself lingered.
--   2. Trim return_source_type enum: remove 'order', which backed the
--      now-deleted Customer Orders module. Any orphan returns rows are
--      deleted first (their source_id pointed at a dropped table).
--   3. Rename warehouse_field_rps -> warehouse_responsible_persons for
--      clarity ("field RP" was jargon left over from a previous project).
--      RPC replace_warehouse_field_rps renamed to match.
--
-- No .from()/.rpc() reference in application code will be left dangling
-- after the companion code changes on this same branch.

BEGIN;

-- ── 1. Drop calendar_schedule_id column ───────────────────────────────
ALTER TABLE public.company_divisions
  DROP COLUMN IF EXISTS calendar_schedule_id;

-- ── 2. Trim return_source_type enum ───────────────────────────────────
-- Postgres can't DROP VALUE from an enum, so recreate + swap.
-- First, purge any dead 'order' rows (source_id points at the deleted
-- Customer Orders table so they are unusable regardless).
DELETE FROM public.returns WHERE source_type::text = 'order';

ALTER TYPE public.return_source_type RENAME TO return_source_type_old;
CREATE TYPE public.return_source_type AS ENUM ('sale_order', 'purchase_order');

ALTER TABLE public.returns
  ALTER COLUMN source_type TYPE public.return_source_type
  USING source_type::text::public.return_source_type;

DROP TYPE public.return_source_type_old;

-- ── 3. Rename warehouse_field_rps -> warehouse_responsible_persons ────
ALTER TABLE IF EXISTS public.warehouse_field_rps
  RENAME TO warehouse_responsible_persons;

-- Constraint + index renames follow the table rename convention.
DO $$ BEGIN
  ALTER TABLE public.warehouse_responsible_persons
    RENAME CONSTRAINT warehouse_field_rps_pkey TO warehouse_responsible_persons_pkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.warehouse_responsible_persons
    RENAME CONSTRAINT warehouse_field_rps_warehouse_id_fkey TO warehouse_responsible_persons_warehouse_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.warehouse_responsible_persons
    RENAME CONSTRAINT warehouse_field_rps_profile_id_fkey TO warehouse_responsible_persons_profile_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Rename the RPC that writes to this table so its name matches too.
DO $$
DECLARE
  fn_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO fn_sig
    FROM pg_proc p
   WHERE p.proname = 'replace_warehouse_field_rps'
     AND p.pronamespace = 'public'::regnamespace
   LIMIT 1;
  IF fn_sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s RENAME TO replace_warehouse_responsible_persons', fn_sig);
  END IF;
END $$;

COMMIT;
