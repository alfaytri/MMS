-- Multi-division PO (Phase 1) — array-aware visibility on purchase_orders.
--
-- A PO can now belong to several divisions (purchase_orders.division_ids). It
-- must be visible to a viewer of ANY of those divisions. We repoint the 4
-- division_scope_* policies to check the set.
--
-- CASE (not a bare OR): when the PO has a division set, visibility is decided
-- ONLY by the set; the header division_id is used solely as the legacy fallback
-- for old rows that have no set (division_ids = '{}'). This preserves the old
-- "NULL header = visible to all" behavior for legacy rows WITHOUT letting a new
-- multi-division PO leak globally if its header were ever NULL.

BEGIN;

-- Re-add the array visibility helper (dropped in 20260815010500).
CREATE OR REPLACE FUNCTION public.is_any_division_visible(p_division_ids uuid[])
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_division_ids, '{}'::uuid[])) AS d(id)
    WHERE public.is_division_visible(d.id)
  );
$fn$;

DROP POLICY IF EXISTS division_scope_select ON public.purchase_orders;
CREATE POLICY division_scope_select ON public.purchase_orders FOR SELECT
  USING (
    CASE WHEN cardinality(division_ids) > 0
         THEN is_any_division_visible(division_ids)
         ELSE is_division_visible(division_id)
    END
  );

DROP POLICY IF EXISTS division_scope_update ON public.purchase_orders;
CREATE POLICY division_scope_update ON public.purchase_orders FOR UPDATE
  USING (
    CASE WHEN cardinality(division_ids) > 0
         THEN is_any_division_visible(division_ids)
         ELSE is_division_visible(division_id)
    END
  )
  WITH CHECK (
    CASE WHEN cardinality(division_ids) > 0
         THEN is_any_division_visible(division_ids)
         ELSE is_division_visible(division_id)
    END
  );

DROP POLICY IF EXISTS division_scope_delete ON public.purchase_orders;
CREATE POLICY division_scope_delete ON public.purchase_orders FOR DELETE
  USING (
    CASE WHEN cardinality(division_ids) > 0
         THEN is_any_division_visible(division_ids)
         ELSE is_division_visible(division_id)
    END
  );

DROP POLICY IF EXISTS division_scope_insert ON public.purchase_orders;
CREATE POLICY division_scope_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (
    CASE WHEN cardinality(division_ids) > 0
         THEN is_any_division_visible(division_ids)
         ELSE is_division_visible(division_id)
    END
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
