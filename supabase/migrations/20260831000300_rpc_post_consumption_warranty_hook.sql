-- Consumption warranties: wire create_warranty_records_for_consumption into
-- rpc_post_consumption so custody consumption auto-issues warranties. Body is
-- the live function verbatim (incl. the Phase-1 notes guard) with the hook added
-- after the recalc_average_cost loop, before the final return.
CREATE OR REPLACE FUNCTION public.rpc_post_consumption(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_consumer_type text, p_consumer_sub_container_id uuid, p_notes text, p_attachments text[], p_lines jsonb, p_milestone_id uuid DEFAULT NULL::uuid, p_discipline_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text)
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
  v_code                 text := nullif(btrim(p_code), '');
  v_is_team_item         boolean := false;
  v_team_flags           boolean[];
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

  -- Phase 1: custody consumption is a sale — the invoice/order/project ref is mandatory.
  if p_consumer_type = 'custody' and nullif(btrim(p_notes), '') is null then
    raise exception 'Notes are required for custody consumption — enter the invoice / order number / project code.'
      using errcode = 'P0001';
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

  -- Team-item routing: derive whether this consumption is of team-held items and
  -- stamp the header, so the Consumption page splits Team vs Service history with a
  -- cheap indexed filter. Effective flag per item = COALESCE(item, category, false).
  -- A single consumption is homogeneous by construction (the UI never mixes the two
  -- pickers); assert exactly one distinct effective flag so the stored value is
  -- unambiguous. INNER joins are safe (variant->item->category are NOT NULL FKs); a
  -- bogus variant id simply drops out here and fails later in the FIFO drain.
  select array_agg(distinct coalesce(ii.is_team_item, ic.is_team_item, false))
    into v_team_flags
    from jsonb_array_elements(p_lines) l
    join public.inventory_item_brand_variants bv on bv.id = (l->>'brand_variant_id')::uuid
    join public.inventory_items ii on ii.id = bv.item_id
    join public.inventory_categories ic on ic.id = ii.category_id;

  if coalesce(array_length(v_team_flags, 1), 0) > 1 then
    raise exception 'rpc_post_consumption: a single consumption cannot mix team-items and normal items — post them as separate consumptions';
  end if;
  v_is_team_item := coalesce(v_team_flags[1], false);

  v_ce_number := public.generate_consumption_number(p_consumer_type);

  insert into public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_sub_container_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id, milestone_id, discipline_id, code, is_team_item
  ) values (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_sub_container_id, null,
    nullif(p_notes, ''), coalesce(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id, p_milestone_id, p_discipline_id, v_code, v_is_team_item
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
        division_id, consumer_division_id, milestone_id, discipline_id, code
      ) values (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_sub_container_id, null,
        v_sub.division_id, v_sub.division_id, p_milestone_id, p_discipline_id, v_code
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

  -- Consumption warranties: issue warranty records for custody-sold items
  -- (custody-only + policy checks live inside create_warranty_records_for_consumption).
  perform public.create_warranty_records_for_consumption(v_consumption_id);

  return v_consumption_id;
end;
$function$;

NOTIFY pgrst, 'reload schema';
