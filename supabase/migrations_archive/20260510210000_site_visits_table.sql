-- ═══════════════════════════════════════════════════════════════════════════
-- Site Visits — separate table from orders.
--
-- Rationale: site visits have a different business meaning from service orders.
-- They require no division, no services, no invoice, and carry their own
-- numbering sequence (V/YYYY/MM/NNNN vs N/YYYY/MM/NNNN for orders).
-- Separating them makes analysis and reporting straightforward.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. site_visits ───────────────────────────────────────────────────────────
CREATE TABLE site_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        TEXT NOT NULL UNIQUE,        -- V/2026/05/0001
  customer_id     UUID NOT NULL REFERENCES customers(id),
  phone_id        UUID REFERENCES customer_phones(id),
  status          TEXT NOT NULL DEFAULT 'scheduled',
  mode            TEXT NOT NULL DEFAULT 'normal',
  scheduled_date  DATE,
  address         TEXT,
  notes           TEXT,
  arrival_phone   TEXT,
  attachments     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_site_visits_customer   ON site_visits(customer_id);
CREATE INDEX idx_site_visits_scheduled  ON site_visits(scheduled_date);
CREATE INDEX idx_site_visits_visit_id   ON site_visits(visit_id);

-- ── 2. site_visit_team_assignments ───────────────────────────────────────────
CREATE TABLE site_visit_team_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        UUID NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES teams(id),
  scheduled_date  DATE,
  time_slot       TEXT,
  duration        TEXT DEFAULT '1',
  services        JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_svta_team_date ON site_visit_team_assignments(team_id, scheduled_date);

-- ── 3. site_visit_dates ──────────────────────────────────────────────────────
CREATE TABLE site_visit_dates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  visit_date  DATE NOT NULL,
  from_time   TIME,
  to_time     TIME,
  sort_order  SMALLINT DEFAULT 0
);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE site_visits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_dates           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON site_visits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON site_visit_team_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON site_visit_dates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. create_site_visit RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_site_visit(
  p_visit_id       text,
  p_customer_id    uuid,
  p_status         text,
  p_mode           text,
  p_scheduled_date date,
  p_address        text,
  p_notes          text,
  p_arrival_phone  text,
  p_attachments    jsonb,   -- [{url, name, type}] or NULL
  p_visit_dates    jsonb,   -- [{visit_date, from_time, to_time, sort_order}]
  p_assignments    jsonb    -- [{team_id, scheduled_date, time_slot, duration}]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  -- 1. Insert the site visit
  INSERT INTO site_visits (
    visit_id, customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments
  ) VALUES (
    p_visit_id,
    p_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments
  ) RETURNING id INTO v_visit_id;

  -- 2. Insert visit date windows
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO site_visit_dates (visit_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_visit_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  -- 3. Insert team assignments
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO site_visit_team_assignments (
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

-- ── 6. Extend calendar_visits view to include site visits ────────────────────
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

-- Source 3: Site visits (new)
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
      THEN (svta.time_slot::time + (svta.duration::int * interval '1 hour'))
    WHEN svta.time_slot ~ '^\d{2}:\d{2}'
      THEN (svta.time_slot::time + interval '1 hour')
    ELSE NULL
  END                                     AS end_time,
  'site_visit'::text                      AS visit_type,
  sv.status                               AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  NULL::uuid                              AS service_id,
  sv.visit_id                             AS order_number,
  sv.arrival_phone                        AS customer_phone,
  'Site Visit'::text                      AS services_summary
FROM public.site_visit_team_assignments   svta
JOIN public.site_visits                   sv  ON sv.id  = svta.visit_id
JOIN public.teams                         t   ON t.id  = svta.team_id
LEFT JOIN public.customers                c   ON c.id  = sv.customer_id;

GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar view over order_team_assignments, contract_visits, and site_visit_team_assignments. Read-only.';
