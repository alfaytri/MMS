-- VWh Projects Phase 2 — Task 2.3: milestone RPCs + rpc_post_consumption rewrite
--
-- rpc_post_consumption gains an 8th arg, p_milestone_id uuid DEFAULT NULL (nullable,
-- backward-compatible). When provided, it is validated against the CONSUMER
-- sub-container (not the source) — the spend report (Task 4.1) resolves discipline
-- from cogs.consumer_sub_container_id, and milestone_id sits next to it on the cogs
-- row, so binding the milestone to the consumer keeps the tag consistent with the
-- dimension the report groups by. A milestone requires a custody consumer, so
-- p_milestone_id with a null consumer (internal, or custody-with-null) raises.
-- The tag is stamped on consumption_entries and copied onto EVERY per-FIFO-layer
-- cogs_entries row, mirroring the existing consumer_sub_container_id /
-- consumer_division_id denormalization.
--
-- Base body = live pg_get_functiondef fetch (2026-08-16), edited minimally:
--   1. signature: + p_milestone_id uuid DEFAULT NULL
--   2. new validation block (after the consumer-division guard, before v_ce_number)
--   3. consumption_entries insert: + milestone_id column/value
--   4. cogs_entries insert (inside the per-layer loop): + milestone_id column/value
-- Every other line is byte-identical to the live body. Old 7-arg signature is
-- dropped so exactly one overload (8-arg) remains; the original ACL (authenticated
-- + service_role execute, no anon grant) is restored on the new signature.

DROP FUNCTION IF EXISTS public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb);

CREATE OR REPLACE FUNCTION public.rpc_post_consumption(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_consumer_type text, p_consumer_sub_container_id uuid, p_notes text, p_attachments text[], p_lines jsonb, p_milestone_id uuid DEFAULT NULL)
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

  -- Milestone guard: a milestone is a cost tag scoped to the CONSUMER sub-container
  -- (the discipline bucket the spend report groups by), not the source. It therefore
  -- requires a non-null custody consumer; internal consumption or a milestone that
  -- belongs to a different sub-container both raise.
  if p_milestone_id is not null then
    if p_consumer_sub_container_id is null
       or not exists (
             select 1 from public.project_milestones pm
             where pm.id = p_milestone_id
               and pm.sub_container_id = p_consumer_sub_container_id
           )
    then
      raise exception 'rpc_post_consumption: milestone % does not belong to the consumer sub-container %', p_milestone_id, p_consumer_sub_container_id;
    end if;
  end if;

  v_ce_number := public.generate_consumption_number(p_consumer_type);

  insert into public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_sub_container_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id, milestone_id
  ) values (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_sub_container_id, null,
    nullif(p_notes, ''), coalesce(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id, p_milestone_id
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
        division_id, consumer_division_id, milestone_id
      ) values (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_sub_container_id, null,
        v_sub.division_id, v_sub.division_id, p_milestone_id
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

-- Restore the original ACL (captured pre-drop): postgres owner + authenticated +
-- service_role execute, no anon grant, PUBLIC default left untouched (never revoked).
GRANT EXECUTE ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb, uuid) TO service_role;

-- add_project_milestone: create a labelled cost tag under a discipline bucket.
-- Same permission gate + style as sibling create_project / add_project_discipline.
-- UNIQUE(sub_container_id, label) yields 23505 on a duplicate label — the UI maps it.
CREATE OR REPLACE FUNCTION public.add_project_milestone(p_sub_container_id uuid, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.project_milestones (sub_container_id, label, created_by)
  VALUES (p_sub_container_id, p_label, public._current_user_data_id())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_project_milestone(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_milestone(uuid, text) TO service_role;

-- close_project_milestone: deactivate only — keep history (existing consumption/cogs
-- rows keep their milestone_id). Same shape as close_project's deactivate step, minus
-- the stock guard (a milestone is a cost tag, not a stock container).
CREATE OR REPLACE FUNCTION public.close_project_milestone(p_milestone_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_milestones
  SET is_active = false, updated_at = now()
  WHERE id = p_milestone_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_project_milestone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_project_milestone(uuid) TO service_role;

-- Money/stock + management RPCs must not be anon-executable. Postgres grants EXECUTE
-- to PUBLIC by default on new functions, and the 2026-08-05 ALTER DEFAULT PRIVILEGES
-- does not cover these — so revoke PUBLIC explicitly, matching the sibling money-path
-- convention (e.g. 20260806150000_rpc_create_purchase_order.sql). anon executes only
-- via PUBLIC membership, so this closes the anon path; authenticated/service_role keep it.
REVOKE EXECUTE ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, text, text[], jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_project_milestone(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_project_milestone(uuid) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
