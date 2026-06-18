-- supabase/migrations/20260511200000_teams_division_fk.sql
-- Replace teams.division (team_division enum) with teams.division_id (UUID FK → divisions).
-- Backfill by matching enum slug string to divisions.slug.

-- ── 0. Drop calendar_visits view — it depends on teams.division column ────────
DROP VIEW IF EXISTS public.calendar_visits;

-- ── 1. Add division_id column (nullable during backfill) ──────────────────────
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES public.divisions(id);

-- ── 2. Backfill: match enum value to division slug ────────────────────────────
UPDATE public.teams t
   SET division_id = d.id
  FROM public.divisions d
 WHERE (t.division::text) = d.slug
   AND t.division_id IS NULL;

-- ── 3. Report unmatched teams as NOTICE (no hard fail — admin fixes slugs manually) ──
DO $$
DECLARE v_unmatched INT;
BEGIN
  SELECT COUNT(*) INTO v_unmatched
  FROM public.teams
  WHERE division_id IS NULL;

  IF v_unmatched > 0 THEN
    RAISE NOTICE
      'teams.division_id: % team(s) had no matching divisions.slug and have division_id = NULL. '
      'Fix by updating the relevant division slug(s) to match the old team_division enum values, '
      'then run: UPDATE teams SET division_id = (SELECT id FROM divisions WHERE slug = division::text) WHERE division_id IS NULL.',
      v_unmatched;
  END IF;
END;
$$;

-- ── 5. Drop old enum column ───────────────────────────────────────────────────
ALTER TABLE public.teams DROP COLUMN IF EXISTS division;

-- ── 6. Drop enum type if nothing else references it ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class  c ON c.oid  = a.attrelid
    JOIN pg_type   t ON t.oid  = a.atttypid
    WHERE t.typname     = 'team_division'
      AND a.attnum      > 0
      AND NOT a.attisdropped
  ) THEN
    DROP TYPE IF EXISTS public.team_division;
  END IF;
END;
$$;

-- ── 7. Rebuild calendar_visits — replace t.division::text with d.slug ─────────
CREATE OR REPLACE VIEW public.calendar_visits AS

-- Source 1: Order team assignments
SELECT
  ota.id                                  AS id,
  'order'::text                           AS source_type,
  ota.team_id                             AS team_id,
  d.slug                                  AS division,
  t.is_qc                                 AS is_qc,
  ota.scheduled_date                      AS visit_date,
  CASE
    WHEN ota.time_slot  ~ '^\d{2}:\d{2}' THEN ota.time_slot::time
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}' THEN o.scheduled_time::time
    ELSE NULL
  END                                     AS start_time,
  CASE
    WHEN ota.time_slot ~ '^\d{2}:\d{2}' AND ota.duration ~ '^\d+$'
      THEN (ota.time_slot::time + (GREATEST(1, ota.duration::int) * interval '1 hour'))
    WHEN ota.time_slot ~ '^\d{2}:\d{2}'
      THEN (ota.time_slot::time + interval '2 hours')
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}'
      THEN (o.scheduled_time::time + interval '2 hours')
    ELSE NULL
  END                                     AS end_time,
  COALESCE(o.type, 'normal_order')        AS visit_type,
  COALESCE(o.status::text, 'scheduled')  AS status,
  COALESCE(sc.name, c.name)              AS customer_name,
  COALESCE(o.service_customer_id, c.id)  AS customer_id,
  NULL::uuid                              AS service_id,
  o.order_id                              AS order_number,
  o.arrival_phone                         AS customer_phone,
  (
    SELECT string_agg(os.qty::text || '× ' || os.name, ', ' ORDER BY os.name)
    FROM public.order_services os
    WHERE os.order_id = o.id
  )                                       AS services_summary
FROM public.order_team_assignments  ota
JOIN public.orders                  o   ON o.id  = ota.order_id
JOIN public.teams                   t   ON t.id  = ota.team_id
JOIN public.divisions               d   ON d.id  = t.division_id
LEFT JOIN public.customers          c   ON c.id  = o.customer_id
LEFT JOIN public.service_customers  sc  ON sc.id = o.service_customer_id

UNION ALL

-- Source 2: Contract visits
SELECT
  cv.id                                   AS id,
  'contract_visit'::text                  AS source_type,
  cv.team_id                              AS team_id,
  d.slug                                  AS division,
  t.is_qc                                 AS is_qc,
  cv.scheduled_date                       AS visit_date,
  NULL::time                              AS start_time,
  NULL::time                              AS end_time,
  'contract_visit'::text                  AS visit_type,
  CASE WHEN cv.completed THEN 'completed' ELSE 'scheduled' END AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  NULL::uuid                              AS service_id,
  NULL::text                              AS order_number,
  NULL::text                              AS customer_phone,
  NULL::text                              AS services_summary
FROM public.contract_visits  cv
JOIN public.teams             t    ON t.id  = cv.team_id
JOIN public.divisions         d    ON d.id  = t.division_id
LEFT JOIN public.contracts    con  ON con.id = cv.contract_id
LEFT JOIN public.customers    c    ON c.id  = con.customer_id
WHERE cv.team_id IS NOT NULL

UNION ALL

-- Source 3: Site visit team assignments
SELECT
  svta.id                                 AS id,
  'site_visit'::text                      AS source_type,
  svta.team_id                            AS team_id,
  d.slug                                  AS division,
  t.is_qc                                 AS is_qc,
  svta.scheduled_date                     AS visit_date,
  CASE
    WHEN svta.time_slot ~ '^\d{2}:\d{2}' THEN svta.time_slot::time
    ELSE NULL
  END                                     AS start_time,
  CASE
    WHEN svta.time_slot ~ '^\d{2}:\d{2}' AND svta.duration ~ '^\d+$'
      THEN (svta.time_slot::time + (GREATEST(1, svta.duration::int) * interval '1 hour'))
    WHEN svta.time_slot ~ '^\d{2}:\d{2}'
      THEN (svta.time_slot::time + interval '1 hour')
    ELSE NULL
  END                                     AS end_time,
  'site_visit'::text                      AS visit_type,
  sv.status                               AS status,
  COALESCE(sc.name, c.name)              AS customer_name,
  COALESCE(sv.service_customer_id, c.id) AS customer_id,
  NULL::uuid                              AS service_id,
  sv.visit_id                             AS order_number,
  sv.arrival_phone                        AS customer_phone,
  'Site Visit'::text                      AS services_summary
FROM public.site_visit_team_assignments   svta
JOIN public.site_visits                   sv  ON sv.id  = svta.visit_id
JOIN public.teams                         t   ON t.id  = svta.team_id
JOIN public.divisions                     d   ON d.id  = t.division_id
LEFT JOIN public.customers                c   ON c.id  = sv.customer_id
LEFT JOIN public.service_customers        sc  ON sc.id = sv.service_customer_id;

GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar view. division comes from divisions.slug via FK. customer_name coalesces service_customers and legacy customers.';
