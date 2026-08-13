-- Virtual Warehouses — follow-up: consumption cross-division via a grantable permission
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- The consumer-division guard in rpc_post_consumption decided who may book a
-- consumption to a division OTHER than their own. Migration 3 fixed the guard's
-- pre-existing enum crash by matching role NAMES ('owner'/'accountant'), but role
-- names are operator-created and editable — a rename silently breaks the bypass.
--
-- This replaces the name match with a proper, grantable permission key
-- `consumption.cross_division`, enforced server-side via public._user_has_permission
-- (which already folds in is_system_admin, so Owner stays covered). Admins grant the
-- key to whichever role should cross divisions, in the role editor. Body reproduced
-- verbatim from the live definition (2026-08-12) except the one guard block.

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

-- Preserve the original intent: grant the new key to the existing Owner + Accountant
-- roles (Owner also bypasses via is_system_admin, but grant it so the role editor
-- shows it explicitly). Idempotent — only appends when absent.
update public.custom_roles
   set permissions = array_append(permissions, 'consumption.cross_division')
 where lower(name) in ('owner', 'accountant')
   and not ('consumption.cross_division' = any(coalesce(permissions, '{}'::text[])));
