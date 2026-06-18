-- supabase/migrations/20260511100003_update_order_rpcs_service_customer.sql
-- Update create_order_with_dates, create_site_visit, save_quotation to accept
-- p_service_customer_id (service_customers FK) instead of p_customer_id.
-- Also makes legacy customer_id columns nullable (transitional — dropped in Migration B).

-- ── 0. Make customer_id nullable (old column stays until Migration B) ─────────
ALTER TABLE public.orders      ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.quotations  ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.site_visits ALTER COLUMN customer_id DROP NOT NULL;

-- ── 1. create_order_with_dates ────────────────────────────────────────────────
-- Drop all known overloads (parameter set changed across multiple migrations).
-- v1 (original 13-param, no division):
DROP FUNCTION IF EXISTS public.create_order_with_dates(text, uuid, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb);
-- v2 (14-param, with division):
DROP FUNCTION IF EXISTS public.create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb);
-- v3 (13-param, with phone_id uuid as 3rd arg):
DROP FUNCTION IF EXISTS public.create_order_with_dates(text, uuid, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb, jsonb);

CREATE FUNCTION public.create_order_with_dates(
  p_order_id            text,
  p_service_customer_id uuid,
  p_type                text,
  p_division            text,
  p_status              text,
  p_scheduled_date      date,
  p_total_amount        numeric,
  p_address             text,
  p_notes               text,
  p_arrival_phone       text,
  p_attachments         jsonb,
  p_services            jsonb,
  p_visit_dates         jsonb,
  p_assignments         jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, notes, has_invoice, arrival_phone, attachments
  ) VALUES (
    p_order_id,
    p_service_customer_id,
    p_type,
    NULLIF(p_division, ''),
    p_status::order_status,
    'not_sent'::confirmation_status,
    p_scheduled_date,
    p_total_amount,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    false,
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      (v_item->>'duration')::int,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      CASE WHEN v_item->'configuration' IS NULL OR v_item->>'configuration' = 'null'
           THEN NULL ELSE v_item->'configuration' END,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    BEGIN
      INSERT INTO public.order_team_assignments (
        order_id, team_id, services, scheduled_date, time_slot, duration
      ) VALUES (
        v_order_id,
        (v_item->>'team_id')::uuid,
        COALESCE(v_item->'services', '[]'::jsonb),
        (v_item->>'scheduled_date')::date,
        v_item->>'time_slot',
        v_item->>'duration'
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'slot_conflict: Team is already booked for that time slot on %', v_item->>'scheduled_date'
          USING ERRCODE = 'P0001';
    END;
  END LOOP;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ── 2. create_site_visit ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_site_visit(text, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb);

CREATE FUNCTION public.create_site_visit(
  p_visit_id            text,
  p_service_customer_id uuid,
  p_status              text,
  p_mode                text,
  p_scheduled_date      date,
  p_address             text,
  p_notes               text,
  p_arrival_phone       text,
  p_attachments         jsonb,
  p_visit_dates         jsonb,
  p_assignments         jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, service_customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments
  ) VALUES (
    p_visit_id,
    p_service_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_visit_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_dates (visit_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_visit_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_team_assignments (
      visit_id, team_id, scheduled_date, time_slot, duration
    ) VALUES (
      v_visit_id,
      (v_item->>'team_id')::uuid,
      (v_item->>'scheduled_date')::date,
      v_item->>'time_slot',
      COALESCE(v_item->>'duration', '1')
    );
  END LOOP;

  RETURN v_visit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_site_visit(text, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb) TO authenticated;

-- ── 3. save_quotation ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_quotation(text, uuid, text, quotation_status, numeric, text, date, timestamptz, jsonb);

CREATE FUNCTION public.save_quotation(
  p_quotation_id        text,
  p_service_customer_id uuid,
  p_division            text,
  p_status              text,
  p_total_amount        numeric,
  p_notes               text,
  p_expiry_date         date,
  p_sent_date           timestamptz,
  p_line_items          jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::quotation_status,
    p_total_amount,
    NULLIF(p_notes, ''),
    CURRENT_DATE,
    p_expiry_date,
    p_sent_date
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    service_customer_id = EXCLUDED.service_customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date
  RETURNING id INTO v_uuid;

  DELETE FROM public.quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.quotation_line_items (
      quotation_id, service_id, name, path, qty, price, duration
    ) VALUES (
      v_uuid,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      NULLIF(v_item->>'duration', '')::int
    );
  END LOOP;

  RETURN v_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_quotation(text, uuid, text, text, numeric, text, date, timestamptz, jsonb) TO authenticated;

-- ── 4. Update calendar_visits — join service_customers for new records ─────────
CREATE OR REPLACE VIEW public.calendar_visits AS

-- Source 1: Order team assignments
SELECT
  ota.id                                  AS id,
  'order'::text                           AS source_type,
  ota.team_id                             AS team_id,
  t.division::text                        AS division,
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
LEFT JOIN public.customers          c   ON c.id  = o.customer_id
LEFT JOIN public.service_customers  sc  ON sc.id = o.service_customer_id

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
  NULL::uuid                              AS service_id,
  NULL::text                              AS order_number,
  NULL::text                              AS customer_phone,
  NULL::text                              AS services_summary
FROM public.contract_visits  cv
JOIN public.teams             t    ON t.id  = cv.team_id
LEFT JOIN public.contracts    con  ON con.id = cv.contract_id
LEFT JOIN public.customers    c    ON c.id  = con.customer_id
WHERE cv.team_id IS NOT NULL

UNION ALL

-- Source 3: Site visit team assignments
SELECT
  svta.id                                 AS id,
  'site_visit'::text                      AS source_type,
  svta.team_id                            AS team_id,
  t.division::text                        AS division,
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
LEFT JOIN public.customers                c   ON c.id  = sv.customer_id
LEFT JOIN public.service_customers        sc  ON sc.id = sv.service_customer_id;

GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar view. customer_name coalesces service_customers and legacy customers. end_time uses GREATEST(1, duration).';
