-- F② — Split the team-leader permission so field leaders see ONLY their own team.
--
-- F① (migration …400) added an authorization guard whose "monitor any team"
-- branch checked teams.team_leader.view. But EVERY field leader holds .view
-- just to open the app, so that branch let any leader read any team — the guard
-- was effectively "any TL user, any team". F② moves the monitor branch to the
-- (previously unused) teams.team_leader.manage permission:
--   • .view   = open the app + see the team you actually lead   (field leaders)
--   • .manage = monitor ANY team                                (TL admins)
-- The client (useTeamLeaderIdentity.isAdmin) is switched to .manage in the same
-- change, so a plain field leader gets no team selector and is scoped by this
-- guard to the team whose teams.leader_id resolves to them.
--
-- Only the monitor-branch permission string changes vs …400; the 3 UNION ALL
-- sources are identical.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_team_leader_visits(p_team_id uuid, p_from_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, date date, scheduled_time text, status text, type text, source_id uuid, source_type text, team_id uuid, customer_name text, customer_phone text, location_phone text, address text, waze_link text, services_json jsonb, team_ids uuid[], order_id text, notes text, other_teams_names text[], has_invoice boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := public._current_user_data_id();
BEGIN
  -- ── Authorization guard (F① + F②) ───────────────────────────────────
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (
       public._auth_user_has_permission('teams.team_leader.manage')   -- monitor ANY team
    OR EXISTS (                                                        -- leads THIS team
         SELECT 1 FROM public.teams t
         JOIN public.employees e ON e.id = t.leader_id
         WHERE t.id = p_team_id AND e.profile_id = v_me AND t.deleted_at IS NULL)
    OR (public.check_is_division_manager(v_me) AND EXISTS (            -- DM over its division
         SELECT 1 FROM public.teams t
         JOIN public.user_company_divisions ucd ON ucd.division_id = t.division_id
         WHERE t.id = p_team_id AND ucd.profile_id = v_me))
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_team';
  END IF;

  RETURN QUERY

  -- ── Source 1: Order team assignments ─────────────────────────────────
  SELECT
    ota.id,
    ota.scheduled_date,
    COALESCE(ota.time_slot, o.scheduled_time),
    COALESCE(o.status::text, 'scheduled'),
    COALESCE(o.type, 'order'),
    o.id,
    'order'::text,
    ota.team_id,
    COALESCE(sc.name, 'Unknown Customer'),
    (SELECT p.phone FROM public.service_customer_phones p
     WHERE p.customer_id = o.service_customer_id AND p.is_primary LIMIT 1),
    o.arrival_phone,
    COALESCE(o.address, ''),
    addr.waze_link,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', os.id,
        'name', COALESCE(s.name_en, os.name, 'Service'),
        'unit_price', COALESCE(os.price, 0),
        'qty', COALESCE(os.qty, 1)
      ) ORDER BY os.name)
      FROM public.order_services os
      LEFT JOIN public.services s ON s.id = os.service_id
      WHERE os.order_id = o.id
    ),
    (SELECT array_agg(ota2.team_id) FROM public.order_team_assignments ota2 WHERE ota2.order_id = o.id),
    o.order_id,
    o.notes,
    (SELECT array_agg(COALESCE(t.name_en, t.name) ORDER BY COALESCE(t.name_en, t.name))
       FROM public.order_team_assignments ota2
       JOIN public.teams t ON t.id = ota2.team_id
       WHERE ota2.order_id = o.id AND ota2.team_id <> p_team_id),
    EXISTS (SELECT 1 FROM public.tl_invoices ti WHERE ti.visit_id = ota.id)
  FROM public.order_team_assignments ota
  JOIN public.orders o ON o.id = ota.order_id
  LEFT JOIN public.service_customers sc ON sc.id = o.service_customer_id
  LEFT JOIN public.service_customer_addresses addr ON addr.id = o.address_id
  WHERE ota.team_id = p_team_id
    AND ota.scheduled_date >= p_from_date
    AND COALESCE(o.status::text, 'scheduled') != 'cancelled'

  UNION ALL

  -- ── Source 2: Contract visits ────────────────────────────────────────
  SELECT
    cv.id,
    cv.scheduled_date,
    NULL::text,
    CASE WHEN cv.completed THEN 'completed' ELSE 'scheduled' END,
    'contract'::text,
    cv.contract_id,
    'contract'::text,
    cv.team_id,
    COALESCE(c.name, 'Unknown Customer'),
    NULL::text,
    NULL::text,
    COALESCE(con.site_name, ''),
    NULL::text,
    NULL::jsonb,
    ARRAY[cv.team_id],
    NULL::text,
    NULL::text,
    NULL::text[],
    false
  FROM public.contract_visits cv
  LEFT JOIN public.contracts con ON con.id = cv.contract_id
  LEFT JOIN public.customers c ON c.id = con.customer_id
  WHERE cv.team_id = p_team_id
    AND cv.scheduled_date >= p_from_date
    AND NOT cv.completed

  UNION ALL

  -- ── Source 3: Site visit team assignments ────────────────────────────
  SELECT
    svta.id,
    COALESCE(svta.scheduled_date::date, sv.scheduled_date),
    svta.time_slot,
    COALESCE(sv.status, 'scheduled'),
    'site-visit-single'::text,
    sv.id,
    'site_visit'::text,
    svta.team_id,
    COALESCE(sc.name, 'Unknown Customer'),
    (SELECT p.phone FROM public.service_customer_phones p
     WHERE p.customer_id = sv.service_customer_id AND p.is_primary LIMIT 1),
    sv.arrival_phone,
    COALESCE(sv.address, ''),
    NULL::text,
    NULL::jsonb,
    (SELECT array_agg(svta2.team_id) FROM public.site_visit_team_assignments svta2 WHERE svta2.visit_id = sv.id),
    NULL::text,
    sv.notes,
    (SELECT array_agg(COALESCE(t.name_en, t.name) ORDER BY COALESCE(t.name_en, t.name))
       FROM public.site_visit_team_assignments svta2
       JOIN public.teams t ON t.id = svta2.team_id
       WHERE svta2.visit_id = sv.id AND svta2.team_id <> p_team_id),
    EXISTS (SELECT 1 FROM public.tl_invoices ti WHERE ti.visit_id = svta.id)
  FROM public.site_visit_team_assignments svta
  JOIN public.site_visits sv ON sv.id = svta.visit_id
  LEFT JOIN public.service_customers sc ON sc.id = sv.service_customer_id
  WHERE svta.team_id = p_team_id
    AND COALESCE(svta.scheduled_date::date, sv.scheduled_date) >= p_from_date
    AND COALESCE(sv.status, 'scheduled') != 'cancelled'

  ORDER BY 2, 3 NULLS LAST;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
