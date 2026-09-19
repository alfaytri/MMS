-- 20260919010600_mep_report_project_consumption.sql — MEP Phase 2 (Task 8)
-- rpc_report_project_consumption: regroup on the DIRECT FKs now on
-- cogs_entries (project_id, milestone_code_id — Task 5; discipline_id,
-- milestone_id were already direct) instead of resolving the project through
-- the consumer sub-container's own project_id. consumer_kind/consumer_id now
-- key off c.project_id directly, so a project-tagged consumption is
-- attributed to its project even when it isn't routed through a project-pool
-- sub-container (e.g. an internal consumption that still carries
-- p_project_id — Task 7's deferred-minor: tags are stamped without a
-- consumer-sub-container requirement for internal consumer_type).
--
-- Live signature re-confirmed unchanged before writing this file (fetched via
-- pg_get_function_identity_arguments / pg_get_function_result on staging
-- mwvblpgbgxipvrevkeff, then the full body via pg_get_functiondef byte-diffed
-- against 20261016000000_fix_project_consumption_same_name_merge.sql — zero
-- drift, live == that file exactly). Same 12-column return shape kept
-- identical here so the frontend hook is unaffected: consumer_kind text,
-- consumer_id uuid, consumer_name text, project_number text,
-- discipline_name text, milestone_label text, code text, item_name text,
-- sku text, consumed_on date, qty integer, total_cost numeric. Args unchanged:
-- p_from date, p_to date, p_division_ids uuid[] DEFAULT NULL.
--
-- Changes vs. the live body:
--  - consumer_kind / consumer_id key off c.project_id (direct FK) instead of
--    sc.project_id (via the consumer sub-container). "team" consumer_name
--    still reads sc.name (team-side attribution is untouched by this task).
--  - milestone_label now reads COALESCE(pm.name, pm.milestone_no::text,
--    'Unassigned') — the Task 4 reshape's replacement columns for the
--    deprecated (now-nullable) pm.label.
--  - code now prefers the new milestone_codes.code (via the new
--    c.milestone_code_id FK, joined as mc) over the legacy free-text
--    cogs_entries.code, falling back to the free-text code when no
--    milestone_code is tagged: COALESCE(mc.code, c.code).
--  - item_name expression simplified to
--    COALESCE(ic.name_en || ' · ' || ii.name_en, ii.name_en, '(item removed)')
--    — same category-qualification intent as the live same_name_merge fix,
--    minus its stray leading " · " when the category is missing.
--  - dropped the `c.consumer_sub_container_id IS NOT NULL` filter: project
--    attribution no longer requires a consumer sub-container, so a
--    project-tagged consumption with no pool sub-container (internal +
--    project tag) is no longer silently excluded from the report. Team rows
--    are unaffected (a plain internal, non-project consumption has both
--    project_id and consumer_sub_container_id NULL and will surface as a
--    consumer_kind='team' row with NULL consumer_id/consumer_name — flagged
--    in the task report as a minor, brief-specified behavior change, not a
--    defect introduced here).
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_report_project_consumption(date, date, uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(
  p_from date, p_to date, p_division_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(
  consumer_kind text, consumer_id uuid, consumer_name text, project_number text,
  discipline_name text, milestone_label text, code text,
  item_name text, sku text, consumed_on date, qty integer, total_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    CASE WHEN c.project_id IS NOT NULL THEN 'project' ELSE 'team' END,
    COALESCE(c.project_id, c.consumer_sub_container_id),
    CASE WHEN c.project_id IS NOT NULL THEN COALESCE(pr.name, pr.project_number) ELSE sc.name END,
    pr.project_number,
    disc.name,
    COALESCE(pm.name, pm.milestone_no::text, 'Unassigned'),
    COALESCE(mc.code, c.code),
    COALESCE(ic.name_en || ' · ' || ii.name_en, ii.name_en, '(item removed)'),
    ii.sku, c.date,
    SUM(c.qty)::int, SUM(c.total_cost)::numeric
  FROM public.cogs_entries c
  LEFT JOIN public.warehouse_sub_containers          sc   ON sc.id   = c.consumer_sub_container_id
  LEFT JOIN public.projects                          pr   ON pr.id   = c.project_id
  LEFT JOIN public.disciplines                       disc ON disc.id = c.discipline_id
  LEFT JOIN public.project_milestones                pm   ON pm.id   = c.milestone_id
  LEFT JOIN public.milestone_codes                   mc   ON mc.id   = c.milestone_code_id
  LEFT JOIN public.inventory_item_brand_variants     biv  ON biv.id  = c.brand_variant_id
  LEFT JOIN public.inventory_items                   ii   ON ii.id   = biv.item_id
  LEFT JOIN public.inventory_categories              ic   ON ic.id   = ii.category_id
  WHERE c.source_type='consumption' AND c.date BETWEEN p_from AND p_to
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1,2,3,4,5,6,7,8,9,10
  ORDER BY 3, 5 NULLS FIRST, 6, 7 NULLS FIRST, 10, 8
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_project_consumption(date,date,uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_report_project_consumption(date,date,uuid[]) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
