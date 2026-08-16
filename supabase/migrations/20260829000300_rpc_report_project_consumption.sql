-- VWh Projects Phase 4 — Task 4.1: project/team consumption spend report
-- Read-only. Sums consumption cost already booked in cogs_entries (no new cost
-- math) broken down by consumer (team | project) -> discipline -> milestone.
-- A "project" consumer = a discipline-bucket sub-container (project_id set);
-- a "team" consumer = any other custody sub-container (resolved by its name,
-- since there is no teams table). Internal consumptions have a NULL
-- consumer_sub_container_id and are intentionally excluded (no consumer to
-- attribute to). milestone_id NULL -> 'Unassigned'. is_division_visible-scoped.
CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(
  p_from date,
  p_to date,
  p_division_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  consumer_kind   text,
  consumer_id     uuid,
  consumer_name   text,
  project_number  text,
  discipline_name text,
  milestone_label text,
  qty             integer,
  total_cost      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    SUM(c.qty)::int                                                            AS qty,
    SUM(c.total_cost)::numeric                                                 AS total_cost
  FROM public.cogs_entries c
  JOIN public.warehouse_sub_containers sc ON sc.id = c.consumer_sub_container_id
  LEFT JOIN public.projects           pr   ON pr.id   = sc.project_id
  LEFT JOIN public.disciplines        disc ON disc.id = sc.discipline_id
  LEFT JOIN public.project_milestones pm   ON pm.id   = c.milestone_id
  WHERE c.source_type = 'consumption'
    AND c.date BETWEEN p_from AND p_to
    AND c.consumer_sub_container_id IS NOT NULL
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1, 2, 3, 4, 5, 6
  ORDER BY consumer_name, discipline_name NULLS FIRST, milestone_label
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_report_project_consumption(date, date, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_report_project_consumption(date, date, uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_report_project_consumption(date, date, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
