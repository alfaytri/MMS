-- =============================================================================
-- Warehouse Model v2 — Phase C.3 hotfix #2
--
-- Two more bugs surfaced in Phase D.1 smoke testing:
--
--   3. `sub_container_scope_select_r` on warehouse_sub_containers hits the
--      same self-lookup pathology as the INSERT policy: the SELECT gate calls
--      `is_sub_container_visible(id)` which does `SELECT ... FROM
--      warehouse_sub_containers WHERE id = p_sub_container_id`. During
--      `.insert().select()` RETURNING evaluation, the just-inserted row is
--      not reliably visible through a helper's back-referencing SELECT, so
--      the RETURNING fails with "new row violates row-level security policy".
--      Fix: inline the check on the row's own division_id + warehouse_id,
--      matching the INSERT/UPDATE policies rewritten in hotfix #1.
--
--   4. CHECK constraint `warehouses_division_required_unless_virtual` (from
--      20260802000350) still forces `is_virtual OR division_id IS NOT NULL`.
--      Phase D.1's warehouse form no longer sends division_id (divisions are
--      managed per sub-container now), so every non-virtual warehouse insert
--      trips the CHECK. This constraint's death was scheduled for Phase E
--      alongside dropping warehouses.division_id, but D.1 needs it gone now.
--      Drop the CHECK; leave the column itself in place — Phase E removes it.
-- =============================================================================

-- ── 1. warehouse_sub_containers SELECT — inline check ─────────────────────
DROP POLICY IF EXISTS sub_container_scope_select_r ON public.warehouse_sub_containers;

CREATE POLICY sub_container_scope_select_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR SELECT
  USING (
    public.is_division_visible(division_id)
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_responsible_persons rp
       WHERE rp.warehouse_id = warehouse_sub_containers.warehouse_id
         AND rp.profile_id   = public._current_user_data_id()
    )
  );

-- ── 2. warehouse_sub_containers DELETE — same inline pattern for symmetry ─
DROP POLICY IF EXISTS sub_container_scope_delete_r ON public.warehouse_sub_containers;

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR DELETE
  USING (
    public.is_division_visible(division_id)
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_responsible_persons rp
       WHERE rp.warehouse_id = warehouse_sub_containers.warehouse_id
         AND rp.profile_id   = public._current_user_data_id()
    )
  );

-- ── 3. Drop the legacy division-required CHECK on warehouses ──────────────
ALTER TABLE public.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_division_required_unless_virtual;

-- Note: warehouses.division_id remains a nullable column through Phase D.
-- Phase E drops the column entirely along with the legacy division_scope_r
-- policies.
