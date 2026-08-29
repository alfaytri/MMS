-- Fix: rpc_report_project_consumption merged two DIFFERENT items that share a
-- name across sub-categories (e.g. "11.3 kg" under both Refrigerant › R410A and
-- Refrigerant › R422D). It grouped by (item_name, item.sku) — and item.sku is
-- the non-unique item name too — so their qty/cost combined into one row, and the
-- page (which shows only the Item column) couldn't tell them apart.
--
-- Fix = prefix item_name with the item's category ("R410A · 11.3 kg") and join
-- inventory_categories to get it. The category-qualified name is unique per item
-- here, so the GROUP BY no longer merges them AND the report is readable.
-- Body sourced from the live function; only the item_name expression + the
-- inventory_categories join changed.

CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(consumer_kind text, consumer_id uuid, consumer_name text, project_number text, discipline_name text, milestone_label text, code text, item_name text, sku text, consumed_on date, qty integer, total_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN sc.project_id IS NOT NULL THEN 'project' ELSE 'team' END          AS consumer_kind,
    COALESCE(sc.project_id, sc.id)                                              AS consumer_id,
    CASE WHEN sc.project_id IS NOT NULL
         THEN COALESCE(pr.name, pr.project_number)
         ELSE sc.name END                                                      AS consumer_name,
    pr.project_number                                                          AS project_number,
    disc.name                                                                  AS discipline_name,
    COALESCE(pm.label, 'Unassigned')                                           AS milestone_label,
    c.code                                                                      AS code,
    -- Category-qualified so same-named items in different sub-categories stay
    -- distinct rows (and are readable in the Item column).
    COALESCE(NULLIF(ic.name_en, '') || ' · ', '')
      || COALESCE(ii.name_en, '(item removed)')                                AS item_name,
    ii.sku                                                                      AS sku,
    c.date                                                                      AS consumed_on,
    SUM(c.qty)::int                                                             AS qty,
    SUM(c.total_cost)::numeric                                                  AS total_cost
  FROM public.cogs_entries c
  JOIN public.warehouse_sub_containers          sc   ON sc.id   = c.consumer_sub_container_id
  LEFT JOIN public.projects                     pr   ON pr.id   = sc.project_id
  LEFT JOIN public.disciplines                  disc ON disc.id = c.discipline_id
  LEFT JOIN public.project_milestones           pm   ON pm.id   = c.milestone_id
  LEFT JOIN public.inventory_item_brand_variants biv ON biv.id  = c.brand_variant_id
  LEFT JOIN public.inventory_items              ii   ON ii.id   = biv.item_id
  LEFT JOIN public.inventory_categories         ic   ON ic.id   = ii.category_id
  WHERE c.source_type = 'consumption'
    AND c.date BETWEEN p_from AND p_to
    AND c.consumer_sub_container_id IS NOT NULL
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  ORDER BY consumer_name, discipline_name NULLS FIRST, milestone_label, code NULLS FIRST, consumed_on, item_name
$function$;

NOTIFY pgrst, 'reload schema';
