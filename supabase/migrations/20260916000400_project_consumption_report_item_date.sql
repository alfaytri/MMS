-- Project Consumption report — add per-ITEM + per-DATE detail.
-- The report now returns one row per (consumer, discipline, milestone, item,
-- date) instead of aggregating across items/dates, so each team/project shows
-- WHAT was consumed and WHEN. Params (p_from, p_to, p_division_ids) unchanged;
-- return type gains item_name / sku / consumed_on → DROP + recreate. Totals are
-- unaffected (finer grouping of the same cogs_entries rows).
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_report_project_consumption(date, date, uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(
  p_from date,
  p_to date,
  p_division_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(
  consumer_kind text, consumer_id uuid, consumer_name text, project_number text,
  discipline_name text, milestone_label text,
  item_name text, sku text, consumed_on date,
  qty integer, total_cost numeric
)
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
    COALESCE(ii.name_en, '(item removed)')                                      AS item_name,
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
  WHERE c.source_type = 'consumption'
    AND c.date BETWEEN p_from AND p_to
    AND c.consumer_sub_container_id IS NOT NULL
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
  ORDER BY consumer_name, discipline_name NULLS FIRST, milestone_label, consumed_on, item_name
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_project_consumption(date, date, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_project_consumption(date, date, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
