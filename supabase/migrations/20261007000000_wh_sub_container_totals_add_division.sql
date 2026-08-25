-- Add division_id + division_name to warehouse_sub_container_totals so the
-- Warehouses tab (WhWarehousesTab) can show each sub-container's division next
-- to its name — useful when the sub-container name doesn't imply the division
-- (e.g. "RSH Team 01" lives in the Pest Control & Cleaning division).
--
-- The two new columns are APPENDED after the existing ones so CREATE OR REPLACE
-- VIEW is valid (it forbids reordering/renaming/dropping existing columns) and
-- preserves the view's existing grants. Body sourced verbatim from the live
-- pg_get_viewdef; only the division_id/division_name select, the
-- company_divisions LEFT JOIN, and the GROUP BY additions are new.
CREATE OR REPLACE VIEW public.warehouse_sub_container_totals AS
 SELECT sc.warehouse_id,
    sc.id AS sub_container_id,
    sc.name AS sub_container_name,
    sc.is_active AS sub_container_is_active,
    count(DISTINCT fcl.brand_variant_id) FILTER (WHERE fcl.remaining_qty > 0) AS item_count,
    COALESCE(sum(fcl.remaining_qty) FILTER (WHERE fcl.remaining_qty > 0), 0::bigint)::numeric AS total_qty,
    COALESCE(sum(fcl.remaining_qty::numeric * fcl.total_unit_cost) FILTER (WHERE fcl.remaining_qty > 0), 0::numeric) AS total_value,
    sc.division_id,
    d.name AS division_name
   FROM warehouse_sub_containers sc
     LEFT JOIN fifo_cost_layers fcl ON fcl.sub_container_id = sc.id
     LEFT JOIN company_divisions d ON d.id = sc.division_id
  WHERE sc.is_active = true
  GROUP BY sc.warehouse_id, sc.id, sc.name, sc.is_active, sc.division_id, d.name;
