-- Warehouse Model v2 — Phase D.9 refinement (needed by D.6.b UX)
--
-- The original `warehouse_sub_container_totals` (2026-08-01 D.9 Task 1) built
-- FROM fifo_cost_layers, so a sub-container with zero live stock was absent
-- from the result set. That's fine for physical warehouses where every sub
-- normally holds stock — but breaks the Repair warehouse case (D.6.b): repair
-- vendors are sub-containers that spend most of their time at 0 units (stock
-- only sits there while items are out for repair). With the sub absent from
-- the breakdown, the WhWarehousesTab card dropdown collapses to the plain
-- division-label fallback and the operator can't pick a vendor from the card.
--
-- Fix: swap the base. FROM warehouse_sub_containers (all active), LEFT JOIN
-- fifo_cost_layers with remaining_qty > 0 → 0/NULL sums coalesced to 0.
-- Active sub-containers with no live stock now appear as rows with
-- item_count=0, total_qty=0, total_value=0.

BEGIN;

CREATE OR REPLACE VIEW public.warehouse_sub_container_totals AS
SELECT
  sc.warehouse_id,
  sc.id                                                       AS sub_container_id,
  sc.name                                                     AS sub_container_name,
  sc.is_active                                                AS sub_container_is_active,
  COUNT(DISTINCT fcl.brand_variant_id) FILTER (WHERE fcl.remaining_qty > 0) AS item_count,
  COALESCE(SUM(fcl.remaining_qty)                    FILTER (WHERE fcl.remaining_qty > 0), 0)::numeric AS total_qty,
  COALESCE(SUM(fcl.remaining_qty * fcl.total_unit_cost) FILTER (WHERE fcl.remaining_qty > 0), 0)::numeric AS total_value
FROM public.warehouse_sub_containers sc
LEFT JOIN public.fifo_cost_layers fcl
  ON fcl.sub_container_id = sc.id
WHERE sc.is_active = true
GROUP BY sc.warehouse_id, sc.id, sc.name, sc.is_active;

-- View recreation preserves the security_invoker=false setting from the
-- 2026-08-01 follow-up migration.
ALTER VIEW public.warehouse_sub_container_totals SET (security_invoker = false);

COMMENT ON VIEW public.warehouse_sub_container_totals IS
  'Warehouse Model v2 D.9 (updated D.6.b) — per-(warehouse, sub_container) item_count + total_value. Includes zero-stock active sub-containers so repair vendors (typically 0 units on-hand) always surface on warehouse cards.';

GRANT SELECT ON public.warehouse_sub_container_totals TO authenticated;

COMMIT;
