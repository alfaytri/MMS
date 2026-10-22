-- Customer consolidation — Stage 5.7 prep (non-destructive): flip the last service_customers-reading
-- DB objects onto the unified customers side so nothing references service_customers before the DROP.
--   * calendar_visits view: drop the service_customers joins; name/customer_id from customers/o.customer_id
--   * get_due_reminders: read o.customer_id + customers + customer_phones (RETURNS column name kept)
--   * get_pending_order_approvals / get_qc_inspections: customer_name from customers via o.customer_id
-- Orders/site_visits are dual-keyed (customer_id populated); new rows are customers-only. reminder_sends
-- has no FK to service_customers, so its (plain uuid) service_customer_id can carry customers ids.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

CREATE OR REPLACE VIEW public.calendar_visits AS
 SELECT ota.id,
    'order'::text AS source_type,
    ota.team_id,
    d.slug AS division,
    t.is_qc,
    ota.scheduled_date AS visit_date,
        CASE
            WHEN ota.time_slot ~ '^\d{2}:\d{2}'::text THEN ota.time_slot::time without time zone
            WHEN o.scheduled_time ~ '^\d{2}:\d{2}'::text THEN o.scheduled_time::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN ota.time_slot ~ '^\d{2}:\d{2}'::text AND ota.duration ~ '^\d+$'::text THEN ota.time_slot::time without time zone + GREATEST(1, ota.duration::integer)::double precision * '01:00:00'::interval
            WHEN ota.time_slot ~ '^\d{2}:\d{2}'::text THEN ota.time_slot::time without time zone + '02:00:00'::interval
            WHEN o.scheduled_time ~ '^\d{2}:\d{2}'::text THEN o.scheduled_time::time without time zone + '02:00:00'::interval
            ELSE NULL::time without time zone
        END AS end_time,
    COALESCE(o.type, 'normal_order'::text) AS visit_type,
    COALESCE(o.status::text, 'scheduled'::text) AS status,
    c.name AS customer_name,
    o.customer_id AS customer_id,
    NULL::uuid AS service_id,
    o.order_id AS order_number,
    o.arrival_phone AS customer_phone,
    ( SELECT string_agg((os.qty::text || '× '::text) || os.name, ', '::text ORDER BY os.name) AS string_agg
           FROM order_services os
          WHERE os.order_id = o.id) AS services_summary,
    o.id AS source_id,
    pcr.full_name AS created_by_name
   FROM order_team_assignments ota
     JOIN orders o ON o.id = ota.order_id
     JOIN teams t ON t.id = ota.team_id
     JOIN company_divisions d ON d.id = t.division_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN user_data pcr ON pcr.id = o.created_by
UNION ALL
 SELECT cv.id,
    'contract_visit'::text AS source_type,
    cv.team_id,
    d.slug AS division,
    t.is_qc,
    cv.scheduled_date AS visit_date,
    cv.start_time,
    cv.end_time,
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
   FROM contract_visits cv
     JOIN teams t ON t.id = cv.team_id
     JOIN company_divisions d ON d.id = t.division_id
     LEFT JOIN contracts con ON con.id = cv.contract_id
     LEFT JOIN customers c ON c.id = con.customer_id
  WHERE cv.team_id IS NOT NULL
UNION ALL
 SELECT svta.id,
    'site_visit'::text AS source_type,
    svta.team_id,
    d.slug AS division,
    t.is_qc,
    svta.scheduled_date AS visit_date,
        CASE
            WHEN svta.time_slot ~ '^\d{2}:\d{2}'::text THEN svta.time_slot::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN svta.time_slot ~ '^\d{2}:\d{2}'::text AND svta.duration ~ '^\d+$'::text THEN svta.time_slot::time without time zone + GREATEST(1, svta.duration::integer)::double precision * '01:00:00'::interval
            WHEN svta.time_slot ~ '^\d{2}:\d{2}'::text THEN svta.time_slot::time without time zone + '01:00:00'::interval
            ELSE NULL::time without time zone
        END AS end_time,
    'site_visit'::text AS visit_type,
    sv.status,
    c.name AS customer_name,
    sv.customer_id AS customer_id,
    NULL::uuid AS service_id,
    sv.visit_id AS order_number,
    sv.arrival_phone AS customer_phone,
    'Site Visit'::text AS services_summary,
    sv.id AS source_id,
    pcr.full_name AS created_by_name
   FROM site_visit_team_assignments svta
     JOIN site_visits sv ON sv.id = svta.visit_id
     JOIN teams t ON t.id = svta.team_id
     JOIN company_divisions d ON d.id = t.division_id
     LEFT JOIN customers c ON c.id = sv.customer_id
     LEFT JOIN user_data pcr ON pcr.id = sv.created_by
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
    fur.status::text AS status,
    COALESCE(c.name, 'Unknown'::text) AS customer_name,
    parent.customer_id AS customer_id,
    NULL::uuid AS service_id,
    fur.request_number AS order_number,
    NULL::text AS customer_phone,
    ( SELECT string_agg(elem.value ->> 'name'::text, ', '::text) AS string_agg
           FROM jsonb_array_elements(fur.services_to_followup) elem(value)) AS services_summary,
    fur.id AS source_id,
    NULL::text AS created_by_name
   FROM follow_up_requests fur
     JOIN teams t ON t.id = fur.requested_team_id
     JOIN company_divisions d ON d.id = t.division_id
     LEFT JOIN orders parent ON parent.id = fur.parent_order_id
     LEFT JOIN customers c ON c.id = parent.customer_id
  WHERE fur.status = 'pending'::follow_up_request_status AND fur.requested_date IS NOT NULL AND fur.requested_time_from IS NOT NULL AND fur.requested_time_to IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_due_reminders()
 RETURNS TABLE(service_id uuid, service_name text, service_customer_id uuid, customer_name text, phone text, reminder_template_id uuid, wati_template_name text, param_names jsonb, interval_months integer, last_service_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name_en, o.customer_id, c.name,
         (SELECT p.phone FROM public.customer_phones p
           WHERE p.customer_id = o.customer_id
           ORDER BY p.is_primary DESC NULLS LAST, p.created_at LIMIT 1),
         rt.id, rt.wati_template_name, rt.param_names, rt.interval_months,
         MAX(o.completed_at)::date
  FROM public.services s
  JOIN public.reminder_templates rt
    ON rt.id = s.reminder_template_id AND rt.active AND COALESCE(rt.wati_template_name,'') <> ''
  JOIN public.order_services os ON os.service_id = s.id
  JOIN public.orders o ON o.id = os.order_id AND o.status = 'completed' AND o.completed_at IS NOT NULL
  JOIN public.customers c ON c.id = o.customer_id
  WHERE s.status = 'active' AND s.reminder_template_id IS NOT NULL
  GROUP BY s.id, s.name_en, o.customer_id, c.name, rt.id, rt.wati_template_name, rt.param_names, rt.interval_months
  HAVING MAX(o.completed_at) <= now() - make_interval(months => rt.interval_months)
     AND NOT EXISTS (
       SELECT 1 FROM public.reminder_sends rs
       WHERE rs.service_id = s.id AND rs.service_customer_id = o.customer_id
         AND rs.status = 'sent'
         AND rs.sent_at > now() - make_interval(months => rt.interval_months)
     );
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_order_approvals()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at ASC), '[]'::jsonb)
  FROM (
    SELECT
      a.id          AS approval_id,
      a.source_id   AS order_uuid,
      a.step_role,
      a.step_order,
      a.reason,
      a.created_at,
      o.order_id,
      o.total_amount,
      o.scheduled_date,
      o.division,
      o.is_emergency,
      c.name        AS customer_name
    FROM public.sale_order_approvals a
    JOIN public.orders o             ON o.id = a.source_id
    LEFT JOIN public.customers c     ON c.id = o.customer_id
    WHERE a.source_type   = 'order'
      AND a.approval_type = 'service_order'
      AND a.status        = 'pending'
      AND a.is_active
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.get_qc_inspections(p_scope text DEFAULT 'mine'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_result     jsonb;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_data WHERE auth_user_id = auth.uid();

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT i.id, i.order_id, i.stage, i.points, i.breakdown, i.timing, i.status,
           i.inspection_date, i.analyst_id, i.findings, i.reject_reason, i.photo_urls,
           i.created_at, i.decided_at,
           o.order_id AS order_number, o.division, o.scheduled_date,
           c.name AS customer_name,
           an.full_name AS analyst_name
    FROM public.qc_inspections i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.customers c ON c.id = o.customer_id
    LEFT JOIN public.user_data an ON an.id = i.analyst_id
    WHERE
      CASE
        WHEN p_scope = 'mine'   THEN i.analyst_id = v_profile_id AND i.status = 'pending_analyst'
        WHEN p_scope = 'review' THEN i.status = 'pending_manager'
        WHEN p_scope = 'open'   THEN i.status IN ('pending_analyst','pending_manager')
        ELSE true
      END
  ) x;

  RETURN v_result;
END;
$function$;

COMMIT;
