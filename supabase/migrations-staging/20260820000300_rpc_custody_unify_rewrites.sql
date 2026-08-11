-- Virtual Warehouses — Migration 3 of 4: custody RPC rewrites (unify teams+places → custody)
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- All bodies below are reproduced from the LIVE staging definitions
-- (pg_get_functiondef, 2026-08-12) with ONLY these changes:
--   * warehouse_kind IN ('teams','places')  →  = 'custody'   (and inverse checks)
--   * consumer_type IN ('team','place','internal')  →  ('custody','internal')
--   * consumer_team_sub_id + consumer_place_sub_id  →  consumer_sub_container_id
--   * generate_consumption_number prefix  →  CE-Custody / CE-Internal
--   * get_teams_master_list + get_places_master_list  →  get_custody_master_list(warehouse?)
--   * rpc_upsert_team_or_place retired (callers use rpc_upsert_warehouse_sub_container)
-- Plus ONE bug fix in rpc_post_consumption's consumer-division guard: the live body
-- tested `user_type IN ('owner','accountant')` against an enum that has no such labels
-- (it's {internal,customer,employee,team-leader}), so that IF could never plan — latent
-- because no non-admin custody consumption had been posted since the guard was added. The
-- Owner/Accountant override is now checked on the ROLE (custom_roles). Nothing else changed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. generate_consumption_number — CE-Custody / CE-Internal
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_consumption_number(p_consumer_type text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_type   text := lower(coalesce(p_consumer_type, 'internal'));
  v_period text := to_char(current_date, 'YYYY-MM');
  v_seq    int;
begin
  -- custody | internal only; anything not 'internal' books to the custody series.
  if v_type <> 'internal' then
    v_type := 'custody';
  end if;

  insert into public.consumption_number_counters (consumer_type, period, last_seq)
  values (v_type, v_period, 1)
  on conflict (consumer_type, period)
  do update set last_seq   = public.consumption_number_counters.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  -- e.g. CE-Custody-2026-08-01 / CE-Internal-2026-08-01 (NN ≥ 2 digits, grows past 99).
  return 'CE-' || initcap(v_type) || '-' || v_period || '-' || lpad(v_seq::text, 2, '0');
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_post_consumption — single consumer_sub_container_id; consumer_type custody|internal
--    Signature changes → drop the old overload first.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_post_consumption(uuid,uuid,text,uuid,uuid,uuid,text,text[],jsonb);

create or replace function public.rpc_post_consumption(
  p_source_warehouse_id     uuid,
  p_source_sub_container_id uuid,
  p_consumer_type           text,
  p_consumer_sub_container_id uuid,
  p_notes                   text,
  p_attachments             text[],
  p_lines                   jsonb
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- caller belongs to. Owner/Accountant + custody-admin override. Internal use has no
  -- consumer division and is left to the source guard above.
  if p_consumer_type = 'custody' then
    select sc.division_id into v_consumer_div
    from public.warehouse_sub_containers sc
    where sc.id = p_consumer_sub_container_id;

    if v_consumer_div is not null
       and not public._has_custody_admin_role(v_uid)
       -- Owner / Accountant financial-oversight roles bypass the division scope.
       -- FIX (pre-existing bug): the live body tested `user_type IN ('owner','accountant')`,
       -- but user_type is an enum {internal,customer,employee,team-leader} with no such
       -- labels, so the IF failed to plan ("invalid input value for enum user_type").
       -- The oversight distinction lives on the ROLE (custom_roles.name / is_system_admin).
       and not exists (
             select 1 from public.user_custom_roles ucr
             join public.custom_roles cr on cr.id = ucr.role_id
             where ucr.profile_id = v_uid
               and lower(cr.name) in ('owner','accountant')
           )
       and not exists (
             select 1 from public.user_company_divisions ucd
             where ucd.profile_id = v_uid and ucd.division_id = v_consumer_div
           )
    then
      raise exception 'You can only book a consumption to a custody location in your own division.';
    end if;
  end if;

  v_ce_number := public.generate_consumption_number(p_consumer_type);

  insert into public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_sub_container_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id
  ) values (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_sub_container_id, null,
    nullif(p_notes, ''), coalesce(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id
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
        division_id, consumer_division_id
      ) values (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_sub_container_id, null,
        v_sub.division_id, v_sub.division_id
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
$function$;

grant execute on function public.rpc_post_consumption(uuid,uuid,text,uuid,text,text[],jsonb)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_create_custody_assign — destination must be a custody sub-container
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_create_custody_assign(
  p_source_warehouse_id uuid,
  p_source_sub_container_id uuid,
  p_dest_sub_container_id uuid,
  p_items jsonb,
  p_notes text default null::text,
  p_created_by_profile_id uuid default null::uuid,
  p_created_by_name text default null::text
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_source_sub        record;
  v_dest_sub          record;
  v_dest_warehouse_id uuid;
  v_dest_responsible  uuid;
  v_transfer_id       uuid;
  v_transfer_number   text;
  v_uid               uuid := public._current_user_data_id();
  v_creator           uuid := coalesce(p_created_by_profile_id, v_uid);
  v_item              jsonb;
  v_bv_id             uuid;
  v_qty               int;
  v_label             record;
begin
  if v_creator is null then
    raise exception 'You need to be signed in to request custody stock.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before submitting the request.';
  end if;

  -- Source sub sanity checks.
  select sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name
    into v_source_sub
    from public.warehouse_sub_containers sc
    where sc.id = p_source_sub_container_id;

  if not found or v_source_sub.is_active is not true then
    raise exception 'The source sub-container is no longer active.';
  end if;
  if v_source_sub.warehouse_id <> p_source_warehouse_id then
    raise exception 'The source sub-container does not belong to the chosen warehouse.';
  end if;

  -- Destination sub must be an active custody sub AND have a responsible person set,
  -- OR the caller must be admin (bypass) — otherwise nobody can accept later.
  select sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind,
         sc.responsible_person_profile_id
    into v_dest_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_dest_sub_container_id;

  if not found or v_dest_sub.is_active is not true then
    raise exception 'The destination custody sub-container is no longer active.';
  end if;
  if v_dest_sub.warehouse_kind <> 'custody' then
    raise exception 'Custody requests can only target a Custody warehouse, not %.', v_dest_sub.warehouse_kind;
  end if;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;
  v_dest_responsible  := v_dest_sub.responsible_person_profile_id;

  if v_dest_warehouse_id = p_source_warehouse_id then
    raise exception 'Source and destination warehouses must differ.';
  end if;

  -- Permission: request must come from the destination sub's responsible person OR an admin.
  if v_dest_responsible is distinct from v_creator
     and not public._has_custody_admin_role(v_creator) then
    raise exception 'Only the responsible person of this custody sub-container (or an admin) can request stock for it.';
  end if;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name
  ) values (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'pending',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    if v_bv_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'One of the request lines is missing an item or has an invalid qty.';
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           nullif(ii.sku, '')::text        as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_bv_id;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, unit_cost, sub_container_id
    ) values (
      v_transfer_id, v_bv_id, coalesce(v_label.item_name, ''), v_label.sku,
      v_qty, 0, p_source_sub_container_id
    );
  end loop;

  return v_transfer_id;
end;
$function$;

grant execute on function public.rpc_create_custody_assign(uuid,uuid,uuid,jsonb,text,uuid,text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_create_custody_return — source is custody, destination is a real warehouse
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_create_custody_return(
  p_source_sub_container_id uuid,
  p_dest_warehouse_id uuid,
  p_dest_sub_container_id uuid,
  p_items jsonb,
  p_notes text default null::text,
  p_created_by_profile_id uuid default null::uuid,
  p_created_by_name text default null::text
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_source_sub               record;
  v_source_responsible_name  text;
  v_dest_sub                 record;
  v_transfer_id              uuid;
  v_transfer_number          text;
  v_uid                      uuid := public._current_user_data_id();
  v_creator                  uuid := coalesce(p_created_by_profile_id, v_uid);
  v_item                     jsonb;
  v_bv_id                    uuid;
  v_qty                      int;
  v_label                    record;
  v_layer                    record;
  v_qty_taken_sum            int;
  v_new_item_id              uuid;
begin
  if v_creator is null then
    raise exception 'You need to be signed in to return custody stock.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before submitting the return.';
  end if;

  select sc.id, sc.warehouse_id, sc.is_active, sc.responsible_person_profile_id,
         w.warehouse_kind, sc.name, u.full_name as responsible_name
    into v_source_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    left join public.user_data u on u.id = sc.responsible_person_profile_id
    where sc.id = p_source_sub_container_id;

  if not found or v_source_sub.is_active is not true then
    raise exception 'This custody sub-container is no longer active.';
  end if;
  if v_source_sub.warehouse_kind <> 'custody' then
    raise exception 'This flow only handles returns from a Custody warehouse — not %.', v_source_sub.warehouse_kind;
  end if;

  v_source_responsible_name := v_source_sub.responsible_name;

  if v_source_sub.responsible_person_profile_id is distinct from v_creator
     and not public._has_custody_admin_role(v_creator) then
    if v_source_sub.responsible_person_profile_id is null then
      raise exception 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to return the stock.';
    else
      raise exception 'Only % can return stock from this custody sub-container.', v_source_responsible_name;
    end if;
  end if;

  select sc.id, sc.warehouse_id, sc.is_active, w.warehouse_kind
    into v_dest_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_dest_sub_container_id;

  if not found or v_dest_sub.is_active is not true then
    raise exception 'The destination sub-container is no longer active.';
  end if;
  if v_dest_sub.warehouse_id <> p_dest_warehouse_id then
    raise exception 'The destination sub-container does not belong to the chosen warehouse.';
  end if;
  if v_dest_sub.warehouse_kind = 'custody' then
    raise exception 'Returns must land on a real warehouse, not a Custody location. Use the assign flow for custody-to-custody moves.';
  end if;
  if v_dest_sub.warehouse_id = v_source_sub.warehouse_id then
    raise exception 'Source and destination warehouses must differ.';
  end if;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    dispatched_by_profile_id, dispatched_by_name, dispatched_at
  ) values (
    v_transfer_number, v_source_sub.warehouse_id, p_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_return', 'in_transit',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    if v_bv_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'One of the return lines is missing an item or has an invalid qty.';
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           nullif(ii.sku, '')::text        as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_bv_id;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost,
      sub_container_id
    ) values (
      v_transfer_id, v_bv_id, coalesce(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, 0,
      p_source_sub_container_id
    )
    returning id into v_new_item_id;

    v_qty_taken_sum := 0;

    for v_layer in
      select layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      from   public.deduct_fifo_layers(
        v_bv_id,
        v_source_sub.warehouse_id,
        v_qty,
        true,
        p_source_sub_container_id
      )
    loop
      v_qty_taken_sum := v_qty_taken_sum + v_layer.qty_taken;

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) values (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        coalesce(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, nullif(p_notes, '')
      );
    end loop;

    if v_qty_taken_sum < v_qty then
      raise exception 'Not enough stock of "%" in custody to return % — only % available.',
        coalesce(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken_sum;
    end if;

    update public.warehouse_transfer_items wti
       set unit_cost = (
         select sum(qty * unit_cost) / nullif(sum(qty), 0)
         from   public.inventory_stock_movements
         where  reference_type = 'transfer'
           and  reference_id   = v_transfer_id
           and  brand_variant_id = v_bv_id
       )
     where wti.id = v_new_item_id;
  end loop;

  return v_transfer_id;
end;
$function$;

grant execute on function public.rpc_create_custody_return(uuid,uuid,uuid,jsonb,text,uuid,text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_upsert_warehouse_sub_container — custody sub-containers require a division
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_upsert_warehouse_sub_container(
  p_warehouse_id uuid,
  p_name text,
  p_division_id uuid default null::uuid,
  p_id uuid default null::uuid,
  p_is_active boolean default null::boolean,
  p_responsible_person_profile_id uuid default null::uuid
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wh_kind text;
  v_is_virtual boolean;
  v_new_id uuid;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse_id is required';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  select warehouse_kind, is_virtual
    into v_wh_kind, v_is_virtual
    from public.warehouses
    where id = p_warehouse_id;

  if not found then
    raise exception 'Warehouse % not found', p_warehouse_id;
  end if;

  -- Shape rules per warehouse kind:
  --   general / any real WH → division_id REQUIRED
  --   custody               → division_id REQUIRED (each team / project / site is scoped to a division)
  --   repair                → division_id OPTIONAL (nullable — vendors are cross-division)
  if v_wh_kind = 'custody' then
    if p_division_id is null then
      raise exception 'Division is required for custody sub-containers.';
    end if;
  elsif not coalesce(v_is_virtual, false) then
    if p_division_id is null then
      raise exception 'Division is required for real-warehouse sub-containers.';
    end if;
  end if;

  if p_id is null then
    insert into public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active,
      responsible_person_profile_id
    )
    values (
      p_warehouse_id, p_division_id, btrim(p_name), coalesce(p_is_active, true),
      p_responsible_person_profile_id
    )
    returning id into v_new_id;
    return v_new_id;
  end if;

  if not exists (
    select 1 from public.warehouse_sub_containers
    where id = p_id and warehouse_id = p_warehouse_id
  ) then
    raise exception 'Sub-container % is not under warehouse %.', p_id, p_warehouse_id;
  end if;

  update public.warehouse_sub_containers
     set name                          = btrim(p_name),
         division_id                   = coalesce(p_division_id, division_id),
         is_active                     = coalesce(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         updated_at                    = now()
   where id = p_id;

  return p_id;
end;
$function$;

grant execute on function public.rpc_upsert_warehouse_sub_container(uuid,text,uuid,uuid,boolean,uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. get_custody_master_list — replaces get_teams_master_list + get_places_master_list
--    Returns all custody sub-containers (optionally one warehouse), grouped-ready
--    with warehouse_id + warehouse_name so the UI can render a tab per custody WH.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_teams_master_list();
drop function if exists public.get_places_master_list();

create or replace function public.get_custody_master_list(p_warehouse_id uuid default null::uuid)
 returns table(
   id uuid, name text,
   warehouse_id uuid, warehouse_name text,
   division_id uuid, division_name text,
   is_active boolean,
   responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text,
   created_at timestamp with time zone, updated_at timestamp with time zone
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select sc.id,
         sc.name,
         w.id   as warehouse_id,
         w.name as warehouse_name,
         sc.division_id,
         d.name as division_name,
         sc.is_active,
         sc.responsible_person_profile_id,
         u.full_name as responsible_person_name,
         u.phone     as responsible_person_phone,
         sc.created_at,
         sc.updated_at
  from   public.warehouse_sub_containers sc
  join   public.warehouses         w on w.id = sc.warehouse_id
  left   join public.company_divisions d on d.id = sc.division_id
  left   join public.user_data     u on u.id = sc.responsible_person_profile_id
  where  w.warehouse_kind = 'custody'
    and  (p_warehouse_id is null or w.id = p_warehouse_id)
  order  by w.name, d.name, sc.name;
$function$;

grant execute on function public.get_custody_master_list(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Retire rpc_upsert_team_or_place — callers now pass the chosen custody warehouse
--    to rpc_upsert_warehouse_sub_container.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean, uuid);
