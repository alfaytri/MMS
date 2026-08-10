-- Warehouse Origin Visibility follow-up — allow cancelling an inventory check.
--
-- The "Cancel Check" action sets inventory_checks.status = 'cancelled', but the
-- live CHECK constraint inventory_checks_status_check (last set by
-- 20260715232000) enumerates only:
--   draft · in_progress · submitted · reviewed · pending_approval ·
--   approved · rejected · completed
-- so the UPDATE aborts with SQLSTATE 23514. Re-create the constraint with
-- 'cancelled' appended. DROP + ADD is safe: every existing row already
-- satisfies the old 8-value set, which is a strict subset of the new 9-value
-- set, so the ADD cannot fail on legacy data.

ALTER TABLE public.inventory_checks
  DROP CONSTRAINT IF EXISTS inventory_checks_status_check;

ALTER TABLE public.inventory_checks
  ADD CONSTRAINT inventory_checks_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'in_progress'::text,
      'submitted'::text,
      'reviewed'::text,
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text,
      'completed'::text,
      'cancelled'::text
    ]));
