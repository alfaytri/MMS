-- Warehouse Model v2 — Phase D.9 Task 1
-- Per-sub-container aggregate view for warehouse landing cards.
--
-- `warehouses.item_count` and `warehouses.total_value` are trigger-computed
-- from `fifo_cost_layers` (see the `refresh_warehouse_totals` trigger in the
-- baseline schema): item_count = COUNT(DISTINCT brand_variant_id) where
-- remaining_qty > 0; total_value = SUM(remaining_qty * total_unit_cost) where
-- remaining_qty > 0. This view aggregates the same source at
-- (warehouse_id, sub_container_id) granularity so `WhWarehousesTab` cards can
-- show a Maintenance / Kitchen split of the same numbers the header already
-- reports at warehouse level.
--
-- Note: summing sub-container item_counts can EXCEED the warehouse item_count
-- when a single variant has stock in multiple sub-containers of the same
-- warehouse — expected behaviour, the breakdown answers "where does stock
-- live", not "how many distinct variants".

BEGIN;

CREATE OR REPLACE VIEW public.warehouse_sub_container_totals AS
SELECT
  fcl.warehouse_id,
  fcl.sub_container_id,
  sc.name                                                     AS sub_container_name,
  sc.is_active                                                AS sub_container_is_active,
  COUNT(DISTINCT fcl.brand_variant_id)                        AS item_count,
  COALESCE(SUM(fcl.remaining_qty), 0)::numeric                AS total_qty,
  COALESCE(SUM(fcl.remaining_qty * fcl.total_unit_cost), 0)::numeric AS total_value
FROM public.fifo_cost_layers fcl
JOIN public.warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
WHERE fcl.remaining_qty > 0
  AND fcl.sub_container_id IS NOT NULL
GROUP BY fcl.warehouse_id, fcl.sub_container_id, sc.name, sc.is_active;

COMMENT ON VIEW public.warehouse_sub_container_totals IS
  'Warehouse Model v2 D.9 — per-(warehouse, sub_container) item_count + total_value, aggregated from live FIFO layers. Feeds WhWarehousesTab card breakdown.';

GRANT SELECT ON public.warehouse_sub_container_totals TO authenticated;

COMMIT;
