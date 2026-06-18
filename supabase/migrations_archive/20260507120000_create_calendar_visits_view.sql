-- calendar_visits: unified read-only view over all visit sources.
-- Used exclusively by the Operations Calendar.
CREATE OR REPLACE VIEW public.calendar_visits AS

-- Source 1: Order team assignments (the primary field-service visit type)
SELECT
  ota.id                                  AS id,
  'order'::text                           AS source_type,
  ota.team_id                             AS team_id,
  t.division::text                        AS division,
  t.is_qc                                 AS is_qc,
  ota.scheduled_date                      AS visit_date,

  -- start_time: prefer order_team_assignments.time_slot, fall back to orders.scheduled_time
  CASE
    WHEN ota.time_slot  ~ '^\d{2}:\d{2}' THEN ota.time_slot::time
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}' THEN o.scheduled_time::time
    ELSE NULL
  END                                     AS start_time,

  -- end_time: start + duration (hours integer), or start + 2h default
  CASE
    WHEN ota.time_slot ~ '^\d{2}:\d{2}' AND ota.duration ~ '^\d+$'
      THEN (ota.time_slot::time + (ota.duration::int * interval '1 hour'))
    WHEN ota.time_slot ~ '^\d{2}:\d{2}'
      THEN (ota.time_slot::time + interval '2 hours')
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}'
      THEN (o.scheduled_time::time + interval '2 hours')
    ELSE NULL
  END                                     AS end_time,

  COALESCE(o.type, 'normal_order')        AS visit_type,
  COALESCE(o.status::text, 'scheduled')  AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  -- services column shape is [{name, qty}] — no UUID service_id present.
  -- Stored as name strings only; use NULL until a FK is added to this column.
  NULL::uuid                              AS service_id

FROM public.order_team_assignments  ota
JOIN public.orders                  o   ON o.id  = ota.order_id
JOIN public.teams                   t   ON t.id  = ota.team_id
LEFT JOIN public.customers          c   ON c.id  = o.customer_id

UNION ALL

-- Source 2: Contract visits
SELECT
  cv.id                                   AS id,
  'contract_visit'::text                  AS source_type,
  cv.team_id                              AS team_id,
  t.division::text                        AS division,
  t.is_qc                                 AS is_qc,
  cv.scheduled_date                       AS visit_date,
  NULL::time                              AS start_time,
  NULL::time                              AS end_time,
  'contract_visit'::text                  AS visit_type,
  CASE WHEN cv.completed THEN 'completed' ELSE 'scheduled' END AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  -- contract_visits stores service as a name string (service_name), not a UUID FK.
  -- If your schema adds a service_id FK to contract_visits later, replace NULL here.
  NULL::uuid                              AS service_id

FROM public.contract_visits  cv
JOIN public.teams             t    ON t.id  = cv.team_id
LEFT JOIN public.contracts    con  ON con.id = cv.contract_id
LEFT JOIN public.customers    c    ON c.id  = con.customer_id
WHERE cv.team_id IS NOT NULL;

-- Read-only: grant SELECT to authenticated role used by Supabase client
GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar view over order_team_assignments and contract_visits. Read-only.';
