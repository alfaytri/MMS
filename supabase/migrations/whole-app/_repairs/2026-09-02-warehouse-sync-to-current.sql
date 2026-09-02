-- ============================================================================
-- Repair: whole-app dev DB (wkmvjxxmzstsvahuiwsz) warehouse domain -> current staging
-- Applied 2026-09-02 via `supabase db query --file` inside BEGIN...COMMIT (atomic).
-- Dry-run validated first with BEGIN...ROLLBACK against real data (0 errors).
--
-- Brings the warehouse portion current with live staging (mwvblpgbgxipvrevkeff)
-- while KEEPING all field-service module objects untouched:
--   kept: 73 module tables, company_divisions.calendar_schedule_id (+FK),
--         notifications.allow_all_notifications policy, 34 module/overload funcs,
--         5 module views.
--
-- Scope applied: +1 table (inventory_category_divisions), +11 columns, 4 column
--   alterations, 83 functions (23 missing + 60 changed; 1 DROP-first for return
--   type), 6 triggers, 135 indexes, 10 constraints, 15 policies, 1 view.
-- Post-apply diff vs staging: 0 missing / 0 changed across every object class
--   (only the intentional module keeps remain).
--
-- NOTE: 88 further warehouse functions differ from staging by CRLF-vs-LF line
--   endings ONLY (logically identical) and were intentionally left as-is.
-- ============================================================================

BEGIN;

-- ===================================================================
-- SECTION 1 — new warehouse table: inventory_category_divisions (columns only)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.inventory_category_divisions (
  category_id uuid NOT NULL,
  division_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);
ALTER TABLE public.inventory_category_divisions ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- SECTION 2 — add missing warehouse columns (11)
-- ===================================================================
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.inventory_item_divisions ADD COLUMN IF NOT EXISTS tool_tracking_mode tool_tracking_mode;
ALTER TABLE public.return_lines ADD COLUMN IF NOT EXISTS consumption_line_id uuid;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS tool_unit_id uuid;
ALTER TABLE public.tool_asset_units ADD COLUMN IF NOT EXISTS pending_scrap boolean DEFAULT false NOT NULL;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.warranty_records ADD COLUMN IF NOT EXISTS consumption_id uuid;
ALTER TABLE public.warranty_records ADD COLUMN IF NOT EXISTS consumption_line_id uuid;

-- ===================================================================
-- SECTION 3 — column alterations (defaults / nullability to match current warehouse)
-- ===================================================================
ALTER TABLE public.inventory_categories ALTER COLUMN tool_tracking_mode SET DEFAULT 'bulk'::tool_tracking_mode;
ALTER TABLE public.warranty_records ALTER COLUMN sale_delivery_line_id DROP NOT NULL;
ALTER TABLE public.warranty_records ALTER COLUMN sale_order_id DROP NOT NULL;
ALTER TABLE public.warranty_records ALTER COLUMN customer_id DROP NOT NULL;

-- ===================================================================
-- SECTION 4 — functions: 23 missing + 60 changed = 83 (CREATE OR REPLACE from staging; 1 need DROP first for return-type change)
-- ===================================================================
CREATE OR REPLACE FUNCTION public._stamp_sale_delivery_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := public._current_user_data_id();
  END IF;
  IF NEW.created_by_name IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := (SELECT full_name FROM public.user_data WHERE id = NEW.created_by);
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public._apply_tool_scrap_on_adjustment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tool_unit_id IS NULL THEN RETURN NEW; END IF;

  -- Approved: retire the unit now.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.tool_unit_assignments
      SET released_at = COALESCE(released_at, now()), release_reason = COALESCE(release_reason, 'scrapped')
      WHERE unit_id = NEW.tool_unit_id AND released_at IS NULL;
    UPDATE public.tool_asset_units
      SET status = 'retired', current_custody_location_id = NULL, pending_scrap = false
      WHERE id = NEW.tool_unit_id;

  -- Rejected: release the lock; the unit returns to its prior state.
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.tool_asset_units SET pending_scrap = false WHERE id = NEW.tool_unit_id;
  END IF;

  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public._emit_send_for_repair_transfer(p_warehouse_id uuid, p_to_warehouse_id uuid, p_brand_variant_id uuid, p_qty numeric, p_unit_cost numeric, p_item_name text, p_sku text, p_from_sub_container_id uuid, p_to_sub_container_id uuid, p_repair_vendor_id uuid, p_expected_return_date date, p_notes text, p_disposition_id uuid, p_movement_notes text, p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer_id     uuid;
  v_transfer_number text;
begin
  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, p_to_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_disposition_id, p_expected_return_date,
    p_from_sub_container_id, p_to_sub_container_id,
    p_uid, p_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, p_brand_variant_id,
    coalesce(p_item_name, ''), nullif(p_sku, ''),
    p_qty::integer, p_unit_cost, p_qty::integer,
    p_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, p_brand_variant_id, p_qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', p_qty, p_warehouse_id, p_brand_variant_id, p_unit_cost,
    p_disposition_id, v_transfer_id, p_movement_notes, p_uid
  );

  return v_transfer_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_role_name_to_approval_tiers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_remove(required_roles, OLD.name)
     WHERE OLD.name = ANY(required_roles);
    RETURN OLD;
  END IF;

  -- UPDATE: propagate a rename
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_replace(required_roles, OLD.name, NEW.name)
     WHERE OLD.name = ANY(required_roles);
  END IF;

  -- UPDATE: treat a soft delete (deleted_at newly set) as a removal
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_remove(required_roles, NEW.name)
     WHERE NEW.name = ANY(required_roles);
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.delete_workflow_step(p_step_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner boolean;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN
    RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'Owner'
      AND cr.is_approval_slot = true
      AND cr.deleted_at IS NULL
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only owners can delete approval chain steps';
  END IF;

  DELETE FROM approval_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public._autostick_item_division()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_item uuid; v_div uuid;
begin
  if new.remaining_qty is null or new.remaining_qty <= 0 then return new; end if;
  select sc.division_id into v_div
    from public.warehouse_sub_containers sc where sc.id = new.sub_container_id;
  if v_div is null then return new; end if;
  select bv.item_id into v_item
    from public.inventory_item_brand_variants bv where bv.id = new.brand_variant_id;
  if v_item is null then return new; end if;
  insert into public.inventory_item_divisions (item_id, division_id, category_id)
  select v_item, v_div, (select category_id from public.inventory_items where id = v_item)
  on conflict (item_id, division_id) do nothing;   -- additive; never removes
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_set_category_divisions(p_category_id uuid, p_division_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public._user_can_write_catalog(public._current_user_data_id()) then
    raise exception 'not authorized';
  end if;
  delete from public.inventory_category_divisions
   where category_id = p_category_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  insert into public.inventory_category_divisions (category_id, division_id, created_by)
  select p_category_id, d, public._current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (category_id, division_id) do nothing;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_item_effective_divisions(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive anc(id) as (
    select category_id from public.inventory_items where id = p_item_id and category_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'explicit', coalesce((select array_agg(division_id)
                            from public.inventory_item_divisions where item_id = p_item_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
CREATE OR REPLACE FUNCTION public.rpc_category_divisions(p_category_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive anc(id) as (
    select parent_id from public.inventory_categories where id = p_category_id and parent_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'own', coalesce((select array_agg(division_id)
                       from public.inventory_category_divisions where category_id = p_category_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
CREATE OR REPLACE FUNCTION public.rpc_cascade_category_units_division(p_category_id uuid, p_division_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_moved int := 0; v_skipped text[] := array[]::text[]; r record;
begin
  if not public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') then
    raise exception 'not authorized';
  end if;
  if p_division_id is null then raise exception 'target division required'; end if;

  for r in
    with recursive subtree as (
      select id from public.inventory_categories where id = p_category_id
      union all
      select c.id from public.inventory_categories c join subtree s on c.parent_id = s.id
    )
    select tau.id as unit_id
      from public.tool_asset_units tau
      join public.inventory_items ii on ii.id = tau.item_id
     where ii.category_id in (select id from subtree)
       and tau.division_id is distinct from p_division_id
  loop
    -- mirror rpc_transfer_tool_unit: division moves, open team assignment released, custody cleared
    update public.tool_asset_units set division_id = p_division_id where id = r.unit_id;
    update public.tool_unit_assignments set released_at = now(), release_reason = 'moved'
      where unit_id = r.unit_id and released_at is null;
    update public.tool_asset_units set current_custody_location_id = null where id = r.unit_id;
    v_moved := v_moved + 1;
  end loop;

  return jsonb_build_object('moved', v_moved, 'skipped', to_jsonb(v_skipped));
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_dead_stock_report(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(brand_variant_id uuid, item_name text, category_name text, brand text, sku text, stock_level numeric, average_cost numeric, total_value numeric, last_movement_date timestamp with time zone, last_movement_source text, days_idle integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  div_stock AS (
    -- On-hand for the selected division(s), from FIFO layers by sub-container.
    SELECT fcl.brand_variant_id,
           SUM(fcl.remaining_qty)::numeric                       AS qty,
           SUM(fcl.remaining_qty::numeric * fcl.total_unit_cost) AS value
      FROM fifo_cost_layers fcl
      JOIN warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
     WHERE p_division_ids IS NOT NULL
       AND fcl.remaining_qty > 0
       AND sc.division_id = ANY(p_division_ids)
     GROUP BY fcl.brand_variant_id
  ),
  latest_movements AS (
    SELECT brand_variant_id, MAX(created_at) AS last_movement_at
      FROM inventory_stock_movements
     GROUP BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
      FROM fifo_cost_layers
     WHERE remaining_qty > 0
     GROUP BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                      AS brand_variant_id,
      ii.name_en                                                  AS item_name,
      ic.name_en                                                  AS category_name,
      COALESCE(b.name, NULLIF(TRIM(ibv.brand), ''))               AS brand,
      ibv.code                                                    AS sku,
      CASE WHEN p_division_ids IS NULL THEN ibv.stock_level
           ELSE ds.qty END                                        AS stock_level,
      CASE WHEN p_division_ids IS NULL THEN COALESCE(ibv.average_cost, 0)
           ELSE COALESCE(ds.value / NULLIF(ds.qty, 0), 0) END     AS average_cost,
      CASE WHEN p_division_ids IS NULL THEN ibv.stock_level * COALESCE(ibv.average_cost, 0)
           ELSE COALESCE(ds.value, 0) END                         AS total_value,
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz,
               ibv.created_at)                                    AS last_movement_date,
      CASE
        WHEN lm.last_movement_at  IS NOT NULL THEN 'movement'
        WHEN of.oldest_layer_date IS NOT NULL THEN 'fifo'
        WHEN ibv.created_at       IS NOT NULL THEN 'created'
        ELSE NULL
      END                                                         AS last_movement_source,
      EXTRACT(DAY FROM
        CURRENT_TIMESTAMP -
        COALESCE(lm.last_movement_at,
                 of.oldest_layer_date::timestamptz,
                 ibv.created_at)
      )::int                                                      AS days_idle
    FROM       public.inventory_item_brand_variants ibv
    JOIN       public.inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  public.inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  public.brands                   b  ON b.id  = ibv.brand_id
    LEFT JOIN  latest_movements                lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo                     of ON of.brand_variant_id = ibv.id
    LEFT JOIN  div_stock                       ds ON ds.brand_variant_id = ibv.id
    WHERE (p_division_ids IS NULL     AND ibv.stock_level > 0)
       OR (p_division_ids IS NOT NULL AND ds.qty > 0)
  )
  SELECT
    brand_variant_id, item_name, category_name, brand, sku,
    stock_level, average_cost, total_value, last_movement_date,
    last_movement_source, days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$function$;
CREATE OR REPLACE FUNCTION public.delete_warehouse(p_warehouse_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_ids uuid[];
  r  record;
  n  bigint;
  blockers text[] := '{}';
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'A warehouse id is required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse not found (it may already have been deleted).';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_sub_ids
    FROM warehouse_sub_containers WHERE warehouse_id = p_warehouse_id;

  -- Refuse if any RESTRICT / NO ACTION child (real stock or history) points at
  -- the warehouse or any of its sub-containers. The self-FK
  -- (warehouse_sub_containers.warehouse_id) is excluded — we delete those rows
  -- ourselves below.
  FOR r IN
    SELECT tc.table_name AS c_tab, kcu.column_name AS c_col, ccu.table_name AS p_tab
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name IN ('warehouses','warehouse_sub_containers')
      AND rc.delete_rule IN ('RESTRICT','NO ACTION')
      AND NOT (tc.table_name = 'warehouse_sub_containers' AND kcu.column_name = 'warehouse_id')
  LOOP
    IF r.p_tab = 'warehouses' THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.c_tab, r.c_col)
        INTO n USING p_warehouse_id;
    ELSIF cardinality(v_sub_ids) > 0 THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', r.c_tab, r.c_col)
        INTO n USING v_sub_ids;
    ELSE
      n := 0;
    END IF;
    IF n > 0 THEN
      blockers := blockers || format('%s: %s', r.c_tab, n);
    END IF;
  END LOOP;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION 'This warehouse still has stock or history and can''t be deleted (%). Move or clear those records first.',
      array_to_string(blockers, ', ');
  END IF;

  DELETE FROM warehouse_sub_containers WHERE warehouse_id = p_warehouse_id;
  DELETE FROM warehouses              WHERE id           = p_warehouse_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_warranty_records_for_consumption(p_consumption_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ce            RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_country_id    integer;
  v_country_name  text;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_inserted      integer := 0;
BEGIN
  SELECT id, date, division_id, consumer_type
  INTO   v_ce
  FROM   public.consumption_entries
  WHERE  id = p_consumption_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Warranty only on custody consumption (the sale case); internal gets none.
  IF v_ce.consumer_type <> 'custody' OR v_ce.division_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty
    FROM   public.consumption_lines
    WHERE  consumption_id = p_consumption_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty IS NULL
       OR v_line.qty <= 0
    THEN
      CONTINUE;
    END IF;

    SELECT biv.item_id, biv.country_id, cc.name
    INTO   v_item_id, v_country_id, v_country_name
    FROM   public.inventory_item_brand_variants biv
    LEFT JOIN public.country_codes cc ON cc.id = biv.country_id
    WHERE  biv.id = v_line.brand_variant_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_policy_id := public.get_effective_warranty_policy(v_item_id);

    IF v_policy_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_policy
    FROM   public.warranty_policies
    WHERE  id = v_policy_id;

    IF v_policy.duration_months = 0 THEN
      CONTINUE;
    END IF;

    -- Consumption has no delivery/invoice split: the warranty always starts on
    -- the consumption date. The policy's starts_from is still snapshotted for
    -- the record of what rule was in force.
    v_start_date := COALESCE(v_ce.date, CURRENT_DATE);

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      consumption_id,
      consumption_line_id,
      division_id,
      brand_variant_id,
      item_name,
      sku,
      qty,
      policy_id,
      policy_name_snapshot,
      coverage_type_snapshot,
      duration_months_snapshot,
      terms_en_snapshot,
      terms_ar_snapshot,
      void_conditions_snapshot,
      starts_from_snapshot,
      start_date,
      end_date,
      origin_country_id,
      origin_name_snapshot
    ) VALUES (
      public.next_warranty_number('consumption'::warranty_source_type, v_ce.division_id),
      'consumption'::warranty_source_type,
      v_ce.id,
      v_line.id,
      v_ce.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      NULLIF(v_line.sku, ''),
      v_line.qty,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date,
      v_country_id,
      v_country_name
    )
    ON CONFLICT (consumption_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_sub_container_division_map()
 RETURNS TABLE(sub_container_id uuid, warehouse_id uuid, division_id uuid, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, warehouse_id, division_id, is_active
  FROM public.warehouse_sub_containers;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_import_inventory_stock(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := public._current_user_data_id();
  v_row      jsonb;
  v_bv       uuid;
  v_sub      uuid;
  v_qty      integer;
  v_cost     numeric;
  v_wh       uuid;
  v_layers   integer := 0;
  v_units    bigint := 0;
  v_value    numeric := 0;
  v_variants uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to import stock.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._user_has_permission(v_uid, 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Missing permission: inventory.catalog.manage' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_bv   := (v_row->>'brand_variant_id')::uuid;
    v_sub  := (v_row->>'sub_container_id')::uuid;
    v_qty  := (v_row->>'qty')::integer;
    v_cost := COALESCE((v_row->>'unit_cost')::numeric, 0);
    IF v_bv IS NULL OR v_sub IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT warehouse_id INTO v_wh FROM public.warehouse_sub_containers WHERE id = v_sub;
    IF v_wh IS NULL THEN
      RAISE EXCEPTION 'Unknown sub-container %', v_sub USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, remaining_qty, unit_cost, total_unit_cost, landed_cost_per_unit,
      source_type, source_currency, source_exchange_rate
    ) VALUES (
      v_bv, v_wh, v_sub, CURRENT_DATE,
      v_qty, v_qty, v_cost, v_cost, 0,
      'inventory_import', 'QAR', 1
    );

    v_layers   := v_layers + 1;
    v_units    := v_units + v_qty;
    v_value    := v_value + (v_qty * v_cost);
    v_variants := array_append(v_variants, v_bv);
  END LOOP;

  -- Caches the FIFO trigger does not maintain (refresh_stock_summary_row builds
  -- warehouse_stock_summary only). Not guarded — the pricing guard fires only on
  -- cost_price/selling_price changes, which we don't touch here.
  SELECT array_agg(DISTINCT x) INTO v_variants FROM unnest(v_variants) AS x;
  IF v_variants IS NOT NULL AND array_length(v_variants, 1) > 0 THEN
    UPDATE public.inventory_item_brand_variants bv SET
      stock_level = COALESCE((
        SELECT SUM(l.remaining_qty) FROM public.fifo_cost_layers l
        WHERE l.brand_variant_id = bv.id AND l.remaining_qty > 0), 0),
      average_cost = COALESCE((
        SELECT SUM(l.remaining_qty::numeric * l.total_unit_cost) FILTER (WHERE l.total_unit_cost > 0)
             / NULLIF(SUM(l.remaining_qty) FILTER (WHERE l.total_unit_cost > 0), 0)
        FROM public.fifo_cost_layers l
        WHERE l.brand_variant_id = bv.id AND l.remaining_qty > 0), bv.average_cost)
    WHERE bv.id = ANY(v_variants);

    UPDATE public.inventory_items ii SET
      total_stock = COALESCE((
        SELECT SUM(bv.stock_level) FROM public.inventory_item_brand_variants bv
        WHERE bv.item_id = ii.id), 0)
    WHERE ii.id IN (
      SELECT DISTINCT item_id FROM public.inventory_item_brand_variants WHERE id = ANY(v_variants));
  END IF;

  RETURN jsonb_build_object('layers_created', v_layers, 'units', v_units, 'value', v_value);
END;
$function$;
CREATE OR REPLACE FUNCTION public._reverse_sale_cogs_for_return(p_return_id uuid, p_brand_variant_id uuid, p_qty numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_cogs            RECORD;
  v_qty_remaining   numeric := p_qty;
  v_qty_this_chunk  numeric;
  v_available_qty   numeric;
  v_reversed_cost   numeric := 0;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RETURN 0; END IF;

  SELECT id, source_type, source_id, division_id, return_number
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % not found', p_return_id;
  END IF;

  IF v_return.source_type = 'sale_order' THEN
    -- Sale reversal (unchanged from Phase 3a).
    SELECT COALESCE(SUM(qty), 0) INTO v_available_qty
    FROM   public.cogs_entries
    WHERE  sale_order_id = v_return.source_id AND brand_variant_id = p_brand_variant_id
      AND  source_type = 'sale' AND qty > 0;
    IF v_available_qty < p_qty THEN
      RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % variant % requests qty % but only % sale COGS available',
        v_return.return_number, p_brand_variant_id, p_qty, v_available_qty;
    END IF;
    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id
      FROM   public.cogs_entries
      WHERE  sale_order_id = v_return.source_id AND brand_variant_id = p_brand_variant_id
        AND  source_type = 'sale' AND qty > 0
      ORDER  BY date ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;
      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);
      INSERT INTO public.cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, division_id, notes
      ) VALUES (
        p_brand_variant_id, v_cogs.sale_delivery_id, v_cogs.sale_order_id,
        -v_qty_this_chunk, v_cogs.unit_cost, -(v_qty_this_chunk * v_cogs.unit_cost), current_date,
        'sale_return', COALESCE(v_return.division_id, v_cogs.division_id),
        'COGS reversed by return ' || v_return.return_number || ' (disposition)'
      );
      v_reversed_cost := v_reversed_cost + (v_qty_this_chunk * v_cogs.unit_cost);
      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

  ELSIF v_return.source_type = 'consumption' THEN
    -- Phase 3b: consumption reversal. Consumption COGS keys on consumption_id
    -- (no delivery/order); reverse into negative cogs_entries('consumption_return').
    SELECT COALESCE(SUM(qty), 0) INTO v_available_qty
    FROM   public.cogs_entries
    WHERE  consumption_id = v_return.source_id AND brand_variant_id = p_brand_variant_id
      AND  source_type = 'consumption' AND qty > 0;
    IF v_available_qty < p_qty THEN
      RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % variant % requests qty % but only % consumption COGS available',
        v_return.return_number, p_brand_variant_id, p_qty, v_available_qty;
    END IF;
    FOR v_cogs IN
      SELECT id, consumption_id, qty, unit_cost, division_id,
             consumer_type, consumer_sub_container_id, consumer_customer_id
      FROM   public.cogs_entries
      WHERE  consumption_id = v_return.source_id AND brand_variant_id = p_brand_variant_id
        AND  source_type = 'consumption' AND qty > 0
      ORDER  BY date ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;
      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);
      INSERT INTO public.cogs_entries (
        brand_variant_id, consumption_id,
        qty, unit_cost, total_cost, date, source_type, division_id,
        consumer_type, consumer_sub_container_id, consumer_customer_id, notes
      ) VALUES (
        p_brand_variant_id, v_cogs.consumption_id,
        -v_qty_this_chunk, v_cogs.unit_cost, -(v_qty_this_chunk * v_cogs.unit_cost), current_date,
        'consumption_return', COALESCE(v_return.division_id, v_cogs.division_id),
        v_cogs.consumer_type, v_cogs.consumer_sub_container_id, v_cogs.consumer_customer_id,
        'Consumption COGS reversed by return ' || v_return.return_number || ' (disposition)'
      );
      v_reversed_cost := v_reversed_cost + (v_qty_this_chunk * v_cogs.unit_cost);
      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

  ELSE
    RETURN 0;  -- purchase_order or other: not applicable
  END IF;

  IF v_qty_remaining > 0 THEN
    RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % variant % could not fully attribute % units',
      v_return.return_number, p_brand_variant_id, v_qty_remaining;
  END IF;

  RETURN v_reversed_cost;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tool_effective_mode(p_item_id uuid, p_division_id uuid)
 RETURNS tool_tracking_mode
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT iid.tool_tracking_mode
       FROM public.inventory_item_divisions iid
      WHERE iid.item_id = p_item_id AND iid.division_id = p_division_id),
    (SELECT ic.tool_tracking_mode
       FROM public.inventory_items it
       JOIN public.inventory_categories ic ON ic.id = it.category_id
      WHERE it.id = p_item_id)
  );
$function$;
CREATE OR REPLACE FUNCTION public.get_tool_item_division_modes(p_category_id uuid)
 RETURNS TABLE(item_id uuid, item_name text, division_id uuid, division_name text, effective_mode tool_tracking_mode, bulk_qty numeric, unit_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ov_items AS (
    SELECT DISTINCT iid.item_id
    FROM public.inventory_item_divisions iid
    JOIN public.inventory_items it ON it.id = iid.item_id
    WHERE it.category_id = p_category_id
      AND iid.tool_tracking_mode IS NOT NULL
  )
  SELECT
    it.id,
    it.name_en,
    iid.division_id,
    cd.name,
    public.tool_effective_mode(it.id, iid.division_id),
    COALESCE((
      SELECT SUM(f.remaining_qty)
      FROM public.inventory_item_brand_variants v
      JOIN public.fifo_cost_layers f ON f.brand_variant_id = v.id
      JOIN public.warehouse_sub_containers sc ON sc.id = f.sub_container_id
      WHERE v.item_id = it.id AND sc.division_id = iid.division_id
    ), 0)::numeric,
    (SELECT count(*) FROM public.tool_asset_units u
      WHERE u.item_id = it.id AND u.division_id = iid.division_id)::integer
  FROM ov_items oi
  JOIN public.inventory_items it ON it.id = oi.item_id
  JOIN public.inventory_item_divisions iid ON iid.item_id = it.id
  JOIN public.company_divisions cd ON cd.id = iid.division_id
  ORDER BY it.name_en, cd.name;
$function$;
CREATE OR REPLACE FUNCTION public.tool_bulk_items_in_division(p_division_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT it.id
  FROM public.inventory_items it
  JOIN public.inventory_categories ic ON ic.id = it.category_id AND ic.type = 'tools'
  WHERE it.status <> 'archived'
    AND public.tool_effective_mode(it.id, p_division_id) = 'bulk';
$function$;
CREATE OR REPLACE FUNCTION public.guard_tool_unit_serialized_division()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_tool boolean;
  v_eff     public.tool_tracking_mode;
BEGIN
  IF NEW.division_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.division_id IS NOT DISTINCT FROM OLD.division_id THEN
    RETURN NEW;
  END IF;

  SELECT (ic.type = 'tools') INTO v_is_tool
  FROM inventory_items ii
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ii.id = NEW.item_id;
  IF v_is_tool IS NOT TRUE THEN RETURN NEW; END IF;

  v_eff := public.tool_effective_mode(NEW.item_id, NEW.division_id);
  IF v_eff = 'bulk' THEN
    RAISE EXCEPTION
      'A serial unit cannot belong to a division where this tool is tracked in bulk. Switch that division to serialized first, or leave the unit''s division unset.'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_process_consumption_return_restock(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_line            RECORD;
  v_cogs            RECORD;
  v_qty_remaining   int;
  v_qty_this_chunk  numeric;
  v_available_qty   numeric;
  v_pending_insp    int;
  v_division        uuid;
  v_warehouse       uuid;
  v_sub_container   uuid;
BEGIN
  IF NOT (public._auth_user_has_permission('consumption.returns.create')
       OR public._auth_user_has_permission('consumption.returns.manage')) THEN
    RAISE EXCEPTION 'Not authorized to restock consumption returns' USING ERRCODE = '42501';
  END IF;

  SELECT id, source_type, source_id, restock_warehouse_id, status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  IF v_return.source_type <> 'consumption' THEN
    RAISE EXCEPTION 'rpc_process_consumption_return_restock: expected source_type=consumption, got %', v_return.source_type;
  END IF;
  IF v_return.restocked_at IS NOT NULL THEN RETURN; END IF;  -- idempotent

  SELECT count(*) INTO v_pending_insp
  FROM   public.return_lines WHERE return_id = p_return_id AND condition = 'inspection';
  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — complete inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  -- Destination = operator-chosen warehouse + the return's (or consumption's) division.
  v_warehouse := v_return.restock_warehouse_id;
  IF v_warehouse IS NULL THEN
    RAISE EXCEPTION 'Return % has no restock warehouse set', v_return.return_number
      USING HINT = 'Choose the warehouse to receive the good stock back into before restocking.';
  END IF;
  v_division := v_return.division_id;
  IF v_division IS NULL THEN
    SELECT ce.division_id INTO v_division FROM public.consumption_entries ce WHERE ce.id = v_return.source_id;
  END IF;
  IF v_division IS NULL THEN
    RAISE EXCEPTION 'Return %: cannot resolve division from return or consumption', v_return.return_number;
  END IF;
  v_sub_container := public._find_or_create_sub_container(v_warehouse, v_division);

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty
    FROM   public.return_lines
    WHERE  return_id = p_return_id AND brand_variant_id IS NOT NULL AND qty > 0 AND condition = 'good'
  LOOP
    SELECT COALESCE(SUM(qty), 0) INTO v_available_qty
    FROM   public.cogs_entries
    WHERE  consumption_id = v_return.source_id AND brand_variant_id = v_line.brand_variant_id
      AND  source_type = 'consumption' AND qty > 0;
    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % consumption COGS available',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty;
    END IF;

    v_qty_remaining := v_line.qty;
    FOR v_cogs IN
      SELECT id, consumption_id, qty, unit_cost, division_id,
             consumer_type, consumer_sub_container_id, consumer_customer_id, date, source_id
      FROM   public.cogs_entries
      WHERE  consumption_id = v_return.source_id AND brand_variant_id = v_line.brand_variant_id
        AND  source_type = 'consumption' AND qty > 0
      ORDER  BY date ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;
      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      INSERT INTO public.fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id, sub_container_id
      ) VALUES (
        v_line.brand_variant_id, v_warehouse, v_cogs.date,
        v_qty_this_chunk, v_cogs.unit_cost - COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0), COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0), v_cogs.unit_cost, v_qty_this_chunk,
        'consumption_return', p_return_id, v_sub_container
      );

      INSERT INTO public.cogs_entries (
        brand_variant_id, consumption_id,
        qty, unit_cost, total_cost, date, source_type, division_id,
        consumer_type, consumer_sub_container_id, consumer_customer_id, notes
      ) VALUES (
        v_line.brand_variant_id, v_cogs.consumption_id,
        -v_qty_this_chunk, v_cogs.unit_cost, -(v_qty_this_chunk * v_cogs.unit_cost), current_date,
        'consumption_return', COALESCE(v_return.division_id, v_cogs.division_id),
        v_cogs.consumer_type, v_cogs.consumer_sub_container_id, v_cogs.consumer_customer_id,
        'Reversed by consumption return ' || v_return.return_number
      );

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_warehouse, v_sub_container, v_line.brand_variant_id, v_line.item_name, nullif(v_line.sku, ''),
        'consumption_return', v_qty_this_chunk, v_cogs.unit_cost,
        'return', p_return_id, 'Consumption return restocked (good) — ' || v_return.return_number
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + v_line.qty, updated_at = now()
     WHERE id = v_line.brand_variant_id;
  END LOOP;

  UPDATE public.so_po_returns
    SET status = 'restocked', restocked_at = now(), updated_at = now()
    WHERE id = p_return_id;

  PERFORM public._maybe_close_return(p_return_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_item_division_tracking_mode_switch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_mode public.tool_tracking_mode;
  v_cat_mode public.tool_tracking_mode;
  v_old_eff  public.tool_tracking_mode;
  v_new_eff  public.tool_tracking_mode;
  v_units    int;
  v_qty      numeric;
BEGIN
  -- Prior override: NULL on INSERT (nothing existed), else the old row's value.
  v_old_mode := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tool_tracking_mode ELSE NULL END;

  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM v_old_mode THEN
    RETURN NEW;  -- override unchanged (covers no-op updates and NULL-mode inserts)
  END IF;

  SELECT ic.tool_tracking_mode INTO v_cat_mode
  FROM inventory_items ii
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ii.id = NEW.item_id;

  v_old_eff := COALESCE(v_old_mode, v_cat_mode);
  v_new_eff := COALESCE(NEW.tool_tracking_mode, v_cat_mode);
  IF v_old_eff IS NOT DISTINCT FROM v_new_eff THEN
    RETURN NEW;  -- effective mode unchanged (redundant override, or matches category)
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  WHERE tau.item_id = NEW.item_id
    AND tau.division_id = NEW.division_id
    AND tau.status <> 'retired';

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_item_brand_variants bv
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  JOIN warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
  WHERE bv.item_id = NEW.item_id AND sc.division_id = NEW.division_id;

  -- Corrective exception: serialized → bulk with ONLY bulk qty (no serial units)
  -- is safe — the qty is already bulk-shaped. Everything else stays blocked.
  IF (v_units > 0 OR v_qty > 0)
     AND NOT (v_new_eff = 'bulk'::public.tool_tracking_mode AND v_units = 0) THEN
    RAISE EXCEPTION
      'Cannot set this tool''s tracking mode in this division while it holds stock: % unit(s), % qty on hand. Empty the division first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._bill_qar_factor(p_bill_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN po.currency IS NOT NULL
     AND po.currency <> 'QAR'
     AND COALESCE(po.exchange_rate, 0) > 0
    THEN po.exchange_rate
    ELSE 1
  END
  FROM public.bills b
  LEFT JOIN public.purchase_orders po ON po.id = b.purchase_order_id
  WHERE b.id = p_bill_id;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_financial_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;

  receivables_total          numeric;
  receivables_overdue        numeric;
  receivables_overdue_count  bigint;

  payables_total             numeric;
  payables_overdue           numeric;
  payables_overdue_count     bigint;

  cash_in_this_month         numeric;
  cash_out_this_month        numeric;
  cash_in_last_month         numeric;
  cash_out_last_month        numeric;

  invoiced_this_month        numeric;
  billed_this_month          numeric;

  monthly_trend              jsonb;
  top_overdue_customers      jsonb;
  top_overdue_suppliers      jsonb;

  v_month_start              date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_last_month_start         date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date;
BEGIN
  -- AR receivables from so_invoices
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM so_invoices
  WHERE payment_status != 'paid'
    AND total_amount - paid_amount > 0;

  -- AP payables from bills
  SELECT
    COALESCE(SUM((total_amount - paid_amount) * public._bill_qar_factor(id)), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN (total_amount - paid_amount) * public._bill_qar_factor(id) END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM bills
  WHERE payment_status != 'paid'
    AND total_amount - paid_amount > 0;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_this_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_this_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_last_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_last_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  -- Invoiced this month from so_invoices (AR)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO invoiced_this_month
  FROM so_invoices
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  -- Billed this month from bills (AP)
  SELECT COALESCE(SUM(total_amount * public._bill_qar_factor(id)), 0)
  INTO billed_this_month
  FROM bills
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM so_invoices
        WHERE DATE_TRUNC('month', issued_date) = m.month
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount * public._bill_qar_factor(id)) FROM bills
        WHERE DATE_TRUNC('month', issued_date) = m.month
      ), 0) AS billed,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'incoming'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS collected,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'outgoing'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS paid_out
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_customers
  FROM (
    SELECT
      c.id,
      c.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      COUNT(*) AS invoice_count,
      MIN(i.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(i.due_date))::int AS days_overdue
    FROM so_invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.id,
      s.name,
      SUM((b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)) AS amount,
      COUNT(*) AS bill_count,
      MIN(b.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(b.due_date))::int AS days_overdue
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.due_date < CURRENT_DATE
      AND b.payment_status != 'paid'
      AND b.total_amount - b.paid_amount > 0
    GROUP BY s.id, s.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'receivables', jsonb_build_object(
      'total', receivables_total,
      'overdue', receivables_overdue,
      'overdue_count', receivables_overdue_count
    ),
    'payables', jsonb_build_object(
      'total', payables_total,
      'overdue', payables_overdue,
      'overdue_count', payables_overdue_count
    ),
    'cash_this_month', jsonb_build_object(
      'in',  cash_in_this_month,
      'out', cash_out_this_month,
      'net', cash_in_this_month - cash_out_this_month,
      'in_prev',  cash_in_last_month,
      'out_prev', cash_out_last_month,
      'invoiced', invoiced_this_month,
      'billed',   billed_this_month
    ),
    'monthly_trend', monthly_trend,
    'top_overdue_customers', top_overdue_customers,
    'top_overdue_suppliers', top_overdue_suppliers
  );

  RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.bill_recompute_paid_fn(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total  NUMERIC;
  v_po_id  UUID;
  v_paid   NUMERIC := 0;
  v_new    public.invoice_payment_status;
BEGIN
  SELECT total_amount, purchase_order_id
  INTO   v_total, v_po_id
  FROM   public.bills WHERE id = p_bill_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'bill' AND source_id = p_bill_id)
             OR bill_id = p_bill_id
           )
      AND  direction = 'outgoing'
      AND  deleted_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.payment_bill_allocations pba WHERE pba.payment_id = payments.id)
  ), 0);

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payment_bill_allocations
    WHERE  bill_id = p_bill_id
  ), 0);

  IF v_po_id IS NOT NULL THEN
    v_paid := v_paid + COALESCE((
      SELECT SUM(amount)
      FROM   public.payments
      WHERE  source_type = 'purchase_order'
        AND  source_id   = v_po_id
        AND  direction   = 'outgoing'
        AND  deleted_at  IS NULL
    ), 0);
  END IF;

  v_paid := LEAST(v_paid, COALESCE(v_total, 0));

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'::public.invoice_payment_status
    WHEN v_paid > 0                                     THEN 'partially_paid'::public.invoice_payment_status
    ELSE                                                     'unpaid'::public.invoice_payment_status
  END;

  UPDATE public.bills
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_bill_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_customer_statement(p_customer_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(txn_date date, txn_type text, reference text, description text, debit numeric, credit numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    i.issued_date AS txn_date,
    'invoice' AS txn_type,
    i.invoice_id AS reference,
    CASE
      WHEN i.due_date IS NOT NULL THEN 'Invoice — due ' || TO_CHAR(i.due_date, 'DD Mon YYYY')
      ELSE 'Invoice'
    END AS description,
    i.total_amount AS debit,
    0::numeric AS credit
  FROM so_invoices i
  WHERE i.customer_id = p_customer_id
    AND (p_date_from IS NULL OR i.issued_date >= p_date_from)
    AND (p_date_to IS NULL OR i.issued_date <= p_date_to)

  UNION ALL

  SELECT
    p.date AS txn_date,
    'payment' AS txn_type,
    p.payment_id AS reference,
    'Payment — ' || COALESCE(p.method::text, 'unknown')
      || CASE WHEN p.reference IS NOT NULL THEN ' · ' || p.reference ELSE '' END AS description,
    0::numeric AS debit,
    p.amount AS credit
  FROM payments p
  LEFT JOIN sale_orders so ON so.id = p.source_id AND p.source_type = 'sale_order'
  LEFT JOIN so_invoices inv ON inv.id = p.invoice_id
  WHERE p.direction = 'incoming'
    AND p.deleted_at IS NULL
    AND COALESCE(p.method::text, '') NOT IN ('credit_note', 'store_credit')
    AND p.status IN ('completed', 'pending', 'processing')
    AND COALESCE(p.customer_id, so.customer_id, inv.customer_id) = p_customer_id
    AND (p_date_from IS NULL OR p.date >= p_date_from)
    AND (p_date_to IS NULL OR p.date <= p_date_to)

  UNION ALL

  SELECT
    cn.created_at::date AS txn_date,
    'credit_note' AS txn_type,
    cn.credit_note_id AS reference,
    'Credit Note — ' || COALESCE(cn.reason, cn.resolution_type::text) AS description,
    0::numeric AS debit,
    cn.total_amount AS credit
  FROM credit_notes cn
  JOIN so_invoices inv ON inv.id = cn.invoice_id
  WHERE cn.status != 'draft'
    AND inv.customer_id = p_customer_id
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)

  ORDER BY txn_date, txn_type;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_report_pnl_cogs_detail(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(cogs_id uuid, date date, source_type text, stream text, item_name text, code text, reference text, counterparty text, qty integer, unit_cost numeric, total_cost numeric, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ce.id                                                        AS cogs_id,
    ce.date                                                      AS date,
    ce.source_type                                               AS source_type,
    initcap(replace(COALESCE(c.type::text, 'other'), '-', ' '))  AS stream,
    it.name_en                                                   AS item_name,
    v.code                                                       AS code,
    COALESCE(so.so_number, lc.lc_number)                         AS reference,
    cust.name                                                    AS counterparty,
    ce.qty                                                       AS qty,
    ce.unit_cost                                                 AS unit_cost,
    ce.total_cost                                                AS total_cost,
    COALESCE(ce.consumer_division_id, ce.division_id)            AS division_id,
    d.name                                                       AS division_name
  FROM public.cogs_entries ce
  JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
  JOIN public.inventory_items it ON it.id = v.item_id
  LEFT JOIN public.inventory_categories c   ON c.id  = it.category_id
  LEFT JOIN public.sale_orders so           ON so.id = ce.sale_order_id
  LEFT JOIN public.customers cust           ON cust.id = so.customer_id
  LEFT JOIN public.landed_costs lc          ON lc.id = ce.landed_cost_id
  LEFT JOIN public.fifo_cost_layers fl      ON fl.id = ce.source_id
  LEFT JOIN public.company_divisions d      ON d.id  = COALESCE(ce.consumer_division_id, ce.division_id)
  WHERE ce.source_type IN ('sale', 'sale_return', 'sale_replacement', 'consumption', 'landed_cost', 'landed_cost_reversal')
    AND ce.date BETWEEN p_start AND p_end
    AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
    AND (p_division_ids  IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
    AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
  ORDER BY ce.date, it.name_en, ce.source_type;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_apply_debit_note_to_bill(p_debit_note_id uuid, p_amount numeric DEFAULT NULL::numeric, p_bill_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dn             debit_notes%ROWTYPE;
  v_bill           bills%ROWTYPE;
  v_bill_paid      numeric;
  v_bill_outstand  numeric;
  v_amount         numeric;
  v_dn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
  v_bill_currency  text;
  v_bill_rate      numeric;
BEGIN
  IF p_debit_note_id IS NULL THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: p_debit_note_id is required';
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount must be > 0 (got %)', p_amount;
  END IF;

  SELECT * INTO v_dn
    FROM debit_notes
   WHERE id = p_debit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: debit note % not found', p_debit_note_id;
  END IF;

  v_dn_remaining := COALESCE(v_dn.remaining_amount, v_dn.total_amount);
  IF v_dn_remaining <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no remaining balance (%)',
      v_dn.debit_note_id, v_dn_remaining;
  END IF;

  -- Bill resolution: caller-provided > DN's own PO bill.
  IF p_bill_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % not found', p_bill_id;
    END IF;
    -- Supplier match — never let a DN pay off another supplier's bill.
    IF v_dn.supplier_name IS NOT NULL
       AND v_bill.supplier_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM suppliers s
          WHERE s.id = v_bill.supplier_id
            AND s.name IS DISTINCT FROM v_dn.supplier_name
       ) THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: selected bill belongs to a different supplier than the DN';
    END IF;
  ELSE
    IF v_dn.purchase_order_id IS NULL THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no purchase_order_id and no p_bill_id was provided',
        p_debit_note_id;
    END IF;
    SELECT * INTO v_bill
      FROM bills
     WHERE purchase_order_id = v_dn.purchase_order_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No bill exists for this PO yet. Create the bill first (Purchases → Bills → New), then apply the debit note.'
        USING HINT = 'Once the bill exists, reopen the DN and click Apply to Bill.';
    END IF;
  END IF;

  IF v_bill.total_amount IS NULL OR v_bill.total_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % has an invalid total_amount %',
      v_bill.id, v_bill.total_amount;
  END IF;

  v_bill_paid := COALESCE(v_bill.paid_amount, 0);
  v_bill_outstand := v_bill.total_amount - v_bill_paid;
  IF v_bill_outstand <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % is already fully paid', v_bill.bill_number;
  END IF;

  v_amount := COALESCE(p_amount, LEAST(v_dn_remaining, v_bill_outstand));
  IF v_amount > v_dn_remaining THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds DN remaining %', v_amount, v_dn_remaining;
  END IF;
  IF v_amount > v_bill_outstand THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds bill outstanding %', v_amount, v_bill_outstand;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  -- The DN/bill amounts are in the PO's currency; resolve that currency + booking
  -- rate so the offset payment records amount_qar in QAR (was hardcoded QAR/1,
  -- understating QAR cash-out for foreign bills in the dashboard & P&L cash basis).
  SELECT
    CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE 'QAR' END,
    CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' AND COALESCE(po.exchange_rate, 0) > 0
         THEN po.exchange_rate ELSE 1 END
    INTO v_bill_currency, v_bill_rate
    FROM public.purchase_orders po
   WHERE po.id = v_bill.purchase_order_id;
  v_bill_currency := COALESCE(v_bill_currency, 'QAR');
  v_bill_rate     := COALESCE(v_bill_rate, 1);

  INSERT INTO payments (
    payment_id, bill_id, debit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, direction, status,
    notes
  ) VALUES (
    v_payment_id, v_bill.id, p_debit_note_id,
    v_amount, v_bill_currency, v_bill_rate, round(v_amount * v_bill_rate, 2),
    'debit_note', CURRENT_DATE, 'outgoing', 'completed',
    'Debit note ' || v_dn.debit_note_id || ' applied to bill ' || v_bill.bill_number
  )
  RETURNING id INTO v_payment_uuid;

  PERFORM public.allocate_payment_to_bill(v_payment_uuid, v_bill.id, v_amount);

  UPDATE debit_notes
     SET remaining_amount = v_dn_remaining - v_amount,
         bill_id          = v_bill.id,
         updated_at       = now()
   WHERE id = p_debit_note_id;

  RETURN v_payment_uuid;
END;
$function$;
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
CREATE OR REPLACE FUNCTION public.rpc_product_profitability(p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days        integer;
  v_prev_start  date;
  v_prev_end    date;
  v_summary     jsonb;
  v_products    jsonb;
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'p_start_date and p_end_date are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'p_end_date must be >= p_start_date';
  end if;

  v_days := (p_end_date - p_start_date) + 1;
  v_prev_end   := p_start_date - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  with current_window as (
    select
      ce.brand_variant_id,
      sum(ce.qty)::numeric                            as qty,
      sum(CASE WHEN ce.source_type IN ('sale', 'sale_return') THEN ce.qty * sol.unit_price * coalesce(so_fx.exchange_rate, 1) ELSE 0 END)                    as revenue,
      sum(ce.total_cost)                              as cogs,
      (array_agg(sol.item_name order by sol.created_at desc))[1] as item_name,
      (array_agg(sol.sku       order by sol.created_at desc))[1] as sku
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    join sale_orders so_fx on so_fx.id = ce.sale_order_id
    where ce.date >= p_start_date
      and ce.date <= p_end_date
      and public.is_division_visible(ce.division_id)
    group by ce.brand_variant_id
  ),
  current_with_meta as (
    select
      cw.brand_variant_id,
      cw.sku,
      cw.item_name  as name,
      bv.brand      as brand_name,
      cw.qty,
      cw.revenue,
      cw.cogs,
      (cw.revenue - cw.cogs) as profit,
      case when cw.revenue = 0 then null
           else round(((cw.revenue - cw.cogs) / cw.revenue) * 100, 2)
      end as margin_pct
    from current_window cw
    left join inventory_item_brand_variants bv on bv.id = cw.brand_variant_id
  ),
  current_totals as (
    select
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cogs), 0)    as cogs
    from current_with_meta
  ),
  prev_totals as (
    select
      coalesce(sum(CASE WHEN ce.source_type IN ('sale', 'sale_return') THEN ce.qty * sol.unit_price * coalesce(so_fx.exchange_rate, 1) ELSE 0 END), 0)  as revenue,
      coalesce(sum(ce.total_cost), 0)            as cogs
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    join sale_orders so_fx on so_fx.id = ce.sale_order_id
    where ce.date >= v_prev_start
      and ce.date <= v_prev_end
      and public.is_division_visible(ce.division_id)
  ),
  products_agg as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'brand_variant_id', brand_variant_id,
          'sku',              sku,
          'name',             name,
          'brand_name',       brand_name,
          'qty',              qty,
          'revenue',          revenue,
          'cogs',             cogs,
          'profit',           profit,
          'margin_pct',       margin_pct
        )
        order by profit desc nulls last
      ),
      '[]'::jsonb
    ) as products
    from current_with_meta
  )
  select
    jsonb_build_object(
      'revenue',           ct.revenue,
      'cogs',              ct.cogs,
      'gross_profit',      (ct.revenue - ct.cogs),
      'margin_pct',        case when ct.revenue = 0 then null
                                else round(((ct.revenue - ct.cogs) / ct.revenue) * 100, 2)
                           end,
      'prev_revenue',      pt.revenue,
      'prev_cogs',         pt.cogs,
      'prev_gross_profit', (pt.revenue - pt.cogs),
      'prev_margin_pct',   case when pt.revenue = 0 then null
                                else round(((pt.revenue - pt.cogs) / pt.revenue) * 100, 2)
                           end
    ),
    pa.products
  into v_summary, v_products
  from current_totals ct, prev_totals pt, products_agg pa;

  return jsonb_build_object(
    'summary',  v_summary,
    'products', v_products
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_profitability_drilldown(p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start and end dates are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date must be >= start date';
  END IF;

  RETURN COALESCE((
    WITH line_data AS (
      SELECT
        ce.sale_order_id,
        ce.brand_variant_id,
        SUM(ce.qty)::numeric                              AS qty,
        SUM(CASE WHEN ce.source_type IN ('sale', 'sale_return') THEN ce.qty * sol.unit_price * COALESCE(so_fx.exchange_rate, 1) ELSE 0 END)                      AS line_revenue,
        SUM(ce.total_cost)                                AS line_cogs,
        SUM(CASE WHEN ce.source_type IN ('sale', 'sale_return') THEN ce.qty * sol.unit_price * COALESCE(so_fx.exchange_rate, 1) ELSE 0 END) - SUM(ce.total_cost) AS line_profit,
        sol.unit_price,
        (array_agg(sol.item_name ORDER BY sol.created_at DESC))[1] AS item_name,
        (array_agg(sol.sku       ORDER BY sol.created_at DESC))[1] AS sku
      FROM cogs_entries ce
      JOIN sale_order_lines sol
        ON sol.sale_order_id  = ce.sale_order_id
       AND sol.brand_variant_id = ce.brand_variant_id
      JOIN sale_orders so_fx ON so_fx.id = ce.sale_order_id
      WHERE ce.date >= p_start_date
        AND ce.date <= p_end_date
        AND ce.sale_order_id IS NOT NULL
        AND public.is_division_visible(ce.division_id)
      GROUP BY ce.sale_order_id, ce.brand_variant_id, sol.unit_price
    ),
    so_agg AS (
      SELECT
        ld.sale_order_id,
        so.so_number,
        so.created_at::date              AS order_date,
        COALESCE(c.name, 'Walk-in')      AS customer_name,
        COUNT(*)::int                    AS item_count,
        SUM(ld.line_revenue)             AS revenue,
        SUM(ld.line_cogs)                AS cogs,
        SUM(ld.line_profit)              AS profit,
        CASE WHEN SUM(ld.line_revenue) = 0 THEN NULL
             ELSE ROUND((SUM(ld.line_profit) / SUM(ld.line_revenue)) * 100, 2)
        END                              AS margin_pct,
        jsonb_agg(
          jsonb_build_object(
            'brand_variant_id', ld.brand_variant_id,
            'item_name',        ld.item_name,
            'sku',              ld.sku,
            'qty',              ld.qty,
            'unit_price',       ld.unit_price,
            'revenue',          ld.line_revenue,
            'cogs',             ld.line_cogs,
            'profit',           ld.line_profit
          ) ORDER BY ld.line_cogs DESC
        ) AS lines
      FROM line_data ld
      JOIN sale_orders so ON so.id = ld.sale_order_id
      LEFT JOIN customers c ON c.id = so.customer_id
      GROUP BY ld.sale_order_id, so.so_number, so.created_at, c.name
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'sale_order_id', sale_order_id,
        'so_number',     so_number,
        'order_date',    order_date,
        'customer_name', customer_name,
        'item_count',    item_count,
        'revenue',       revenue,
        'cogs',          cogs,
        'profit',        profit,
        'margin_pct',    margin_pct,
        'lines',         lines
      ) ORDER BY cogs DESC
    )
    FROM so_agg
  ), '[]'::jsonb);
END;
$function$;
CREATE OR REPLACE FUNCTION public.reject_transfer_v2(p_transfer_id uuid, p_rejected_by_profile_id uuid, p_rejected_by_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.transfer.receive') AND NOT public._auth_user_has_permission('warehouse.transfer.approve') THEN RAISE EXCEPTION 'Not authorized to reject transfers' USING ERRCODE = '42501'; END IF;
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %',
      p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_profile_id = p_rejected_by_profile_id,
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items
    WHERE transfer_id = p_transfer_id
    ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT SUM(ABS(qty) * ABS(unit_cost)) / NULLIF(SUM(ABS(qty)), 0) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out';

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(consumer_kind text, consumer_id uuid, consumer_name text, project_number text, discipline_name text, milestone_label text, code text, item_name text, sku text, consumed_on date, qty integer, total_cost numeric)
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
    c.code                                                                      AS code,
    -- Category-qualified so same-named items in different sub-categories stay
    -- distinct rows (and are readable in the Item column).
    COALESCE(NULLIF(ic.name_en, '') || ' · ', '')
      || COALESCE(ii.name_en, '(item removed)')                                AS item_name,
    ii.sku                                                                      AS sku,
    c.date                                                                      AS consumed_on,
    SUM(c.qty)::int                                                             AS qty,
    SUM(c.total_cost)::numeric                                                  AS total_cost
  FROM public.cogs_entries c
  JOIN public.warehouse_sub_containers          sc   ON sc.id   = c.consumer_sub_container_id
  LEFT JOIN public.projects                     pr   ON pr.id   = sc.project_id
  LEFT JOIN public.disciplines                  disc ON disc.id = c.discipline_id
  LEFT JOIN public.project_milestones           pm   ON pm.id   = c.milestone_id
  LEFT JOIN public.inventory_item_brand_variants biv ON biv.id  = c.brand_variant_id
  LEFT JOIN public.inventory_items              ii   ON ii.id   = biv.item_id
  LEFT JOIN public.inventory_categories         ic   ON ic.id   = ii.category_id
  WHERE c.source_type = 'consumption'
    AND c.date BETWEEN p_from AND p_to
    AND c.consumer_sub_container_id IS NOT NULL
    AND public.is_division_visible(c.consumer_division_id)
    AND (p_division_ids IS NULL OR c.consumer_division_id = ANY(p_division_ids))
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  ORDER BY consumer_name, discipline_name NULLS FIRST, milestone_label, code NULLS FIRST, consumed_on, item_name
$function$;
CREATE OR REPLACE FUNCTION public.dispatch_transfer(p_transfer_id uuid, p_dispatched_by_profile_id uuid, p_dispatched_by_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_layer    RECORD;
BEGIN IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'damaged_repair_out' THEN RAISE EXCEPTION 'repair transfers use the Send / Return-from-repair flow, not the generic transfer action' USING ERRCODE = '42501'; END IF; IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'custody_assign' THEN RAISE EXCEPTION 'custody transfers use the custody flow (dispatch/accept), not the generic transfer action' USING ERRCODE = '42501'; END IF;
  IF NOT public._auth_user_has_permission('warehouse.transfer.dispatch') THEN RAISE EXCEPTION 'Not authorized to dispatch transfers' USING ERRCODE = '42501'; END IF;
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id, to_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer % cannot be dispatched — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF NOT is_field_rp_of(p_dispatched_by_profile_id, v_transfer.from_warehouse_id)
     AND NOT has_inventory_manager_role(p_dispatched_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to dispatch from this warehouse';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'in_transit',
      dispatched_by_profile_id = p_dispatched_by_profile_id,
      dispatched_by_name = p_dispatched_by_name,
      dispatched_at = now()
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        TRUE,
        v_transfer.from_sub_container_id
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id,
        sub_container_id, source_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id,
        v_transfer.from_sub_container_id, v_layer.layer_id
      );
    END LOOP;

    -- Scope allocation decrement to the transfer's source sub-container.
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id
      AND sub_container_id = v_transfer.from_sub_container_id;

    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.receive_transfer(p_transfer_id uuid, p_received_by_profile_id uuid, p_received_by_name text, p_received_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer      RECORD;
  v_ri            JSONB;
  v_item          RECORD;
  v_move          RECORD;
  v_dispatched    NUMERIC;
  v_received_qty  INT;
  v_shrinkage_reason text;
  v_remaining_recv NUMERIC;
  v_total_dispatched NUMERIC;
  v_total_shrinkage  NUMERIC;
  v_take          NUMERIC;
  v_miss          NUMERIC;
  v_dest_date     DATE;
BEGIN IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'damaged_repair_out' THEN RAISE EXCEPTION 'repair transfers use the Send / Return-from-repair flow, not the generic transfer action' USING ERRCODE = '42501'; END IF; IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'custody_assign' THEN RAISE EXCEPTION 'custody transfers use the custody flow (dispatch/accept), not the generic transfer action' USING ERRCODE = '42501'; END IF;
  IF NOT public._auth_user_has_permission('warehouse.transfer.receive') THEN RAISE EXCEPTION 'Not authorized to receive transfers' USING ERRCODE = '42501'; END IF;
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         dispatched_by_profile_id,
         from_sub_container_id, to_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'in_transit' THEN
    RAISE EXCEPTION 'Transfer % cannot be received — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT is_sub_container_rp(p_received_by_profile_id, v_transfer.to_sub_container_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to receive at this warehouse';
  END IF;

  -- Same-person separation applies only to CROSS-warehouse transfers. An
  -- intra-warehouse (sub-container → sub-container) move may be completed by
  -- the same operator who dispatched it.
  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND v_transfer.from_warehouse_id <> v_transfer.to_warehouse_id
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'Same person cannot dispatch and receive a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'received',
      received_by_profile_id = p_received_by_profile_id,
      received_by_name = p_received_by_name,
      received_at = now()
  WHERE id = p_transfer_id;

  v_dest_date := COALESCE(v_transfer.date, CURRENT_DATE);

  FOR v_ri IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    SELECT * INTO v_item
    FROM warehouse_transfer_items
    WHERE id = (v_ri->>'transfer_item_id')::UUID
      AND transfer_id = p_transfer_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_received_qty     := COALESCE((v_ri->>'received_qty')::INT, v_item.dispatched_qty);
    v_shrinkage_reason := COALESCE(v_ri->>'shrinkage_reason', 'missing');
    v_dispatched       := COALESCE(v_item.dispatched_qty, 0);

    -- Sum total dispatched across all transfer_out movements for this
    -- (transfer, variant). Used to compute the per-item shrinkage flag +
    -- clamp over-receipt.
    SELECT COALESCE(SUM(ABS(qty)), 0)
    INTO v_total_dispatched
    FROM inventory_stock_movements
    WHERE reference_id = p_transfer_id
      AND brand_variant_id = v_item.brand_variant_id
      AND movement_type = 'transfer_out';

    -- Clamp over-receipt (matches the current "GREATEST(v_shrinkage, 0)"
    -- behaviour: extra units above dispatched are silently dropped).
    IF v_received_qty > v_total_dispatched THEN
      v_received_qty := v_total_dispatched::INT;
    END IF;

    v_total_shrinkage := GREATEST(v_total_dispatched - v_received_qty, 0);

    -- Item-level bookkeeping (once per item, not per layer). Flip
    -- sub_container_id to the destination — the source→destination handoff.
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = v_total_shrinkage::INT,
        shrinkage_reason = CASE WHEN v_total_shrinkage > 0 THEN v_shrinkage_reason ELSE NULL END,
        sub_container_id = v_transfer.to_sub_container_id
    WHERE id = v_item.id;

    v_remaining_recv := v_received_qty;

    -- Walk the dispatch-side movements in insertion order (= FIFO source
    -- order). Split each into "received portion → dest layer + transfer_in"
    -- and "missing portion → transfer_shrinkage".
    FOR v_move IN
      SELECT id, qty, unit_cost, source_id
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      ORDER BY created_at ASC, id ASC
    LOOP
      -- movement.qty is negative on transfer_out; the dispatched qty
      -- for this layer is ABS(qty).
      v_dispatched := ABS(v_move.qty);

      v_take := LEAST(v_remaining_recv, v_dispatched);
      v_miss := v_dispatched - v_take;

      IF v_take > 0 THEN
        -- Destination layer at the source layer's exact unit_cost.
        INSERT INTO fifo_cost_layers (
          brand_variant_id, warehouse_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          sub_container_id, source_type, source_id, receival_id
        ) VALUES (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_dest_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take,
          v_transfer.to_sub_container_id, 'transfer', p_transfer_id, (select fcl.receival_id from public.fifo_cost_layers fcl where fcl.id = v_move.source_id)
        );

        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id,
          sub_container_id
        ) VALUES (
          v_transfer.to_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id,
          v_transfer.to_sub_container_id
        );
      END IF;

      IF v_miss > 0 THEN
        -- Shrinkage movement records the loss on the SOURCE side, so it
        -- carries the source sub_container_id.
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes,
          sub_container_id
        ) VALUES (
          v_transfer.from_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_shrinkage', -v_miss, v_move.unit_cost,
          'transfer', p_transfer_id,
          'Shrinkage: ' || v_shrinkage_reason,
          v_transfer.from_sub_container_id
        );
      END IF;

      v_remaining_recv := v_remaining_recv - v_take;
    END LOOP;

    -- H11 fix: shrinkage never reached stock_level.
    -- Dispatch skipped the decrement (in-transit); received
    -- portion doesn't bring it back automatically.
    IF v_total_shrinkage > 0 THEN
      UPDATE public.inventory_item_brand_variants
         SET stock_level = GREATEST(stock_level - v_total_shrinkage, 0),
             updated_at  = now()
       WHERE id = v_item.brand_variant_id;
    END IF;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text, serial_number text, brand text, condition text, lifecycle_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.id, i.name_en, c.id, c.name_en, u.serial_number, u.brand, u.condition::text, u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status NOT IN ('retired','maintenance')
    AND u.pending_scrap = false
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY c.name_en, i.name_en, u.serial_number
  LIMIT 200;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_pending boolean; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to assign tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status, pending_scrap INTO v_unit_div, v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be assigned'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_team_id; END IF;

  IF v_unit_div IS NOT NULL AND v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division assignment blocked: the tool belongs to a different division than this team (use Transfer to change the tool''s division first)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tool_unit_assignments WHERE unit_id = p_unit_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'tool unit is already assigned to a team — move or return it first';
  END IF;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_team_id,
        status = 'assigned',
        division_id = COALESCE(division_id, v_team_div)
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;
CREATE OR REPLACE FUNCTION public.validate_lc_allocation(p_lc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lc RECORD;
BEGIN
  SELECT id, applied_at, voided_at, attached_receival_ids
    INTO v_lc
    FROM landed_costs
   WHERE id = p_lc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost is voided and cannot be applied';
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already applied on %', v_lc.applied_at;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ri.brand_variant_id::TEXT           AS brand_variant_id,
        MAX(ri.item_name)                   AS item_name,
        MAX(ri.sku)                         AS sku,
        SUM(ri.qty_received)                AS qty_received,
        COALESCE(fl_agg.remaining, 0)       AS qty_remaining_in_layers,
        CASE WHEN COALESCE(fl_agg.remaining, 0) = 0
          THEN 'All units already sold — LC posts entirely to COGS as a retroactive cost adjustment (does not change past invoices)'
          ELSE NULL
        END                                 AS warning
      FROM receival_items ri
      JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
      LEFT JOIN LATERAL (
        -- Sum remaining across ALL layers that trace to THIS LC's attached
        -- receivals (by receival_id) — including layers later moved by transfer
        -- (source_type='transfer'), exactly as allocate_landed_cost books it.
        -- A transferred layer keeps its receival_id and still receives the
        -- landed cost, so filtering source_type='receival' undercounted remaining
        -- and could wrongly flag "all units sold".
        SELECT SUM(fl.remaining_qty) AS remaining
        FROM   fifo_cost_layers fl
        WHERE  fl.brand_variant_id = ri.brand_variant_id
          AND  fl.remaining_qty > 0
          AND  fl.receival_id = ANY(v_lc.attached_receival_ids)
      ) fl_agg ON true
      WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
        AND ri.is_free = false
        AND ri.brand_variant_id IS NOT NULL
        AND ri.qty_received > 0
      GROUP BY ri.brand_variant_id, fl_agg.remaining
    ) t
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_send_damaged_for_repair(p_return_line_disposition_id uuid, p_repair_vendor_id uuid, p_warehouse_id uuid, p_expected_return_date date, p_notes text DEFAULT NULL::text, p_source_division_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disp                  record;
  v_return_line           record;
  v_return                record;
  v_vendor                record;
  v_transfer_id           uuid;
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_sub_ct                int;
  v_from_sub_container_id uuid;
  v_uid                   uuid := public._current_user_data_id();
begin IF NOT public._auth_user_has_permission('damaged_stock.out_for_repair.edit') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  select id, return_line_id, disposition_type, qty, warehouse_transfer_id
    into v_disp
    from public.return_line_inventory_dispositions
    where id = p_return_line_disposition_id
    for update;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: disposition % not found', p_return_line_disposition_id;
  end if;
  if v_disp.disposition_type <> 'send_for_repair' then
    raise exception 'rpc_send_damaged_for_repair: disposition % is % (expected send_for_repair)',
      p_return_line_disposition_id, v_disp.disposition_type;
  end if;
  if v_disp.warehouse_transfer_id is not null then
    raise exception 'rpc_send_damaged_for_repair: disposition % already linked to transfer %',
      p_return_line_disposition_id, v_disp.warehouse_transfer_id;
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no virtual warehouse (trigger misfire?)', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no sub_container_id (D.6.b backfill missed?)', p_repair_vendor_id;
  end if;

  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  select r.division_id, r.source_type, r.source_id
    into v_return
    from public.so_po_returns r
    where r.id = v_return_line.return_id;

  -- Phase 3a: the unit leaves "sold" state here (returned -> sent to repair), so
  -- reverse the original sale COGS (full-line reversal). No-op for non-sale
  -- returns. The already-linked guard above ensures this runs once per
  -- disposition; rpc_return_damaged_from_repair does NOT re-reverse (no double).
  perform public._reverse_sale_cogs_for_return(v_return_line.return_id, v_return_line.brand_variant_id, v_disp.qty);

  -- Cascade: explicit override → return → parent SO/PO → cogs_entries → single sub.
  v_source_division := p_source_division_id;

  if v_source_division is null then
    v_source_division := v_return.division_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select so.division_id
      into v_source_division
      from public.sale_orders so
      where so.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'purchase_order' then
    select po.division_id
      into v_source_division
      from public.purchase_orders po
      where po.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select ce.division_id
      into v_source_division
      from public.cogs_entries ce
      where ce.sale_order_id = v_return.source_id
        and ce.division_id is not null
      order by ce.date asc, ce.created_at asc
      limit 1;
  end if;

  if v_source_division is null then
    select count(*)
      into v_sub_ct
      from public.warehouse_sub_containers wsc
      where wsc.warehouse_id = p_warehouse_id;

    if v_sub_ct = 1 then
      select wsc.division_id
        into v_source_division
        from public.warehouse_sub_containers wsc
        where wsc.warehouse_id = p_warehouse_id
        limit 1;
    end if;
  end if;

  if v_source_division is null then
    raise exception 'rpc_send_damaged_for_repair: cannot derive source division. Return %/% has no division_id, parent %/% has no division_id, no cogs_entries division stamped, and warehouse % has % sub-containers. Pass p_source_division_id explicitly.',
      v_return.source_type, v_return_line.return_id,
      v_return.source_type, v_return.source_id,
      p_warehouse_id, v_sub_ct;
  end if;

  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, v_uid);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), v_uid
    );
  end if;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_source_division);

  v_transfer_id := public._emit_send_for_repair_transfer(
    p_warehouse_id, v_vendor.virtual_warehouse_id, v_return_line.brand_variant_id, v_disp.qty,
    v_unit_cost, v_return_line.item_name, v_return_line.sku,
    v_from_sub_container_id, v_vendor.sub_container_id,
    p_repair_vendor_id, p_expected_return_date, p_notes,
    v_disp.id,
    p_notes,
    v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_send_tool_for_repair(p_unit_id uuid, p_repair_vendor_id uuid, p_expected_return_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id();
  v_status public.tool_status;
  v_pending boolean;
  v_vendor record; v_from_sub uuid; v_from_wh uuid; v_num text; v_tid uuid;
BEGIN
  IF NOT public._user_has_permission(v_uid, 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to send tools for repair' USING ERRCODE = '42501';
  END IF;
  SELECT status, pending_scrap INTO v_status, v_pending FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status <> 'maintenance' THEN
    RAISE EXCEPTION 'tool must be in the Repair bucket (maintenance) before sending to a vendor';
  END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.warehouse_transfers wt
             WHERE wt.tool_unit_id = p_unit_id AND wt.transfer_kind = 'damaged_repair_out' AND wt.status = 'in_transit') THEN
    RAISE EXCEPTION 'tool is already out for repair';
  END IF;

  SELECT id, virtual_warehouse_id, sub_container_id, is_active INTO v_vendor
    FROM public.repair_vendors WHERE id = p_repair_vendor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'repair vendor % not found', p_repair_vendor_id; END IF;
  IF NOT v_vendor.is_active THEN RAISE EXCEPTION 'repair vendor is inactive'; END IF;
  IF v_vendor.virtual_warehouse_id IS NULL OR v_vendor.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'repair vendor % has no virtual warehouse / sub_container', p_repair_vendor_id;
  END IF;

  -- from = the team the tool was last with (its most recent assignment).
  SELECT a.custody_location_id, sc.warehouse_id INTO v_from_sub, v_from_wh
    FROM public.tool_unit_assignments a
    JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
    WHERE a.unit_id = p_unit_id
    ORDER BY a.assigned_at DESC
    LIMIT 1;
  IF v_from_sub IS NULL THEN
    RAISE EXCEPTION 'cannot determine the tool''s origin team (from-location) for the repair transfer';
  END IF;

  v_num := public.generate_transfer_number();
  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id, status, date, notes,
    transfer_kind, repair_vendor_id, expected_return_date, tool_unit_id,
    from_sub_container_id, to_sub_container_id, created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) VALUES (
    v_num, v_from_wh, v_vendor.virtual_warehouse_id, 'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_expected_return_date, p_unit_id,
    v_from_sub, v_vendor.sub_container_id, v_uid, v_uid, now()
  ) RETURNING id INTO v_tid;

  RETURN v_tid;
END $function$;
DROP FUNCTION IF EXISTS public.get_repair_bucket(p_division_ids uuid[]);
CREATE OR REPLACE FUNCTION public.get_repair_bucket(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text, division_id uuid, division_name text, current_team_id uuid, current_team_name text, last_inspected_at timestamp with time zone, lifecycle_type text, pending_scrap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text,
         u.division_id, cd.name, la.team_id, sc.name,
         (SELECT max(ins.inspected_at) FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id),
         u.lifecycle_type::text, u.pending_scrap
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = u.division_id
  LEFT JOIN LATERAL (
    SELECT a.custody_location_id AS team_id
    FROM public.tool_unit_assignments a
    WHERE a.unit_id = u.id AND a.release_reason = 'sent_for_repair'
    ORDER BY a.released_at DESC NULLS LAST LIMIT 1
  ) la ON true
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = la.team_id
  WHERE u.status = 'maintenance'
    AND NOT EXISTS (SELECT 1 FROM public.warehouse_transfers wt
                    WHERE wt.tool_unit_id = u.id AND wt.transfer_kind = 'damaged_repair_out' AND wt.status = 'in_transit')
    AND (p_division_ids IS NULL OR u.division_id = ANY(p_division_ids))
  ORDER BY cd.name, i.name_en, u.serial_number;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_return_damaged_from_repair(p_transfer_id uuid, p_outcome text, p_qty_good numeric, p_qty_writeoff numeric, p_repair_cost numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer              record;
  v_disp_id               uuid;
  v_variant               uuid;
  v_qty_out               numeric;
  v_unit_cost_base        numeric;
  v_unit_cost_good        numeric;
  v_wh_source             uuid;
  v_wh_vendor             uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_item_name             text;
  v_item_sku              text;
  v_new_transfer          uuid;
  v_transfer_num          text;
  v_uid                   uuid := public._current_user_data_id();
begin
  IF NOT (public._auth_user_has_permission('damaged_stock.out_for_repair.edit')) THEN RAISE EXCEPTION 'Not authorized to return damaged stock from repair' USING ERRCODE = '42501'; END IF;
  if p_outcome not in ('good','writeoff','mixed') then
    raise exception 'rpc_return_damaged_from_repair: invalid outcome % (expected good | writeoff | mixed)', p_outcome;
  end if;
  if coalesce(p_qty_good, 0) < 0 or coalesce(p_qty_writeoff, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: qty values must be >= 0';
  end if;
  if coalesce(p_repair_cost, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: repair_cost must be >= 0';
  end if;
  if p_outcome = 'good'     and coalesce(p_qty_writeoff, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=good but qty_writeoff=%', p_qty_writeoff;
  end if;
  if p_outcome = 'writeoff' and coalesce(p_qty_good, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=writeoff but qty_good=%', p_qty_good;
  end if;
  if p_outcome = 'mixed'    and (coalesce(p_qty_good, 0) = 0 or coalesce(p_qty_writeoff, 0) = 0) then
    raise exception 'rpc_return_damaged_from_repair: outcome=mixed requires both qty_good and qty_writeoff > 0';
  end if;

  select id, transfer_kind, status, from_warehouse_id, to_warehouse_id,
         repair_vendor_id, source_return_line_disposition_id,
         from_sub_container_id, to_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'rpc_return_damaged_from_repair: transfer % not found', p_transfer_id;
  end if;
  if v_transfer.transfer_kind <> 'damaged_repair_out' then
    raise exception 'rpc_return_damaged_from_repair: transfer % kind is % (expected damaged_repair_out)',
      p_transfer_id, v_transfer.transfer_kind;
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'rpc_return_damaged_from_repair: transfer % status is % (expected in_transit)',
      p_transfer_id, v_transfer.status;
  end if;

  v_disp_id   := v_transfer.source_return_line_disposition_id;
  v_wh_source := v_transfer.from_warehouse_id;
  v_wh_vendor := v_transfer.to_warehouse_id;

  select brand_variant_id, item_name, sku, requested_qty::numeric, unit_cost
    into v_variant, v_item_name, v_item_sku, v_qty_out, v_unit_cost_base
    from public.warehouse_transfer_items
    where transfer_id = p_transfer_id
    order by created_at
    limit 1;

  if v_variant is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no warehouse_transfer_items row', p_transfer_id;
  end if;

  -- The FROM sub-container of the outbound transfer IS the destination the
  -- stock returns to. Skip the derive cascade — the answer was stamped when
  -- we sent it out.
  v_from_sub_container_id := v_transfer.to_sub_container_id;
  v_to_sub_container_id   := v_transfer.from_sub_container_id;

  if v_from_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no to_sub_container_id (pre-D.4 legacy?)', p_transfer_id;
  end if;
  if v_to_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no from_sub_container_id — cannot determine where to return the repaired stock. (pre-D.4 legacy?)', p_transfer_id;
  end if;

  if coalesce(p_qty_good, 0) + coalesce(p_qty_writeoff, 0) <> v_qty_out then
    raise exception 'rpc_return_damaged_from_repair: qty_good (%) + qty_writeoff (%) must equal transfer qty (%)',
      p_qty_good, p_qty_writeoff, v_qty_out;
  end if;

  -- Repair cost is never charged (Phase 2 rework): good units return at their
  -- ORIGINAL unit cost — no repair-cost amortization.
  v_unit_cost_good := coalesce(v_unit_cost_base, 0);

  if p_qty_good > 0 then
    insert into public.fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id,
      sub_container_id
    ) values (
      v_variant, v_wh_source, current_date,
      p_qty_good::integer, v_unit_cost_good, 0, v_unit_cost_good, p_qty_good::integer,
      'damaged_repair_return', p_transfer_id,
      v_to_sub_container_id
    );

    update public.inventory_item_brand_variants
       set stock_level = stock_level + p_qty_good::integer,
           updated_at  = now()
     where id = v_variant;

    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    ) values (
      v_wh_source, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      'damaged_return_from_repair_as_good'::public.stock_movement_type,
      p_qty_good::integer, v_unit_cost_good,
      'warehouse_transfer', p_transfer_id,
      coalesce(p_notes, format('Return from repair (transfer %s) — %s units good',
                               v_transfer.repair_vendor_id, p_qty_good)),
      v_to_sub_container_id
    );

    perform public.recalc_average_cost(v_variant);

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id, repair_cost,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_good', v_transfer.repair_vendor_id, v_disp_id, 0,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_good::integer, v_unit_cost_good, p_qty_good::integer,
      v_to_sub_container_id
    );
  end if;

  if p_qty_writeoff > 0 then
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, source_transfer_id, notes, created_by, division_id)
    values (
      'return_from_repair_as_writeoff', p_qty_writeoff, v_wh_source, v_variant, coalesce(v_unit_cost_base, 0),
      v_disp_id, p_transfer_id,
      coalesce(p_notes, format('Return from repair — %s units written off (unrecoverable)', p_qty_writeoff)),
      v_uid, (select division_id from public.warehouse_sub_containers where id = v_to_sub_container_id)
    );

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_writeoff', v_transfer.repair_vendor_id, v_disp_id,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_writeoff::integer, coalesce(v_unit_cost_base, 0), 0,
      v_to_sub_container_id
    );
  end if;

  update public.warehouse_transfers
     set status                 = 'received',
         received_at            = now(),
         received_by_profile_id = v_uid,
         repair_cost            = 0
   where id = p_transfer_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_cancel_consumption(p_consumption_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ce                RECORD;
  v_cogs              RECORD;
  v_sub_container_id  uuid;
  v_uid               uuid := public._current_user_data_id();
  v_touched_variants  uuid[] := '{}';
  v_variant           uuid;
BEGIN
  IF NOT public._auth_user_has_permission('consumption.cancel') THEN RAISE EXCEPTION 'Not authorized to cancel a consumption' USING ERRCODE = '42501'; END IF;
  SELECT id, status, source_warehouse_id, source_sub_container_id, ce_number, division_id
    INTO v_ce
    FROM public.consumption_entries
    WHERE id = p_consumption_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % not found', p_consumption_id;
  END IF;
  IF v_ce.status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % is % (expected posted)', p_consumption_id, v_ce.status;
  END IF;

  FOR v_cogs IN
    SELECT brand_variant_id, qty, unit_cost, source_id
    FROM   public.cogs_entries
    WHERE  consumption_id = p_consumption_id AND qty > 0
  LOOP
    v_sub_container_id := NULL;
    IF v_cogs.source_id IS NOT NULL THEN
      SELECT sub_container_id INTO v_sub_container_id
      FROM   public.fifo_cost_layers
      WHERE  id = v_cogs.source_id;
    END IF;

    IF v_sub_container_id IS NULL THEN
      v_sub_container_id := v_ce.source_sub_container_id;
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_cogs.brand_variant_id, v_ce.source_warehouse_id, v_sub_container_id, current_date,
      v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty,
      'consumption_cancel', p_consumption_id
    );

    -- C4 fix: restore variant stock_level (deduct_fifo_layers decremented it).
    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + v_cogs.qty,
           updated_at  = now()
     WHERE id = v_cogs.brand_variant_id;

    v_touched_variants := v_touched_variants || v_cogs.brand_variant_id;
  END LOOP;

  DELETE FROM public.inventory_stock_movements
   WHERE reference_type = 'consumption'
     AND reference_id   = p_consumption_id;

  DELETE FROM public.cogs_entries
   WHERE consumption_id = p_consumption_id;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  UPDATE public.consumption_entries
     SET status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now()
   WHERE id = p_consumption_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_resolve_tool_repair(p_unit_id uuid, p_outcome text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.tool_status;
  v_pending boolean;
  v_bv uuid; v_sub uuid; v_wh uuid;
  v_actor uuid; v_actor_name text; v_sa uuid;
  v_step RECORD; v_ord int := 0;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING errcode = '42501';
  END IF;
  IF p_outcome NOT IN ('repaired','scrap') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome;
  END IF;

  SELECT status, pending_scrap INTO v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is already retired'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

  IF p_outcome = 'repaired' THEN
    -- Back in service: Good again; assigned if still held by a team, else available.
    UPDATE public.tool_asset_units
      SET condition = 'Good',
          status = CASE WHEN current_custody_location_id IS NOT NULL THEN 'assigned'::public.tool_status
                        ELSE 'available'::public.tool_status END
      WHERE id = p_unit_id;
    RETURN;
  END IF;

  -- ── scrap ──
  v_actor := public._current_user_data_id();
  SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_actor;

  -- Resolve the unit's stock position + cost from its receival link.
  SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id
    INTO v_bv, v_sub, v_wh
    FROM public.tool_asset_units u
    JOIN public.receival_items ri ON ri.id = u.receival_item_id
    LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
    WHERE u.id = p_unit_id;

  IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
    -- GATED: lock the unit and route a pending write_off through the stock_adj
    -- approval chain. The unit is NOT retired here — trg_tool_scrap_on_adjustment
    -- retires it (and closes the assignment) on approval, or releases the lock
    -- on rejection.
    UPDATE public.tool_asset_units SET pending_scrap = true WHERE id = p_unit_id;

    INSERT INTO public.stock_adjustments
      (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
       reason, status, requested_by, requested_by_name, tool_unit_id)
    VALUES
      (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
       COALESCE(NULLIF(p_notes,''), 'Tool scrapped'), 'pending_approval', v_actor, v_actor_name, p_unit_id)
    RETURNING id INTO v_sa;

    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   public.approval_workflow_steps
      WHERE  workflow = 'stock_adj' AND is_active = true AND archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;
      v_ord := v_ord + 1;
      INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
      VALUES (v_sa, v_ord, v_step.step_key, v_step.step_label);
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
    END IF;
  ELSE
    -- UNCOSTED (seed / no receival cost layer): nothing to cost, so retire
    -- immediately at zero value (owner decision), closing any open assignment.
    UPDATE public.tool_unit_assignments
      SET released_at = now(), release_reason = 'scrapped'
      WHERE unit_id = p_unit_id AND released_at IS NULL;
    UPDATE public.tool_asset_units
      SET status = 'retired', current_custody_location_id = NULL
      WHERE id = p_unit_id;
    RAISE NOTICE 'scrap: unit % has no receival cost layer — retired at zero value', p_unit_id;
  END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.rpc_move_tool_unit_to_team(p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_pending boolean; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to move tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status, pending_scrap INTO v_unit_div, v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be moved'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_to_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team_id; END IF;

  IF v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division move blocked: destination team is in a different division than the tool';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'moved'
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_to_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_to_team_id, status = 'assigned'
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;
CREATE OR REPLACE FUNCTION public.rpc_create_custody_return(p_source_sub_container_id uuid, p_dest_warehouse_id uuid, p_dest_sub_container_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        reference_type, reference_id, notes, source_id
      ) values (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        coalesce(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, nullif(p_notes, ''), v_layer.layer_id
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
CREATE OR REPLACE FUNCTION public.create_and_confirm_delivery(p_so_id uuid, p_warehouse_id uuid, p_warehouse_name text, p_date date, p_items jsonb)
 RETURNS TABLE(id uuid, delivery_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_delivery_number text;
  v_new_id          uuid;
  v_line            jsonb;
begin
  IF NOT public._auth_user_has_permission('sales.deliveries.create') AND NOT public._auth_user_has_permission('sales.deliveries.manage') THEN RAISE EXCEPTION 'Not authorized to create deliveries' USING ERRCODE = '42501'; END IF;
  -- Single source of truth: use the canonical minter that
  -- rpc_create_partial_replacement and every other creator already use.
  v_delivery_number := public.next_delivery_number();

  insert into sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status, created_by, created_by_name
  ) values (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending',
    public._current_user_data_id(),
    (SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id())
  )
  returning sale_deliveries.id into v_new_id;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_new_id,
      case when v_line->>'brand_variant_id' is not null
           and v_line->>'brand_variant_id' != 'null'
           then (v_line->>'brand_variant_id')::uuid end,
      coalesce(v_line->>'item_name', 'Item'),
      nullif(v_line->>'sku', ''),
      coalesce((v_line->>'qty_delivered')::integer, 0)
    );
  end loop;

  perform complete_delivery_inventory(v_new_id, p_so_id);

  return query select v_new_id, v_delivery_number;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_return_tool_from_repair(p_transfer_id uuid, p_outcome text, p_to_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id(); v_actor_name text;
  v_unit uuid; v_kind text; v_tstatus text;
  v_bv uuid; v_sub uuid; v_wh uuid; v_sa uuid;
  v_step RECORD; v_ord int := 0;
BEGIN
  IF NOT public._user_has_permission(v_uid, 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('usable','writeoff') THEN RAISE EXCEPTION 'invalid outcome: %', p_outcome; END IF;

  SELECT tool_unit_id, transfer_kind, status::text INTO v_unit, v_kind, v_tstatus
    FROM public.warehouse_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer % not found', p_transfer_id; END IF;
  IF v_unit IS NULL OR v_kind <> 'damaged_repair_out' THEN RAISE EXCEPTION 'transfer % is not a tool repair transfer', p_transfer_id; END IF;
  IF v_tstatus <> 'in_transit' THEN RAISE EXCEPTION 'transfer % is not out for repair (status %)', p_transfer_id, v_tstatus; END IF;

  IF p_outcome = 'usable' THEN
    -- Record the destination store on the collection ledger row.
    UPDATE public.tool_unit_assignments
      SET returned_to_warehouse_id = p_to_warehouse_id
      WHERE id = (SELECT a.id FROM public.tool_unit_assignments a
                  WHERE a.unit_id = v_unit AND a.release_reason = 'sent_for_repair'
                  ORDER BY a.released_at DESC NULLS LAST LIMIT 1);
    UPDATE public.tool_asset_units
      SET status = 'available', condition = 'Good',
          lifecycle_type = 'repaired'::public.tool_lifecycle_type,
          current_custody_location_id = NULL
      WHERE id = v_unit;
  ELSE
    -- ── writeoff ──
    SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_uid;

    SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id INTO v_bv, v_sub, v_wh
      FROM public.tool_asset_units u
      JOIN public.receival_items ri ON ri.id = u.receival_item_id
      LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
      WHERE u.id = v_unit;

    IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
      -- GATED: lock + route a pending write_off; the trigger retires on approve.
      UPDATE public.tool_asset_units SET pending_scrap = true WHERE id = v_unit;

      INSERT INTO public.stock_adjustments
        (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
         reason, status, requested_by, requested_by_name, tool_unit_id)
      VALUES
        (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
         COALESCE(NULLIF(p_notes,''), 'Tool scrapped (repair writeoff)'), 'pending_approval', v_uid, v_actor_name, v_unit)
      RETURNING id INTO v_sa;

      FOR v_step IN
        SELECT step_key, step_label, is_conditional, condition_types
        FROM   public.approval_workflow_steps
        WHERE  workflow = 'stock_adj' AND is_active = true AND archived_at IS NULL
        ORDER BY step_order
      LOOP
        IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
          CONTINUE;
        END IF;
        v_ord := v_ord + 1;
        INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
        VALUES (v_sa, v_ord, v_step.step_key, v_step.step_label);
      END LOOP;

      IF v_ord = 0 THEN
        RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
      END IF;
    ELSE
      -- UNCOSTED: retire immediately at zero value (owner decision).
      UPDATE public.tool_asset_units
        SET status = 'retired', current_custody_location_id = NULL
        WHERE id = v_unit;
      RAISE NOTICE 'writeoff: unit % has no receival cost layer — retired at zero value', v_unit;
    END IF;
  END IF;

  -- The tool physically returned either way — close the repair transfer.
  UPDATE public.warehouse_transfers
    SET status = 'received', received_at = now(), received_by_profile_id = v_uid
    WHERE id = p_transfer_id;
END $function$;
CREATE OR REPLACE FUNCTION public._maybe_close_return(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source               public.return_source_type;
  v_customer_remaining   numeric;
  v_inventory_remaining  numeric;
  v_new_status           public.return_status;
  v_cn_id                uuid;
  v_all_replacement      boolean;
  v_all_store_credit     boolean;
  v_all_refund           boolean;
  v_new_resolution_type  public.credit_note_resolution_type;
  v_restocked_at         timestamptz;
  v_has_good             boolean;
begin
  select source_type into v_source from public.so_po_returns where id = p_return_id;

  -- Phase 3b: consumption returns carry no customer / credit-note dimension.
  -- Close when good lines have been restocked AND the damaged-line dispositions
  -- are fully resolved.
  if v_source = 'consumption' then
    select restocked_at into v_restocked_at from public.so_po_returns where id = p_return_id;
    select exists (
      select 1 from public.return_lines
      where return_id = p_return_id and condition = 'good' and qty > 0
    ) into v_has_good;
    if v_has_good and v_restocked_at is null then
      return;  -- good stock not put back yet
    end if;

    select inventory_remaining into v_inventory_remaining
      from public.return_progress where return_id = p_return_id;
    if coalesce(v_inventory_remaining, 0) > 0 then
      return;  -- damaged dispositions still pending
    end if;

    update public.so_po_returns
      set status = 'closed', updated_at = now()
      where id = p_return_id
        and status not in ('cancelled', 'closed');
    return;
  end if;

  -- Sales / PO path (unchanged).
  select customer_remaining, inventory_remaining
    into v_customer_remaining, v_inventory_remaining
    from public.return_progress
    where return_id = p_return_id;

  if v_customer_remaining is null or v_customer_remaining > 0 then
    return;
  end if;
  if coalesce(v_inventory_remaining, 0) > 0 then
    return;
  end if;

  v_new_status := public._return_resolution_status(p_return_id);
  if v_new_status is null then
    return;
  end if;

  update public.so_po_returns
    set status = v_new_status, updated_at = now()
    where id = p_return_id
      and status not in (
        'cancelled',
        'resolved_credit',
        'resolved_replacement',
        'resolved_partial'
      );

  -- Stamp the CN with the resolution_type + terminal status.
  select credit_note_id into v_cn_id
    from public.so_po_returns where id = p_return_id;
  if v_cn_id is null then
    return;
  end if;

  select
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  into
    v_all_replacement, v_all_store_credit, v_all_refund
  from public.return_line_customer_resolutions cr
  join public.return_lines rl on rl.id = cr.return_line_id
  where rl.return_id = p_return_id;

  v_new_resolution_type := case
    when v_all_replacement  then 'replacement'::public.credit_note_resolution_type
    when v_all_store_credit then 'store_credit'::public.credit_note_resolution_type
    when v_all_refund       then 'refund'::public.credit_note_resolution_type
    else null
  end;

  update public.credit_notes cn
    set resolution_type = v_new_resolution_type,
        status = case
          when cn.status = 'void'::public.credit_note_status
            then 'void'::public.credit_note_status
          else 'resolved'::public.credit_note_status
        end
    where cn.id = v_cn_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_create_custody_transfer(p_source_sub_container_id uuid, p_dest_sub_container_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_sub      record;
  v_dest_sub        record;
  v_uid             uuid := public._current_user_data_id();
  v_creator         uuid := coalesce(p_created_by_profile_id, v_uid);
  v_transfer_id     uuid;
  v_transfer_number text;
  v_item            jsonb;
  v_bv_id           uuid;
  v_qty             int;
  v_label           record;
  v_layer           record;
  v_qty_taken       int;
  v_line_total      numeric;
  v_weighted        numeric;
begin
  if v_creator is null then
    raise exception 'You need to be signed in to transfer custody stock.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before submitting the transfer.';
  end if;

  -- Source: active custody location under a warehouse permitted to hand out.
  select sc.id, sc.warehouse_id, sc.is_active, sc.name,
         sc.responsible_person_profile_id,
         w.warehouse_kind,
         coalesce(w.can_transfer_custody, false) as can_transfer
    into v_source_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_source_sub_container_id;

  if not found or v_source_sub.is_active is not true then
    raise exception 'The source custody location is no longer active.';
  end if;
  if v_source_sub.warehouse_kind <> 'custody' then
    raise exception 'Only custody locations can transfer to other custody locations.';
  end if;
  if v_source_sub.can_transfer is not true then
    raise exception 'This custody warehouse is not permitted to hand out stock to other custody locations.';
  end if;

  -- Destination: a DIFFERENT active custody location that has a responsible person.
  select sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name,
         sc.responsible_person_profile_id, w.warehouse_kind
    into v_dest_sub
    from public.warehouse_sub_containers sc
    join public.warehouses w on w.id = sc.warehouse_id
    where sc.id = p_dest_sub_container_id;

  if not found or v_dest_sub.is_active is not true then
    raise exception 'The destination custody location is no longer active.';
  end if;
  if v_dest_sub.warehouse_kind <> 'custody' then
    raise exception 'Custody transfers can only target another custody location.';
  end if;
  if p_dest_sub_container_id = p_source_sub_container_id then
    raise exception 'Source and destination locations must differ.';
  end if;
  if v_dest_sub.responsible_person_profile_id is null then
    raise exception 'The destination custody location has no responsible person set, so nobody could accept the transfer. Assign one in Master Data first.';
  end if;

  -- The destination must be in a division the caller is assigned to (owner /
  -- accountant see all). is_division_member reads the caller's JWT division_ids,
  -- so this holds even on a direct API call, mirroring the UI's scoping.
  if not public.is_division_member(v_dest_sub.division_id) then
    raise exception 'You can only transfer to a custody location in a division you are assigned to.';
  end if;

  -- Permission: the SOURCE location's responsible person, or a custody admin.
  if v_source_sub.responsible_person_profile_id is distinct from v_creator
     and not public._has_custody_admin_role(v_creator) then
    raise exception 'Only the responsible person of the source custody location (or an admin) can transfer its stock.';
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
    v_transfer_number, v_source_sub.warehouse_id, v_dest_sub.warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'in_transit',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  returning id into v_transfer_id;

  -- Deduct the source FIFO per line and book transfer_out movements — identical
  -- to rpc_dispatch_custody_assign, so rpc_accept_custody_assign can restock the
  -- destination and reconcile any shortfall against the source on acceptance.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    if v_bv_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'One of the transfer lines is missing an item or has an invalid qty.';
    end if;

    select coalesce(ii.name_en, '')::text as item_name,
           nullif(ii.sku, '')::text        as sku
      into v_label
      from public.inventory_item_brand_variants bv
      left join public.inventory_items ii on ii.id = bv.item_id
      where bv.id = v_bv_id;

    v_qty_taken  := 0;
    v_line_total := 0;

    for v_layer in
      select layer_id, qty_taken, unit_cost, total_cost
      from public.deduct_fifo_layers(
        v_bv_id,
        v_source_sub.warehouse_id,
        v_qty,
        true,                              -- p_is_transfer (keeps company stock_level until accept)
        p_source_sub_container_id
      )
    loop
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, source_id
      ) values (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        coalesce(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, v_layer.layer_id
      );
    end loop;

    if v_qty_taken < v_qty then
      raise exception 'Not enough stock of "%" at the source to transfer % — only % available.',
        coalesce(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken;
    end if;

    v_weighted := v_line_total / nullif(v_qty_taken, 0);

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost, sub_container_id
    ) values (
      v_transfer_id, v_bv_id, coalesce(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, coalesce(v_weighted, 0), p_source_sub_container_id
    );
  end loop;

  return v_transfer_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_assess_warranty_claim(p_claim_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_profile uuid; v_status warranty_claim_status; v_source text;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Load the claim (locked) + its warranty source so the permission key can be
  -- chosen by source.
  SELECT wc.status, wr.source_type INTO v_status, v_source
    FROM warranty_claims wc
    JOIN warranty_records wr ON wr.id = wc.warranty_record_id
    WHERE wc.id = p_claim_id
    FOR UPDATE OF wc;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_source = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_decision NOT IN ('covered','rejected') THEN RAISE EXCEPTION 'decision must be covered or rejected'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Only an open claim can be assessed (status: %)', v_status USING ERRCODE='42501'; END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE warranty_claims
    SET decision = p_decision, decided_by = v_profile, decided_at = now(), decision_reason = NULLIF(btrim(p_reason),''),
        status = CASE WHEN p_decision = 'covered' THEN 'covered'::warranty_claim_status ELSE 'rejected'::warranty_claim_status END,
        updated_at = now()
    WHERE id = p_claim_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_report_accounts_payable(p_division_ids uuid[] DEFAULT NULL::uuid[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(bill_no text, supplier text, po_no text, po_id uuid, issued_date date, due_date date, amount numeric, paid numeric, due numeric, po_currency text, po_amount numeric, status text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.bill_no, r.supplier, r.po_no, r.po_id, r.issued_date, r.due_date,
         r.amount, r.paid, r.due, r.po_currency, r.po_amount, r.status, r.division_id, r.division_name
  FROM (
    SELECT
      b.bill_number AS bill_no,
      s.name        AS supplier,
      po.po_number  AS po_no,
      b.purchase_order_id AS po_id,
      b.issued_date,
      b.due_date,
      -- Bills store money in the PO's currency; convert the per-division
      -- allocated amounts to QAR using the PO's booking rate.
      round(a.amount * f.factor, 2)            AS amount,
      round(a.paid   * f.factor, 2)            AS paid,
      round((a.amount - a.paid) * f.factor, 2) AS due,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE NULL END AS po_currency,
      -- Original PO-currency amount, shown alongside the QAR value.
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR'
           THEN round(a.amount, 2) ELSE NULL END AS po_amount,
      CASE
        WHEN b.payment_status = 'paid' OR (a.amount - a.paid) <= 0 THEN 'Paid'
        WHEN b.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      a.division_id,
      d.name AS division_name
    FROM public.bills b
    LEFT JOIN public.suppliers s        ON s.id  = b.supplier_id
    LEFT JOIN public.purchase_orders po ON po.id = b.purchase_order_id
    CROSS JOIN LATERAL (
      -- Per-division allocation of THIS bill.
      WITH w AS (
        SELECT dw.division_id, dw.weight
        FROM public._po_division_weights(b.purchase_order_id) dw
      ),
      ranked AS (
        SELECT division_id, weight,
               row_number() OVER (ORDER BY weight DESC, division_id) AS rn
        FROM w
      ),
      base AS (
        SELECT rn, division_id,
               round(COALESCE(b.total_amount, 0) * weight, 2) AS amt_r,
               round(COALESCE(b.paid_amount,  0) * weight, 2) AS paid_r
        FROM ranked
      ),
      resid AS (
        SELECT COALESCE(b.total_amount, 0) - COALESCE(SUM(amt_r),  0) AS amt_res,
               COALESCE(b.paid_amount,  0) - COALESCE(SUM(paid_r), 0) AS paid_res
        FROM base
      )
      SELECT base.division_id,
             base.amt_r  + CASE WHEN base.rn = 1 THEN resid.amt_res  ELSE 0 END AS amount,
             base.paid_r + CASE WHEN base.rn = 1 THEN resid.paid_res ELSE 0 END AS paid
      FROM base CROSS JOIN resid
      UNION ALL
      -- Fallback: no line-division breakdown → whole bill on its own division.
      SELECT b.division_id, COALESCE(b.total_amount, 0), COALESCE(b.paid_amount, 0)
      WHERE NOT EXISTS (SELECT 1 FROM w)
    ) a
    CROSS JOIN LATERAL (SELECT public._bill_qar_factor(b.id) AS factor) f
    LEFT JOIN public.company_divisions d ON d.id = a.division_id
    WHERE public.is_division_visible(a.division_id)
      AND (p_division_ids IS NULL OR a.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR b.issued_date >= p_from)
      AND (p_to   IS NULL OR b.issued_date <= p_to)
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.bill_no;
$function$;
CREATE OR REPLACE FUNCTION public._sync_warranty_claim_from_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_all_replacement  boolean;
  v_all_store_credit boolean;
  v_all_refund       boolean;
  v_resolution_type  text;
BEGIN
  -- Consumption warranty return (Phase 4): no customer/credit dimension; the
  -- claim resolves once the return is fully processed (status='closed').
  IF NEW.source_type = 'consumption' THEN
    IF NEW.status <> 'closed' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM warranty_claims WHERE id = NEW.warranty_claim_id AND status = 'in_progress'
    ) THEN
      RETURN NEW;
    END IF;
    UPDATE warranty_claims
      SET status = 'resolved',
          resolved_at = now(),
          resolution_type = NULL,
          linked_credit_note_id = NULL,
          updated_at = now()
      WHERE id = NEW.warranty_claim_id;
    RETURN NEW;
  END IF;

  -- Sales path (unchanged).
  IF NEW.status NOT IN ('resolved_credit','resolved_replacement','resolved_partial') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM warranty_claims WHERE id = NEW.warranty_claim_id AND status = 'in_progress'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  INTO v_all_replacement, v_all_store_credit, v_all_refund
  FROM return_line_customer_resolutions cr
  JOIN return_lines rl ON rl.id = cr.return_line_id
  WHERE rl.return_id = NEW.id;

  v_resolution_type := CASE
    WHEN v_all_replacement  THEN 'replacement'
    WHEN v_all_refund       THEN 'refund'
    WHEN v_all_store_credit THEN 'credit'
    ELSE NULL
  END;

  UPDATE warranty_claims
    SET status = 'resolved',
        resolved_at = now(),
        linked_credit_note_id = NEW.credit_note_id,
        resolution_type = v_resolution_type,
        updated_at = now()
    WHERE id = NEW.warranty_claim_id;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_file_warranty_claim(p_warranty_record_id uuid, p_issue text, p_claim_qty integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile   uuid;
  v_rec       RECORD;
  v_remaining integer;
  v_id        uuid;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Lock the record so concurrent files can't both pass the remaining check.
  -- Loaded before the permission check so the key can be chosen by source.
  SELECT id, source_type, division_id, qty INTO v_rec
    FROM warranty_records WHERE id = p_warranty_record_id FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

  -- Source-aware permission: consumption warranties use the consumption key;
  -- everything else (sale/service/contract) keeps the sales key.
  IF v_rec.source_type = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'Issue description is required'; END IF;
  IF p_claim_qty IS NULL OR p_claim_qty < 1 THEN
    RAISE EXCEPTION 'Claim quantity must be at least 1';
  END IF;

  v_remaining := v_rec.qty - COALESCE((
    SELECT SUM(c.claim_qty) FROM warranty_claims c
     WHERE c.warranty_record_id = v_rec.id
       AND c.status NOT IN ('void','rejected')
  ), 0);

  IF p_claim_qty > v_remaining THEN
    RAISE EXCEPTION 'Only % unit(s) remain under this warranty (requested %)', v_remaining, p_claim_qty
      USING ERRCODE='23514';
  END IF;

  INSERT INTO warranty_claims(
    claim_number, warranty_record_id, warranty_type, status, issue_description,
    claim_qty, reported_by, division_id
  )
  VALUES (
    public.next_warranty_claim_number(v_rec.division_id), v_rec.id, v_rec.source_type, 'open', btrim(p_issue),
    p_claim_qty, v_profile, v_rec.division_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_report_pnl(p_start date, p_end date, p_basis text DEFAULT 'accrual'::text, p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_fx     numeric;
  v_scrap  numeric;
BEGIN
  -- Realized FX from payments settled in the period (both bases). Purchase
  -- payments on a multi-division PO are split by line-value weight; everything
  -- else is attributed to its header division.
  WITH fx_raw AS (
    SELECT
      (COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0)) AS fx,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
      COALESCE(po.id, bl.purchase_order_id) AS po_id
    FROM public.payments p
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    WHERE p.deleted_at IS NULL
      AND p.date BETWEEN p_start AND p_end
  ),
  fx_attr AS (
    -- Purchase payment on a PO with per-division weights → split.
    SELECT w.division_id AS div, fr.fx * w.weight AS fx
    FROM fx_raw fr
    CROSS JOIN LATERAL public._po_division_weights(fr.po_id) w
    UNION ALL
    -- Everything else → header division.
    SELECT fr.hdr_div AS div, fr.fx
    FROM fx_raw fr
    WHERE NOT EXISTS (SELECT 1 FROM public._po_division_weights(fr.po_id))
  )
  SELECT COALESCE(SUM(fx), 0)
    INTO v_fx
  FROM fx_attr
  WHERE public.is_division_visible(div)
    AND (p_division_ids IS NULL OR div = ANY(p_division_ids));

  -- Scrap & Defective — canonical write-offs only (approved SA adjustment_type='write_off'),
  -- valued at the cost booked to the movement each produced. Both good and damaged
  -- write-offs are now division + warehouse scoped.
  SELECT
    COALESCE((
      -- Good-pile write-offs: division + warehouse scoped via sub_container -> division.
      SELECT SUM(ABS(sm.qty) * sm.unit_cost)
      FROM public.inventory_stock_movements sm
      JOIN public.stock_adjustments sa ON sa.id = sm.reference_id
      LEFT JOIN public.warehouse_sub_containers wsc ON wsc.id = sm.sub_container_id
      WHERE sm.movement_type::text  = 'adjustment'
        AND sm.reference_type       = 'adjustment'
        AND sa.adjustment_type::text IN ('write_off', 'decrease')
        AND sa.status::text          = 'approved'
        AND sm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(wsc.division_id)
        AND (p_division_ids  IS NULL OR wsc.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR sm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
    +
    COALESCE((
      -- Transfer shrinkage: stock lost in transit, logged at the source
      -- sub-container. Division + warehouse scoped via sub_container -> division.
      SELECT SUM(ABS(sm.qty) * sm.unit_cost)
      FROM public.inventory_stock_movements sm
      LEFT JOIN public.warehouse_sub_containers wsc ON wsc.id = sm.sub_container_id
      WHERE sm.movement_type::text = 'transfer_shrinkage'
        AND sm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(wsc.division_id)
        AND (p_division_ids  IS NULL OR wsc.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR sm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
    +
    COALESCE((
      -- Damaged-pile write-offs: division-scoped via the movement's division_id
      -- (stamped from the source sub-container / return at damage time).
      SELECT SUM(dm.qty * dm.unit_cost)
      FROM public.inventory_damaged_movements dm
      WHERE dm.movement_type IN ('damaged_write_off', 'return_from_repair_as_writeoff')
        AND dm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(dm.division_id)
        AND (p_division_ids  IS NULL OR dm.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR dm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
  INTO v_scrap;

  IF p_basis = 'cash' THEN
    WITH pay_raw AS (
      SELECT
        p.direction,
        COALESCE(p.amount_qar, 0) AS amt,
        COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
        COALESCE(po.id, bl.purchase_order_id) AS po_id
      FROM public.payments p
      LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
      LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
      LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
      LEFT JOIN public.bills bl           ON bl.id = p.bill_id
      WHERE p.deleted_at IS NULL
        AND p.status::text IN ('completed', 'pending', 'processing')
        AND p.date BETWEEN p_start AND p_end
    ),
    pay AS (
      -- Outgoing (purchase) payment on a weighted PO → split by division.
      SELECT pr.direction, w.division_id AS div, pr.amt * w.weight AS amt
      FROM pay_raw pr
      CROSS JOIN LATERAL public._po_division_weights(pr.po_id) w
      WHERE pr.direction = 'outgoing'
      UNION ALL
      -- Incoming payments, and outgoing payments without a weighted PO → header division.
      SELECT pr.direction, pr.hdr_div AS div, pr.amt
      FROM pay_raw pr
      WHERE pr.direction <> 'outgoing'
         OR NOT EXISTS (SELECT 1 FROM public._po_division_weights(pr.po_id))
    ),
    pay_vis AS (
      SELECT direction, amt
      FROM pay
      WHERE public.is_division_visible(div)
        AND (p_division_ids IS NULL OR div = ANY(p_division_ids))
    )
    SELECT jsonb_build_object(
      'basis',    'cash',
      'cash_in',  (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'incoming'),
      'cash_out', (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'outgoing'),
      'fx_net',   v_fx,
      'scrap',    v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'cash_in')::numeric - (v_result->>'cash_out')::numeric + v_fx - v_scrap
    );
  ELSE
    WITH lines AS (
      SELECT
        ce.source_type,
        initcap(replace(COALESCE(c.type::text, 'other'), '-', ' ')) AS category_stream,
        CASE WHEN ce.source_type = 'sale_replacement' THEN 0
             ELSE (ce.qty * COALESCE(sol.unit_price, 0) * COALESCE(so.exchange_rate, 1)) END AS revenue,
        ce.total_cost AS cogs
      FROM public.cogs_entries ce
      JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
      JOIN public.inventory_items it ON it.id = v.item_id
      LEFT JOIN public.inventory_categories c ON c.id = it.category_id
      LEFT JOIN public.sale_orders so ON so.id = ce.sale_order_id
      LEFT JOIN LATERAL (
        SELECT sol2.unit_price FROM public.sale_order_lines sol2
        WHERE sol2.sale_order_id = ce.sale_order_id AND sol2.brand_variant_id = ce.brand_variant_id
        LIMIT 1
      ) sol ON true
      LEFT JOIN public.fifo_cost_layers fl ON fl.id = ce.source_id
      WHERE ce.source_type IN ('sale', 'sale_return', 'sale_replacement', 'consumption', 'landed_cost', 'landed_cost_reversal')
        AND ce.date BETWEEN p_start AND p_end
        AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
        AND (p_division_ids IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
    ),
    -- Revenue stays grouped by the item's category stream. Landed-cost rows carry
    -- no revenue (no sale line), so this grouping is unchanged by the LC split.
    rev_by_stream AS (
      SELECT category_stream AS stream, SUM(revenue) AS amount
      FROM lines
      GROUP BY category_stream
    ),
    -- COGS pulls landed-cost adjustments out of the item streams into a dedicated
    -- "LC Variation" line (net of landed_cost + landed_cost_reversal). Every other
    -- source type keeps its item-category stream.
    cogs_by_stream AS (
      SELECT
        CASE
          WHEN source_type IN ('landed_cost', 'landed_cost_reversal') THEN 'LC Variation'
          ELSE category_stream
        END AS stream,
        SUM(cogs) AS amount
      FROM lines
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'basis',         'accrual',
      'revenue',       COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(amount, 2)) ORDER BY stream) FROM rev_by_stream), '[]'::jsonb),
      'cogs',          COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(amount, 2)) ORDER BY stream) FROM cogs_by_stream), '[]'::jsonb),
      'revenue_total', COALESCE((SELECT SUM(amount) FROM rev_by_stream), 0),
      'cogs_total',    COALESCE((SELECT SUM(amount) FROM cogs_by_stream), 0),
      'fx_net',        v_fx,
      'scrap',         v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'revenue_total')::numeric - (v_result->>'cogs_total')::numeric + v_fx - v_scrap
    );
  END IF;

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_cascade_category_tracking_mode(p_category_id uuid, p_mode tool_tracking_mode)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changed text[] := ARRAY[]::text[];
  v_locked  text[] := ARRAY[]::text[];
  r RECORD;
  v_has_units boolean;
  v_has_qty   boolean;
  v_locked_row boolean;
BEGIN
  IF p_category_id IS NULL OR p_mode IS NULL THEN
    RAISE EXCEPTION 'category id and mode are required';
  END IF;

  FOR r IN
    WITH RECURSIVE subtree AS (
      SELECT id, name_en, tool_tracking_mode, 0 AS depth
        FROM inventory_categories
       WHERE id = p_category_id
      UNION ALL
      SELECT c.id, c.name_en, c.tool_tracking_mode, s.depth + 1
        FROM inventory_categories c
        JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id, name_en, tool_tracking_mode
      FROM subtree
     WHERE depth > 0
     ORDER BY name_en
  LOOP
    CONTINUE WHEN r.tool_tracking_mode IS NOT DISTINCT FROM p_mode;

    v_has_units := EXISTS (
      SELECT 1 FROM tool_asset_units tau
      JOIN inventory_items ii ON ii.id = tau.item_id
      WHERE ii.category_id = r.id
    );
    v_has_qty := EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
      JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
      WHERE ii.category_id = r.id
    );

    -- Lock (skip) only for the unsafe cases: any serial units, or moving to a
    -- non-bulk mode while bulk qty exists. serialized -> bulk with only qty is
    -- the corrective, allowed flip.
    v_locked_row := v_has_units
      OR (v_has_qty AND p_mode <> 'bulk'::tool_tracking_mode);

    IF v_locked_row THEN
      v_locked := v_locked || r.name_en;
    ELSE
      UPDATE inventory_categories SET tool_tracking_mode = p_mode WHERE id = r.id;
      v_changed := v_changed || r.name_en;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'changed', to_jsonb(v_changed),
    'locked',  to_jsonb(v_locked)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_build_po_approval_steps(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_po        RECORD;
  v_chain_id  uuid;
  v_iteration int;
  v_count     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_qar, division_id, status
    INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: PO % not found', p_po_id;
  END IF;

  -- Caller must be able to see the PO's division (mirrors the row-visibility
  -- model). Legacy NULL-division POs are not gated on visibility.
  IF v_po.division_id IS NOT NULL AND NOT public.is_division_visible(v_po.division_id) THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authorized for this PO' USING ERRCODE = '42501';
  END IF;

  -- Active chain: PO division first, else company-default (NULL division).
  SELECT id INTO v_chain_id
    FROM po_approval_chains
   WHERE is_active AND archived_at IS NULL AND division_id = v_po.division_id
   LIMIT 1;
  IF v_chain_id IS NULL THEN
    SELECT id INTO v_chain_id
      FROM po_approval_chains
     WHERE is_active AND archived_at IS NULL AND division_id IS NULL
     LIMIT 1;
  END IF;
  IF v_chain_id IS NULL THEN
    RAISE EXCEPTION 'No approval chain configured for this PO.';
  END IF;

  -- Fail closed: an applicable band with no approvers would silently drop its
  -- required sign-off. Block until an admin configures a role for that band.
  IF EXISTS (
    SELECT 1 FROM po_approval_chain_tiers t
     WHERE t.chain_id   = v_chain_id
       AND t.deleted_at IS NULL
       AND t.min_amount <= COALESCE(v_po.total_qar, 0)
       AND COALESCE(array_length(t.required_roles, 1), 0) = 0
  ) THEN
    RAISE EXCEPTION 'An approval band for this PO amount has no approvers configured. Ask an admin to add a role to it in Approval Settings.'
      USING ERRCODE = '23514';
  END IF;

  v_iteration := COALESCE((SELECT max(iteration) FROM po_approvals WHERE po_id = p_po_id), 0) + 1;

  -- Derive steps from the authoritative tier config: every tier whose
  -- min_amount <= the PO total, one pending step per required role.
  INSERT INTO po_approvals (po_id, role, tier_rank, status, is_active, iteration)
  SELECT p_po_id, r.role, t.rank, 'pending', true, v_iteration
    FROM po_approval_chain_tiers t
    CROSS JOIN LATERAL unnest(t.required_roles) AS r(role)
   WHERE t.chain_id      = v_chain_id
     AND t.deleted_at    IS NULL
     AND t.min_amount    <= COALESCE(v_po.total_qar, 0);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No approval tiers match this PO amount. Check the approval chain configuration.';
  END IF;

  RETURN jsonb_build_object('iteration', v_iteration, 'step_count', v_count);
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_report_cash(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL::uuid[], p_method_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(is_opening boolean, date date, payment_method text, doc_no text, doc_kind text, party text, debit numeric, credit numeric, balance numeric, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      p.id, p.date, p.created_at,
      pm.name                                  AS payment_method,
      COALESCE(si.invoice_id, bl.bill_number)  AS doc_no,
      CASE WHEN si.id IS NOT NULL THEN 'invoice'
           WHEN bl.id IS NOT NULL THEN 'bill' END AS doc_kind,
      COALESCE(cust.name, sup.name)            AS party,
      CASE WHEN p.direction = 'incoming' THEN COALESCE(p.amount_qar, 0) ELSE 0 END AS debit,
      CASE WHEN p.direction = 'outgoing' THEN COALESCE(p.amount_qar, 0) ELSE 0 END AS credit,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id, (SELECT w.division_id FROM public._po_division_weights(po.id) w ORDER BY w.weight DESC NULLS LAST LIMIT 1))      AS division_id
    FROM public.payments p
    JOIN public.payment_methods pm ON pm.id = p.method_id AND pm.is_cash_equivalent
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    LEFT JOIN public.customers cust     ON cust.id = p.customer_id
    LEFT JOIN public.suppliers sup      ON sup.id = p.supplier_id
    WHERE p.deleted_at IS NULL
      AND p.status::text IN ('completed', 'pending', 'processing')
      AND (p_method_ids IS NULL OR p.method_id = ANY(p_method_ids))
  ),
  scoped AS (
    SELECT * FROM base
    WHERE public.is_division_visible(division_id)
      AND (p_division_ids IS NULL OR division_id = ANY(p_division_ids))
  ),
  opening AS (
    SELECT COALESCE(SUM(debit - credit), 0) AS bal FROM scoped WHERE date < p_start
  )
  SELECT u.is_opening, u.date, u.payment_method, u.doc_no, u.doc_kind, u.party, u.debit, u.credit, u.balance, u.division_id, u.division_name
  FROM (
    SELECT true AS is_opening, p_start AS date, 'Opening balance'::text AS payment_method,
           NULL::text AS doc_no, NULL::text AS doc_kind, NULL::text AS party, NULL::numeric AS debit, NULL::numeric AS credit,
           (SELECT bal FROM opening) AS balance, NULL::uuid AS division_id, NULL::text AS division_name,
           '1900-01-01'::timestamptz AS sort_ts, 0 AS sort_seq
    UNION ALL
    SELECT false, s.date, s.payment_method, s.doc_no, s.doc_kind, s.party, s.debit, s.credit,
           (SELECT bal FROM opening) + SUM(s.debit - s.credit) OVER (ORDER BY s.date, s.created_at, s.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
           s.division_id, d.name,
           s.created_at AS sort_ts, 1 AS sort_seq
    FROM scoped s
    LEFT JOIN public.company_divisions d ON d.id = s.division_id
    WHERE s.date BETWEEN p_start AND p_end
  ) u
  ORDER BY u.sort_seq, u.date, u.sort_ts;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_accept_custody_assign(p_transfer_id uuid, p_receipts jsonb, p_accepted_by_profile_id uuid DEFAULT NULL::uuid, p_accepted_by_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer              record;
  v_dest_responsible      uuid;
  v_dest_responsible_name text;
  v_uid                   uuid := public._current_user_data_id();
  v_accepter              uuid := coalesce(p_accepted_by_profile_id, v_uid);
  v_item                  record;
  v_move                  record;
  v_receipt               jsonb;
  v_received_qty          int;
  v_shrinkage_reason      text;
  v_action                text;
  v_total_dispatched      numeric;
  v_total_short           numeric;
  v_line_writeoff         numeric;
  v_line_restock          numeric;
  v_remaining_recv        numeric;
  v_take                  numeric;
  v_miss                  numeric;
  v_touched_variants      uuid[] := '{}';
  v_variant               uuid;
begin
  if v_accepter is null then
    raise exception 'You need to be signed in to accept a custody assignment.';
  end if;

  select id, transfer_kind, status, to_warehouse_id, to_sub_container_id,
         from_warehouse_id, from_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;

  if not found then
    raise exception 'This custody assignment no longer exists.';
  end if;
  if v_transfer.transfer_kind <> 'custody_assign' then
    raise exception 'This transfer is not a custody assignment and cannot be accepted here.';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'This custody assignment is already % — it can no longer be accepted.', v_transfer.status;
  end if;

  -- Permission: destination sub's responsible person, inventory_manager, or system admin.
  select sc.responsible_person_profile_id, u.full_name
    into v_dest_responsible, v_dest_responsible_name
    from public.warehouse_sub_containers sc
    left join public.user_data u on u.id = sc.responsible_person_profile_id
    where sc.id = v_transfer.to_sub_container_id;

  if v_dest_responsible is distinct from v_accepter
     and not public._has_custody_admin_role(v_accepter) then
    if v_dest_responsible is null then
      raise exception 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to accept it, or assign one in Master Data.';
    else
      raise exception 'Only % can accept this custody assignment.', v_dest_responsible_name;
    end if;
  end if;

  for v_item in
    select id, brand_variant_id, item_name, sku
    from   public.warehouse_transfer_items
    where  transfer_id = p_transfer_id
    order  by brand_variant_id
  loop
    -- Total actually dispatched for this variant = sum of its transfer_out layers.
    select coalesce(sum(abs(qty)), 0)
      into v_total_dispatched
      from public.inventory_stock_movements
      where reference_type   = 'transfer'
        and reference_id     = p_transfer_id
        and brand_variant_id = v_item.brand_variant_id
        and movement_type    = 'transfer_out';

    if v_total_dispatched <= 0 then
      continue;
    end if;

    -- Receipt for this line: received qty (default = full dispatched, clamped),
    -- disposition for any shortfall, and an optional shrinkage reason.
    select r into v_receipt
      from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb)) r
      where (r->>'transfer_item_id')::uuid = v_item.id
      limit 1;

    v_received_qty     := coalesce((v_receipt->>'received_qty')::int, v_total_dispatched::int);
    v_shrinkage_reason := coalesce(nullif(btrim(v_receipt->>'shrinkage_reason'), ''), 'missing');
    v_action           := lower(coalesce(nullif(btrim(v_receipt->>'shortfall_action'), ''), 'writeoff'));
    if v_action not in ('writeoff', 'restock') then
      v_action := 'writeoff';
    end if;
    if v_received_qty < 0 then v_received_qty := 0; end if;
    if v_received_qty > v_total_dispatched then v_received_qty := v_total_dispatched::int; end if;

    -- The whole line's shortfall follows the line's chosen disposition.
    v_total_short   := greatest(v_total_dispatched - v_received_qty, 0);
    v_line_writeoff := case when v_action = 'restock' then 0 else v_total_short end;
    v_line_restock  := case when v_action = 'restock' then v_total_short else 0 end;

    update public.warehouse_transfer_items
       set received_qty     = v_received_qty,
           shrinkage_qty    = v_line_writeoff::int,
           returned_qty     = v_line_restock::int,
           shrinkage_reason = case when v_line_writeoff > 0 then v_shrinkage_reason else null end
     where id = v_item.id;

    v_remaining_recv := v_received_qty;

    -- Walk the dispatch-side layers in FIFO order. Each splits into a received
    -- portion (→ destination fifo layer + transfer_in) and a missing portion,
    -- which is either written off (transfer_shrinkage at source) or given back
    -- (re-created source fifo layer + transfer_in at source). No early exit —
    -- layers past the received qty are fully short and must still be recorded.
    for v_move in
      select qty, unit_cost, source_id
      from   public.inventory_stock_movements
      where  reference_type   = 'transfer'
        and  reference_id     = p_transfer_id
        and  brand_variant_id = v_item.brand_variant_id
        and  movement_type    = 'transfer_out'
      order  by created_at asc, id asc
    loop
      v_take := least(v_remaining_recv, abs(v_move.qty));
      v_miss := abs(v_move.qty) - v_take;

      if v_take > 0 then
        insert into public.fifo_cost_layers (
          brand_variant_id, warehouse_id, sub_container_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          source_type, source_id, receival_id
        ) values (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take,
          'custody_assign', p_transfer_id, (select fcl.receival_id from public.fifo_cost_layers fcl where fcl.id = v_move.source_id)
        );

        insert into public.inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id,
          item_name, sku, movement_type, qty, unit_cost,
          reference_type, reference_id
        ) values (
          v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, v_item.brand_variant_id,
          coalesce(v_item.item_name, ''), v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id
        );
      end if;

      if v_miss > 0 then
        if v_action = 'restock' then
          -- Give the missing units back to the SOURCE shelf: re-create the FIFO
          -- layer the dispatch drained (same cost) and log a transfer_in there.
          -- stock_level is untouched — these units never left total inventory.
          insert into public.fifo_cost_layers (
            brand_variant_id, warehouse_id, sub_container_id, date,
            qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
            source_type, source_id, receival_id
          ) values (
            v_item.brand_variant_id, v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, current_date,
            v_miss, v_move.unit_cost, 0, v_move.unit_cost, v_miss,
            'custody_return', p_transfer_id, (select fcl.receival_id from public.fifo_cost_layers fcl where fcl.id = v_move.source_id)
          );

          insert into public.inventory_stock_movements (
            warehouse_id, sub_container_id, brand_variant_id,
            item_name, sku, movement_type, qty, unit_cost,
            reference_type, reference_id, notes
          ) values (
            v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, v_item.brand_variant_id,
            coalesce(v_item.item_name, ''), v_item.sku,
            'transfer_in', v_miss, v_move.unit_cost,
            'transfer', p_transfer_id, 'Returned to source (not received)'
          );
        else
          -- Write off the missing units as shrinkage at the source.
          insert into public.inventory_stock_movements (
            warehouse_id, sub_container_id, brand_variant_id,
            item_name, sku, movement_type, qty, unit_cost,
            reference_type, reference_id, notes
          ) values (
            v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, v_item.brand_variant_id,
            coalesce(v_item.item_name, ''), v_item.sku,
            'transfer_shrinkage', -v_miss, v_move.unit_cost,
            'transfer', p_transfer_id, 'Shrinkage: ' || v_shrinkage_reason
          );
        end if;
      end if;

      v_remaining_recv := v_remaining_recv - v_take;
    end loop;

    -- Only a write-off leaves total inventory. Dispatch skipped the stock_level
    -- decrement for in-transit units; the received portion doesn't bring it back,
    -- and a restock keeps it (re-added to the source FIFO above). So decrement
    -- exactly the written-off quantity here.
    if v_line_writeoff > 0 then
      update public.inventory_item_brand_variants
         set stock_level = greatest(stock_level - v_line_writeoff, 0),
             updated_at  = now()
       where id = v_item.brand_variant_id;
    end if;

    v_touched_variants := v_touched_variants || v_item.brand_variant_id;
  end loop;

  update public.warehouse_transfers
     set status                 = 'received',
         received_by_profile_id = v_accepter,
         received_by_name       = p_accepted_by_name,
         received_at            = now()
   where id = p_transfer_id;

  -- Recost every touched variant (dest layer added, and/or source layer restored).
  select array(select distinct unnest(v_touched_variants)) into v_touched_variants;
  foreach v_variant in array v_touched_variants loop
    perform public.recalc_average_cost(v_variant);
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_item_divisions_by_stock(p_type text)
 RETURNS TABLE(item_id uuid, category_id uuid, division_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive cat_anc(cat_id, anc_id) as (
    select id, id from public.inventory_categories
    union all
    select ca.cat_id, c.parent_id
    from cat_anc ca
    join public.inventory_categories c on c.id = ca.anc_id
    where c.parent_id is not null
  )
  select ii.id, ii.category_id,
    coalesce((
      select array_agg(distinct d) from (
        select idv.division_id as d
          from public.inventory_item_divisions idv where idv.item_id = ii.id
        union
        select sc.division_id
          from public.inventory_item_brand_variants bv
          join public.fifo_cost_layers fcl on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
          join public.warehouse_sub_containers sc on sc.id = fcl.sub_container_id and sc.division_id is not null
         where bv.item_id = ii.id
        union
        select icd.division_id
          from cat_anc ca
          join public.inventory_category_divisions icd on icd.category_id = ca.anc_id
         where ca.cat_id = ii.category_id
      ) u where d is not null
    ), '{}'::uuid[]) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$function$;
CREATE OR REPLACE FUNCTION public.rpc_create_partial_replacement(p_return_id uuid, p_warehouse_id uuid, p_lines jsonb, p_gift_items jsonb DEFAULT '[]'::jsonb, p_dispositions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_sale_order_id   uuid;
  v_delivery_id     uuid;
  v_delivery_num    text;
  v_return_line     RECORD;
  v_line            jsonb;
  v_line_id         uuid;
  v_line_qty        numeric;
  v_gift            jsonb;
  v_gift_variant    uuid;
  v_gift_qty        numeric;
  v_gift_item       RECORD;
  v_disp            jsonb;
  v_disp_line_id    uuid;
  v_disp_type       text;
  v_disp_qty        numeric;
  v_disp_transfer   uuid;
  v_disp_cost       numeric;
  v_mov_id          uuid;
  v_disp_warehouse  uuid;
  v_disp_sub_cont   uuid;
  v_return_division uuid;
  v_fallback_div    uuid;
  v_layer           RECORD;
  v_repl_sub        uuid;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to create replacements' USING ERRCODE = '42501'; END IF;
  SELECT id, source_id, status, division_id
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: return % not found', p_return_id;
  END IF;

  v_sale_order_id   := v_return.source_id;
  v_return_division := v_return.division_id;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: p_lines must be a jsonb array';
  END IF;

  IF jsonb_array_length(p_lines) > 0 OR jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 THEN
    v_delivery_num := public.next_delivery_number();
    INSERT INTO public.sale_deliveries (
      delivery_number, sale_order_id, warehouse_id, date,
      status, type, return_id
    ) VALUES (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', p_return_id
    ) RETURNING id INTO v_delivery_id;

    -- Phase 3a: destination sub-container for FIFO deduction of the free
    -- replacement / gift lines (mirrors complete_delivery_inventory).
    v_repl_sub := public._find_or_create_sub_container(
      p_warehouse_id,
      coalesce(v_return_division, (SELECT division_id FROM public.sale_orders WHERE id = v_sale_order_id)));
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT rl.brand_variant_id, rl.item_name, rl.sku
      INTO v_return_line
      FROM public.return_lines rl
      WHERE rl.id = v_line_id AND rl.return_id = p_return_id;
    IF v_return_line.item_name IS NULL THEN
      RAISE EXCEPTION 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    END IF;

    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty::integer
    );

    -- Phase 3a: book the replacement's cost. Free swap (customer already paid),
    -- so mirror complete_delivery_inventory (deduct FIFO + one cogs + one
    -- movement per layer) with source_type='sale_replacement' -> the P&L counts
    -- the cost with ZERO revenue (revenue is forced to 0 for this source_type).
    FOR v_layer IN
      SELECT layer_id, qty_taken, unit_cost, total_cost
      FROM public.deduct_fifo_layers(v_return_line.brand_variant_id, p_warehouse_id, v_line_qty::integer, false, v_repl_sub)
    LOOP
      INSERT INTO public.cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id, division_id
      ) VALUES (
        v_return_line.brand_variant_id, v_delivery_id, v_sale_order_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'sale_replacement', v_layer.layer_id, v_return_division
      );
      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, v_repl_sub, v_return_line.brand_variant_id,
        coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', v_delivery_id, 'Free replacement — ' || v_delivery_num
      );
    END LOOP;

    PERFORM public._record_customer_resolution(
      p_return_line_id    => v_line_id,
      p_resolution_type   => 'replacement',
      p_qty               => v_line_qty,
      p_sale_delivery_id  => v_delivery_id
    );
  END LOOP;

  FOR v_gift IN SELECT * FROM jsonb_array_elements(coalesce(p_gift_items, '[]'::jsonb)) LOOP
    v_gift_variant := (v_gift->>'brand_variant_id')::uuid;
    v_gift_qty     := (v_gift->>'qty')::numeric;
    IF v_gift_variant IS NULL OR v_gift_qty IS NULL OR v_gift_qty <= 0 THEN
      CONTINUE;
    END IF;
    SELECT item_name, sku INTO v_gift_item
      FROM public.inventory_item_brand_variants WHERE id = v_gift_variant;
    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty::integer
    );

    -- Phase 3a: gifts also leave inventory free -> book cost (sale_replacement).
    FOR v_layer IN
      SELECT layer_id, qty_taken, unit_cost, total_cost
      FROM public.deduct_fifo_layers(v_gift_variant, p_warehouse_id, v_gift_qty::integer, false, v_repl_sub)
    LOOP
      INSERT INTO public.cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id, division_id
      ) VALUES (
        v_gift_variant, v_delivery_id, v_sale_order_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'sale_replacement', v_layer.layer_id, v_return_division
      );
      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, v_repl_sub, v_gift_variant,
        coalesce(v_gift_item.item_name, 'Gift'), nullif(v_gift_item.sku, ''),
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', v_delivery_id, 'Gift on return — ' || v_delivery_num
      );
    END LOOP;
  END LOOP;

  IF jsonb_typeof(p_dispositions) = 'array' AND jsonb_array_length(p_dispositions) > 0 THEN
    FOR v_disp IN SELECT * FROM jsonb_array_elements(p_dispositions) LOOP
      v_disp_line_id  := (v_disp->>'return_line_id')::uuid;
      v_disp_type     := v_disp->>'type';
      v_disp_qty      := (v_disp->>'qty')::numeric;
      v_disp_transfer := nullif(v_disp->>'transfer_id', '')::uuid;

      IF v_disp_type = 'write_off' THEN
        SELECT rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.sale_delivery_line_id
          INTO v_return_line
          FROM public.return_lines rl
          WHERE rl.id = v_disp_line_id;
        IF v_return_line.item_name IS NULL THEN
          RAISE EXCEPTION 'rpc_create_partial_replacement: disposition return_line % not found', v_disp_line_id;
        END IF;

        v_disp_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

        v_disp_warehouse := NULL;
        v_disp_sub_cont  := NULL;

        IF v_return_line.sale_delivery_line_id IS NOT NULL THEN
          SELECT sd.warehouse_id, fcl.sub_container_id
          INTO   v_disp_warehouse, v_disp_sub_cont
          FROM   public.sale_delivery_lines sdl
          JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
          JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                               AND ce.brand_variant_id = sdl.brand_variant_id
          JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
          WHERE  sdl.id = v_return_line.sale_delivery_line_id
          ORDER  BY ce.created_at ASC
          LIMIT  1;
        END IF;

        -- Phase E: cascade is return → SO → raise. Warehouse fallback removed.
        IF v_disp_warehouse IS NULL OR v_disp_sub_cont IS NULL THEN
          v_disp_warehouse := p_warehouse_id;

          v_fallback_div := v_return_division;

          IF v_fallback_div IS NULL THEN
            SELECT so.division_id INTO v_fallback_div
            FROM   public.sale_orders so WHERE so.id = v_sale_order_id;
          END IF;

          IF v_fallback_div IS NULL THEN
            RAISE EXCEPTION 'rpc_create_partial_replacement: write_off cannot resolve division from return or sale_order for warehouse %.',
              p_warehouse_id
              USING HINT = 'Set division_id on the return or sale_order before writing off.';
          END IF;

          v_disp_sub_cont := public._find_or_create_sub_container(p_warehouse_id, v_fallback_div);
        END IF;

        INSERT INTO public.inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) VALUES (
          v_disp_warehouse, v_disp_sub_cont,
          v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
          v_disp_cost,
          'return', p_return_id,
          coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
        ) RETURNING id INTO v_mov_id;

        PERFORM public._record_inventory_disposition(
          p_return_line_id              => v_disp_line_id,
          p_disposition_type            => 'write_off',
          p_qty                         => v_disp_qty,
          p_inventory_stock_movement_id => v_mov_id
        );

        -- Phase 3a: this RPC has its OWN inline write-off; emit the
        -- damaged_write_off the P&L Scrap reads + reverse the sale COGS.
        INSERT INTO public.inventory_damaged_movements (
          movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
          notes, created_by, division_id
        ) VALUES (
          'damaged_write_off', v_disp_qty, v_disp_warehouse, v_return_line.brand_variant_id, v_disp_cost,
          coalesce(v_return_line.condition_notes, 'Written off on customer return'),
          public._current_user_data_id(), coalesce(v_return_division, v_fallback_div)
        );
        PERFORM public._reverse_sale_cogs_for_return(p_return_id, v_return_line.brand_variant_id, v_disp_qty);

      ELSIF v_disp_type = 'restock_as_damaged' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'restock_as_damaged',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSIF v_disp_type = 'send_for_repair' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'send_for_repair',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSE
        RAISE EXCEPTION 'rpc_create_partial_replacement: unknown disposition type %', v_disp_type;
      END IF;
    END LOOP;
  END IF;

  PERFORM public._maybe_close_return(p_return_id);
  RETURN v_delivery_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public._return_line_fifo_unit_cost(p_return_id uuid, p_return_line_id uuid, p_qty numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_id       uuid;
  v_brand_variant   uuid;
  v_qty_remaining   numeric := p_qty;
  v_qty_this_chunk  numeric;
  v_total_cost      numeric := 0;
  v_cogs            record;
begin
  select r.source_id, rl.brand_variant_id
    into v_source_id, v_brand_variant
    from public.so_po_returns r
    join public.return_lines rl on rl.return_id = r.id
    where r.id = p_return_id
      and rl.id = p_return_line_id;

  if v_source_id is null or v_brand_variant is null then
    return 0;
  end if;

  for v_cogs in
    select qty, unit_cost
      from public.cogs_entries
      where sale_order_id = v_source_id
        and brand_variant_id = v_brand_variant
        and qty > 0
      order by date asc, id asc
  loop
    exit when v_qty_remaining <= 0;
    v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);
    v_total_cost := v_total_cost + (v_qty_this_chunk * v_cogs.unit_cost);
    v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
  end loop;

  if p_qty > 0 then
    return round(v_total_cost / p_qty, 4);
  end if;
  return 0;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_void_warranty_claim(p_claim_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile       uuid;
  v_status        warranty_claim_status;
  v_return_id     uuid;
  v_return_status return_status;
  v_source        text;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Load the claim (locked) + its warranty source so the permission key can be
  -- chosen by source.
  SELECT wc.status, wc.linked_return_id, wr.source_type INTO v_status, v_return_id, v_source
    FROM warranty_claims wc
    JOIN warranty_records wr ON wr.id = wc.warranty_record_id
    WHERE wc.id = p_claim_id
    FOR UPDATE OF wc;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_source = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  IF v_status IN ('resolved','void') THEN RAISE EXCEPTION 'Claim is already %', v_status USING ERRCODE='42501'; END IF;

  -- in_progress claim: reconcile its linked return so voiding can't orphan a live
  -- return (which would double-count the units against released coverage).
  IF v_status = 'in_progress' AND v_return_id IS NOT NULL THEN
    SELECT status INTO v_return_status FROM so_po_returns WHERE id = v_return_id FOR UPDATE;
    IF v_return_status IS DISTINCT FROM 'pending_inspection' THEN
      RAISE EXCEPTION 'This claim''s return has already been processed (status: %). Resolve or complete that return instead of voiding the claim.', v_return_status
        USING ERRCODE='42501';
    END IF;
    UPDATE so_po_returns SET status = 'cancelled', updated_at = now() WHERE id = v_return_id;
  END IF;

  UPDATE warranty_claims
    SET status = 'void', void_reason = btrim(p_reason), voided_by = v_profile, voided_at = now(), updated_at = now()
    WHERE id = p_claim_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_delivery_inventory(p_delivery_id uuid, p_so_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery          RECORD;
  v_cogs              RECORD;
  v_line              RECORD;
  v_wh_id             UUID;
  v_division_id       UUID;
  v_sub_container_id  UUID;
BEGIN
  SELECT warehouse_id, date, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery % is already cancelled', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;

  UPDATE sale_deliveries
  SET    status = 'cancelled', updated_at = now()
  WHERE  id = p_delivery_id;

  IF v_delivery.status = 'delivered' THEN

    SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

    -- Reverse delivered_qty on SO lines
    FOR v_line IN
      SELECT brand_variant_id, item_name, qty_delivered
      FROM sale_delivery_lines
      WHERE sale_delivery_id = p_delivery_id
    LOOP
      CONTINUE WHEN v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

      IF v_line.brand_variant_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_line.brand_variant_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = v_line.item_name
          ORDER  BY id
          LIMIT  1
        );
      END IF;

      IF v_line.brand_variant_id IS NOT NULL THEN
        UPDATE inventory_item_brand_variants
           SET reserved_qty = reserved_qty + v_line.qty_delivered, updated_at = now()
         WHERE id = v_line.brand_variant_id;
      END IF;
    END LOOP;

    -- Restore FIFO layers from cogs_entries, per-layer sub_container_id
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost, source_id
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id AND qty > 0
    LOOP
      -- Restore to the SAME sub-container the drained layer came from
      v_sub_container_id := NULL;
      IF v_cogs.source_id IS NOT NULL THEN
        SELECT sub_container_id INTO v_sub_container_id
        FROM   public.fifo_cost_layers
        WHERE  id = v_cogs.source_id;
      END IF;

      -- Fallback if the original layer was purged (rare): re-derive
      IF v_sub_container_id IS NULL AND v_division_id IS NOT NULL THEN
        v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
      END IF;

      IF v_sub_container_id IS NULL THEN
        RAISE EXCEPTION 'Cannot restore FIFO layer for variant %: no sub-container resolvable (original layer purged and SO has no division)', v_cogs.brand_variant_id;
      END IF;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, sub_container_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, v_sub_container_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost - COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0), COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0), v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_item_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    DELETE FROM cogs_entries WHERE sale_delivery_id = p_delivery_id;

    -- Revert SO status
    UPDATE sale_orders
    SET    status = CASE
             WHEN EXISTS (
               SELECT 1 FROM sale_order_lines
               WHERE sale_order_id = p_so_id AND COALESCE(delivered_qty, 0) > 0
             ) THEN 'partial_delivery'::sale_order_status
             ELSE 'confirmed'::sale_order_status
           END,
           updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('delivered', 'partial_delivery');
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_set_item_divisions(p_item_id uuid, p_division_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _user_can_write_catalog(_current_user_data_id()) then
    raise exception 'not authorized';
  end if;
  -- Remove divisions no longer selected.
  delete from public.inventory_item_divisions
   where item_id = p_item_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  -- Add newly selected divisions; keep existing rows (and their category overlay)
  -- untouched via ON CONFLICT DO NOTHING. New rows file under the item's canonical
  -- category (Phase 2 will let the dialog set a per-division category).
  insert into public.inventory_item_divisions (item_id, division_id, category_id, created_by)
  select p_item_id, d, (select category_id from public.inventory_items where id = p_item_id), _current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (item_id, division_id) do nothing;
end;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_cancelled_by_profile_id uuid, p_cancelled_by_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.transfer.create') AND NOT public._auth_user_has_permission('warehouse.transfer.approve') THEN RAISE EXCEPTION 'Not authorized to cancel transfers' USING ERRCODE = '42501'; END IF;
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         created_by_profile_id, from_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be cancelled — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  IF v_transfer.created_by_profile_id != p_cancelled_by_profile_id
     AND NOT has_inventory_manager_role(p_cancelled_by_profile_id) THEN
    RAISE EXCEPTION 'Only the creator or an Inventory Manager can cancel a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'cancelled',
      cancelled_by_profile_id = p_cancelled_by_profile_id,
      cancelled_by_name = p_cancelled_by_name,
      cancelled_at = now()
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT SUM(ABS(qty) * ABS(unit_cost)) / NULLIF(SUM(ABS(qty)), 0) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out';

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer cancelled — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id       uuid;
  v_category      text;
  v_effective     text;
  v_division_id   uuid;
  v_has_override  boolean;
  v_unit_division uuid;
  v_ri_id         uuid;
  v_qty           int := COALESCE(NEW.qty, 0)::int;
  v_receival_id   uuid;
  v_unit_cost     numeric := COALESCE(NEW.total_unit_cost, NEW.unit_cost);
  i               int;
BEGIN
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ic.type::text
    INTO v_item_id, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  -- The division this layer landed in (its sub-container's division). NULL when
  -- the sub-container is division-less — tool_effective_mode() then falls back
  -- to the category mode, i.e. exactly the pre-per-division behavior.
  SELECT sc.division_id INTO v_division_id
  FROM warehouse_sub_containers sc
  WHERE sc.id = NEW.sub_container_id;

  -- Route by EFFECTIVE mode of (item, this division). Non-tools and divisions
  -- where the tool is bulk fall through to the qty/FIFO machinery (no units).
  v_effective := public.tool_effective_mode(v_item_id, v_division_id)::text;
  IF v_category IS NULL OR v_category <> 'tools' OR v_effective <> 'serialized' THEN
    RETURN NEW;
  END IF;

  -- Scope the spawned units to the receival division ONLY when the serialization
  -- comes from an explicit per-(item,division) override. For a plain serialized
  -- CATEGORY (no override) keep the shipped behavior: NULL division, established
  -- on first team assign — zero change for existing serialized tools.
  SELECT (iid.tool_tracking_mode IS NOT NULL) INTO v_has_override
  FROM inventory_item_divisions iid
  WHERE iid.item_id = v_item_id AND iid.division_id = v_division_id
  LIMIT 1;
  v_unit_division := CASE
    WHEN v_has_override IS TRUE AND v_division_id IS NOT NULL THEN v_division_id
    ELSE NULL
  END;

  BEGIN
    v_receival_id := NEW.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_receival_id := NULL;
  END;

  IF v_receival_id IS NOT NULL THEN
    SELECT ri.id INTO v_ri_id
    FROM receival_items ri
    WHERE ri.receival_id = v_receival_id
      AND ri.brand_variant_id = NEW.brand_variant_id
    LIMIT 1;
  END IF;

  -- Insert v_qty placeholder rows with NULL serial. UI shows them as
  -- "pending serial" and disables assignment until confirmed. unit_cost carries
  -- the layer's landed per-unit cost so each unit knows what it cost.
  FOR i IN 1..v_qty LOOP
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand, unit_cost, division_id
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default', v_unit_cost, v_unit_division
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let this trigger fail the receival — log and continue.
  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Tool Unit Auto-Create Failed',
    'inventory',
    'brand_variant',
    NEW.brand_variant_id,
    'system',
    'warning',
    jsonb_build_object(
      'sqlstate',      SQLSTATE,
      'sqlerrm',       SQLERRM,
      'receival_id',   NEW.receival_id,
      'brand_variant', NEW.brand_variant_id,
      'qty',           NEW.qty
    )::text
  );
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_tool_tracking_mode_switch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_units int;
  v_qty   numeric;
BEGIN
  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM OLD.tool_tracking_mode THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  JOIN inventory_items ii ON ii.id = tau.item_id
  WHERE ii.category_id = NEW.id;

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_items ii
  JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  WHERE ii.category_id = NEW.id;

  -- Corrective exception: serialized -> bulk with ONLY bulk qty (no serial units).
  IF (v_units > 0 OR v_qty > 0)
     AND NOT (NEW.tool_tracking_mode = 'bulk'::public.tool_tracking_mode AND v_units = 0) THEN
    RAISE EXCEPTION
      'Cannot switch tracking mode while the category holds stock: % asset unit(s), % qty on hand. Empty the category first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_and_confirm_delivery(p_so_id uuid, p_warehouse_id uuid, p_warehouse_name text, p_date date, p_items jsonb, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, delivery_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
  v_line            JSONB;
BEGIN
  IF NOT public._auth_user_has_permission('sales.deliveries.create') AND NOT public._auth_user_has_permission('sales.deliveries.manage') THEN RAISE EXCEPTION 'Not authorized to create deliveries' USING ERRCODE = '42501'; END IF;
  v_delivery_number := public.next_delivery_number();

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status, created_by, created_by_name
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending',
    public._current_user_data_id(),
    (SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id())
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_id,
      CASE WHEN v_line->>'brand_variant_id' IS NOT NULL
           AND v_line->>'brand_variant_id' <> 'null'
           THEN (v_line->>'brand_variant_id')::uuid END,
      COALESCE(v_line->>'item_name', 'Item'),
      NULLIF(v_line->>'sku', ''),
      COALESCE((v_line->>'qty_delivered')::integer, 0)
    );
  END LOOP;

  PERFORM complete_delivery_inventory(v_new_id, p_so_id, p_sub_container_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return             RECORD;
  v_line               RECORD;
  v_cogs               RECORD;
  v_qty_remaining      int;
  v_qty_this_chunk     numeric;
  v_available_qty      numeric;
  v_pending_insp       int;
  v_line_warehouse     uuid;
  v_line_sub_container uuid;
  v_fallback_division  uuid;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage') OR public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to restock returns' USING ERRCODE = '42501'; END IF;
  SELECT id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status <> 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  END IF;

  IF v_return.source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  END IF;

  SELECT count(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes,
           sale_delivery_line_id
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
      AND  condition = 'good'
  LOOP
    IF v_line.sale_delivery_line_id IS NULL THEN
      RAISE EXCEPTION 'Return line % has no sale_delivery_line_id link; cannot derive restock destination.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.b. Contact ops to reconcile.';
    END IF;

    SELECT sd.warehouse_id,
           fcl.sub_container_id
    INTO   v_line_warehouse, v_line_sub_container
    FROM   public.sale_delivery_lines sdl
    JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
    JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                         AND ce.brand_variant_id = sdl.brand_variant_id
    JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
    WHERE  sdl.id = v_line.sale_delivery_line_id
    ORDER  BY ce.created_at ASC
    LIMIT  1;

    -- Fallback for pre-D.3 deliveries. Phase E: division-derive cascade
    -- runs return → sale_order → cogs_entries. Warehouse-based fallback
    -- is gone (warehouses.division_id was dropped in Phase E).
    IF v_line_warehouse IS NULL OR v_line_sub_container IS NULL THEN
      SELECT sd.warehouse_id
      INTO   v_line_warehouse
      FROM   public.sale_delivery_lines sdl
      JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
      WHERE  sdl.id = v_line.sale_delivery_line_id;

      IF v_line_warehouse IS NULL THEN
        RAISE EXCEPTION 'Return line %: cannot resolve warehouse from delivery_line %.',
          v_line.id, v_line.sale_delivery_line_id;
      END IF;

      v_fallback_division := v_return.division_id;

      IF v_fallback_division IS NULL THEN
        SELECT so.division_id
        INTO   v_fallback_division
        FROM   public.sale_orders so
        WHERE  so.id = v_return.source_id;
      END IF;

      -- Phase E follow-up: cogs_entries.division_id is preserved and
      -- reliably populated on every delivery COGS row, so it's the last
      -- and most permissive fallback before we give up.
      IF v_fallback_division IS NULL THEN
        SELECT ce.division_id
        INTO   v_fallback_division
        FROM   public.cogs_entries ce
        WHERE  ce.sale_order_id      = v_return.source_id
          AND  ce.brand_variant_id   = v_line.brand_variant_id
          AND  ce.division_id IS NOT NULL
        ORDER  BY ce.date ASC, ce.created_at ASC
        LIMIT  1;
      END IF;

      IF v_fallback_division IS NULL THEN
        RAISE EXCEPTION 'Return line %: pre-D.3 delivery has no source_id chain AND division cannot be resolved from return, sale_order, or cogs_entries.',
          v_line.id
          USING HINT = 'Set division_id on the return, sale_order, or the delivery COGS row before restocking.';
      END IF;

      v_line_sub_container := public._find_or_create_sub_container(v_line_warehouse, v_fallback_division);
    END IF;

    SELECT coalesce(sum(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date, source_id
      FROM   cogs_entries
      WHERE  sale_order_id = v_return.source_id
        AND  brand_variant_id = v_line.brand_variant_id
        AND  qty > 0
      ORDER  BY date ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id,
        sub_container_id
      ) VALUES (
        v_line.brand_variant_id,
        v_line_warehouse,
        v_cogs.date,
        v_qty_this_chunk,
        v_cogs.unit_cost - COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0),
        COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0),
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_line_sub_container
      );

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) VALUES (
        v_line.brand_variant_id,
        v_cogs.sale_delivery_id,
        v_cogs.sale_order_id,
        -v_qty_this_chunk,
        v_cogs.unit_cost,
        -(v_qty_this_chunk * v_cogs.unit_cost),
        current_date,
        'sale_return',
        coalesce(v_return.division_id, v_cogs.division_id, v_fallback_division),
        'Reversed by return ' || v_return.return_number
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_line_warehouse,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number,
        v_line_sub_container
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + v_line.qty, updated_at = now()
     WHERE id = v_line.brand_variant_id;
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_request_damaged_writeoff(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_sub_container_id uuid, p_reason text, p_notes text, p_requested_by uuid, p_requested_by_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available   numeric;
  v_check_wh    uuid;
  v_check_active boolean;
  v_id          uuid;
  v_step        RECORD;
  v_ord         int := 0;
BEGIN IF NOT public._auth_user_has_permission('damaged_stock.on_hand.edit') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: qty must be > 0 (got %)', p_qty;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: reason is required';
  END IF;

  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub_container_id is required — pick one on the dialog.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  SELECT COALESCE(qty, 0)
    INTO v_available
    FROM public.inventory_damaged_stock
    WHERE warehouse_id     = p_warehouse_id
      AND brand_variant_id = p_brand_variant_id;

  IF COALESCE(v_available, 0) < p_qty THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, COALESCE(v_available, 0), p_qty;
  END IF;

  INSERT INTO public.stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id,
    adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name,
    source_pile
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    'write_off'::public.stock_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes, ''), '{}'::text[], 'pending_approval',
    p_requested_by, p_requested_by_name,
    'damaged'
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   public.approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER  BY step_order
  LOOP
    IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: no approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_send_damaged_stock_for_repair(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_repair_vendor_id uuid, p_expected_return_date date, p_source_division_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vendor                record;
  v_available             numeric;
  v_unit_cost             numeric;
  v_item_name             text;
  v_item_sku              text;
  v_from_sub_container_id uuid;
  v_uid                   uuid := public._current_user_data_id();
begin IF NOT public._auth_user_has_permission('damaged_stock.on_hand.edit') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  if p_qty is null or p_qty <= 0 then
    raise exception 'rpc_send_damaged_stock_for_repair: qty must be > 0 (got %)', p_qty;
  end if;
  if p_source_division_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: source_division_id is required — pick one on the dialog';
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no virtual warehouse', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no sub_container_id', p_repair_vendor_id;
  end if;
  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_stock_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  select coalesce(qty, 0), coalesce(weighted_unit_cost, 0)
    into v_available, v_unit_cost
    from public.inventory_damaged_stock
    where warehouse_id     = p_warehouse_id
      and brand_variant_id = p_brand_variant_id;

  if coalesce(v_available, 0) < p_qty then
    raise exception 'rpc_send_damaged_stock_for_repair: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, coalesce(v_available, 0), p_qty;
  end if;

  -- Human-readable labels for the transfer_item row.
  select coalesce(ii.name_en, ''), coalesce(ii.sku, '')
    into v_item_name, v_item_sku
    from public.inventory_item_brand_variants bv
    left join public.inventory_items ii on ii.id = bv.item_id
    where bv.id = p_brand_variant_id;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, p_source_division_id);

  return public._emit_send_for_repair_transfer(
    p_warehouse_id, v_vendor.virtual_warehouse_id, p_brand_variant_id, p_qty::numeric,
    v_unit_cost, v_item_name, v_item_sku,
    v_from_sub_container_id, v_vendor.sub_container_id,
    p_repair_vendor_id, p_expected_return_date, p_notes,
    NULL::uuid,
    coalesce(p_notes, 'Ad-hoc send-for-repair from Damaged Stock On-hand'),
    v_uid
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_dispatch_custody_assign(p_transfer_id uuid, p_dispatched_by_profile_id uuid DEFAULT NULL::uuid, p_dispatched_by_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer     RECORD;
  v_uid          uuid := public._current_user_data_id();
  v_dispatcher   uuid := COALESCE(p_dispatched_by_profile_id, v_uid);
  v_item         RECORD;
  v_layer        RECORD;
  v_qty_taken    int;
  v_weighted     numeric;
  v_line_total   numeric;
BEGIN
  IF v_dispatcher IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to dispatch a custody request.';
  END IF;

  SELECT id, transfer_kind, status,
         from_warehouse_id, from_sub_container_id,
         to_warehouse_id, to_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This custody request no longer exists.';
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'This transfer is not a custody request and cannot be dispatched here.';
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'This custody request is already % — it can no longer be dispatched.', v_transfer.status;
  END IF;

  -- Permission: source WH field RP OR admin/inventory_manager.
  IF NOT public.is_field_rp_of(v_dispatcher, v_transfer.from_warehouse_id)
     AND NOT public._has_custody_admin_role(v_dispatcher) THEN
    RAISE EXCEPTION 'Only a responsible person of the source warehouse (or an admin) can dispatch this request.';
  END IF;

  -- Deduct source FIFO per line, emit transfer_out movements.
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_qty_taken := 0;
    v_line_total := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        true,                                  -- p_is_transfer
        v_transfer.from_sub_container_id
      )
    LOOP
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, source_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_transfer.from_sub_container_id,
        v_item.brand_variant_id,
        COALESCE(v_item.item_name, ''), v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id, v_layer.layer_id
      );
    END LOOP;

    IF v_qty_taken < v_item.requested_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" at the source to dispatch % — only % available.',
        COALESCE(v_item.item_name, v_item.brand_variant_id::text),
        v_item.requested_qty, v_qty_taken;
    END IF;

    v_weighted := v_line_total / NULLIF(v_qty_taken, 0);

    UPDATE public.warehouse_transfer_items
       SET dispatched_qty = v_item.requested_qty,
           unit_cost      = COALESCE(v_weighted, 0)
     WHERE id = v_item.id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                     = 'in_transit',
         dispatched_by_profile_id   = v_dispatcher,
         dispatched_by_name         = p_dispatched_by_name,
         dispatched_at              = now()
   WHERE id = p_transfer_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public._enforce_return_line_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_source public.return_source_type;
BEGIN
  SELECT source_type INTO v_source
  FROM   public.so_po_returns
  WHERE  id = NEW.return_id;

  IF v_source = 'purchase_order' AND NEW.receival_item_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.receival_item_id is required for PO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every PO-return line must reference the receival_items row it originated from.';
  END IF;

  IF v_source = 'sale_order' AND NEW.sale_delivery_line_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.sale_delivery_line_id is required for SO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every SO-return line must reference the sale_delivery_lines row it originated from.';
  END IF;

  IF v_source = 'consumption' AND NEW.consumption_line_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.consumption_line_id is required for consumption returns (return_id=%)', NEW.return_id
      USING HINT = 'Every consumption-return line must reference the consumption_lines row it originated from.';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_transfer_v2(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_date date, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text, p_from_sub_container_id uuid DEFAULT NULL::uuid, p_to_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id           UUID;
  v_transfer_number       TEXT;
  v_item                  JSONB;
  v_bv_id                 UUID;
  v_qty                   INT;
  v_available             INT;
  v_from_sub_container_id UUID;
  v_to_sub_container_id   UUID;
  v_from_count            INT;
  v_to_count              INT;
BEGIN IF p_to_sub_container_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.warehouse_sub_containers sc JOIN public.warehouses w ON w.id = sc.warehouse_id WHERE sc.id = p_to_sub_container_id AND w.warehouse_kind = 'custody' AND sc.division_id IS NOT NULL AND public.is_division_member(sc.division_id) IS NOT TRUE) THEN RAISE EXCEPTION 'destination is outside your division' USING ERRCODE = '42501'; END IF;
  IF NOT public._auth_user_has_permission('warehouse.transfer.create') THEN RAISE EXCEPTION 'Not authorized to create transfers' USING ERRCODE = '42501'; END IF;
  -- ─ Resolve source sub-container ─────────────────────────────────────
  IF p_from_sub_container_id IS NOT NULL THEN
    v_from_sub_container_id := p_from_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_from_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active;

    IF v_from_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_from_sub_container_id',
        p_from_warehouse_id;
    END IF;

    SELECT id INTO v_from_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_from_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_from_warehouse_id;
    END IF;
  END IF;

  -- ─ Resolve destination sub-container ────────────────────────────────
  IF p_to_sub_container_id IS NOT NULL THEN
    v_to_sub_container_id := p_to_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_to_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active;

    IF v_to_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_to_sub_container_id',
        p_to_warehouse_id;
    END IF;

    SELECT id INTO v_to_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_to_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_to_warehouse_id;
    END IF;
  END IF;

  v_transfer_number := generate_transfer_number();

  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name,
    from_sub_container_id, to_sub_container_id
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name,
    v_from_sub_container_id, v_to_sub_container_id
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation
    -- within the same source sub-container.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id
      AND brand_variant_id = v_bv_id
      AND sub_container_id = v_from_sub_container_id
    FOR UPDATE;

    -- Availability = (FIFO stock in the source sub-container) - (already
    -- allocated in the same sub-container). Both sides scoped to
    -- v_from_sub_container_id so a transfer can never spill into a peer
    -- sub-container's stock.
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id
     AND wsa.brand_variant_id = v_bv_id
     AND wsa.sub_container_id = v_from_sub_container_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.sub_container_id = v_from_sub_container_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_from_sub_container_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id, sub_container_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_from_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_start_warranty_claim_resolution(p_claim_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile      uuid;
  v_profile_name text;
  v_claim        RECORD;
  v_rec          RECORD;
  v_delivery_id  uuid;
  v_division     uuid;
  v_return_number text;
  v_return_id     uuid;
BEGIN
  SELECT id, full_name INTO v_profile, v_profile_name FROM user_data WHERE auth_user_id = auth.uid();

  SELECT id, claim_number, status, warranty_type, warranty_record_id, division_id, claim_qty
    INTO v_claim
    FROM warranty_claims
    WHERE id = p_claim_id
    FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  -- Permission by source: consumption claims use the consumption key (Phase 4);
  -- sale claims keep the sales key. Service / contract not built yet.
  IF v_claim.warranty_type = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSIF v_claim.warranty_type = 'sale' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'service/contract warranty resolution is not built yet' USING ERRCODE='0A000';
  END IF;

  IF v_claim.status <> 'covered' THEN
    RAISE EXCEPTION 'Only a covered claim can start resolution (status: %)', v_claim.status USING ERRCODE='42501';
  END IF;

  IF v_claim.warranty_type = 'sale' THEN
    -- ── Sales return (unchanged) ──
    SELECT id, sale_order_id, sale_delivery_line_id, brand_variant_id, item_name, sku
      INTO v_rec
      FROM warranty_records
      WHERE id = v_claim.warranty_record_id;
    IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

    SELECT sale_delivery_id INTO v_delivery_id
      FROM sale_delivery_lines
      WHERE id = v_rec.sale_delivery_line_id;

    PERFORM pg_advisory_xact_lock(hashtext('so_po_returns_return_number'));
    SELECT 'SR-' || lpad((count(*) + 1)::text, 5, '0')
      INTO v_return_number
      FROM so_po_returns
      WHERE source_type = 'sale_order';

    INSERT INTO so_po_returns (
      return_number, source_type, source_id, source_delivery_id,
      reason, status, division_id, warranty_claim_id,
      created_by, created_by_name
    ) VALUES (
      v_return_number, 'sale_order', v_rec.sale_order_id, v_delivery_id,
      'Warranty claim ' || v_claim.claim_number, 'pending_inspection', v_claim.division_id, p_claim_id,
      v_profile, v_profile_name
    )
    RETURNING id INTO v_return_id;

    INSERT INTO return_lines (
      return_id, brand_variant_id, item_name, sku, qty, condition, sale_delivery_line_id
    ) VALUES (
      v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_claim.claim_qty, 'inspection', v_rec.sale_delivery_line_id
    );

  ELSE
    -- ── Consumption return (Phase 4) ──
    SELECT id, consumption_id, consumption_line_id, brand_variant_id, item_name, sku
      INTO v_rec
      FROM warranty_records
      WHERE id = v_claim.warranty_record_id;
    IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;
    IF v_rec.consumption_id IS NULL OR v_rec.consumption_line_id IS NULL THEN
      RAISE EXCEPTION 'Consumption warranty record % is missing its consumption linkage', v_rec.id;
    END IF;

    -- The consumption return needs a division for the disposition/restock
    -- sub-container resolution (no sale-order fallback exists). Prefer the
    -- claim's division, else the consumption's.
    v_division := COALESCE(
      v_claim.division_id,
      (SELECT ce.division_id FROM consumption_entries ce WHERE ce.id = v_rec.consumption_id)
    );

    PERFORM pg_advisory_xact_lock(hashtext('so_po_returns_return_number'));
    SELECT 'CR-' || lpad((count(*) + 1)::text, 5, '0')
      INTO v_return_number
      FROM so_po_returns
      WHERE source_type = 'consumption';

    INSERT INTO so_po_returns (
      return_number, source_type, source_id,
      reason, status, division_id, warranty_claim_id,
      created_by, created_by_name
    ) VALUES (
      v_return_number, 'consumption', v_rec.consumption_id,
      'Warranty claim ' || v_claim.claim_number, 'pending_inspection', v_division, p_claim_id,
      v_profile, v_profile_name
    )
    RETURNING id INTO v_return_id;

    INSERT INTO return_lines (
      return_id, brand_variant_id, item_name, sku, qty, condition, consumption_line_id
    ) VALUES (
      v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_claim.claim_qty, 'inspection', v_rec.consumption_line_id
    );
  END IF;

  UPDATE warranty_claims
    SET status = 'in_progress', linked_return_id = v_return_id, updated_at = now()
    WHERE id = p_claim_id;

  RETURN v_return_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.allocate_landed_cost(p_lc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lc                RECORD;
  v_apply_time        TIMESTAMPTZ := now();
  v_grand_total       NUMERIC := 0;
  v_total_remaining   BIGINT  := 0;
  v_allocations       JSONB   := '[]'::JSONB;
  v_snapshot          JSONB   := '[]'::JSONB;
  v_bv                RECORD;
  v_bv_lc_share       NUMERIC;
  v_bv_remaining      BIGINT;
  v_sold              BIGINT;
  v_per_unit_lc       NUMERIC;
  v_inventory_portion NUMERIC;
  v_cogs_portion      NUMERIC;
  v_layer             RECORD;
  v_rep_layer_id      UUID;
  v_rep_division_id   UUID;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  IF v_lc.attached_receival_ids IS NULL OR array_length(v_lc.attached_receival_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has no attached receivals', v_lc.lc_number;
  END IF;

  -- QAR value base (merged from 20260816000000/20260816100000 lc_allocation_qar_value_base):
  -- convert each item to QAR at its PO's booked rate before summing so a
  -- mixed-currency LC splits correctly. COALESCE(...,1) covers inventory
  -- receivals (po_id NULL, costs already QAR).
  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1)), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
    LEFT JOIN purchase_orders po ON po.id = rv.po_id
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                    AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      -- total_value + avg_unit_cost in QAR (× PO booked rate per item).
      SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1))  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1)) / SUM(ri.qty_received)
        ELSE 0 END                          AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
    LEFT JOIN purchase_orders po ON po.id = rv.po_id
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

    -- C5 scope (hotfix): use receival_id instead of source_id. receival_id
    -- is always populated for source_type='receival' layers; source_id was
    -- not stamped by the receival RPCs and only backfilled once (2026-07-26).
    SELECT COALESCE(SUM(fcl.remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers fcl
     WHERE fcl.brand_variant_id = v_bv.brand_variant_id
       AND fcl.remaining_qty    > 0
       AND fcl.receival_id      = ANY(v_lc.attached_receival_ids);

    v_sold := GREATEST(v_bv.qty_received - v_bv_remaining, 0);

    IF v_sold <= 0 THEN
      v_inventory_portion := v_bv_lc_share;
      v_cogs_portion      := 0;
    ELSIF v_bv_remaining <= 0 THEN
      v_inventory_portion := 0;
      v_cogs_portion      := v_bv_lc_share;
    ELSE
      v_inventory_portion := ROUND(v_bv_remaining * v_per_unit_lc, 2);
      v_cogs_portion      := v_bv_lc_share - v_inventory_portion;
    END IF;

    INSERT INTO landed_cost_item_allocations (
      landed_cost_id, brand_variant_id, item_name, sku,
      qty_received, qty_remaining_at_lc, sold_qty,
      original_unit_cost, lc_per_unit, updated_unit_cost,
      allocated_lc_total, inventory_portion, cogs_portion
    ) VALUES (
      p_lc_id, v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
      v_bv.qty_received, v_bv_remaining, v_sold,
      ROUND(v_bv.avg_unit_cost, 4),
      ROUND(COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv_lc_share, 2),
      ROUND(v_inventory_portion, 2),
      ROUND(v_cogs_portion, 2)
    );

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',     v_bv.brand_variant_id,
      'item_name',            v_bv.item_name,
      'sku',                  v_bv.sku,
      'qty_received',         v_bv.qty_received,
      'qty_remaining_at_lc',  v_bv_remaining,
      'sold_qty',             v_sold,
      'original_unit_cost',   ROUND(v_bv.avg_unit_cost, 4),
      'per_unit_lc',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'lc_per_unit',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'inventory_portion',    ROUND(v_inventory_portion, 2),
      'cogs_portion',         ROUND(v_cogs_portion, 2),
      'allocated_lc_total',   ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',    ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      'allocated_cost',       ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    IF v_bv_remaining > 0 AND COALESCE(v_per_unit_lc, 0) <> 0 THEN
      FOR v_layer IN
        SELECT fcl.id, fcl.warehouse_id, fcl.sub_container_id, fcl.remaining_qty
          FROM fifo_cost_layers fcl
         WHERE fcl.brand_variant_id = v_bv.brand_variant_id
           AND fcl.remaining_qty    > 0
           AND fcl.receival_id      = ANY(v_lc.attached_receival_ids)
         FOR UPDATE
      LOOP
        UPDATE fifo_cost_layers
           SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
               total_unit_cost      = total_unit_cost      + v_per_unit_lc
         WHERE id = v_layer.id;

        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'layer_id',          v_layer.id::TEXT,
          'brand_variant_id',  v_bv.brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ));

        INSERT INTO inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost,
          reference_type, reference_id, source_id, notes
        ) VALUES (
          v_layer.warehouse_id,
          v_layer.sub_container_id,
          v_bv.brand_variant_id,
          v_bv.item_name,
          NULLIF(v_bv.sku, ''),
          'cost_adjustment',
          v_layer.remaining_qty,
          v_per_unit_lc,
          'landed_cost',
          p_lc_id,
          v_layer.id,
          'LC ' || v_lc.lc_number || ': '
            || ROUND(v_per_unit_lc, 4) || ' ' || v_lc.currency
            || ' × ' || v_layer.remaining_qty || ' remaining units'
        );
      END LOOP;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);
      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;

    IF v_sold > 0 THEN
      -- Attribute the retroactive LC-COGS to the division where the goods were
      -- received (sub-container division of this variant's LC receival layers)
      -- and point source_id at a representative layer, so rpc_report_pnl can
      -- division/warehouse-scope it. Sold-out layers still exist (remaining_qty
      -- may be 0), so this resolves even when nothing remains in stock.
      SELECT fcl.id, wsc.division_id
        INTO v_rep_layer_id, v_rep_division_id
        FROM fifo_cost_layers fcl
        LEFT JOIN warehouse_sub_containers wsc ON wsc.id = fcl.sub_container_id
       WHERE fcl.brand_variant_id = v_bv.brand_variant_id
         AND fcl.source_type      = 'receival'
         AND fcl.receival_id      = ANY(v_lc.attached_receival_ids)
       ORDER BY fcl.qty DESC NULLS LAST
       LIMIT 1;

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
        qty, unit_cost, total_cost, date, notes, source_type,
        division_id, source_id
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units',
        'landed_cost',
        v_rep_division_id, v_rep_layer_id
      );
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET applied_at       = v_apply_time,
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = v_apply_time
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$function$;
CREATE OR REPLACE FUNCTION public.generate_invoice_from_so(p_so_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
  v_delivered_subtotal NUMERIC;
  v_delivered_total    NUMERIC;
BEGIN
  IF NOT public._auth_user_has_permission('sales.invoices.create') AND NOT public._auth_user_has_permission('sales.invoices.manage') THEN RAISE EXCEPTION 'Not authorized to create invoices' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (
    SELECT 1 FROM so_invoices
    WHERE  sale_order_id = p_so_id
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.division_id,
    so.subtotal,
    so.total                            AS total_amount,
    CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('confirmed', 'partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_invoiceable';
  END IF;

  SELECT COALESCE(SUM(sol.delivered_qty * sol.unit_price), 0)
    INTO v_delivered_subtotal
    FROM sale_order_lines sol
   WHERE sol.sale_order_id = p_so_id;
  v_delivered_total := round(v_delivered_subtotal * COALESCE(v_so.total_amount / NULLIF(v_so.subtotal, 0), 1), 2);
  IF v_delivered_subtotal <= 0 THEN
    RAISE EXCEPTION 'nothing_delivered';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  direction   = 'incoming'
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_delivered_total THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  v_invoice_id_str := v_so.so_number || '-I';

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO so_invoices (
    invoice_id, customer_id, sale_order_id,
    division_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', v_payment_status::public.invoice_payment_status, false,
    v_delivered_total, v_delivered_subtotal, v_paid_amount,
    v_issued_date, v_due_date,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  -- Explicit FX recompute — the AFTER trigger only fires for source_type
  -- IN ('purchase_order','sale_order'). Post-remap the payments are
  -- 'invoice', so the trigger skips them and the SO would keep stale
  -- exchange_gain / exchange_loss values. Force one more recompute here.
  PERFORM public.rpc_recompute_document_fx('sale_order', p_so_id);

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
  SELECT v_new_inv_id, sol.item_name, sol.delivered_qty, sol.unit_price, round(sol.delivered_qty * sol.unit_price, 2), sol.brand_variant_id
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id AND sol.delivered_qty > 0;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_record_inventory_disposition(p_return_id uuid, p_warehouse_id uuid, p_dispositions jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disp         jsonb;
  v_disp_line_id uuid;
  v_disp_type    text;
  v_disp_qty     numeric;
  v_return_line  record;
  v_mov_id       uuid;
  v_unit_cost    numeric;
  v_count        int := 0;
  v_disp_id      uuid;
  v_return_div   uuid;
  v_sub          uuid;
begin
  if not exists (
    select 1 from public.so_po_returns
    where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_record_inventory_disposition: return % not found', p_return_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_record_inventory_disposition: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_dispositions) <> 'array' or jsonb_array_length(p_dispositions) = 0 then
    raise exception 'rpc_record_inventory_disposition: p_dispositions must be a non-empty array';
  end if;

  for v_disp in select * from jsonb_array_elements(p_dispositions) loop
    v_disp_line_id := (v_disp->>'return_line_id')::uuid;
    v_disp_type    := v_disp->>'type';
    v_disp_qty     := (v_disp->>'qty')::numeric;

    if v_disp_type = 'write_off' then
      select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.return_id
        into v_return_line
        from public.return_lines rl
        where rl.id = v_disp_line_id;
      if v_return_line.item_name is null then
        raise exception 'rpc_record_inventory_disposition: return_line % not found', v_disp_line_id;
      end if;
      if v_return_line.return_id <> p_return_id then
        raise exception 'rpc_record_inventory_disposition: return_line % does not belong to return %', v_disp_line_id, p_return_id;
      end if;

      v_unit_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

      -- Phase 3a: resolve the return division + a destination sub-container.
      -- inventory_stock_movements.sub_container_id is NOT NULL; the previous insert
      -- omitted it and broke on a schema drift, so no write-off could be recorded.
      -- Sale returns are commonly created with a NULL division_id, so fall back to
      -- the source sale order's division (mirrors rpc_create_partial_replacement).
      -- On a real (non-virtual) warehouse a NULL division is rejected by
      -- _enforce_sub_container_division_rule, so resolve it before creating the sub.
      select coalesce(r.division_id, so.division_id)
        into v_return_div
        from public.so_po_returns r
        left join public.sale_orders so
          on so.id = r.source_id and r.source_type = 'sale_order'
        where r.id = p_return_id;
      if v_return_div is null then
        raise exception 'rpc_record_inventory_disposition: write_off cannot resolve division from return or sale order for warehouse %.', p_warehouse_id
          using hint = 'Set division_id on the return or its sale order before writing off.';
      end if;
      v_sub := public._find_or_create_sub_container(p_warehouse_id, v_return_div);

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_sub, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
        v_unit_cost,
        'return', p_return_id,
        coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
      ) returning id into v_mov_id;

      select public._record_inventory_disposition(
        p_return_line_id              => v_disp_line_id,
        p_disposition_type            => 'write_off',
        p_qty                         => v_disp_qty,
        p_inventory_stock_movement_id => v_mov_id
      ) into v_disp_id;

      -- Phase 3a: emit the damaged_write_off movement the P&L Scrap line reads
      -- (only a P&L-invisible sale_return_damaged stock movement was written
      -- before), and reverse the sale COGS (full-line reversal — cost -> scrap).
      insert into public.inventory_damaged_movements (
        movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
        source_return_line_disposition_id, notes, created_by, division_id
      ) values (
        'damaged_write_off', v_disp_qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
        v_disp_id, coalesce(v_return_line.condition_notes, 'Written off on customer return'),
        public._current_user_data_id(), v_return_div
      );
      perform public._reverse_sale_cogs_for_return(p_return_id, v_return_line.brand_variant_id, v_disp_qty);

    elsif v_disp_type = 'restock_as_damaged' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'restock_as_damaged',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    elsif v_disp_type = 'send_for_repair' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'send_for_repair',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    else
      raise exception 'rpc_record_inventory_disposition: unknown disposition type %', v_disp_type;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public._maybe_close_return(p_return_id);
  end if;
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_complete_return_inspection(p_return_id uuid, p_splits jsonb, p_restock_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return         RECORD;
  v_split          RECORD;
  v_line           RECORD;
  v_seen_lines     UUID[] := ARRAY[]::UUID[];
  v_pending_insp   INT;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage')
       OR public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')
       OR public._auth_user_has_permission('consumption.returns.create') OR public._auth_user_has_permission('consumption.returns.manage')) THEN
    RAISE EXCEPTION 'Not authorized to complete return inspection' USING ERRCODE = '42501';
  END IF;
  SELECT id, status, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.status <> 'pending_inspection' THEN
    RAISE EXCEPTION 'Return % must be status=pending_inspection to complete inspection (got %)',
      v_return.return_number, v_return.status;
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
  END IF;

  FOR v_split IN
    SELECT
      (elem->>'return_line_id')::uuid   AS line_id,
      COALESCE((elem->>'good_qty')::int, 0)     AS good_qty,
      COALESCE((elem->>'damaged_qty')::int, 0)  AS damaged_qty,
      NULLIF(elem->>'condition_notes', '')      AS condition_notes
    FROM jsonb_array_elements(p_splits) AS elem
  LOOP
    SELECT * INTO v_line
    FROM   return_lines
    WHERE  id = v_split.line_id
      AND  return_id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return line % not found on return %', v_split.line_id, v_return.return_number;
    END IF;

    IF v_line.condition <> 'inspection' THEN
      RAISE EXCEPTION 'Return line % is not an inspection line (condition=%)',
        v_line.id, v_line.condition;
    END IF;

    IF v_split.good_qty < 0 OR v_split.damaged_qty < 0 THEN
      RAISE EXCEPTION 'Return line %: good_qty and damaged_qty must be non-negative', v_line.id;
    END IF;

    IF (v_split.good_qty + v_split.damaged_qty) <> v_line.qty THEN
      RAISE EXCEPTION 'Return line %: good_qty (%) + damaged_qty (%) must equal original qty (%)',
        v_line.id, v_split.good_qty, v_split.damaged_qty, v_line.qty;
    END IF;

    v_seen_lines := array_append(v_seen_lines, v_line.id);

    IF v_split.good_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id, consumption_line_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.good_qty, 'good', NULL,
        v_line.sale_delivery_line_id, v_line.receival_item_id, v_line.consumption_line_id
      );
    END IF;

    IF v_split.damaged_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id, consumption_line_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.damaged_qty, 'damaged',
        COALESCE(v_split.condition_notes, v_line.condition_notes),
        v_line.sale_delivery_line_id, v_line.receival_item_id, v_line.consumption_line_id
      );
    END IF;

    DELETE FROM return_lines WHERE id = v_line.id;
  END LOOP;

  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % still has % inspection line(s) not covered by the splits',
      v_return.return_number, v_pending_insp;
  END IF;

  UPDATE so_po_returns
  SET    restock_warehouse_id = p_restock_warehouse_id,
         status               = 'received',
         updated_at           = now()
  WHERE  id = p_return_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_purchase_aging_report()
 RETURNS TABLE(supplier_id uuid, supplier_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    b.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN b.due_date >= CURRENT_DATE THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE - 90 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_over_90,
    COALESCE(SUM((b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM bills b
  JOIN suppliers s ON s.id = b.supplier_id
  WHERE b.payment_status != 'paid'
    AND b.total_amount - b.paid_amount > 0
  GROUP BY b.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$function$;
CREATE OR REPLACE FUNCTION public._record_inventory_disposition(p_return_line_id uuid, p_disposition_type text, p_qty numeric, p_inventory_stock_movement_id uuid DEFAULT NULL::uuid, p_warehouse_transfer_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_condition     text;
  v_remaining     numeric;
  v_return_id     uuid;
  v_brand_variant uuid;
  v_unit_cost     numeric;
  v_new_id        uuid;
  v_division      uuid;
  v_uid           uuid := public._current_user_data_id();
begin
  if p_disposition_type not in ('write_off','restock_as_damaged','send_for_repair') then
    raise exception '_record_inventory_disposition: invalid disposition_type %', p_disposition_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_inventory_disposition: qty must be > 0 (got %)', p_qty;
  end if;

  select rl.condition, p.inventory_remaining_qty, p.return_id, p.brand_variant_id
    into v_condition, v_remaining, v_return_id, v_brand_variant
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.id = p_return_line_id;
  if v_condition is null then
    raise exception '_record_inventory_disposition: return_line % not found', p_return_line_id;
  end if;
  if v_condition <> 'damaged' then
    raise exception '_record_inventory_disposition: return_line % is not damaged (condition=%)', p_return_line_id, v_condition;
  end if;
  if p_qty > coalesce(v_remaining, 0) then
    raise exception '_record_inventory_disposition: qty % exceeds inventory remaining %', p_qty, coalesce(v_remaining, 0);
  end if;

  if p_disposition_type = 'restock_as_damaged' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for restock_as_damaged';
  end if;
  if p_disposition_type = 'send_for_repair' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for send_for_repair (needed by rpc_send_damaged_for_repair follow-up)';
  end if;

  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  if p_disposition_type = 'restock_as_damaged' then
    v_unit_cost := public._return_line_fifo_unit_cost(v_return_id, p_return_line_id, p_qty);

    -- Division = the return's division (so a damaged restock attributes to it).
    select r.division_id into v_division from public.so_po_returns r where r.id = v_return_id;

    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by, division_id)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, v_uid, v_division);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_brand_variant, p_qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by, division_id)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, v_uid, v_division
    );

    -- Phase 3a: reverse the sale COGS for the disposed qty (full-line
    -- reversal; the cost moves from sold -> damaged asset). The helper
    -- no-ops for non-sale-sourced returns.
    perform public._reverse_sale_cogs_for_return(v_return_id, v_brand_variant, p_qty);
  end if;

  return v_new_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.revert_landed_cost(p_lc_id uuid, p_performer_name text DEFAULT 'System'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lc      RECORD;
  v_layer   JSONB;
  v_bv_ids  UUID[] := '{}';
  v_bv_id   UUID;
  v_now     TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;

  IF v_lc.revert_snapshot IS NOT NULL AND jsonb_array_length(v_lc.revert_snapshot) > 0 THEN
    FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit - (v_layer->>'lc_per_unit_delta')::NUMERIC,
             total_unit_cost      = total_unit_cost      - (v_layer->>'lc_per_unit_delta')::NUMERIC
       WHERE id = (v_layer->>'layer_id')::UUID;

      v_bv_id := (v_layer->>'brand_variant_id')::UUID;
      IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
        v_bv_ids := v_bv_ids || v_bv_id;
      END IF;
    END LOOP;

    FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
      PERFORM recalc_average_cost(v_bv_id);
    END LOOP;

    DELETE FROM inventory_stock_movements
    WHERE reference_type = 'landed_cost'
      AND reference_id   = p_lc_id
      AND movement_type  = 'cost_adjustment';
  END IF;

  DELETE FROM cogs_entries
    WHERE landed_cost_id = p_lc_id
      AND source_type IN ('landed_cost', 'landed_cost_reversal');

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$function$;

-- ===================================================================
-- SECTION 5 — triggers: 6 missing
-- ===================================================================
DROP TRIGGER IF EXISTS trg_guard_tool_unit_serialized_division ON public.tool_asset_units;
CREATE TRIGGER trg_guard_tool_unit_serialized_division BEFORE INSERT OR UPDATE ON public.tool_asset_units FOR EACH ROW EXECUTE FUNCTION guard_tool_unit_serialized_division();
DROP TRIGGER IF EXISTS trg_guard_item_division_tracking_mode_switch ON public.inventory_item_divisions;
CREATE TRIGGER trg_guard_item_division_tracking_mode_switch BEFORE INSERT OR UPDATE ON public.inventory_item_divisions FOR EACH ROW EXECUTE FUNCTION guard_item_division_tracking_mode_switch();
DROP TRIGGER IF EXISTS trg_autostick_item_division ON public.fifo_cost_layers;
CREATE TRIGGER trg_autostick_item_division AFTER INSERT ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION _autostick_item_division();
DROP TRIGGER IF EXISTS trg_sync_role_name_to_approval_tiers ON public.custom_roles;
CREATE TRIGGER trg_sync_role_name_to_approval_tiers AFTER DELETE OR UPDATE OF name, deleted_at ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION sync_role_name_to_approval_tiers();
DROP TRIGGER IF EXISTS trg_stamp_sale_delivery_creator ON public.sale_deliveries;
CREATE TRIGGER trg_stamp_sale_delivery_creator BEFORE INSERT ON public.sale_deliveries FOR EACH ROW EXECUTE FUNCTION _stamp_sale_delivery_creator();
DROP TRIGGER IF EXISTS trg_tool_scrap_on_adjustment ON public.stock_adjustments;
CREATE TRIGGER trg_tool_scrap_on_adjustment AFTER UPDATE OF status ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION _apply_tool_scrap_on_adjustment();

-- ===================================================================
-- SECTION 6 — indexes: 135 missing
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_check_log_check_id ON public.inventory_check_log USING btree (check_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id ON public.stock_adjustments USING btree (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_linked_return_id ON public.warranty_claims USING btree (linked_return_id);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_virtual_warehouse_id ON public.repair_vendors USING btree (virtual_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_payments_method_id ON public.payments USING btree (method_id);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quotes_currency_id ON public.po_rfq_quotes USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_project_disciplines_discipline_id ON public.project_disciplines USING btree (discipline_id);
CREATE INDEX IF NOT EXISTS idx_user_company_divisions_division_id ON public.user_company_divisions USING btree (division_id);
CREATE INDEX IF NOT EXISTS idx_receival_edit_requests_approved_by ON public.receival_edit_requests USING btree (approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_sub_container_id ON public.stock_adjustments USING btree (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_by ON public.bill_attachments USING btree (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_assignment_id ON public.inventory_check_items USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_previous_group_id ON public.customer_credit_group_requests USING btree (previous_group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_check_id ON public.inventory_check_items USING btree (check_id);
CREATE INDEX IF NOT EXISTS idx_payments_currency_id ON public.payments USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_division_id ON public.so_po_returns USING btree (division_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON public.suppliers USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_installments_plan_id ON public.payment_installments USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_data_active_division_id ON public.user_data USING btree (active_division_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_divisions_created_by ON public.inventory_item_divisions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_receivals_carved_from_layer_id ON public.receivals USING btree (carved_from_layer_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_created_by ON public.sale_deliveries USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_bills_receival_id ON public.bills USING btree (receival_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_brand_variant_id ON public.stock_adjustments USING btree (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_invoice_line_id ON public.credit_note_lines USING btree (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_companies_currency_id ON public.companies USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_icd_division ON public.inventory_category_divisions USING btree (division_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_repair_vendor_id ON public.warehouses USING btree (repair_vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_created_by ON public.project_milestones USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_suppliers_currency_id ON public.suppliers USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_currency_id ON public.purchase_orders USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_sub_container_id ON public.warehouse_transfers USING btree (to_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warranty_records_brand_variant_id ON public.warranty_records USING btree (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_allocations_sub_container_id ON public.warehouse_stock_allocations USING btree (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_decided_by ON public.customer_credit_group_requests USING btree (decided_by);
CREATE INDEX IF NOT EXISTS idx_inventory_check_assignments_profile_id ON public.inventory_check_assignments USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_consumption_edit_requests_reviewed_by ON public.consumption_edit_requests USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_received_by_profile_id ON public.warehouse_transfers USING btree (received_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_initial_rate_captured_by ON public.purchase_orders USING btree (initial_rate_captured_by);
CREATE INDEX IF NOT EXISTS idx_inventory_check_approvals_check_id ON public.inventory_check_approvals USING btree (check_id);
CREATE INDEX IF NOT EXISTS idx_reason_lists_created_by ON public.reason_lists USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_warehouses_company_id ON public.warehouses USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_po_versions_currency_id ON public.po_versions USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_country_id ON public.suppliers USING btree (country_id);
CREATE INDEX IF NOT EXISTS idx_po_versions_submitted_by ON public.po_versions USING btree (submitted_by);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_created_by ON public.repair_vendors USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_restock_warehouse_id ON public.so_po_returns USING btree (restock_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_brand_variant_id ON public.inventory_check_items USING btree (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_stock_layers_source_return_line_id ON public.inventory_damaged_stock_layers USING btree (source_return_line_id);
CREATE INDEX IF NOT EXISTS idx_sale_order_approvals_requested_by ON public.sale_order_approvals USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_approvals_profile_id ON public.stock_adjustment_approvals USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_cancelled_by_profile_id ON public.warehouse_transfers USING btree (cancelled_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_resolved_by ON public.warehouse_item_requests USING btree (resolved_by);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_sale_order_id ON public.sale_deliveries USING btree (sale_order_id);
CREATE INDEX IF NOT EXISTS idx_sale_order_approvals_decided_by ON public.sale_order_approvals USING btree (decided_by);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_decided_by ON public.warranty_claims USING btree (decided_by);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_change_log_changed_by ON public.exchange_rate_change_log USING btree (changed_by);
CREATE INDEX IF NOT EXISTS idx_inventory_check_approvals_profile_id ON public.inventory_check_approvals USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_voided_by ON public.warranty_claims USING btree (voided_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_sub_container_id ON public.warehouse_transfer_items USING btree (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_allocations_brand_variant_id ON public.warehouse_stock_allocations USING btree (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_archived_by ON public.approval_workflow_steps USING btree (archived_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_requested_by ON public.warehouse_item_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_landed_costs_currency_id ON public.landed_costs USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_sub_container_id ON public.warehouse_transfers USING btree (from_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_credit_note_id ON public.so_po_returns USING btree (credit_note_id);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_created_by ON public.consumption_entries USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_tool_unit_inspections_custody_location_id ON public.tool_unit_inspections USING btree (custody_location_id);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_sub_container_id ON public.repair_vendors USING btree (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_sub_containers_discipline_id ON public.warehouse_sub_containers USING btree (discipline_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_requested_group_id ON public.customer_credit_group_requests USING btree (requested_group_id);
CREATE INDEX IF NOT EXISTS idx_po_edit_requests_reviewed_by ON public.po_edit_requests USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_company_divisions_created_by ON public.company_divisions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_responsible_persons_profile_id ON public.warehouse_responsible_persons USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_created_by_profile_id ON public.warehouse_transfers USING btree (created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_group_id ON public.approval_workflow_steps USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_credit_group_payment_methods_payment_method_id ON public.credit_group_payment_methods USING btree (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_created_by ON public.so_po_returns USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_role_id ON public.approval_workflow_steps USING btree (role_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_initial_rate_captured_by ON public.sale_orders USING btree (initial_rate_captured_by);
CREATE INDEX IF NOT EXISTS idx_tool_unit_assignments_returned_to_warehouse_id ON public.tool_unit_assignments USING btree (returned_to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_reorder_points_brand_variant_id ON public.warehouse_reorder_points USING btree (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_requested_by ON public.stock_adjustments USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_consumption_edit_requests_requested_by ON public.consumption_edit_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_dest_sub_container_id ON public.warehouse_item_requests USING btree (dest_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_sale_order_lines_created_by ON public.sale_order_lines USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_po_edit_requests_requested_by ON public.po_edit_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_reported_by ON public.warranty_claims USING btree (reported_by);
CREATE INDEX IF NOT EXISTS idx_payment_plans_invoice_id ON public.payment_plans USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_projects_warehouse_id ON public.projects USING btree (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_user_company_divisions_created_by ON public.user_company_divisions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_receival_edit_requests_requested_by ON public.receival_edit_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_credit_notes_source_return_id ON public.credit_notes USING btree (source_return_id);
CREATE INDEX IF NOT EXISTS idx_inventory_checks_initiated_by_profile_id ON public.inventory_checks USING btree (initiated_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_log_profile_id ON public.inventory_check_log USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_role_id ON public.user_custom_roles USING btree (role_id);
CREATE INDEX IF NOT EXISTS idx_receival_items_sub_container_id ON public.receival_items USING btree (sub_container_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_records_consumption_line ON public.warranty_records USING btree (consumption_line_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_discipline_id ON public.project_milestones USING btree (discipline_id);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_posted_by ON public.consumption_entries USING btree (posted_by);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quotes_supplier_id ON public.po_rfq_quotes USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_requested_by ON public.customer_credit_group_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_sub_containers_created_by ON public.warehouse_sub_containers USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_warranty_number_counters_division_id ON public.warranty_number_counters USING btree (division_id);
CREATE INDEX IF NOT EXISTS idx_project_disciplines_created_by ON public.project_disciplines USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_shipments_receival_id ON public.shipments USING btree (receival_id);
CREATE INDEX IF NOT EXISTS idx_projects_responsible_person_profile_id ON public.projects USING btree (responsible_person_profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_approvals_decided_by ON public.customer_credit_group_approvals USING btree (decided_by);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_stock_layers_created_by ON public.inventory_damaged_stock_layers USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_warranty_policies_created_by ON public.warranty_policies USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_category_divisions_created_by ON public.inventory_category_divisions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_landed_cost_lines_currency_id ON public.landed_cost_lines USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON public.credit_notes USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_warehouse_id ON public.sale_deliveries USING btree (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warranty_records_origin_country_id ON public.warranty_records USING btree (origin_country_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_dispatched_by_profile_id ON public.warehouse_transfers USING btree (dispatched_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_source_check_item_id ON public.stock_adjustments USING btree (source_check_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_attribute_definitions_created_by ON public.inventory_attribute_definitions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_company_divisions_currency_id ON public.company_divisions USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_receivals_source_debit_note_id ON public.receivals USING btree (source_debit_note_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_bill_id ON public.payment_plans USING btree (bill_id);
CREATE INDEX IF NOT EXISTS idx_customers_credit_group_id ON public.customers USING btree (credit_group_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_custom_roles_created_by ON public.custom_roles USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_movements_created_by ON public.inventory_damaged_movements USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source_return_line_disposition_id ON public.warehouse_transfers USING btree (source_return_line_disposition_id);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quote_items_po_line_item_id ON public.po_rfq_quote_items USING btree (po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_payment_id ON public.payment_installments USING btree (payment_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_return_id ON public.sale_deliveries USING btree (return_id);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_cancelled_by ON public.consumption_entries USING btree (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_company_divisions_company_id ON public.company_divisions USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_currency_id ON public.sale_orders USING btree (currency_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_created_by ON public.user_custom_roles USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_item_attributes_updated_by ON public.inventory_item_attributes USING btree (updated_by);

-- ===================================================================
-- SECTION 7 — constraints: 9 missing + 1 changed
-- ===================================================================
ALTER TABLE public.return_lines DROP CONSTRAINT IF EXISTS return_lines_provenance_required;
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_provenance_required CHECK (((receival_item_id IS NOT NULL) OR (sale_delivery_line_id IS NOT NULL) OR (consumption_line_id IS NOT NULL)));
ALTER TABLE public.inventory_category_divisions DROP CONSTRAINT IF EXISTS inventory_category_divisions_category_id_fkey;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_category_divisions DROP CONSTRAINT IF EXISTS inventory_category_divisions_created_by_fkey;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.inventory_category_divisions DROP CONSTRAINT IF EXISTS inventory_category_divisions_division_id_fkey;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_category_divisions DROP CONSTRAINT IF EXISTS inventory_category_divisions_pkey;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_pkey PRIMARY KEY (category_id, division_id);
ALTER TABLE public.return_lines DROP CONSTRAINT IF EXISTS return_lines_consumption_line_id_fkey;
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_consumption_line_id_fkey FOREIGN KEY (consumption_line_id) REFERENCES consumption_lines(id);
ALTER TABLE public.warranty_records DROP CONSTRAINT IF EXISTS warranty_records_consumption_id_fkey;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES consumption_entries(id) ON DELETE CASCADE;
ALTER TABLE public.warranty_records DROP CONSTRAINT IF EXISTS warranty_records_consumption_line_id_fkey;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_consumption_line_id_fkey FOREIGN KEY (consumption_line_id) REFERENCES consumption_lines(id) ON DELETE CASCADE;
ALTER TABLE public.warranty_records DROP CONSTRAINT IF EXISTS warranty_records_source_xor;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_source_xor CHECK ((((sale_delivery_line_id IS NOT NULL) AND (consumption_line_id IS NULL)) OR ((sale_delivery_line_id IS NULL) AND (consumption_line_id IS NOT NULL))));
ALTER TABLE public.stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_tool_unit_id_fkey;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES tool_asset_units(id) ON DELETE SET NULL;

-- ===================================================================
-- SECTION 8 — policies: 9 missing + 6 changed
-- ===================================================================
DROP POLICY IF EXISTS "sale_delivery_lines_read" ON public.sale_delivery_lines;
CREATE POLICY "sale_delivery_lines_read" ON public.sale_delivery_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sale_delivery_lines_write" ON public.sale_delivery_lines;
CREATE POLICY "sale_delivery_lines_write" ON public.sale_delivery_lines AS PERMISSIVE FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "landed_cost_lines_read" ON public.landed_cost_lines;
CREATE POLICY "landed_cost_lines_read" ON public.landed_cost_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "landed_cost_lines_write" ON public.landed_cost_lines;
CREATE POLICY "landed_cost_lines_write" ON public.landed_cost_lines AS PERMISSIVE FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "landed_cost_item_alloc_read" ON public.landed_cost_item_allocations;
CREATE POLICY "landed_cost_item_alloc_read" ON public.landed_cost_item_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "landed_cost_item_alloc_write" ON public.landed_cost_item_allocations;
CREATE POLICY "landed_cost_item_alloc_write" ON public.landed_cost_item_allocations AS PERMISSIVE FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "division_scope_delete_r" ON public.sale_delivery_lines;
CREATE POLICY "division_scope_delete_r" ON public.sale_delivery_lines AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
DROP POLICY IF EXISTS "division_scope_insert_r" ON public.sale_delivery_lines;
CREATE POLICY "division_scope_insert_r" ON public.sale_delivery_lines AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
DROP POLICY IF EXISTS "division_scope_select_r" ON public.sale_delivery_lines;
CREATE POLICY "division_scope_select_r" ON public.sale_delivery_lines AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
DROP POLICY IF EXISTS "division_scope_update_r" ON public.sale_delivery_lines;
CREATE POLICY "division_scope_update_r" ON public.sale_delivery_lines AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
DROP POLICY IF EXISTS "icd_select" ON public.inventory_category_divisions;
CREATE POLICY "icd_select" ON public.inventory_category_divisions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING ((profile_id = _current_user_data_id()));
DROP POLICY IF EXISTS "notifications_insert_any" ON public.notifications;
CREATE POLICY "notifications_insert_any" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((profile_id = _current_user_data_id()));
DROP POLICY IF EXISTS "notifications_update_any" ON public.notifications;
CREATE POLICY "notifications_update_any" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ===================================================================
-- SECTION 9 — views: 1 changed
-- ===================================================================
CREATE OR REPLACE VIEW public.warehouse_sub_container_totals AS  SELECT sc.warehouse_id,
    sc.id AS sub_container_id,
    sc.name AS sub_container_name,
    sc.is_active AS sub_container_is_active,
    count(DISTINCT fcl.brand_variant_id) FILTER (WHERE fcl.remaining_qty > 0) AS item_count,
    COALESCE(sum(fcl.remaining_qty) FILTER (WHERE fcl.remaining_qty > 0), 0::bigint)::numeric AS total_qty,
    COALESCE(sum(fcl.remaining_qty::numeric * fcl.total_unit_cost) FILTER (WHERE fcl.remaining_qty > 0), 0::numeric) AS total_value,
    sc.division_id,
    d.name AS division_name
   FROM warehouse_sub_containers sc
     LEFT JOIN fifo_cost_layers fcl ON fcl.sub_container_id = sc.id
     LEFT JOIN company_divisions d ON d.id = sc.division_id
  WHERE sc.is_active = true
  GROUP BY sc.warehouse_id, sc.id, sc.name, sc.is_active, sc.division_id, d.name;
COMMIT;
