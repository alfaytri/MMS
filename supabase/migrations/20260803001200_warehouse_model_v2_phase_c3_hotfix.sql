-- =============================================================================
-- Warehouse Model v2 — Phase C.3 hotfix
--
-- Two bugs found in operator smoke test of the Phase D.1 UI:
--
--   1. `sub_container_scope_insert_r` on warehouse_sub_containers rejected
--      every operator INSERT with "new row violates row-level security
--      policy". The policy called `is_sub_container_visible(id)` which does
--      `SELECT ... FROM warehouse_sub_containers WHERE id = NEW.id` — but the
--      row-being-inserted is NOT visible via a back-referencing SELECT during
--      the WITH CHECK phase. Fix: check NEW.division_id and NEW.warehouse_id
--      inline. Same fix applied to the UPDATE policy for symmetry.
--
--   2. `sub_container_scope_select_r` on warehouses blocked reads of brand-
--      new warehouses. A just-inserted warehouse has zero sub-containers, so
--      the EXISTS check returns FALSE and the `.insert().select()` RETURNING
--      clause fails. Design intent stays intact — a warehouse with sub-
--      containers, none of them visible to the caller, still hides. Only the
--      bootstrap case (zero sub-containers) is now allowed through.
-- =============================================================================

-- ── 1. warehouse_sub_containers INSERT — inline check against NEW columns ────
DROP POLICY IF EXISTS sub_container_scope_insert_r ON public.warehouse_sub_containers;

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    public.is_division_visible(division_id)
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_responsible_persons rp
       WHERE rp.warehouse_id = warehouse_sub_containers.warehouse_id
         AND rp.profile_id   = public._current_user_data_id()
    )
  );

-- ── 2. warehouse_sub_containers UPDATE — same inline pattern for symmetry ──
DROP POLICY IF EXISTS sub_container_scope_update_r ON public.warehouse_sub_containers;

CREATE POLICY sub_container_scope_update_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR UPDATE
  USING (
    public.is_division_visible(division_id)
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_responsible_persons rp
       WHERE rp.warehouse_id = warehouse_sub_containers.warehouse_id
         AND rp.profile_id   = public._current_user_data_id()
    )
  )
  WITH CHECK (
    public.is_division_visible(division_id)
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_responsible_persons rp
       WHERE rp.warehouse_id = warehouse_sub_containers.warehouse_id
         AND rp.profile_id   = public._current_user_data_id()
    )
  );

-- SELECT + DELETE policies keep calling is_sub_container_visible(id) — for
-- those the row exists at check time, so the helper works correctly.

-- ── 3. warehouses SELECT — allow bootstrap (zero sub-containers) case ──────
DROP POLICY IF EXISTS sub_container_scope_select_r ON public.warehouses;

CREATE POLICY sub_container_scope_select_r ON public.warehouses
  AS RESTRICTIVE FOR SELECT
  USING (
    is_virtual = TRUE
    OR NOT EXISTS (
      SELECT 1
        FROM public.warehouse_sub_containers sc
       WHERE sc.warehouse_id = warehouses.id
    )
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_sub_containers sc
       WHERE sc.warehouse_id = warehouses.id
         AND public.is_sub_container_visible(sc.id)
    )
  );
