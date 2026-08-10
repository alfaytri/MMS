-- Report 1.1 — Product Cost (PO-wise), one row per FIFO cost layer.
--
-- Current on-hand stock (fifo_cost_layers.remaining_qty > 0) valued at its own
-- layer cost, so per-PO / per-receipt unit costs stay visible and are NEVER
-- blended. SECURITY DEFINER, so every row is filtered through
-- is_division_visible(division_id) — a limited-division caller can only ever
-- pull their own divisions regardless of the p_division_ids they pass;
-- p_division_ids narrows WITHIN the visible set.
--
-- Live-schema facts (verified on staging 2026-08-11):
--   * fifo_cost_layers: remaining_qty, total_unit_cost (all-in), warehouse_id,
--     sub_container_id, source_type (text), receival_id.
--   * receivals.po_id -> purchase_orders.po_number (NOT purchase_order_id).
--   * On-hand layers are mostly source_type='inventory_import' (seed, no PO);
--     only 'receival' layers carry a PO, so PO No falls back to a humanized
--     source label (Import / Sale Return / Adjustment / Custody / …).
--   * Product hierarchy: variant.item_id -> inventory_items.category_id ->
--     inventory_categories (type enum, parent_id, name_en). Two-level map:
--     Category = parent category name (else the leaf), Sub-category = leaf when
--     it has a parent. Barcode = inventory_item_brand_variants.code.

CREATE OR REPLACE FUNCTION public.rpc_report_product_cost(
  p_division_ids   uuid[] DEFAULT NULL,
  p_warehouse_ids  uuid[] DEFAULT NULL,
  p_po_id          uuid   DEFAULT NULL,
  p_category_id    uuid   DEFAULT NULL,
  p_brand_variant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  layer_id         uuid,
  po_no            text,
  po_id            uuid,
  product_type     text,
  category         text,
  sub_category     text,
  product_name     text,
  barcode          text,
  qty              integer,
  unit_cost        numeric,
  total_cost       numeric,
  sales_price      numeric,
  division_id      uuid,
  division_name    text,
  warehouse_id     uuid,
  warehouse_name   text,
  brand_variant_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    fcl.id AS layer_id,
    COALESCE(po.po_number, initcap(replace(fcl.source_type, '_', ' '))) AS po_no,
    r.po_id,
    initcap(replace(COALESCE(c.type::text, ''), '-', ' '))              AS product_type,
    COALESCE(cp.name_en, c.name_en)                                     AS category,
    CASE WHEN cp.id IS NOT NULL THEN c.name_en ELSE NULL END            AS sub_category,
    it.name_en                                                          AS product_name,
    v.code                                                              AS barcode,
    fcl.remaining_qty                                                   AS qty,
    fcl.total_unit_cost                                                 AS unit_cost,
    (fcl.remaining_qty * fcl.total_unit_cost)                           AS total_cost,
    v.selling_price                                                     AS sales_price,
    sc.division_id,
    d.name                                                              AS division_name,
    fcl.warehouse_id,
    w.name                                                              AS warehouse_name,
    fcl.brand_variant_id
  FROM public.fifo_cost_layers fcl
  JOIN public.warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
  JOIN public.inventory_item_brand_variants v ON v.id = fcl.brand_variant_id
  JOIN public.inventory_items it ON it.id = v.item_id
  LEFT JOIN public.inventory_categories c  ON c.id  = it.category_id
  LEFT JOIN public.inventory_categories cp ON cp.id = c.parent_id
  LEFT JOIN public.receivals r         ON r.id  = fcl.receival_id
  LEFT JOIN public.purchase_orders po  ON po.id = r.po_id
  LEFT JOIN public.warehouses w        ON w.id  = fcl.warehouse_id
  LEFT JOIN public.company_divisions d ON d.id  = sc.division_id
  WHERE fcl.remaining_qty > 0
    AND public.is_division_visible(sc.division_id)
    AND (p_division_ids   IS NULL OR sc.division_id   = ANY(p_division_ids))
    AND (p_warehouse_ids  IS NULL OR fcl.warehouse_id = ANY(p_warehouse_ids))
    AND (p_po_id          IS NULL OR r.po_id          = p_po_id)
    AND (p_category_id    IS NULL OR it.category_id   = p_category_id)
    AND (p_brand_variant_id IS NULL OR fcl.brand_variant_id = p_brand_variant_id)
  ORDER BY d.name, w.name, it.name_en, fcl.total_unit_cost;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_product_cost(uuid[], uuid[], uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_product_cost(uuid[], uuid[], uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
