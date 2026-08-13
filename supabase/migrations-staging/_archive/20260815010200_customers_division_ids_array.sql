-- Replace `customers.division_id uuid` with `customers.division_ids uuid[]`.
--
-- Motivation: the single-division-plus-NULL-for-global model doesn't fit
-- how the business actually works — a customer can legitimately live in
-- more than one division (e.g. same client billed by both AFM and AFK),
-- and "Global" was a papered-over workaround for that. Every customer now
-- must belong to at least one division; the "Global" concept is retired.
--
-- Backfill rules:
--   • customer.division_id IS NOT NULL → division_ids = ARRAY[division_id]
--   • customer.division_id IS NULL (was global) → division_ids = every
--     currently-active division. Preserves the previous "visible everywhere"
--     behaviour for those rows without inventing new access.
--
-- After this migration:
--   • Column `customers.division_id` is dropped.
--   • RLS on customers uses `is_any_division_visible(division_ids)` — the
--     caller sees a customer iff ANY of its divisions overlaps with the
--     caller's accessible divisions (owner/accountant always see all).
--   • A CHECK constraint enforces at-least-one division per customer.

BEGIN;

-- ── 1. New column ──────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS division_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS customers_division_ids_gin
  ON public.customers USING GIN (division_ids);

-- ── 2. Backfill ────────────────────────────────────────────────────
-- 2a. Customers with a scoped division_id → single-element array.
UPDATE public.customers
   SET division_ids = ARRAY[division_id]
 WHERE division_id IS NOT NULL
   AND (division_ids IS NULL OR array_length(division_ids, 1) IS NULL);

-- 2b. Customers previously "global" (division_id IS NULL) → array of all
-- currently-active divisions. Empty result would leave the row unusable
-- (fails the CHECK below); guard against that.
UPDATE public.customers c
   SET division_ids = divs.ids
  FROM (
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) AS ids
      FROM public.company_divisions
     WHERE is_active = true
  ) divs
 WHERE c.division_id IS NULL
   AND (c.division_ids IS NULL OR array_length(c.division_ids, 1) IS NULL);

-- Refuse to proceed if any row would violate the new CHECK. If this fires,
-- there were legacy "global" customers created before company_divisions
-- had any active rows — those need manual intervention.
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.customers
   WHERE division_ids IS NULL
      OR array_length(division_ids, 1) IS NULL;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce non-empty division_ids: % customer(s) still have no division. '
      'Backfill them manually before re-running this migration.', v_bad;
  END IF;
END $guard$;

-- ── 3. Array-aware visibility helper ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_any_division_visible(p_division_ids uuid[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR (
      p_division_ids IS NOT NULL
      AND array_length(p_division_ids, 1) > 0
      AND p_division_ids && ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    );
$$;

REVOKE ALL ON FUNCTION public.is_any_division_visible(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_any_division_visible(uuid[]) TO authenticated, service_role;

-- ── 4. Swap RLS policies ───────────────────────────────────────────
DROP POLICY IF EXISTS division_scope_select_r ON public.customers;
DROP POLICY IF EXISTS division_scope_insert_r ON public.customers;
DROP POLICY IF EXISTS division_scope_update_r ON public.customers;
DROP POLICY IF EXISTS division_scope_delete_r ON public.customers;

CREATE POLICY division_scope_select_r ON public.customers
  AS RESTRICTIVE FOR SELECT
  USING (public.is_any_division_visible(division_ids));

CREATE POLICY division_scope_insert_r ON public.customers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_any_division_visible(division_ids));

CREATE POLICY division_scope_update_r ON public.customers
  AS RESTRICTIVE FOR UPDATE
  USING      (public.is_any_division_visible(division_ids))
  WITH CHECK (public.is_any_division_visible(division_ids));

CREATE POLICY division_scope_delete_r ON public.customers
  AS RESTRICTIVE FOR DELETE
  USING (public.is_any_division_visible(division_ids));

-- ── 5. Drop legacy column + its index ──────────────────────────────
DROP INDEX IF EXISTS customers_division_id_idx;
ALTER TABLE public.customers DROP COLUMN IF EXISTS division_id;

-- ── 6. Enforce non-empty at the DB level ───────────────────────────
ALTER TABLE public.customers
  ADD CONSTRAINT customers_division_ids_non_empty
  CHECK (array_length(division_ids, 1) >= 1);

COMMENT ON COLUMN public.customers.division_ids IS
'Array of divisions this customer belongs to. Must be non-empty. Replaces the
old scalar `division_id` (with NULL meaning "global") — every customer is now
explicitly scoped to at least one division.';

COMMIT;

NOTIFY pgrst, 'reload schema';
