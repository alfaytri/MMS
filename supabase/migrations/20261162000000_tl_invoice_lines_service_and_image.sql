-- ─────────────────────────────────────────────────────────────────────────────
-- tl_invoice_lines: link to the service, and snapshot its catalog photo.
--
-- tl_invoice_lines had NO link to a service at all — only a `name` text column.
-- The PDF therefore matched lines to services with .in('name_en', names) and a
-- Map keyed on the name, which the code itself called "best-effort". In a
-- six-level tree leaf names repeat (two services are called "Cleaning"), so the
-- Map kept whichever row came back last and the Arabic text and unit printed on
-- an invoice could already belong to the wrong service. service_id retires that
-- guess.
--
-- service_id carries NO FOREIGN KEY on purpose: tl_invoice_lines is live in
-- staging and prod, but `services` is dropped there as an excluded module, so
-- an FK could not exist. A plain uuid keeps this migration applicable if the
-- module ever ships.
--
-- Both columns are nullable: pre-existing rows have neither, and a team leader
-- can bill a typed-in custom service that is not in the catalogue at all.
--
-- get_team_leader_visits never exposed os.service_id, so the client could not
-- identify the service even when it knew the order line. It does now.
--
-- Bodies fetched live with pg_get_functiondef.
--
-- TARGET: Dev DB (wkmvjxxmzstsvahuiwsz) only.
-- STAGING MIRROR DELIBERATELY SKIPPED: the referenced modules do not exist there.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tl_invoice_lines
  ADD COLUMN IF NOT EXISTS service_id uuid;

ALTER TABLE public.tl_invoice_lines
  ADD COLUMN IF NOT EXISTS catalog_image_url text;

COMMENT ON COLUMN public.tl_invoice_lines.service_id IS
  'The catalogue service this line billed, when there was one. No FK: services '
  'is dropped from staging/prod as an excluded module. NULL for a typed-in '
  'custom billable. Replaces matching lines to services by name.';

COMMENT ON COLUMN public.tl_invoice_lines.catalog_image_url IS
  'Snapshot of the service photo, preferring the one the order line was sold '
  'with. Frozen at invoice creation.';

CREATE INDEX IF NOT EXISTS idx_tl_invoice_lines_service_id
  ON public.tl_invoice_lines (service_id) WHERE service_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_team_leader_visits(p_team_id uuid, p_from_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, date date, scheduled_time text, status text, type text, source_id uuid, source_type text, team_id uuid, customer_name text, customer_phone text, location_phone text, address text, waze_link text, services_json jsonb, team_ids uuid[], order_id text, notes text, other_teams_names text[], has_invoice boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := public._current_user_data_id();
BEGIN
  -- â”€â”€ Authorization guard (Fâ‘  + Fâ‘¡) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  -- â”€â”€ Source 1: Order team assignments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        'service_id', os.service_id,
        'name', COALESCE(s.name_en, os.name, 'Service'),
        'unit_price', COALESCE(os.price, 0),
        'qty', COALESCE(os.qty, 1),
        'qc_items', s.qc_items           -- A3c: per-item QC checklist {label,max_score}[]
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

  -- â”€â”€ Source 2: Contract visits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  -- â”€â”€ Source 3: Site visit team assignments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_tl_invoice(p_visit_id uuid, p_order_id text, p_customer_name text, p_customer_phone text, p_lines jsonb, p_spare_parts numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_paid_cash numeric DEFAULT 0, p_paid_pos numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_services    numeric := 0;
  v_spare       numeric;
  v_gross       numeric;
  v_discount    numeric;
  v_net         numeric;
  v_cash        numeric;
  v_pos         numeric;
  v_paid        numeric;
  v_id          uuid;
  v_line        jsonb;
  v_qty         numeric;
  v_unit        numeric;
  v_cash_method uuid;
  v_pos_method  uuid;
  v_actor_name  text;
begin
  if p_visit_id is null then raise exception 'visit_id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line required';
  end if;
  if exists (select 1 from public.tl_invoices where visit_id = p_visit_id) then
    raise exception 'invoice_exists';
  end if;

  -- Recompute the service money on the server; never trust a client total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unit_price')::numeric, 0);
    if v_qty  <= 0 then raise exception 'line qty must be > 0'; end if;
    if v_unit <  0 then raise exception 'line unit_price must be >= 0'; end if;
    v_services := v_services + (v_qty * v_unit);
  end loop;

  v_spare    := greatest(coalesce(p_spare_parts, 0), 0);
  v_gross    := v_services + v_spare;
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net      := v_gross - v_discount;

  v_cash := greatest(coalesce(p_paid_cash, 0), 0);
  v_pos  := greatest(coalesce(p_paid_pos, 0), 0);
  v_paid := v_cash + v_pos;
  if v_paid - v_net > 0.005 then
    raise exception 'paid_exceeds_net';   -- cash + POS cannot exceed the net total
  end if;

  -- Resolve the two fixed methods (attach to what already exists).
  select pm.id into v_cash_method from public.payment_methods pm where pm.slug = 'cash' limit 1;
  select pm.id into v_pos_method  from public.payment_methods pm where pm.slug = 'pos'  limit 1;
  if v_cash > 0 and v_cash_method is null then raise exception 'cash payment method missing'; end if;
  if v_pos  > 0 and v_pos_method  is null then raise exception 'pos payment method missing';  end if;

  select ud.full_name into v_actor_name from public.user_data ud where ud.id = p_created_by;

  insert into public.tl_invoices (
    visit_id, order_id, customer_name, customer_phone,
    subtotal, spare_parts_amount, discount_amount, total_amount, payment_method_id,
    payment_status, notes, created_by
  ) values (
    p_visit_id, p_order_id, p_customer_name, p_customer_phone,
    v_services, v_spare, v_discount, v_net,
    case
      when v_cash > 0 and v_pos = 0 then v_cash_method   -- single method → record it
      when v_pos  > 0 and v_cash = 0 then v_pos_method
      else null                                          -- split or unpaid → payments log is the record
    end,
    case
      when v_net = 0 or v_paid >= v_net then 'paid'
      when v_paid > 0                    then 'partial'
      else 'unpaid'
    end,
    p_notes, p_created_by
  ) returning tl_invoices.id into v_id;

  insert into public.tl_invoice_lines (
    tl_invoice_id, name, qty, unit_price, total, service_id, catalog_image_url
  )
  select v_id, (l->>'name'),
         (l->>'qty')::numeric, (l->>'unit_price')::numeric,
         (l->>'qty')::numeric * (l->>'unit_price')::numeric,
         nullif(l->>'service_id', '')::uuid,
         -- Prefer the photo the order line was SOLD with; fall back to a live
         -- read for team-leader billables, which have no order line at all
         -- (contract and site visits carry services_json = NULL).
         coalesce(
           (select os.catalog_image_url from public.order_services os
             where os.id = nullif(l->>'order_service_id', '')::uuid),
           (select s.catalog_image_url from public.services s
             where s.id = nullif(l->>'service_id', '')::uuid))
  from jsonb_array_elements(p_lines) l;

  -- Record the split payments; the sync trigger sets paid_amount + status.
  if v_cash > 0 then
    insert into public.tl_invoice_payments (
      tl_invoice_id, amount, payment_method_id, method_slug,
      registered_by, registered_by_name, notes
    ) values (v_id, v_cash, v_cash_method, 'cash', p_created_by, v_actor_name, p_notes);
  end if;
  if v_pos > 0 then
    insert into public.tl_invoice_payments (
      tl_invoice_id, amount, payment_method_id, method_slug,
      registered_by, registered_by_name, notes
    ) values (v_id, v_pos, v_pos_method, 'pos', p_created_by, v_actor_name, p_notes);
  end if;

  return query select v_id, ti.invoice_number from public.tl_invoices ti where ti.id = v_id;
end;
$function$
;
