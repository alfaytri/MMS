-- Re-introduce per-division scoping on suppliers, as a VISIBILITY filter.
--
-- History: division_id was added to suppliers in 20260806270000, then dropped
-- in 20260815010500 ("parties are org-wide"). The owner now wants suppliers to
-- support two kinds:
--   • Global   (division_id IS NULL) — visible to every division   [DEFAULT]
--   • Specific (division_id = <div>) — visible only to that division
--
-- This is enforced as a CLIENT-SIDE visibility filter (useSuppliers narrows the
-- list by the active view set), NOT as RLS — so a PO/bill in another division
-- that references a now-scoped supplier still resolves the supplier name. We do
-- NOT re-add the division_scope_* RLS policies that the drop migration removed.
--
-- Existing suppliers all get division_id = NULL → global. No backfill needed.
-- ON DELETE SET NULL: deleting a division makes its suppliers global rather than
-- blocking the delete.

BEGIN;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS division_id uuid
    REFERENCES public.company_divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS suppliers_division_id_idx
  ON public.suppliers(division_id)
  WHERE division_id IS NOT NULL;

COMMENT ON COLUMN public.suppliers.division_id IS
  'NULL = global (visible to every division). Non-null = visible only to that division. Enforced as a client-side visibility filter, not RLS.';

COMMIT;

NOTIFY pgrst, 'reload schema';
