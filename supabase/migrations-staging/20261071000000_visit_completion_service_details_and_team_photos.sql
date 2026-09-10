-- Team-leader completion — Batch 2b: per-service skip-reason / issue-photo
-- capture + team-note photos.
--
-- Adds two columns to visit_completions and threads them through complete_visit:
--   service_status_details jsonb  — { [order_service_id]: { reason?, photo_urls? } }
--     A Skipped service carries a required reason; an Issue service carries
--     required photo_urls. Kept separate from the flat service_statuses map so
--     existing readers of service_statuses are untouched.
--   team_note_photos text[]       — photos attached to the free-text Team Notes
--     (distinct from completion photo_urls and damage photos).
-- complete_visit also finally persists p_notes (the team notes) — the hook used
-- to hardcode NULL.
BEGIN;

ALTER TABLE public.visit_completions
  ADD COLUMN IF NOT EXISTS service_status_details jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS team_note_photos       text[]  NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.visit_completions.service_status_details IS
  'Per-service completion detail keyed by order_service_id: { reason?, photo_urls? }. Skipped→reason, Issue→photo_urls.';
COMMENT ON COLUMN public.visit_completions.team_note_photos IS
  'Photos attached to the free-text team notes (separate from completion photo_urls and damage photos).';

-- Drop every existing overload of complete_visit by name (adding params changes
-- the signature, so CREATE OR REPLACE would leave a stale overload → ambiguity).
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'complete_visit' AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $drop$;

CREATE FUNCTION public.complete_visit(
  p_visit_id               uuid,
  p_source_id              uuid,
  p_source_type            text,
  p_completed_by           uuid,
  p_service_statuses       jsonb   DEFAULT '{}'::jsonb,
  p_damage                 jsonb   DEFAULT NULL::jsonb,
  p_notes                  text    DEFAULT NULL::text,
  p_qc_scores              jsonb   DEFAULT NULL::jsonb,
  p_photo_urls             text[]  DEFAULT '{}'::text[],
  p_signature_url          text    DEFAULT NULL::text,
  p_team_id                uuid    DEFAULT NULL::uuid,
  p_added_services         jsonb   DEFAULT NULL::jsonb,
  p_service_status_details jsonb   DEFAULT '{}'::jsonb,
  p_team_note_photos       text[]  DEFAULT '{}'::text[]
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_updated int := 0; v_id uuid;
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

  return v_id;
end;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
