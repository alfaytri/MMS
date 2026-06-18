-- ─────────────────────────────────────────────────────────────────────────────
-- Extend calendar_visits view with a fourth source: pending follow_up_requests.
--
-- A pending follow-up request reserves a team+date+window the same way a
-- confirmed booking does. The UI surfaces it as a distinct yellow "Requested"
-- card so dispatchers can see what slots are already spoken-for by customer
-- follow-up asks.
--
-- Base: 20260604163220_fix_security_advisor_errors.sql (security_invoker = true,
-- divisions.slug for division text, service_customers + customers coalesced).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.calendar_visits
WITH (security_invoker = true) AS

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
  COALESCE(o.status::text, 'scheduled')   AS status,
  COALESCE(sc.name, c.name)               AS customer_name,
  COALESCE(o.service_customer_id, c.id)   AS customer_id,
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
  COALESCE(sc.name, c.name)               AS customer_name,
  COALESCE(sv.service_customer_id, c.id)  AS customer_id,
  NULL::uuid                              AS service_id,
  sv.visit_id                             AS order_number,
  sv.arrival_phone                        AS customer_phone,
  'Site Visit'::text                      AS services_summary
FROM public.site_visit_team_assignments   svta
JOIN public.site_visits                   sv  ON sv.id  = svta.visit_id
JOIN public.teams                         t   ON t.id  = svta.team_id
JOIN public.divisions                     d   ON d.id  = t.division_id
LEFT JOIN public.customers                c   ON c.id  = sv.customer_id
LEFT JOIN public.service_customers        sc  ON sc.id = sv.service_customer_id

UNION ALL

-- Source 4: Pending follow-up requests
SELECT
  fur.id                                  AS id,
  'follow_up_request'::text               AS source_type,
  fur.requested_team_id                   AS team_id,
  d.slug                                  AS division,
  t.is_qc                                 AS is_qc,
  fur.requested_date                      AS visit_date,
  fur.requested_time_from                 AS start_time,
  fur.requested_time_to                   AS end_time,
  'follow_up_request'::text               AS visit_type,
  fur.status::text                        AS status,
  COALESCE(sc.name, c.name, 'Unknown')    AS customer_name,
  COALESCE(parent.service_customer_id, c.id) AS customer_id,
  NULL::uuid                              AS service_id,
  fur.request_number                      AS order_number,
  NULL::text                              AS customer_phone,
  (
    SELECT string_agg(elem->>'name', ', ')
    FROM jsonb_array_elements(fur.services_to_followup) elem
  )                                       AS services_summary
FROM public.follow_up_requests fur
JOIN public.teams              t      ON t.id = fur.requested_team_id
JOIN public.divisions          d      ON d.id = t.division_id
LEFT JOIN public.orders        parent ON parent.id = fur.parent_order_id
LEFT JOIN public.customers     c      ON c.id  = parent.customer_id
LEFT JOIN public.service_customers sc ON sc.id = parent.service_customer_id
WHERE fur.status = 'pending'
  AND fur.requested_date      IS NOT NULL
  AND fur.requested_time_from IS NOT NULL
  AND fur.requested_time_to   IS NOT NULL;

GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar over orders + contract_visits + site_visits + pending follow_up_requests. Read-only.';
