-- Projects "Option B" — RPC rewrites for the one-pool model.
--   • create_project           → one pool sub-container + project_disciplines (no per-discipline buckets)
--   • add_project_discipline    → record a discipline tag (no sub-container)
--   • add_project_milestone     → (pool sub-container, discipline, label) [signature change]
--   • rpc_report_project_consumption → discipline from cogs_entries.discipline_id
--   • rpc_post_consumption      → +p_discipline_id tag [signature change; body sourced live]
-- Bodies for the unchanged parts are byte-faithful from pg_get_functiondef.
BEGIN;

-- ── create_project ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_project(p_project_number text, p_name text, p_division_id uuid, p_warehouse_id uuid, p_discipline_ids uuid[], p_responsible_person_profile_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_kind       text;
  v_uid        uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  SELECT warehouse_kind INTO v_kind FROM public.warehouses WHERE id = p_warehouse_id;
  IF v_kind IS DISTINCT FROM 'custody' THEN
    RAISE EXCEPTION 'Projects live in a custody warehouse (got %)', COALESCE(v_kind, '<none>');
  END IF;
  IF p_discipline_ids IS NULL OR cardinality(p_discipline_ids) = 0 THEN
    RAISE EXCEPTION 'Pick at least one discipline';
  END IF;

  INSERT INTO public.projects
    (project_number, name, division_id, warehouse_id, responsible_person_profile_id, created_by)
  VALUES
    (p_project_number, p_name, p_division_id, p_warehouse_id, p_responsible_person_profile_id, v_uid)
  RETURNING id INTO v_project_id;

  -- ONE stock pool sub-container (holds all project stock; no discipline).
  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by, project_id, discipline_id)
  VALUES
    (p_warehouse_id, p_division_id, p_project_number, true, v_uid, v_project_id, NULL);

  -- Record the project's disciplines (tags, not containers).
  INSERT INTO public.project_disciplines (project_id, discipline_id, created_by)
  SELECT v_project_id, d.id, v_uid
    FROM public.disciplines d
   WHERE d.id = ANY(p_discipline_ids) AND d.is_active
  ON CONFLICT (project_id, discipline_id) DO NOTHING;

  RETURN v_project_id;
END;
$function$;

-- ── add_project_discipline ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_project_discipline(p_project_id uuid, p_discipline_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id    uuid;
  v_pn    text;
  v_dname text;
  v_uid   uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;
  SELECT project_number INTO v_pn FROM public.projects WHERE id = p_project_id;
  IF v_pn IS NULL THEN RAISE EXCEPTION 'Project % not found', p_project_id; END IF;
  SELECT name INTO v_dname FROM public.disciplines WHERE id = p_discipline_id AND is_active;
  IF v_dname IS NULL THEN RAISE EXCEPTION 'Discipline % not found or inactive', p_discipline_id; END IF;

  INSERT INTO public.project_disciplines (project_id, discipline_id, created_by)
  VALUES (p_project_id, p_discipline_id, v_uid)
  ON CONFLICT (project_id, discipline_id) DO UPDATE SET is_active = true, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ── add_project_milestone (signature change: +p_discipline_id) ────────
DROP FUNCTION IF EXISTS public.add_project_milestone(uuid, text);
CREATE OR REPLACE FUNCTION public.add_project_milestone(p_sub_container_id uuid, p_discipline_id uuid, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id         uuid;
  v_project_id uuid;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  SELECT project_id INTO v_project_id
    FROM public.warehouse_sub_containers WHERE id = p_sub_container_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Sub-container % is not a project pool', p_sub_container_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_disciplines
     WHERE project_id = v_project_id AND discipline_id = p_discipline_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Discipline % is not part of this project', p_discipline_id;
  END IF;

  INSERT INTO public.project_milestones (sub_container_id, discipline_id, label, created_by)
  VALUES (p_sub_container_id, p_discipline_id, p_label, public._current_user_data_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ── rpc_report_project_consumption (discipline from cogs_entries.discipline_id) ──
CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(consumer_kind text, consumer_id uuid, consumer_name text, project_number text, discipline_name text, milestone_label text, qty integer, total_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN sc.project_id IS NOT NULL THEN 'project' ELSE 'team' END          AS consumer_kind,
    COALESCE(sc.project_id, sc.id)                                              AS consumer_id,
    CASE WHEN sc.project_id IS NOT NULL
         THEN COALESCE(pr.name, pr.project_number)
         ELSE sc.name END                                                      AS consumer_name,
    pr.project_number                                                          AS project_number,
    disc.name                                                                  AS discipline_name,
    COALESCE(pm.label, 'Unassigned')                                           AS milestone_label,
    SUM(c.qty)::int                                                            AS qty,
    SUM(c.total_cost)::numeric                                                 AS total_cost
  FROM public.cogs_entries c
  JOIN public.warehouse_sub_containers sc ON sc.id = c.consumer_sub_container_id
  LEFT JOIN public.projects           pr   ON pr.id   = sc.project_id
  LEFT JOIN public.disciplines        disc ON disc.id = c.discipline_id
  LEFT JOIN public.project_milestones pm   ON pm.id   = c.milestone_id
  WHERE c.source_type = 'consumption'
    AND c.date BETWEEN p_from AND p_to
    AND c.consumer_sub_container_id IS NOT NULL
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1, 2, 3, 4, 5, 6
  ORDER BY consumer_name, discipline_name NULLS FIRST, milestone_label
$function$;

-- ── rpc_post_consumption (signature change: +p_discipline_id) ─────────
DROP FUNCTION IF EXISTS public.rpc_post_consumption(uuid,uuid,text,uuid,text,text[],jsonb,uuid);
CREATE OR REPLACE FUNCTION public.rpc_post_consumption(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_consumer_type text, p_consumer_sub_container_id uuid, p_notes text, p_attachments text[], p_lines jsonb, p_milestone_id uuid DEFAULT NULL::uuid, p_discipline_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_consumption_id       uuid;
  v_ce_number            text;
  v_sub                  record;
  v_line                 jsonb;
  v_variant_id           uuid;
  v_qty                  int;
  v_label                record;
  v_layer                record;
  v_qty_taken_sum        int;
  v_total_cost_sum       numeric;
  v_weighted_unit_cost   numeric;
  v_uid                  uuid := public._current_user_data_id();
  v_consumer_div         uuid;
  v_touched_variants     uuid[] := '{}';
  v_variant              uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_post_consumption: at least one line is required';
  end if;

  if p_consumer_type not in ('custody','internal') then
    raise exception 'rpc_post_consumption: invalid consumer_type % (expected custody|internal)', p_consumer_type;
  end if;

  if p_consumer_type = 'custody' and p_consumer_sub_container_id is null then
    raise exception 'rpc_post_consumption: consumer_type=custody requires consumer_sub_container_id';
  end if;

  if p_consumer_type <> 'custody' then
    p_consumer_sub_container_id := null;
  end if;

  select sc.id, sc.warehouse_id, sc.division_id, sc.is_active
    into v_sub
    from public.warehouse_sub_containers sc
    where sc.id = p_source_sub_container_id;

  if not found or v_sub.is_active is not true then
    raise exception 'rpc_post_consumption: source sub-container % not found or inactive', p_source_sub_container_id;
  end if;
  if v_sub.warehouse_id <> p_source_warehouse_id then
    raise exception 'rpc_post_consumption: source sub-container % does not belong to warehouse %', p_source_sub_container_id, p_source_warehouse_id;
  end if;

  -- Access control: caller must be assigned to this source (or an admin).
  if v_uid is null then
    raise exception 'You need to be signed in to post a consumption.';
  end if;
  if not (
        public.is_field_rp_of(v_uid, p_source_warehouse_id)
     or exists (
          select 1 from public.warehouse_sub_containers sc2
          where  sc2.id = p_source_sub_container_id
            and  sc2.responsible_person_profile_id = v_uid
        )
     or public._has_custody_admin_role(v_uid)
  ) then
    raise exception 'You are not assigned to this warehouse or custody, so you cannot post a consumption from it.';
  end if;

  -- Consumer-division guard: only book COGS to a custody location in a division the
  -- caller belongs to. Bypass for custody-admins (inventory_manager / system-admin) or
  -- anyone granted the `consumption.cross_division` permission (financial oversight —
  -- Owner/Accountant by default). Internal use has no consumer division.
  if p_consumer_type = 'custody' then
    select sc.division_id into v_consumer_div
    from public.warehouse_sub_containers sc
    where sc.id = p_consumer_sub_container_id;

    if v_consumer_div is not null
       and not public._has_custody_admin_role(v_uid)
       and not public._user_has_permission(v_uid, 'consumption.cross_division')
       and not exists (
             select 1 from public.user_company_divisions ucd
             where ucd.profile_id = v_uid and ucd.division_id = v_consumer_div
           )
    then
      raise exception 'You can only book a consumption to a custody location in your own division.';
    end if;
  end if;

  -- Discipline guard (project spend): a discipline tags a consumption booked to
  -- a PROJECT pool sub-container. If given, the consumer must be a project
  -- sub-container and the discipline must belong to that project.
  if p_discipline_id is not null then
    if p_consumer_sub_container_id is null then
      raise exception 'rpc_post_consumption: a discipline requires a custody consumer sub-container';
    end if;
    if not exists (
          select 1
          from public.warehouse_sub_containers sc
          join public.project_disciplines pd
            on pd.project_id = sc.project_id
           and pd.discipline_id = p_discipline_id
           and pd.is_active
          where sc.id = p_consumer_sub_container_id
            and sc.project_id is not null
        ) then
      raise exception 'rpc_post_consumption: discipline % is not part of the consumer project (sub %)', p_discipline_id, p_consumer_sub_container_id;
    end if;
  end if;

  -- Milestone guard: a milestone is a cost tag under a (consumer sub-container,
  -- discipline) the spend report groups by. It requires a custody consumer and,
  -- when scoped to a discipline, a matching p_discipline_id.
  if p_milestone_id is not null then
    if p_consumer_sub_container_id is null
       or not exists (
             select 1 from public.project_milestones pm
             where pm.id = p_milestone_id
               and pm.sub_container_id = p_consumer_sub_container_id
               and pm.discipline_id is not distinct from p_discipline_id
           )
    then
      raise exception 'rpc_post_consumption: milestone % does not belong to consumer % / discipline %', p_milestone_id, p_consumer_sub_container_id, p_discipline_id;
    end if;
  end if;

  v_ce_number := public.generate_consumption_number(p_consumer_type);

  insert into public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_sub_container_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id, milestone_id, discipline_id
  ) values (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_sub_container_id, null,
    nullif(p_notes, ''), coalesce(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id, p_milestone_id, p_discipline_id
  )
  returning id into v_consumption_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id := (v_line->>'brand_variant_id')::uuid;
    v_qty        := (v_line->>'qty')::int;

    if v_variant_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'rpc_post_consumption: invalid line %', v_line;
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           coalesce(ii.sku, '')::text     as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_variant_id;

    v_qty_taken_sum := 0;
    v_total_cost_sum := 0;

    for v_layer in
      select layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      from   public.deduct_fifo_layers(
        v_variant_id,
        p_source_warehouse_id,
        v_qty,
        false,
        p_source_sub_container_id
      )
    loop
      v_qty_taken_sum  := v_qty_taken_sum  + v_layer.qty_taken;
      v_total_cost_sum := v_total_cost_sum + v_layer.total_cost;

      insert into public.cogs_entries (
        brand_variant_id, qty, unit_cost, total_cost, date,
        source_type, source_id,
        consumption_id, consumer_type,
        consumer_sub_container_id, consumer_customer_id,
        division_id, consumer_division_id, milestone_id, discipline_id
      ) values (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_sub_container_id, null,
        v_sub.division_id, v_sub.division_id, p_milestone_id, p_discipline_id
      );

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) values (
        p_source_warehouse_id, p_source_sub_container_id, v_variant_id,
        v_label.item_name, nullif(v_label.sku, ''),
        'consumption', -v_layer.qty_taken, v_layer.unit_cost,
        'consumption', v_consumption_id, nullif(p_notes, '')
      );
    end loop;

    if v_qty_taken_sum < v_qty then
      raise exception 'rpc_post_consumption: insufficient stock for variant % at sub % (requested %, drained %)',
        v_variant_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
    end if;

    v_weighted_unit_cost := v_total_cost_sum / v_qty_taken_sum;

    insert into public.consumption_lines (
      consumption_id, brand_variant_id, item_name, sku, qty, unit_cost
    ) values (
      v_consumption_id, v_variant_id, v_label.item_name, nullif(v_label.sku, ''), v_qty, v_weighted_unit_cost
    );

    v_touched_variants := v_touched_variants || v_variant_id;
  end loop;

  select array(select distinct unnest(v_touched_variants)) into v_touched_variants;
  foreach v_variant in array v_touched_variants loop
    perform public.recalc_average_cost(v_variant);
  end loop;

  return v_consumption_id;
end;
$function$
;

-- ── Grants (match the pre-existing authenticated + service_role pattern) ──
REVOKE ALL ON FUNCTION public.add_project_milestone(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_project_milestone(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb, uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
