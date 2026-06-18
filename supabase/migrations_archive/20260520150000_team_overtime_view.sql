-- ─────────────────────────────────────────────────────────────────────────────
-- Team overtime reporting
--
-- Creates two IMMUTABLE helper functions that extract working-hour boundaries
-- from a schedule's days JSONB, then builds a view that aggregates overtime
-- minutes per team per calendar month.
--
-- overtime = minutes worked before schedule start  +  minutes worked after schedule end
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: earliest enabled start hour (default 7 = 7AM when schedule is NULL)
CREATE OR REPLACE FUNCTION public.schedule_day_start(days jsonb)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    MIN(split_part(d.v->>'start', ':', 1)::integer),
    7
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'start' IS NOT NULL;
$$;

-- Helper: latest enabled end hour, ceiled to next hour when minutes > 0
-- (default 18 = 6 PM when schedule is NULL)
CREATE OR REPLACE FUNCTION public.schedule_day_end(days jsonb)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    MAX(
      CASE
        WHEN (split_part(d.v->>'end', ':', 2)::integer) > 0
          THEN split_part(d.v->>'end', ':', 1)::integer + 1
        ELSE split_part(d.v->>'end', ':', 1)::integer
      END
    ),
    18
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'end' IS NOT NULL;
$$;

-- View: monthly overtime summary per team
CREATE OR REPLACE VIEW public.v_team_monthly_overtime AS
WITH assignment_overtime AS (

  -- Source 1: order team assignments
  SELECT
    ota.team_id,
    date_trunc('month', ota.scheduled_date)::date                                   AS month,
    GREATEST(0,
      COALESCE(public.schedule_day_start(sc.days), 7) * 60
      - (EXTRACT(EPOCH FROM ota.time_slot::time) / 60)::integer
    )                                                                                AS early_minutes,
    GREATEST(0,
      (EXTRACT(EPOCH FROM (
        ota.time_slot::time + GREATEST(1, ota.duration::int) * interval '1 hour'
      )) / 60)::integer
      - COALESCE(public.schedule_day_end(sc.days), 18) * 60
    )                                                                                AS late_minutes
  FROM public.order_team_assignments  ota
  JOIN  public.teams      t  ON t.id = ota.team_id AND NOT t.is_qc
  JOIN  public.divisions  d  ON d.id = t.division_id
  LEFT JOIN public.schedules sc ON sc.id = d.calendar_schedule_id
  WHERE ota.time_slot     ~ '^\d{2}:\d{2}'
    AND ota.duration      ~ '^\d+$'
    AND ota.scheduled_date IS NOT NULL

  UNION ALL

  -- Source 2: site visit team assignments
  SELECT
    svta.team_id,
    date_trunc('month', svta.scheduled_date)::date                                  AS month,
    GREATEST(0,
      COALESCE(public.schedule_day_start(sc.days), 7) * 60
      - (EXTRACT(EPOCH FROM svta.time_slot::time) / 60)::integer
    )                                                                                AS early_minutes,
    GREATEST(0,
      (EXTRACT(EPOCH FROM (
        svta.time_slot::time + GREATEST(1, svta.duration::int) * interval '1 hour'
      )) / 60)::integer
      - COALESCE(public.schedule_day_end(sc.days), 18) * 60
    )                                                                                AS late_minutes
  FROM public.site_visit_team_assignments  svta
  JOIN  public.teams      t  ON t.id = svta.team_id AND NOT t.is_qc
  JOIN  public.divisions  d  ON d.id = t.division_id
  LEFT JOIN public.schedules sc ON sc.id = d.calendar_schedule_id
  WHERE svta.time_slot    ~ '^\d{2}:\d{2}'
    AND svta.duration     ~ '^\d+$'
    AND svta.scheduled_date IS NOT NULL

)
SELECT
  t.id                                                            AS team_id,
  COALESCE(t.name_en, t.name)                                     AS team_name,
  d.id                                                            AS division_id,
  d.name                                                          AS division_name,
  d.slug                                                          AS division_slug,
  COALESCE(d.color, '#94a3b8')                                    AS division_color,
  ao.month,
  SUM(ao.early_minutes  + ao.late_minutes)::integer               AS overtime_minutes,
  SUM(ao.early_minutes)::integer                                  AS early_minutes,
  SUM(ao.late_minutes)::integer                                   AS late_minutes,
  COUNT(*) FILTER (
    WHERE ao.early_minutes + ao.late_minutes > 0
  )::integer                                                      AS overtime_visit_count,
  COUNT(*)::integer                                               AS total_visit_count
FROM  assignment_overtime ao
JOIN  public.teams      t ON t.id = ao.team_id
JOIN  public.divisions  d ON d.id = t.division_id
GROUP BY
  t.id, t.name, t.name_en,
  d.id, d.name, d.slug, d.color,
  ao.month
ORDER BY d.name, COALESCE(t.name_en, t.name), ao.month;

GRANT SELECT ON public.v_team_monthly_overtime TO authenticated;

COMMENT ON VIEW public.v_team_monthly_overtime IS
  'Monthly overtime per team. overtime_minutes = early (before schedule start) + late (after schedule end). Sourced from order_team_assignments and site_visit_team_assignments.';
