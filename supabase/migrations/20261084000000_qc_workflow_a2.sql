-- QC Quality-Analyst Workflow — A2: pre-booking gate + scoring engine + QA/Ops queues.
--
-- Builds on A1 (20261082: qc_point_rules, teams.quality_score, app_settings.qc_config).
-- Decisions (design doc 2026-09-12, resolved 2026-09-14):
--   • HARD GATE: a QC-triggered order is held at status='pending-approval'
--     (reused; disambiguated by orders.qc_inspection_id) until the Ops Manager
--     books it. Final booking (→'scheduled') happens only when NO gate remains
--     (shared _maybe_book_order, called by both the QC book and the risk
--     approve_order_request).
--   • customer_complaint = presence of an order_customer_notes row on the order
--     (or its parent) — call-centre logs a complaint as a note on the order card.
--   • new_member / new_leader = diff of this order's team snapshot vs the team's
--     previous order snapshot (order_team_snapshots, written for EVERY order).
--   • backwork / new_service / new_team / team_score_watch are derived from order
--     + assignment history.
--   • QA assignment: round-robin over recipients_for_permission('qc.analyst')
--     within the order's division, balanced by open-inspection count.
--
-- Base function bodies (create_order_with_dates, approve_order_request) were
-- taken from the LIVE whole-app dev DB (wkmvjxxmzstsvahuiwsz) via
-- pg_get_functiondef and reproduced verbatim except the marked QC additions.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════════════════════

-- Customer notes on an order card (call-centre complaint log). Presence => complaint.
CREATE TABLE IF NOT EXISTS public.order_customer_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  note            text NOT NULL,
  created_by      uuid REFERENCES public.user_data(id),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_customer_notes_order ON public.order_customer_notes(order_id);
ALTER TABLE public.order_customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_customer_notes_rw ON public.order_customer_notes;
CREATE POLICY order_customer_notes_rw ON public.order_customer_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Team-composition snapshot per order (baseline for new_member/new_leader).
CREATE TABLE IF NOT EXISTS public.order_team_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL,
  leader_id   uuid,
  member_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_team_snapshots_team ON public.order_team_snapshots(team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_team_snapshots_order ON public.order_team_snapshots(order_id);
ALTER TABLE public.order_team_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_team_snapshots_rw ON public.order_team_snapshots;
CREATE POLICY order_team_snapshots_rw ON public.order_team_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- QC inspections — one per pre-booking (or post-completion, A3) inspection.
CREATE TABLE IF NOT EXISTS public.qc_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  site_key        text,
  inspection_date date,
  stage           text NOT NULL DEFAULT 'pre_booking',
  points          int  NOT NULL DEFAULT 0,
  breakdown       jsonb NOT NULL DEFAULT '[]'::jsonb,
  timing          text NOT NULL DEFAULT 'along',
  status          text NOT NULL DEFAULT 'pending_analyst',
  analyst_id      uuid REFERENCES public.user_data(id),
  reviewed_by     uuid REFERENCES public.user_data(id),
  reviewed_by_name text,
  qc_order_id     uuid REFERENCES public.orders(id) ON DELETE SET NULL,  -- the booked QC visit (A3)
  findings        text,
  scores          jsonb,
  reject_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  CONSTRAINT qc_inspections_stage_chk  CHECK (stage IN ('pre_booking','post_completion')),
  CONSTRAINT qc_inspections_status_chk CHECK (status IN ('pending_analyst','pending_manager','approved','rejected','cancelled')),
  CONSTRAINT qc_inspections_timing_chk CHECK (timing IN ('before','along','after'))
);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_order    ON public.qc_inspections(order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_status   ON public.qc_inspections(status);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_analyst  ON public.qc_inspections(analyst_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_site_day ON public.qc_inspections(site_key, inspection_date);
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qc_inspections_rw ON public.qc_inspections;
CREATE POLICY qc_inspections_rw ON public.qc_inspections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Link the held order to its inspection (nullable; SET NULL if inspection gone).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS qc_inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_qc_inspection ON public.orders(qc_inspection_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Scoring engine — sum matched active qc_point_rules for an order.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.qc_score_order(p_order_id uuid)
RETURNS TABLE(points int, breakdown jsonb, timing text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_order       RECORD;
  r             RECORD;
  v_points      int := 0;
  v_breakdown   jsonb := '[]'::jsonb;
  v_timing      text := 'along';
  v_top_points  int := -1;
  b_backwork    boolean;
  b_complaint   boolean;
  b_new_team    boolean;
  b_new_service boolean;
  b_watch       boolean;
  b_new_member  boolean;
  b_new_leader  boolean;
BEGIN
  SELECT o.id, o.type, o.parent_order_id, o.service_customer_id, o.division
    INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  b_backwork := (v_order.type = 'backwork');

  b_complaint := EXISTS (SELECT 1 FROM public.order_customer_notes n WHERE n.order_id = p_order_id)
    OR (v_order.parent_order_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.order_customer_notes n WHERE n.order_id = v_order.parent_order_id));

  -- new_team: an assigned team with NO prior orders (brand new).
  b_new_team := EXISTS (
    SELECT 1 FROM public.order_team_assignments a
    WHERE a.order_id = p_order_id
      AND NOT EXISTS (
        SELECT 1 FROM public.order_team_assignments a2
        WHERE a2.team_id = a.team_id AND a2.order_id <> p_order_id
      )
  );

  -- new_service: an EXISTING team (has prior orders) doing a service it hasn't done.
  b_new_service := EXISTS (
    SELECT 1
    FROM public.order_team_assignments a
    JOIN public.order_services os ON os.order_id = p_order_id AND os.service_id IS NOT NULL
    WHERE a.order_id = p_order_id
      AND EXISTS (SELECT 1 FROM public.order_team_assignments ax WHERE ax.team_id = a.team_id AND ax.order_id <> p_order_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.order_team_assignments a2
        JOIN public.order_services os2 ON os2.order_id = a2.order_id AND os2.service_id = os.service_id
        WHERE a2.team_id = a.team_id AND a2.order_id <> p_order_id
      )
  );

  -- team_score_watch: this order is a backwork, OR an assigned team's most recent
  -- prior order was a backwork (the "and its next order" window).
  b_watch := b_backwork OR EXISTS (
    SELECT 1 FROM public.order_team_assignments a
    WHERE a.order_id = p_order_id
      AND (
        SELECT o2.type FROM public.order_team_assignments a2
        JOIN public.orders o2 ON o2.id = a2.order_id
        WHERE a2.team_id = a.team_id AND a2.order_id <> p_order_id
        ORDER BY o2.created_at DESC LIMIT 1
      ) = 'backwork'
  );

  -- new_leader / new_member: diff this order's snapshot vs the team's previous snapshot.
  b_new_leader := EXISTS (
    SELECT 1 FROM public.order_team_snapshots s
    WHERE s.order_id = p_order_id
      AND (
        SELECT sp.leader_id FROM public.order_team_snapshots sp
        WHERE sp.team_id = s.team_id AND sp.order_id <> p_order_id
        ORDER BY sp.created_at DESC LIMIT 1
      ) IS DISTINCT FROM s.leader_id
      AND EXISTS (SELECT 1 FROM public.order_team_snapshots sp2 WHERE sp2.team_id = s.team_id AND sp2.order_id <> p_order_id)
  );
  b_new_member := EXISTS (
    SELECT 1 FROM public.order_team_snapshots s
    WHERE s.order_id = p_order_id
      AND EXISTS (
        SELECT 1 FROM public.order_team_snapshots sp
        WHERE sp.team_id = s.team_id AND sp.order_id <> p_order_id
          AND sp.created_at = (
            SELECT MAX(sp2.created_at) FROM public.order_team_snapshots sp2
            WHERE sp2.team_id = s.team_id AND sp2.order_id <> p_order_id)
          AND EXISTS (SELECT 1 FROM unnest(s.member_ids) m WHERE m <> ALL(sp.member_ids))
      )
  );

  FOR r IN SELECT qpr.scenario, qpr.label, qpr.points, qpr.timing
             FROM public.qc_point_rules qpr WHERE qpr.active
            ORDER BY qpr.points DESC, qpr.sort_order LOOP
    IF (r.scenario = 'backwork'           AND b_backwork)
    OR (r.scenario = 'customer_complaint' AND b_complaint)
    OR (r.scenario = 'new_team'           AND b_new_team)
    OR (r.scenario = 'new_service'        AND b_new_service)
    OR (r.scenario = 'team_score_watch'   AND b_watch)
    OR (r.scenario = 'new_member'         AND b_new_member)
    OR (r.scenario = 'new_leader'         AND b_new_leader)
    THEN
      v_points := v_points + r.points;
      v_breakdown := v_breakdown || jsonb_build_object('scenario', r.scenario, 'label', r.label, 'points', r.points, 'timing', r.timing);
      IF r.points > v_top_points THEN v_top_points := r.points; v_timing := r.timing; END IF;
    END IF;
  END LOOP;

  -- Backwork wins the timing when present.
  IF b_backwork THEN
    SELECT COALESCE(qpr.timing, 'along') INTO v_timing FROM public.qc_point_rules qpr WHERE qpr.scenario = 'backwork' AND qpr.active;
    v_timing := COALESCE(v_timing, 'along');
  END IF;

  RETURN QUERY SELECT v_points, v_breakdown, v_timing;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.qc_score_order(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Book-when-clear helper — book an order only if no gate remains.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._maybe_book_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.sale_order_approvals
        WHERE source_id = p_order_id AND approval_type = 'service_order' AND status = 'pending')
     AND NOT EXISTS (
        SELECT 1 FROM public.qc_inspections i
        JOIN public.orders o ON o.qc_inspection_id = i.id
        WHERE o.id = p_order_id AND i.stage = 'pre_booking'
          AND i.status NOT IN ('approved','rejected','cancelled'))
  THEN
    UPDATE public.orders SET status = 'scheduled'::order_status
    WHERE id = p_order_id AND status = 'pending-approval'::order_status;
  END IF;
END;
$function$;
GRANT EXECUTE ON FUNCTION public._maybe_book_order(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. QC gate — score, dedup, capacity, assign QA, create inspection, hold order.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._apply_qc_gate(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_cfg        jsonb;
  v_threshold  int;
  v_max        int;
  v_mode       text;
  v_score      RECORD;
  v_order      RECORD;
  v_site_key   text;
  v_insp_date  date;
  v_existing   uuid;
  v_insp_id    uuid;
  v_analyst    uuid;
  v_count      int;
  v_guard      int := 0;
BEGIN
  SELECT value INTO v_cfg FROM public.app_settings WHERE key = 'qc_config';
  v_threshold := COALESCE((v_cfg->>'threshold')::int, 5);
  v_max       := GREATEST(COALESCE((v_cfg->>'max_qc_per_day')::int, 3), 1);
  v_mode      := COALESCE(v_cfg->>'same_site_mode', 'combine');

  SELECT * INTO v_score FROM public.qc_score_order(p_order_id);
  IF COALESCE(v_score.points, 0) < v_threshold THEN RETURN false; END IF;

  SELECT o.service_customer_id, o.address_id, o.scheduled_date, o.division
    INTO v_order FROM public.orders o WHERE o.id = p_order_id;

  v_site_key  := COALESCE(v_order.service_customer_id::text,'') || ':' || COALESCE(v_order.address_id::text,'');
  v_insp_date := COALESCE(v_order.scheduled_date, current_date);

  -- Same-site dedup: in 'combine' mode reuse an open inspection for the same site+day.
  IF v_mode = 'combine' THEN
    SELECT id INTO v_existing FROM public.qc_inspections
    WHERE site_key = v_site_key AND inspection_date = v_insp_date AND stage = 'pre_booking'
      AND status NOT IN ('approved','rejected','cancelled')
    ORDER BY created_at LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.orders
       SET qc_inspection_id = v_existing,
           status = 'pending-approval'::order_status
     WHERE id = p_order_id;
    RETURN true;
  END IF;

  -- Daily capacity: roll to the next day until under max (bounded loop).
  LOOP
    SELECT count(*) INTO v_count FROM public.qc_inspections
    WHERE inspection_date = v_insp_date AND stage = 'pre_booking'
      AND status NOT IN ('rejected','cancelled');
    EXIT WHEN v_count < v_max OR v_guard >= 366;
    v_insp_date := v_insp_date + 1;
    v_guard := v_guard + 1;
  END LOOP;

  -- QA assignment: least-loaded analyst in the order's division; fall back to any QA.
  SELECT q.qa INTO v_analyst FROM (
    SELECT r AS qa,
           (SELECT count(*) FROM public.qc_inspections i
             WHERE i.analyst_id = r AND i.status NOT IN ('approved','rejected','cancelled')) AS load
    FROM public.recipients_for_permission('qc.analyst') r
    WHERE EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.company_divisions cd ON cd.id = e.division_id
      WHERE e.profile_id = r AND cd.slug = v_order.division)
  ) q ORDER BY q.load ASC, random() LIMIT 1;

  IF v_analyst IS NULL THEN
    SELECT r INTO v_analyst FROM public.recipients_for_permission('qc.analyst') r
    ORDER BY (SELECT count(*) FROM public.qc_inspections i
               WHERE i.analyst_id = r AND i.status NOT IN ('approved','rejected','cancelled')) ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.qc_inspections (
    order_id, site_key, inspection_date, stage, points, breakdown, timing, status, analyst_id
  ) VALUES (
    p_order_id, v_site_key, v_insp_date, 'pre_booking',
    v_score.points, v_score.breakdown, v_score.timing, 'pending_analyst', v_analyst
  ) RETURNING id INTO v_insp_id;

  UPDATE public.orders
     SET status = 'pending-approval'::order_status,
         qc_inspection_id = v_insp_id
   WHERE id = p_order_id;

  RETURN true;
END;
$function$;
GRANT EXECUTE ON FUNCTION public._apply_qc_gate(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. create_order_with_dates — snapshot team composition + apply the QC gate.
--    Body is the LIVE definition verbatim + the two marked QC additions.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_order_with_dates(
  p_order_id text, p_service_customer_id uuid, p_type text, p_division text,
  p_status text, p_scheduled_date date, p_total_amount numeric, p_address text,
  p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb,
  p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid, p_is_emergency boolean DEFAULT false)
RETURNS TABLE(order_id uuid, pending_approval boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_order_id       uuid;
  v_item           jsonb;
  v_tiers          jsonb;
  v_oldest         timestamptz;
  v_days           int;
  v_needs_approval boolean := false;
  v_pending        boolean := false;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by, is_emergency
  ) VALUES (
    p_order_id, p_service_customer_id, p_type, NULLIF(p_division, ''),
    p_status::order_status, 'not_sent'::confirmation_status, p_scheduled_date,
    p_total_amount, NULLIF(p_address, ''), p_address_id, NULLIF(p_notes, ''),
    false, NULLIF(p_arrival_phone, ''), p_attachments, p_created_by,
    COALESCE(p_is_emergency, false)
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
    IF EXISTS (
      SELECT 1
      FROM public.follow_up_requests fur
      WHERE fur.status = 'pending'
        AND fur.requested_team_id   = (v_item->>'team_id')::uuid
        AND fur.requested_date      = (v_item->>'scheduled_date')::date
        AND fur.requested_time_from IS NOT NULL
        AND fur.requested_time_to   IS NOT NULL
        AND (v_item->>'time_slot')::time < fur.requested_time_to
        AND fur.requested_time_from
              < ((v_item->>'time_slot')::time + ((v_item->>'duration')::int * interval '1 hour'))
    ) THEN
      RAISE EXCEPTION 'slot_conflict: A customer follow-up request reserves that slot for the team on %', v_item->>'scheduled_date'
        USING ERRCODE = 'P0001';
    END IF;

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

  -- ── QC: snapshot each assigned team's composition (baseline for new_member/leader) ──
  INSERT INTO public.order_team_snapshots (order_id, team_id, leader_id, member_ids)
  SELECT DISTINCT a.order_id, a.team_id, t.leader_id,
         COALESCE(ARRAY(SELECT e.id FROM public.employees e WHERE e.team_id = a.team_id), '{}'::uuid[])
  FROM public.order_team_assignments a
  JOIN public.teams t ON t.id = a.team_id
  WHERE a.order_id = v_order_id;

  -- ── Risk gate ──────────────────────────────────────────────────────────
  SELECT (value->'tiers') INTO v_tiers FROM public.app_settings WHERE key = 'customer_risk_tiers';
  IF v_tiers IS NULL OR jsonb_typeof(v_tiers) <> 'array' OR jsonb_array_length(v_tiers) = 0 THEN
    v_tiers := '[{"min_days":0,"requires_approval":false},{"min_days":30,"requires_approval":false},{"min_days":60,"requires_approval":false},{"min_days":90,"requires_approval":true}]'::jsonb;
  END IF;

  SELECT MIN(ti.created_at) INTO v_oldest
  FROM   public.tl_invoices ti
  WHERE  ti.payment_status IN ('unpaid', 'partial')
    AND  (ti.total_amount - COALESCE(ti.paid_amount, 0)) > 0
    AND  ti.customer_phone IN (
           SELECT scp.phone FROM public.service_customer_phones scp WHERE scp.customer_id = p_service_customer_id
         );

  IF v_oldest IS NOT NULL THEN
    v_days := floor(extract(epoch FROM (now() - v_oldest)) / 86400)::int;
    SELECT COALESCE((t->>'requires_approval')::boolean, false) INTO v_needs_approval
    FROM   jsonb_array_elements(v_tiers) t
    WHERE  (t->>'min_days')::int <= v_days
    ORDER  BY (t->>'min_days')::int DESC
    LIMIT  1;
    v_needs_approval := COALESCE(v_needs_approval, false);
  END IF;

  IF v_needs_approval THEN
    UPDATE public.orders SET status = 'pending-approval'::order_status WHERE id = v_order_id;
    PERFORM public.build_order_approval_chain(
      v_order_id,
      jsonb_build_object('reason', 'customer_risk', 'requested_by', p_created_by)
    );
    v_pending := true;
  END IF;

  -- ── QC gate (hard): hold + create inspection when the QC score crosses threshold ──
  IF public._apply_qc_gate(v_order_id) THEN
    v_pending := true;
  END IF;

  RETURN QUERY SELECT v_order_id, v_pending;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. approve_order_request — defer final booking to _maybe_book_order (so a
--    QC gate can still hold the order after the risk chain clears).
--    LIVE body verbatim except the marked booking line.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_order_request(p_request_id uuid, p_comment text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_req        RECORD;
  v_profile_id uuid;
  v_full_name  text;
  v_remaining  int;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  SELECT * INTO v_req FROM public.sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active OR v_req.approval_type <> 'service_order' THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  IF NOT (
    public._auth_user_has_permission('orders.approve')
    OR (v_req.step_role IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.user_custom_roles ucr JOIN public.custom_roles cr ON cr.id = ucr.role_id
         WHERE ucr.profile_id = v_profile_id AND cr.name = v_req.step_role
           AND cr.is_approval_slot = true AND cr.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'You are not allowed to approve this order';
  END IF;

  UPDATE public.sale_order_approvals
  SET    status = 'approved', decided_by = v_profile_id, decided_by_name = v_full_name, comment = p_comment
  WHERE  id = p_request_id;

  SELECT count(*) INTO v_remaining FROM public.sale_order_approvals
  WHERE source_id = v_req.source_id AND approval_type = 'service_order'
    AND iteration = v_req.iteration AND status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM public._maybe_book_order(v_req.source_id);  -- QC gate may still hold it
  END IF;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Customer note — call-centre logs a complaint on the order card.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_add_order_customer_note(p_order_id uuid, p_note text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_full_name  text;
  v_id         uuid;
BEGIN
  IF COALESCE(TRIM(p_note), '') = '' THEN RAISE EXCEPTION 'Note text is required.'; END IF;
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();

  INSERT INTO public.order_customer_notes (order_id, note, created_by, created_by_name)
  VALUES (p_order_id, TRIM(p_note), v_profile_id, v_full_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_add_order_customer_note(uuid, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. QA action — submit inspection findings (pending_analyst → pending_manager).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_qc_submit_inspection(
  p_inspection_id uuid, p_findings text DEFAULT NULL, p_scores jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_insp       RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  SELECT * INTO v_insp FROM public.qc_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF v_insp.status <> 'pending_analyst' THEN RAISE EXCEPTION 'Inspection is not awaiting the analyst (status: %).', v_insp.status; END IF;

  IF NOT public._auth_user_has_permission('qc.analyst')
     AND NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'You are not allowed to submit QC inspections.';
  END IF;
  IF v_insp.analyst_id IS NOT NULL AND v_insp.analyst_id <> v_profile_id
     AND NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'This inspection is assigned to another analyst.';
  END IF;

  UPDATE public.qc_inspections
     SET status = 'pending_manager',
         findings = COALESCE(p_findings, findings),
         scores = COALESCE(p_scores, scores),
         analyst_id = COALESCE(analyst_id, v_profile_id)
   WHERE id = p_inspection_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_submit_inspection(uuid, text, jsonb) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Ops action — book (approve) the inspection; releases the held order(s).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_qc_book_inspection(p_inspection_id uuid, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_full_name  text;
  v_insp       RECORD;
  v_ord        uuid;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;
  IF NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'Only a QC manager can book a QC inspection.';
  END IF;

  SELECT * INTO v_insp FROM public.qc_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF v_insp.status NOT IN ('pending_manager','pending_analyst') THEN
    RAISE EXCEPTION 'Inspection is already % — it cannot be booked.', v_insp.status;
  END IF;

  UPDATE public.qc_inspections
     SET status = 'approved', reviewed_by = v_profile_id, reviewed_by_name = v_full_name, decided_at = now()
   WHERE id = p_inspection_id;

  -- Release every order held by this inspection (combine mode shares one).
  FOR v_ord IN SELECT id FROM public.orders WHERE qc_inspection_id = p_inspection_id LOOP
    PERFORM public._maybe_book_order(v_ord);
  END LOOP;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_book_inspection(uuid, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Ops action — reject the inspection; cancels the held order(s).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_qc_reject_inspection(p_inspection_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_full_name  text;
  v_insp       RECORD;
  v_ord        uuid;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to reject.'; END IF;
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;
  IF NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'Only a QC manager can reject a QC inspection.';
  END IF;

  SELECT * INTO v_insp FROM public.qc_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF v_insp.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Inspection is already % — it cannot be rejected.', v_insp.status;
  END IF;

  UPDATE public.qc_inspections
     SET status = 'rejected', reviewed_by = v_profile_id, reviewed_by_name = v_full_name,
         reject_reason = p_reason, decided_at = now()
   WHERE id = p_inspection_id;

  -- Cancel every order held by this inspection + free their calendar slots.
  FOR v_ord IN SELECT id FROM public.orders WHERE qc_inspection_id = p_inspection_id LOOP
    UPDATE public.orders SET status = 'cancelled'::order_status WHERE id = v_ord;
    DELETE FROM public.order_team_assignments WHERE order_id = v_ord;
  END LOOP;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_reject_inspection(uuid, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Ops action — reassign an inspection to another analyst.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_qc_reassign_inspection(p_inspection_id uuid, p_analyst_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'Only a QC manager can reassign a QC inspection.';
  END IF;
  UPDATE public.qc_inspections SET analyst_id = p_analyst_id
   WHERE id = p_inspection_id AND status IN ('pending_analyst','pending_manager');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_reassign_inspection(uuid, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 12. Queue reads — analyst's own queue + Ops review queue (auth-scoped).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_qc_inspections(p_scope text DEFAULT 'mine')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_result     jsonb;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_data WHERE auth_user_id = auth.uid();

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT i.id, i.order_id, i.stage, i.points, i.breakdown, i.timing, i.status,
           i.inspection_date, i.analyst_id, i.findings, i.reject_reason,
           i.created_at, i.decided_at,
           o.order_id AS order_number, o.division, o.scheduled_date,
           sc.name AS customer_name,
           an.full_name AS analyst_name
    FROM public.qc_inspections i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.service_customers sc ON sc.id = o.service_customer_id
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
GRANT EXECUTE ON FUNCTION public.get_qc_inspections(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
