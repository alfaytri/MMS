-- QC Quality-Analyst Workflow — A3: team quality_score engine + post-completion QC.
--
-- Builds on A1 (config) + A2 (qc_inspections, scoring engine, pre-booking gate).
-- Decisions (design doc, user 2026-09-14):
--   • Team quality_score (0–10, starts 10):
--       −1 when a BACKWORK is created → docks the ORIGINAL team (the team on the
--         parent order that needed redoing). One trigger covers every backwork
--         path (create_order_with_dates, link-backwork UPDATE, QC auto-rework).
--       +1 when a team completes a NON-backwork order cleanly (capped at 10).
--       RESET to 10 when a team's leader or a member changes (DB triggers — the
--         app edits teams/employees through many code paths).
--   • Post-completion QC: complete_visit re-scores the finished order; if it still
--     crosses the threshold it creates a stage='post_completion' inspection +
--     assigns a QA (no order hold — the job is already done).
--   • Ops on a post-completion inspection: SIGN OFF (rpc_qc_book_inspection →
--     'approved') or FLAG FOR REWORK (rpc_qc_flag_rework → 'rework'). There is no
--     punitive "fail". Whether flagging auto-creates the backwork is a toggle
--     (qc_config.auto_backwork_on_rework, default off — normally the call centre
--     books the redo). Either way the −1 fires when the backwork is created.
--
-- complete_visit base body is the LIVE whole-app dev definition verbatim + the
-- marked A3 additions.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Allow the 'rework' outcome on qc_inspections.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_status_chk;
ALTER TABLE public.qc_inspections ADD CONSTRAINT qc_inspections_status_chk
  CHECK (status IN ('pending_analyst','pending_manager','approved','rejected','cancelled','rework'));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Team quality-score helper (clamped 0–10).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._bump_team_quality_score(p_team_id uuid, p_delta int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF p_team_id IS NULL THEN RETURN; END IF;
  UPDATE public.teams
     SET quality_score = GREATEST(0, LEAST(10, quality_score + p_delta))
   WHERE id = p_team_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public._bump_team_quality_score(uuid, int) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Backwork −1 — dock the ORIGINAL (parent) team whenever a backwork appears.
--    Fires on INSERT of a backwork or on an order's type flipping to 'backwork'.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_backwork_quality_penalty()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  -- Fire once, when the backwork's parent link is first established: on INSERT of
  -- a parented backwork, or on the UPDATE where parent_order_id becomes set (the
  -- link-backwork route re-writes type='backwork' unchanged, so keying off
  -- parent_order_id — not type — is what makes this correct). Re-saving/editing a
  -- backwork later leaves parent_order_id unchanged → no repeat penalty.
  IF TG_OP = 'UPDATE' AND OLD.parent_order_id IS NOT DISTINCT FROM NEW.parent_order_id THEN
    RETURN NEW;
  END IF;

  -- The team(s) on the PARENT order (the order that needed redoing) lose a point.
  UPDATE public.teams t
     SET quality_score = GREATEST(0, t.quality_score - 1)
   WHERE t.id IN (
     SELECT a.team_id FROM public.order_team_assignments a
     WHERE a.order_id = NEW.parent_order_id AND a.team_id IS NOT NULL
   );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_backwork_penalty ON public.orders;
CREATE TRIGGER trg_backwork_penalty
  AFTER INSERT OR UPDATE OF type, parent_order_id ON public.orders
  FOR EACH ROW
  WHEN (NEW.type = 'backwork' AND NEW.parent_order_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_backwork_quality_penalty();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Reset quality_score to 10 when the team's leader changes.
--    BEFORE UPDATE OF leader_id → sets NEW.quality_score in-flight (no re-fire).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_reset_quality_on_leader_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  NEW.quality_score := 10;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_team_leader_quality_reset ON public.teams;
CREATE TRIGGER trg_team_leader_quality_reset
  BEFORE UPDATE OF leader_id ON public.teams
  FOR EACH ROW
  WHEN (NEW.leader_id IS DISTINCT FROM OLD.leader_id)
  EXECUTE FUNCTION public.trg_reset_quality_on_leader_change();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Reset quality_score to 10 when a team's membership changes.
--    AFTER UPDATE OF team_id ON employees → reset BOTH old and new team.
--    Coexists with trg_clear_stale_team_leader (same event, different table
--    target); updating teams.quality_score never re-fires that trigger.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_reset_quality_on_member_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  UPDATE public.teams SET quality_score = 10
   WHERE id IN (OLD.team_id, NEW.team_id) AND id IS NOT NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_team_member_quality_reset ON public.employees;
CREATE TRIGGER trg_team_member_quality_reset
  AFTER UPDATE OF team_id ON public.employees
  FOR EACH ROW
  WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION public.trg_reset_quality_on_member_change();

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Post-completion QC gate — create a post_completion inspection (no hold).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._apply_post_completion_qc(p_order_id uuid)
RETURNS void
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
  v_analyst    uuid;
  v_count      int;
  v_guard      int := 0;
BEGIN
  SELECT value INTO v_cfg FROM public.app_settings WHERE key = 'qc_config';
  v_threshold := COALESCE((v_cfg->>'threshold')::int, 5);
  v_max       := GREATEST(COALESCE((v_cfg->>'max_qc_per_day')::int, 3), 1);
  v_mode      := COALESCE(v_cfg->>'same_site_mode', 'combine');

  SELECT * INTO v_score FROM public.qc_score_order(p_order_id);
  IF COALESCE(v_score.points, 0) < v_threshold THEN RETURN; END IF;

  SELECT o.service_customer_id, o.address_id, o.division
    INTO v_order FROM public.orders o WHERE o.id = p_order_id;

  v_site_key  := COALESCE(v_order.service_customer_id::text,'') || ':' || COALESCE(v_order.address_id::text,'');
  v_insp_date := current_date;

  -- Don't create a second post_completion inspection for the same order, and in
  -- 'combine' mode share one across the same site+day.
  SELECT id INTO v_existing FROM public.qc_inspections
   WHERE stage = 'post_completion' AND status NOT IN ('rejected','cancelled')
     AND (order_id = p_order_id
          OR (v_mode = 'combine' AND site_key = v_site_key AND inspection_date = v_insp_date))
   ORDER BY created_at LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN; END IF;

  -- Daily capacity: roll to the next day until under max.
  LOOP
    SELECT count(*) INTO v_count FROM public.qc_inspections
     WHERE inspection_date = v_insp_date AND stage = 'post_completion'
       AND status NOT IN ('rejected','cancelled');
    EXIT WHEN v_count < v_max OR v_guard >= 366;
    v_insp_date := v_insp_date + 1;
    v_guard := v_guard + 1;
  END LOOP;

  -- QA assignment: least-loaded analyst in the order's division; else any QA.
  SELECT q.qa INTO v_analyst FROM (
    SELECT r AS qa,
           (SELECT count(*) FROM public.qc_inspections i
             WHERE i.analyst_id = r AND i.status NOT IN ('approved','rejected','cancelled','rework')) AS load
    FROM public.recipients_for_permission('qc.analyst') r
    WHERE EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.company_divisions cd ON cd.id = e.division_id
      WHERE e.profile_id = r AND cd.slug = v_order.division)
  ) q ORDER BY q.load ASC, random() LIMIT 1;
  IF v_analyst IS NULL THEN
    SELECT r INTO v_analyst FROM public.recipients_for_permission('qc.analyst') r
    ORDER BY (SELECT count(*) FROM public.qc_inspections i
               WHERE i.analyst_id = r AND i.status NOT IN ('approved','rejected','cancelled','rework')) ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.qc_inspections (
    order_id, site_key, inspection_date, stage, points, breakdown, timing, status, analyst_id
  ) VALUES (
    p_order_id, v_site_key, v_insp_date, 'post_completion',
    v_score.points, v_score.breakdown, v_score.timing, 'pending_analyst', v_analyst
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public._apply_post_completion_qc(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. complete_visit — +1 clean-completion recovery + post-completion QC.
--    LIVE body verbatim + the marked A3 block before RETURN.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_visit(
  p_visit_id uuid, p_source_id uuid, p_source_type text, p_completed_by uuid,
  p_service_statuses jsonb DEFAULT '{}'::jsonb, p_damage jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text, p_qc_scores jsonb DEFAULT NULL::jsonb,
  p_photo_urls text[] DEFAULT '{}'::text[], p_signature_url text DEFAULT NULL::text,
  p_team_id uuid DEFAULT NULL::uuid, p_added_services jsonb DEFAULT NULL::jsonb,
  p_service_status_details jsonb DEFAULT '{}'::jsonb, p_team_note_photos text[] DEFAULT '{}'::text[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_updated int := 0; v_id uuid; v_order_type text;
begin
  -- Optimistic-lock complete the source record (first completer wins).
  if p_source_type = 'order' then
    update public.orders
       set status='completed', completed_at=now(), completed_by=p_completed_by
     where id=p_source_id and status not in ('completed','customer-unavailable');
    get diagnostics v_updated = row_count;
  elsif p_source_type = 'site_visit' then
    update public.site_visits
       set status='completed', completed_at=now(), completed_by=p_completed_by
     where id=p_source_id and status not in ('completed','customer-unavailable');
    get diagnostics v_updated = row_count;
  elsif p_source_type = 'contract' then
    update public.contract_visits set completed=true
     where id=p_visit_id and completed=false;
    get diagnostics v_updated = row_count;
  else
    raise exception 'Unknown source_type %', p_source_type;
  end if;

  -- Already completed: allowed only when THIS visit already has a completion row
  -- (same team editing its own work); otherwise another team got there first.
  if v_updated = 0 and not exists (
    select 1 from public.visit_completions where visit_id = p_visit_id
  ) then
    raise exception 'already_completed';
  end if;

  insert into public.visit_completions (
    visit_id, source_id, source_type, team_id, completed_by,
    service_statuses, damage_report, notes, qc_scores, added_services, photo_urls, signature_url,
    service_status_details, team_note_photos
  ) values (
    p_visit_id, p_source_id, p_source_type, p_team_id, p_completed_by,
    coalesce(p_service_statuses,'{}'::jsonb), p_damage, p_notes, p_qc_scores, p_added_services,
    coalesce(p_photo_urls,'{}'), p_signature_url,
    coalesce(p_service_status_details,'{}'::jsonb), coalesce(p_team_note_photos,'{}')
  )
  on conflict (visit_id) do update set
    service_statuses       = excluded.service_statuses,
    damage_report          = excluded.damage_report,
    notes                  = excluded.notes,
    qc_scores              = excluded.qc_scores,
    added_services         = excluded.added_services,
    photo_urls             = excluded.photo_urls,
    signature_url          = excluded.signature_url,
    service_status_details = excluded.service_status_details,
    team_note_photos       = excluded.team_note_photos,
    completed_by           = excluded.completed_by,
    completed_at           = now()
  returning id into v_id;

  -- ── A3: only on the FIRST real completion of an ORDER ──
  if v_updated > 0 and p_source_type = 'order' then
    select type into v_order_type from public.orders where id = p_source_id;

    -- +1 clean-completion recovery for the completing team (not for a backwork redo).
    if v_order_type is distinct from 'backwork' then
      if p_team_id is not null then
        perform public._bump_team_quality_score(p_team_id, 1);
      else
        perform public._bump_team_quality_score(a.team_id, 1)
          from public.order_team_assignments a where a.order_id = p_source_id;
      end if;
    end if;

    -- Post-completion QC (creates a post_completion inspection if still triggered).
    perform public._apply_post_completion_qc(p_source_id);
  end if;

  return v_id;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. rpc_qc_flag_rework — Ops flags a post-completion inspection for rework.
--    Records 'rework'; optionally auto-creates the backwork (toggle). The −1
--    fires from trg_backwork_penalty when the backwork row lands.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_qc_flag_rework(p_inspection_id uuid, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_full_name  text;
  v_insp       RECORD;
  v_ord        RECORD;
  v_auto       boolean;
  v_bw_id      uuid;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;
  IF NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'Only a QC manager can flag a QC inspection for rework.';
  END IF;

  SELECT * INTO v_insp FROM public.qc_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF v_insp.status IN ('approved','rejected','cancelled','rework') THEN
    RAISE EXCEPTION 'Inspection is already % — it cannot be flagged.', v_insp.status;
  END IF;

  UPDATE public.qc_inspections
     SET status = 'rework', reviewed_by = v_profile_id, reviewed_by_name = v_full_name,
         findings = COALESCE(p_notes, findings), decided_at = now()
   WHERE id = p_inspection_id;

  -- Auto-create the backwork only when the toggle is on. Otherwise the call
  -- centre books the redo through the normal flow.
  SELECT COALESCE((value->>'auto_backwork_on_rework')::boolean, false) INTO v_auto
    FROM public.app_settings WHERE key = 'qc_config';

  IF v_auto THEN
    SELECT o.service_customer_id, o.division, o.address, o.address_id, o.scheduled_date, o.arrival_phone
      INTO v_ord FROM public.orders o WHERE o.id = v_insp.order_id;

    INSERT INTO public.orders (
      order_id, service_customer_id, type, division, status, confirmation_status,
      scheduled_date, total_amount, address, address_id, notes, has_invoice,
      arrival_phone, created_by, parent_order_id
    ) VALUES (
      public.next_backwork_order_id(), v_ord.service_customer_id, 'backwork', v_ord.division,
      'waitlist'::order_status, 'not_sent'::confirmation_status,
      v_ord.scheduled_date, 0, v_ord.address, v_ord.address_id,
      'Auto-created from QC rework flag', false, v_ord.arrival_phone, v_profile_id, v_insp.order_id
    ) RETURNING id INTO v_bw_id;   -- trg_backwork_penalty docks the original team

    -- Copy the completed order's services as 0-QAR redo lines.
    INSERT INTO public.order_services (order_id, service_id, name, qty, price, duration, path)
    SELECT v_bw_id, os.service_id, os.name, os.qty, 0, os.duration, os.path
      FROM public.order_services os WHERE os.order_id = v_insp.order_id;
  END IF;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_flag_rework(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
