-- =============================================================================
-- Warehouse Model v2 — Phase C.3
-- New sub-container-scoped RLS, stacked ADDITIVELY on top of the existing
-- is_division_visible() division_scope_r policies from 20260731000000.
--
-- Both layers remain in effect through Phase D. Phase E drops the legacy
-- division_scope_r policies and warehouses.division_id.
--
-- Access rules encoded here (from docs/warehouse-model-v2-design.md §Policies):
--   • Sub-container visible to user iff:
--        (Branch A) user's division access covers the sub-container's division
--                   (is_division_visible(sc.division_id) — NULL is visible to
--                    everyone, so virtual repair-vendor sub-containers pass)
--     OR (Branch B) user is a warehouse_responsible_persons row for the
--                    sub-container's parent warehouse (cross-division read
--                    within the RP's own warehouse).
--   • Warehouse visible iff is_virtual = TRUE OR any of its sub-containers is
--     visible. Enforced as a SELECT-only RESTRICTIVE — INSERT/UPDATE/DELETE
--     on warehouses stays gated by the existing division_scope_r policies
--     (warehouses.division_id) until Phase E drops that column.
--   • Stock rows (6 tables) gated by is_sub_container_visible(sub_container_id)
--     for all four CRUD ops (SET NOT NULL landed in Phase C.2.f).
--   • warehouse_transfers gated by
--     (is_sub_container_visible(from) OR is_sub_container_visible(to)).
-- =============================================================================

-- ── 1. Helper function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_sub_container_visible(p_sub_container_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND (
         -- Branch A: user's division access covers the sub-container's
         -- division. is_division_visible(NULL) returns TRUE, so virtual
         -- repair-vendor sub-containers are visible to all authenticated.
         public.is_division_visible(sc.division_id)
         OR
         -- Branch B: user is a responsible person of the parent warehouse.
         EXISTS (
           SELECT 1
             FROM public.warehouse_responsible_persons rp
            WHERE rp.warehouse_id = sc.warehouse_id
              AND rp.profile_id   = public._current_user_data_id()
         )
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_sub_container_visible(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.is_sub_container_visible(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_sub_container_visible IS
  'Warehouse Model v2 (Phase C.3): visibility gate for stock rows. Returns TRUE '
  'if the caller has division access to the sub-container OR is a responsible '
  'person of the parent warehouse. NULL division (virtual repair-vendor '
  'sub-containers) is visible to all authenticated users via the underlying '
  'is_division_visible() NULL branch.';

-- ── 2. warehouse_sub_containers — enable RLS + policies ─────────────────────
-- Phase A created the table without RLS; enable + gate here.
ALTER TABLE public.warehouse_sub_containers ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE base policy so authenticated users can reach the table at all
-- (RESTRICTIVE policies compose via AND on top of the PERMISSIVE result set;
-- with no PERMISSIVE policy, RESTRICTIVE alone denies everything).
CREATE POLICY wsc_authenticated_all ON public.warehouse_sub_containers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY sub_container_scope_select_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR SELECT
  USING (public.is_sub_container_visible(id));

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_sub_container_visible(id));

CREATE POLICY sub_container_scope_update_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(id))
  WITH CHECK (public.is_sub_container_visible(id));

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_sub_containers
  AS RESTRICTIVE FOR DELETE
  USING (public.is_sub_container_visible(id));

-- ── 3. warehouses — SELECT-only sub-container gate ──────────────────────────
-- Virtual warehouses stay visible to all authenticated (repair-vendor
-- bookkeeping targets; the design table treats them as non-sensitive).
-- INSERT/UPDATE/DELETE keep the existing division_scope_r gate until Phase E.
CREATE POLICY sub_container_scope_select_r ON public.warehouses
  AS RESTRICTIVE FOR SELECT
  USING (
    is_virtual = TRUE
    OR EXISTS (
      SELECT 1
        FROM public.warehouse_sub_containers sc
       WHERE sc.warehouse_id = warehouses.id
         AND public.is_sub_container_visible(sc.id)
    )
  );

-- ── 4. Stock tables gated by is_sub_container_visible(sub_container_id) ─────
-- fifo_cost_layers
CREATE POLICY sub_container_scope_select_r ON public.fifo_cost_layers
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.fifo_cost_layers
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.fifo_cost_layers
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.fifo_cost_layers
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- inventory_stock_movements
CREATE POLICY sub_container_scope_select_r ON public.inventory_stock_movements
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.inventory_stock_movements
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.inventory_stock_movements
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.inventory_stock_movements
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- warehouse_stock_allocations
CREATE POLICY sub_container_scope_select_r ON public.warehouse_stock_allocations
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_stock_allocations
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_stock_allocations
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_stock_allocations
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- stock_adjustments
CREATE POLICY sub_container_scope_select_r ON public.stock_adjustments
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.stock_adjustments
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.stock_adjustments
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.stock_adjustments
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- receival_items
CREATE POLICY sub_container_scope_select_r ON public.receival_items
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.receival_items
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.receival_items
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.receival_items
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- warehouse_transfer_items
CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfer_items
  AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfer_items
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfer_items
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_sub_container_visible(sub_container_id))
  WITH CHECK (public.is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfer_items
  AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));

-- ── 5. warehouse_transfers — either endpoint visible ────────────────────────
CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfers
  AS RESTRICTIVE FOR SELECT
  USING (
       public.is_sub_container_visible(from_sub_container_id)
    OR public.is_sub_container_visible(to_sub_container_id)
  );
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfers
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
       public.is_sub_container_visible(from_sub_container_id)
    OR public.is_sub_container_visible(to_sub_container_id)
  );
CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfers
  AS RESTRICTIVE FOR UPDATE
  USING (
       public.is_sub_container_visible(from_sub_container_id)
    OR public.is_sub_container_visible(to_sub_container_id)
  )
  WITH CHECK (
       public.is_sub_container_visible(from_sub_container_id)
    OR public.is_sub_container_visible(to_sub_container_id)
  );
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfers
  AS RESTRICTIVE FOR DELETE
  USING (
       public.is_sub_container_visible(from_sub_container_id)
    OR public.is_sub_container_visible(to_sub_container_id)
  );
