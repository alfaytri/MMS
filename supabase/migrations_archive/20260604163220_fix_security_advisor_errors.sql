-- Fix 7 Supabase Security Advisor ERRORS
-- 4 × Security Definer Views  → recreate with security_invoker = true
-- 3 × RLS Disabled on Tables  → enable RLS + add authenticated policies

-- ═══════════════════════════════════════════════════════════════════════
-- 1. SECURITY DEFINER VIEWS → SECURITY INVOKER
-- ═══════════════════════════════════════════════════════════════════════

-- 1a. subscription_packages_with_counts
CREATE OR REPLACE VIEW public.subscription_packages_with_counts
WITH (security_invoker = true) AS
SELECT
  sp.*,
  COALESCE(sub_cnt.active_subscribers, 0)::int AS subscriber_count,
  COALESCE(svc_cnt.service_count,       0)::int AS service_count
FROM subscription_packages sp
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS active_subscribers
  FROM customer_subscriptions
  WHERE status = 'active'
  GROUP BY package_id
) sub_cnt ON sub_cnt.package_id = sp.id
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS service_count
  FROM subscription_package_services
  GROUP BY package_id
) svc_cnt ON svc_cnt.package_id = sp.id;

-- 1b. calendar_visits (from 20260511200000)
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

-- 1c. warehouse_stock_view
CREATE OR REPLACE VIEW public.warehouse_stock_view
WITH (security_invoker = true) AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ii.name_en  AS item_name,
  ibv.brand,
  ii.sku,
  ii.unit,
  SUM(f.remaining_qty) AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost) AS total_value
FROM fifo_cost_layers f
JOIN inventory_brand_variants ibv ON ibv.id = f.brand_variant_id
JOIN inventory_items          ii  ON ii.id  = ibv.item_id
WHERE f.remaining_qty > 0
  AND f.warehouse_id IS NOT NULL
GROUP BY f.warehouse_id, f.brand_variant_id, ii.name_en, ibv.brand, ii.sku, ii.unit;

-- 1d. v_team_monthly_overtime (from 20260520150000)
CREATE OR REPLACE VIEW public.v_team_monthly_overtime
WITH (security_invoker = true) AS
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


-- ═══════════════════════════════════════════════════════════════════════
-- 2. ENABLE RLS ON 3 PUBLIC TABLES + ADD AUTHENTICATED POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- 2a. employee_services
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read employee_services"
  ON public.employee_services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage employee_services"
  ON public.employee_services FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2b. tool_assignments
ALTER TABLE public.tool_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tool_assignments"
  ON public.tool_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage tool_assignments"
  ON public.tool_assignments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2c. installed_products
ALTER TABLE public.installed_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read installed_products"
  ON public.installed_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage installed_products"
  ON public.installed_products FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
