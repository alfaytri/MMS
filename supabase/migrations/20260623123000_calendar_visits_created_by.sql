-- Add `created_by_name` to the calendar_visits view so hover tooltips on
-- calendar blocks can display who created the order / site visit.
-- Contract visits and follow-up requests don't track a creator → NULL.

DROP VIEW IF EXISTS public.calendar_visits;

CREATE VIEW public.calendar_visits WITH (security_invoker='true') AS
 SELECT ota.id,
    'order'::text AS source_type,
    ota.team_id,
    d.slug AS division,
    t.is_qc,
    ota.scheduled_date AS visit_date,
        CASE
            WHEN (ota.time_slot ~ '^\d{2}:\d{2}'::text) THEN (ota.time_slot)::time without time zone
            WHEN (o.scheduled_time ~ '^\d{2}:\d{2}'::text) THEN (o.scheduled_time)::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN ((ota.time_slot ~ '^\d{2}:\d{2}'::text) AND (ota.duration ~ '^\d+$'::text)) THEN ((ota.time_slot)::time without time zone + ((GREATEST(1, (ota.duration)::integer))::double precision * '01:00:00'::interval))
            WHEN (ota.time_slot ~ '^\d{2}:\d{2}'::text) THEN ((ota.time_slot)::time without time zone + '02:00:00'::interval)
            WHEN (o.scheduled_time ~ '^\d{2}:\d{2}'::text) THEN ((o.scheduled_time)::time without time zone + '02:00:00'::interval)
            ELSE NULL::time without time zone
        END AS end_time,
    COALESCE(o.type, 'normal_order'::text) AS visit_type,
    COALESCE((o.status)::text, 'scheduled'::text) AS status,
    COALESCE(sc.name, c.name) AS customer_name,
    COALESCE(o.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    o.order_id AS order_number,
    o.arrival_phone AS customer_phone,
    ( SELECT string_agg((((os.qty)::text || '× '::text) || os.name), ', '::text ORDER BY os.name) AS string_agg
           FROM public.order_services os
          WHERE (os.order_id = o.id)) AS services_summary,
    o.id AS source_id,
    pcr.full_name AS created_by_name
   FROM ((((((public.order_team_assignments ota
     JOIN public.orders o ON ((o.id = ota.order_id)))
     JOIN public.teams t ON ((t.id = ota.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.customers c ON ((c.id = o.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = o.service_customer_id)))
     LEFT JOIN public.profiles pcr ON ((pcr.id = o.created_by)))
UNION ALL
 SELECT cv.id,
    'contract_visit'::text AS source_type,
    cv.team_id,
    d.slug AS division,
    t.is_qc,
    cv.scheduled_date AS visit_date,
    NULL::time without time zone AS start_time,
    NULL::time without time zone AS end_time,
    'contract_visit'::text AS visit_type,
        CASE
            WHEN cv.completed THEN 'completed'::text
            ELSE 'scheduled'::text
        END AS status,
    c.name AS customer_name,
    c.id AS customer_id,
    NULL::uuid AS service_id,
    NULL::text AS order_number,
    NULL::text AS customer_phone,
    NULL::text AS services_summary,
    cv.contract_id AS source_id,
    NULL::text AS created_by_name
   FROM ((((public.contract_visits cv
     JOIN public.teams t ON ((t.id = cv.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.contracts con ON ((con.id = cv.contract_id)))
     LEFT JOIN public.customers c ON ((c.id = con.customer_id)))
  WHERE (cv.team_id IS NOT NULL)
UNION ALL
 SELECT svta.id,
    'site_visit'::text AS source_type,
    svta.team_id,
    d.slug AS division,
    t.is_qc,
    svta.scheduled_date AS visit_date,
        CASE
            WHEN (svta.time_slot ~ '^\d{2}:\d{2}'::text) THEN (svta.time_slot)::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN ((svta.time_slot ~ '^\d{2}:\d{2}'::text) AND (svta.duration ~ '^\d+$'::text)) THEN ((svta.time_slot)::time without time zone + ((GREATEST(1, (svta.duration)::integer))::double precision * '01:00:00'::interval))
            WHEN (svta.time_slot ~ '^\d{2}:\d{2}'::text) THEN ((svta.time_slot)::time without time zone + '01:00:00'::interval)
            ELSE NULL::time without time zone
        END AS end_time,
    'site_visit'::text AS visit_type,
    sv.status,
    COALESCE(sc.name, c.name) AS customer_name,
    COALESCE(sv.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    sv.visit_id AS order_number,
    sv.arrival_phone AS customer_phone,
    'Site Visit'::text AS services_summary,
    sv.id AS source_id,
    pcr.full_name AS created_by_name
   FROM ((((((public.site_visit_team_assignments svta
     JOIN public.site_visits sv ON ((sv.id = svta.visit_id)))
     JOIN public.teams t ON ((t.id = svta.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.customers c ON ((c.id = sv.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = sv.service_customer_id)))
     LEFT JOIN public.profiles pcr ON ((pcr.id = sv.created_by)))
UNION ALL
 SELECT fur.id,
    'follow_up_request'::text AS source_type,
    fur.requested_team_id AS team_id,
    d.slug AS division,
    t.is_qc,
    fur.requested_date AS visit_date,
    fur.requested_time_from AS start_time,
    fur.requested_time_to AS end_time,
    'follow_up_request'::text AS visit_type,
    (fur.status)::text AS status,
    COALESCE(sc.name, c.name, 'Unknown'::text) AS customer_name,
    COALESCE(parent.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    fur.request_number AS order_number,
    NULL::text AS customer_phone,
    ( SELECT string_agg((elem.value ->> 'name'::text), ', '::text) AS string_agg
           FROM jsonb_array_elements(fur.services_to_followup) elem(value)) AS services_summary,
    fur.id AS source_id,
    NULL::text AS created_by_name
   FROM (((((public.follow_up_requests fur
     JOIN public.teams t ON ((t.id = fur.requested_team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.orders parent ON ((parent.id = fur.parent_order_id)))
     LEFT JOIN public.customers c ON ((c.id = parent.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = parent.service_customer_id)))
  WHERE ((fur.status = 'pending'::public.follow_up_request_status) AND (fur.requested_date IS NOT NULL) AND (fur.requested_time_from IS NOT NULL) AND (fur.requested_time_to IS NOT NULL));

COMMENT ON VIEW public.calendar_visits IS 'Unified calendar over orders + contract_visits + site_visits + pending follow_up_requests. Read-only. `id` is the row id within the source table; `source_id` is the canonical id of the underlying record. `created_by_name` is populated for orders + site_visits, NULL for contract visits + follow-up requests.';
