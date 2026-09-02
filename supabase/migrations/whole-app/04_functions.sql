-- whole-app 04: functions (live post-repair, byte-exact via pg_get_functiondef)
SET check_function_bodies = false;

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
$function$
;

CREATE OR REPLACE FUNCTION public._auth_can_create_catalog()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._auth_user_has_permission('inventory.catalog.create')
      or public._auth_user_has_permission('inventory.catalog.manage')
$function$
;

CREATE OR REPLACE FUNCTION public._auth_can_write_catalog()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._auth_user_has_permission('inventory.catalog.create')
      or public._auth_user_has_permission('inventory.catalog.edit')
      or public._auth_user_has_permission('inventory.catalog.manage')
$function$
;

CREATE OR REPLACE FUNCTION public._auth_user_has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM user_data ud
    WHERE ud.auth_user_id = auth.uid()
      AND public._user_has_permission(ud.id, p_permission)
  );
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._check_attribute_key_branch_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conflict_category text;
BEGIN
  -- Ancestors
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, a.depth + 1
    FROM public.inventory_categories c
    JOIN ancestors a ON a.parent_id = c.id
    WHERE a.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM ancestors a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  WHERE a.depth > 1                     -- exclude the row's own category (depth 1) — that's the local UNIQUE's job
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at ancestor category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  -- Descendants
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE parent_id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, d.depth + 1
    FROM public.inventory_categories c
    JOIN descendants d ON c.parent_id = d.id
    WHERE d.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM descendants a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at descendant category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._consume_damaged_stock_fifo(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_needed numeric := p_qty;
  v_layer  record;
  v_take   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '_consume_damaged_stock_fifo: qty must be > 0 (got %)', p_qty;
  end if;

  for v_layer in
    select id, qty_remaining
      from public.inventory_damaged_stock_layers
     where warehouse_id = p_warehouse_id
       and brand_variant_id = p_brand_variant_id
       and qty_remaining > 0
     order by layered_at, id
    for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_layer.qty_remaining);
    update public.inventory_damaged_stock_layers
       set qty_remaining = qty_remaining - v_take
     where id = v_layer.id;
    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception '_consume_damaged_stock_fifo: insufficient damaged stock at % / % (short by %)',
      p_warehouse_id, p_brand_variant_id, v_needed;
  end if;

  update public.inventory_damaged_stock
     set qty = qty - p_qty,
         updated_at = now()
   where warehouse_id = p_warehouse_id
     and brand_variant_id = p_brand_variant_id;

  if not found then
    raise exception '_consume_damaged_stock_fifo: aggregate row missing at % / %', p_warehouse_id, p_brand_variant_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._consume_damaged_stock_fifo_returning(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty numeric)
 RETURNS TABLE(qty_taken numeric, unit_cost numeric, division_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_needed numeric := p_qty;
  v_layer  record;
  v_take   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '_consume_damaged_stock_fifo_returning: qty must be > 0 (got %)', p_qty;
  end if;

  for v_layer in
    select l.id, l.qty_remaining, l.unit_cost AS layer_cost, l.division_id AS layer_div
      from public.inventory_damaged_stock_layers l
     where l.warehouse_id = p_warehouse_id
       and l.brand_variant_id = p_brand_variant_id
       and l.qty_remaining > 0
     order by l.layered_at, l.id
     for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_layer.qty_remaining);
    update public.inventory_damaged_stock_layers
       set qty_remaining = qty_remaining - v_take
     where id = v_layer.id;

    qty_taken   := v_take;
    unit_cost   := v_layer.layer_cost;
    division_id := v_layer.layer_div;
    return next;

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception '_consume_damaged_stock_fifo_returning: insufficient damaged stock at % / % (short by %)',
      p_warehouse_id, p_brand_variant_id, v_needed;
  end if;

  update public.inventory_damaged_stock
     set qty = qty - p_qty, updated_at = now()
   where warehouse_id = p_warehouse_id
     and brand_variant_id = p_brand_variant_id;

  if not found then
    raise exception '_consume_damaged_stock_fifo_returning: aggregate row missing at % / %', p_warehouse_id, p_brand_variant_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._current_user_data_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.user_data WHERE auth_user_id = auth.uid() LIMIT 1;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._enforce_single_project_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_project_warehouse THEN
    UPDATE public.warehouses
    SET    is_project_warehouse = false
    WHERE  is_project_warehouse AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._enforce_sub_container_division_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_virtual boolean;
begin
  select coalesce(is_virtual, false) into v_virtual
    from public.warehouses
   where id = new.warehouse_id;

  if new.division_id is null and v_virtual = false then
    raise exception '_enforce_sub_container_division_rule: division_id required for sub-containers on real (non-virtual) warehouses (warehouse_id=%)', new.warehouse_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._find_or_create_sub_container(p_warehouse_id uuid, p_division_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id       uuid;
  v_wh_name  text;
  v_div_name text;
begin
  if p_warehouse_id is null then
    raise exception '_find_or_create_sub_container: p_warehouse_id required';
  end if;
  -- p_division_id NULL is only valid for virtual warehouses (per Option A
  -- Variant 1 design). Let the sub-container INSERT hit the
  -- _enforce_sub_container_division_rule trigger for real-warehouse enforcement.

  select id into v_id
    from public.warehouse_sub_containers
   where warehouse_id = p_warehouse_id
     and division_id is not distinct from p_division_id
     and is_active
   order by created_at
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Not found — create one.
  select name into v_wh_name  from public.warehouses         where id = p_warehouse_id;
  if p_division_id is not null then
    select name into v_div_name from public.company_divisions where id = p_division_id;
  end if;

  insert into public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by)
  values (
    p_warehouse_id,
    p_division_id,
    coalesce(v_wh_name, 'Warehouse') || case when v_div_name is null then '' else ' — ' || v_div_name end,
    true,
    public._current_user_data_id()
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._fx_document_booking(p_document_type text, p_document_id uuid, OUT o_currency text, OUT o_rate numeric, OUT o_direction text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_document_type = 'po' THEN
    SELECT currency, initial_exchange_rate, 'outgoing'
      INTO o_currency, o_rate, o_direction
      FROM public.purchase_orders WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT currency, initial_exchange_rate, 'incoming'
      INTO o_currency, o_rate, o_direction
      FROM public.sale_orders WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public._has_custody_admin_role(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles      cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.deleted_at IS NULL
      AND  (cr.name = 'inventory_manager' OR cr.is_system_admin = true)
  );
$function$
;

CREATE OR REPLACE FUNCTION public._landed_costs_block_void_after_apply()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.applied_at IS NOT NULL
     AND (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Landed cost % has been applied (%); cannot void.',
      OLD.id, OLD.applied_at
      USING HINT = 'Applied LCs are permanent — the Revert UI was removed as an ops decision.';
  END IF;
  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._payments_cap_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv_total   numeric;
  v_prior_paid  numeric;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'incoming' OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT total_amount INTO v_inv_total
    FROM so_invoices
   WHERE id = NEW.invoice_id;
  IF v_inv_total IS NULL THEN
    RETURN NEW;  -- no invoice or zero total; nothing to enforce
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_prior_paid
    FROM payments
   WHERE invoice_id = NEW.invoice_id
     AND direction = 'incoming'
     AND deleted_at IS NULL;

  -- 1 fils tolerance for FP rounding on cent-level splits.
  IF v_prior_paid + NEW.amount > v_inv_total + 0.01 THEN
    RAISE EXCEPTION 'Payment over-allocation: amount % + prior paid % exceeds invoice total %',
      NEW.amount, v_prior_paid, v_inv_total
      USING HINT = 'Reduce the payment amount or detach an existing payment first.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._po_division_weights(p_po_id uuid)
 RETURNS TABLE(division_id uuid, weight numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH vals AS (
    SELECT li.division_id AS div, SUM(COALESCE(li.total_price, 0)) AS v
    FROM public.po_line_items li
    WHERE li.po_id = p_po_id
      AND li.division_id IS NOT NULL
    GROUP BY li.division_id
    HAVING SUM(COALESCE(li.total_price, 0)) > 0
  ),
  tot AS (SELECT SUM(v) AS t FROM vals)
  SELECT vals.div, vals.v / tot.t
  FROM vals, tot
  WHERE tot.t > 0;
$function$
;

CREATE OR REPLACE FUNCTION public._record_customer_resolution(p_return_line_id uuid, p_resolution_type text, p_qty numeric, p_sale_delivery_id uuid DEFAULT NULL::uuid, p_credit_note_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_remaining numeric;
  v_new_id    uuid;
  v_return_id uuid;
begin
  if p_resolution_type not in ('refund','replacement','store_credit') then
    raise exception '_record_customer_resolution: invalid resolution_type %', p_resolution_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_customer_resolution: qty must be > 0 (got %)', p_qty;
  end if;

  select customer_remaining_qty into v_remaining
    from public.return_line_progress
    where return_line_id = p_return_line_id;
  if v_remaining is null then
    raise exception '_record_customer_resolution: return_line % not found', p_return_line_id;
  end if;
  if p_qty > v_remaining then
    raise exception '_record_customer_resolution: qty % exceeds customer remaining %', p_qty, v_remaining;
  end if;

  insert into public.return_line_customer_resolutions (
    return_line_id, resolution_type, qty,
    sale_delivery_id, credit_note_id, notes, created_by
  ) values (
    p_return_line_id, p_resolution_type, p_qty,
    p_sale_delivery_id, p_credit_note_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  -- Phase 8.1b: bump linked CN(s) from open → in_progress on first resolution.
  -- Terminal resolved flip is handled by _maybe_close_return.
  select rl.return_id into v_return_id
    from public.return_lines rl
    where rl.id = p_return_line_id;
  update public.credit_notes cn
    set status = 'in_progress'::public.credit_note_status
    where cn.source_return_id = v_return_id
      and cn.status = 'open'::public.credit_note_status;

  return v_new_id;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._repair_vendor_provision_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_repair_wh_id  uuid;
  v_new_sub_id    uuid;
BEGIN
  SELECT id INTO v_repair_wh_id
    FROM public.warehouses
   WHERE name = 'Repair' AND is_virtual = true
   LIMIT 1;

  IF v_repair_wh_id IS NULL THEN
    RAISE EXCEPTION '_repair_vendor_provision_warehouse: shared Repair warehouse missing — did the D.6.b migration run?';
  END IF;

  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active)
  VALUES
    (v_repair_wh_id, NULL, NEW.name, true)
  RETURNING id INTO v_new_sub_id;

  NEW.virtual_warehouse_id := v_repair_wh_id;
  NEW.sub_container_id     := v_new_sub_id;

  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._return_resolution_status(p_return_id uuid)
 RETURNS return_status
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when count(distinct cr.resolution_type) = 0 then null
    when count(distinct cr.resolution_type) > 1 then 'resolved_partial'::public.return_status
    when bool_and(cr.resolution_type = 'replacement') then 'resolved_replacement'::public.return_status
    when bool_and(cr.resolution_type in ('refund','store_credit')) then 'resolved_credit'::public.return_status
    else 'resolved_partial'::public.return_status
  end
  from public.return_lines rl
  join public.return_line_customer_resolutions cr on cr.return_line_id = rl.id
  where rl.return_id = p_return_id;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._sale_orders_block_bypass_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'pending_approval'
     AND NEW.status = 'confirmed'
     AND current_setting('mms.approval_active', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION
      'sale_orders: direct pending_approval → confirmed transition is not allowed. '
      'Route through approve_sales_request / force_approve_sales_request.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public._sale_orders_block_cancel_with_deliveries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bad_deliveries int;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.status IN ('partial_delivery','delivered','invoiced') THEN
      RAISE EXCEPTION
        'sale_orders: cannot cancel an SO in "%" status. Reverse the deliveries and invoices first.',
        OLD.status
        USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_bad_deliveries
      FROM public.sale_deliveries
     WHERE sale_order_id = NEW.id
       AND status <> 'pending';

    IF v_bad_deliveries > 0 THEN
      RAISE EXCEPTION
        'sale_orders: cannot cancel — % non-pending delivery record(s) exist. Reverse them first.',
        v_bad_deliveries
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public._set_lc_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lc_number IS NULL OR NEW.lc_number = '' THEN
    NEW.lc_number := 'LC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('lc_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._sync_brand_variant_damaged_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_variant_id uuid;
BEGIN
  v_variant_id := COALESCE(NEW.brand_variant_id, OLD.brand_variant_id);
  IF v_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.inventory_item_brand_variants v
  SET    damaged_qty = COALESCE((
           SELECT SUM(ds.qty)::int
           FROM   public.inventory_damaged_stock ds
           WHERE  ds.brand_variant_id = v_variant_id
         ), 0),
         updated_at  = now()
  WHERE  v.id = v_variant_id;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_credit_note_reason_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'sale_return'
      AND deleted_at IS NULL
    LIMIT 1;
    -- Silent fallback if unmatched — reason text is snapshot, FK is best-effort.
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_credit_note_refund_method_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.refund_method_id IS NULL AND NEW.refund_method IS NOT NULL THEN
    SELECT id INTO NEW.refund_method_id
    FROM public.payment_methods
    WHERE slug = NEW.refund_method;
    IF NEW.refund_method_id IS NULL THEN
      RAISE EXCEPTION 'refund_method slug % has no matching payment_methods row', NEW.refund_method;
    END IF;
  ELSIF NEW.refund_method_id IS NOT NULL AND NEW.refund_method IS NULL THEN
    SELECT slug INTO NEW.refund_method FROM public.payment_methods WHERE id = NEW.refund_method_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_currency_id_from_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.currency IS NULL THEN
    SELECT code INTO NEW.currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_currency_id_from_default_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.default_currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.default_currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.default_currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.default_currency IS NULL THEN
    SELECT code INTO NEW.default_currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_debit_note_reason_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'po_return'
      AND deleted_at IS NULL
    LIMIT 1;
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_payment_method_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.method_id IS NULL AND NEW.method IS NOT NULL THEN
    SELECT id INTO NEW.method_id FROM public.payment_methods WHERE slug = NEW.method;
    IF NEW.method_id IS NULL THEN
      RAISE EXCEPTION 'payment method slug % has no matching payment_methods row', NEW.method;
    END IF;
  ELSIF NEW.method_id IS NOT NULL AND NEW.method IS NULL THEN
    SELECT slug INTO NEW.method FROM public.payment_methods WHERE id = NEW.method_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._sync_supplier_country_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.country_id IS NULL AND NEW.country IS NOT NULL THEN
    SELECT id INTO NEW.country_id FROM public.country_codes WHERE name = NEW.country;
    IF NEW.country_id IS NULL THEN
      RAISE EXCEPTION 'country name % has no matching country_codes row', NEW.country;
    END IF;
  ELSIF NEW.country_id IS NOT NULL AND NEW.country IS NULL THEN
    SELECT name INTO NEW.country FROM public.country_codes WHERE id = NEW.country_id;
  END IF;
  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._trg_clear_active_on_division_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE user_data
     SET active_division_id = NULL
   WHERE id = OLD.profile_id
     AND active_division_id = OLD.division_id;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._trg_payments_compute_fx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_type_short text;
  v_doc_currency   text;
  v_doc_rate       numeric;
  v_direction      text;
  v_booked_qar     numeric;
  v_paid_qar       numeric;
  v_delta          numeric;
BEGIN
  -- Map payment source_type enum → short form used by our document RPCs
  v_doc_type_short := CASE NEW.source_type::text
    WHEN 'purchase_order' THEN 'po'
    WHEN 'sale_order'     THEN 'so'
    ELSE NULL
  END;

  -- Only compute for foreign-currency payments linked to a PO or SO
  IF v_doc_type_short IS NULL OR NEW.source_id IS NULL
     OR COALESCE(NEW.currency,'QAR') = 'QAR' THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  SELECT o_currency, o_rate, o_direction
    INTO v_doc_currency, v_doc_rate, v_direction
    FROM public._fx_document_booking(v_doc_type_short, NEW.source_id);

  -- Document is QAR-only or currency mismatch → no gain/loss
  IF v_doc_currency IS NULL OR v_doc_currency = 'QAR'
     OR v_doc_currency <> NEW.currency THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  v_booked_qar := NEW.amount * COALESCE(v_doc_rate, 1);
  v_paid_qar   := NEW.amount * COALESCE(NEW.exchange_rate, 1);

  IF v_direction = 'outgoing' THEN
    -- Supplier payment (PO): we paid less QAR than we booked → gain
    v_delta := v_booked_qar - v_paid_qar;
  ELSE
    -- Customer payment (SO): we received more QAR than we booked → gain
    v_delta := v_paid_qar - v_booked_qar;
  END IF;

  IF v_delta >= 0 THEN
    NEW.exchange_gain := v_delta;
    NEW.exchange_loss := 0;
  ELSE
    NEW.exchange_gain := 0;
    NEW.exchange_loss := -v_delta;
  END IF;

  NEW.amount_qar := v_paid_qar;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public._trg_payments_refresh_document_fx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
  IF current_setting('mms.fx_recompute_active', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_type := OLD.source_type::text; v_id := OLD.source_id;
  ELSE
    v_type := NEW.source_type::text; v_id := NEW.source_id;
  END IF;

  IF v_type IN ('purchase_order','sale_order') AND v_id IS NOT NULL THEN
    PERFORM public.rpc_recompute_document_fx(v_type, v_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$
;

CREATE OR REPLACE FUNCTION public._user_can_create_catalog(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._user_has_permission(p_uid, 'inventory.catalog.create')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$function$
;

CREATE OR REPLACE FUNCTION public._user_can_edit_catalog(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._user_has_permission(p_uid, 'inventory.catalog.edit')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$function$
;

CREATE OR REPLACE FUNCTION public._user_can_write_catalog(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._user_has_permission(p_uid, 'inventory.catalog.create')
      or public._user_has_permission(p_uid, 'inventory.catalog.edit')
      or public._user_has_permission(p_uid, 'inventory.catalog.manage')
$function$
;

CREATE OR REPLACE FUNCTION public._user_has_permission(p_profile_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE ucr.profile_id = p_profile_id
      AND (cr.is_system_admin = true OR p_permission = ANY(cr.permissions))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.action_stock_adjustment_step(p_step_id uuid, p_action text, p_profile_id uuid, p_profile_name text, p_notes text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_step          RECORD;
  v_warehouse_id  UUID;
  v_remaining     INTEGER;
  -- Real caller identity, derived from the JWT. The p_profile_* args are
  -- untrusted client input and are NEVER used for authorization or attribution.
  v_caller_id     UUID;
  v_caller_name   TEXT;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
  END IF;

  SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), email)
    INTO v_caller_id, v_caller_name
    FROM user_data
   WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for the authenticated user';
  END IF;

  IF p_action = 'rejected' AND COALESCE(TRIM(p_notes), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting an approval step';
  END IF;

  SELECT *
  INTO   v_step
  FROM   stock_adjustment_approvals
  WHERE  id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval step not found';
  END IF;

  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Step is not pending (current status: %)', v_step.status;
  END IF;

  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  -- AUTHZ: the REAL caller must hold this step's role (or be the warehouse RP).
  IF NOT user_can_action_adjustment_step(v_caller_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = v_caller_id,
         profile_name = v_caller_name,
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by_name  = v_caller_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM approve_stock_adjustment_inventory(
      p_adjustment_id => v_step.adjustment_id,
      p_approved_by   => v_caller_name
    );
    RETURN 'chain_completed';
  END IF;

  RETURN 'step_approved';
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, is_approval_slot, is_system_admin, permissions)
    VALUES (TRIM(p_role_name), true, false, '{}'::text[])
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[], p_group_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit','consumption_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM   custom_roles
  WHERE  name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), true, false, '{}'::text[])
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow AND step_key = v_step_key
      AND  archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit','credit_group','receival_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_workflow_step_for_role(p_workflow text, p_role_id uuid, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
      AND archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, p_role_id, v_step_key, TRIM(v_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_workflow_step_for_role(p_workflow text, p_role_id uuid, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[], p_group_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit','consumption_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM   custom_roles
  WHERE  id = p_role_id
    AND  is_approval_slot = true
    AND  deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow
      AND  role_id  = p_role_id
      AND  archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow AND step_key = v_step_key
      AND  archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.advance_po_approval_tier(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iteration  INT;
  v_next_rank  INT;
  v_all_done   BOOLEAN;
BEGIN
  -- C1: advisory lock to prevent concurrent execution for the same PO
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- C2: existence guard — bail if no approval rows exist for this PO
  IF NOT EXISTS (SELECT 1 FROM po_approvals WHERE po_id = p_po_id AND iteration = (
    SELECT COALESCE(MAX(iteration), 1) FROM po_approvals WHERE po_id = p_po_id
  )) THEN
    RETURN;
  END IF;

  -- I3: do not advance if PO is in a terminal non-pending state
  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = p_po_id AND status = 'pending_approval'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM po_approvals WHERE po_id = p_po_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM po_approvals
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND is_active = true
      AND status NOT IN ('approved')
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT MIN(tier_rank) INTO v_next_rank
  FROM po_approvals
  WHERE po_id = p_po_id
    AND iteration = v_iteration
    AND is_active = false
    AND status = 'pending';

  IF v_next_rank IS NOT NULL THEN
    UPDATE po_approvals
    SET is_active = true
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND tier_rank = v_next_rank;
  ELSE
    UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.advance_sales_approval(p_so_id uuid, p_approval_type approval_type)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iteration  INT;
  v_all_done   BOOLEAN;
  v_open_other BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_so_id::text || p_approval_type::text));

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id = p_so_id AND approval_type = p_approval_type;

  SELECT NOT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  status        <> 'approved'
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type <> p_approval_type
      AND  status        = 'pending'
  ) INTO v_open_other;

  IF NOT v_open_other THEN
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_payment_to_bill(p_payment_id uuid, p_bill_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount INTO v_bill_total
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF v_bill_total IS NULL OR v_bill_total < 0 THEN
    RAISE EXCEPTION 'Bill % has an invalid total_amount (%) — refuse allocation. Fix the bill first.',
      p_bill_id, v_bill_total;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = v_new_status::public.invoice_payment_status
   WHERE id = p_bill_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_warehouse_stock(p_brand_variant_id uuid, p_warehouse_id uuid, p_target_qty integer, p_unit_cost numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_qty    INT;
  v_delta          INT;
  v_unassigned     INT;
  v_total_fifo     INT;
  v_stock_level    INT;
  v_opening_gap    INT;
  v_to_reassign    INT;
  v_from_gap       INT;
  v_to_create      INT;
  r                RECORD;
  v_layer          RECORD;
  v_remaining      INT;
  v_take           INT;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

  IF v_delta = 0 THEN
    IF p_unit_cost > 0 THEN
      UPDATE fifo_cost_layers
      SET unit_cost       = p_unit_cost,
          total_unit_cost = p_unit_cost
      WHERE brand_variant_id = p_brand_variant_id
        AND warehouse_id     = p_warehouse_id
        AND receival_id      IS NULL
        AND remaining_qty    > 0;

      PERFORM recalc_average_cost(p_brand_variant_id);
    END IF;
    RETURN;
  END IF;

  -- ── Quantity increase (unchanged) ────────────────────────────────────────
  IF v_delta > 0 THEN

    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_total_fifo
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND remaining_qty > 0;

    SELECT stock_level INTO v_stock_level
    FROM inventory_item_brand_variants
    WHERE id = p_brand_variant_id;

    v_opening_gap := GREATEST(0, v_stock_level - v_total_fifo);

    v_to_reassign := LEAST(v_delta, v_unassigned);
    v_from_gap    := LEAST(v_delta - v_to_reassign, v_opening_gap);
    v_to_create   := v_delta - v_to_reassign - v_from_gap;

    IF v_to_reassign > 0 THEN
      v_remaining := v_to_reassign;
      FOR r IN
        SELECT id, remaining_qty
        FROM fifo_cost_layers
        WHERE brand_variant_id = p_brand_variant_id
          AND warehouse_id IS NULL
          AND remaining_qty > 0
        ORDER BY date ASC, created_at ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining = 0;
        v_take := LEAST(v_remaining, r.remaining_qty);

        IF v_take = r.remaining_qty THEN
          UPDATE fifo_cost_layers SET warehouse_id = p_warehouse_id WHERE id = r.id;
        ELSE
          UPDATE fifo_cost_layers
          SET remaining_qty = remaining_qty - v_take
          WHERE id = r.id;

          INSERT INTO fifo_cost_layers (
            brand_variant_id, warehouse_id, receival_id, receival_number,
            date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
          )
          SELECT
            brand_variant_id, p_warehouse_id, receival_id, receival_number,
            date, v_take, unit_cost, landed_cost_per_unit, total_unit_cost, v_take
          FROM fifo_cost_layers WHERE id = r.id;
        END IF;

        v_remaining := v_remaining - v_take;
      END LOOP;
    END IF;

    IF v_from_gap > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, '2000-01-01'::DATE,
        v_from_gap, p_unit_cost, 0, p_unit_cost, v_from_gap
      );
    END IF;

    IF v_to_create > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, CURRENT_DATE,
        v_to_create, p_unit_cost, 0, p_unit_cost, v_to_create
      );

      UPDATE inventory_item_brand_variants
      SET stock_level = stock_level + v_to_create, updated_at = now()
      WHERE id = p_brand_variant_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id,
      CASE
        WHEN v_to_reassign > 0 AND v_from_gap > 0 AND v_to_create > 0
          THEN format('Reassigned %s unassigned + %s opening stock + %s new', v_to_reassign, v_from_gap, v_to_create)
        WHEN v_to_reassign > 0 AND v_from_gap > 0
          THEN format('Reassigned %s unassigned + %s opening stock', v_to_reassign, v_from_gap)
        WHEN v_from_gap > 0 AND v_to_create > 0
          THEN format('Allocated %s opening stock + %s new', v_from_gap, v_to_create)
        WHEN v_from_gap > 0
          THEN format('Allocated %s units from opening stock (pre-FIFO)', v_from_gap)
        WHEN v_to_reassign > 0
          THEN format('Reassigned %s from unassigned stock', v_to_reassign)
        ELSE 'Initial stock allocation'
      END
    );

  -- ── Quantity decrease (rewritten) ────────────────────────────────────────
  ELSE
    -- One movement per layer drained. unit_cost now reflects the actual
    -- layer cost (was p_unit_cost, which was a caller-supplied number
    -- that didn't match FIFO reality).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, p_brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'initial_allocation', p_brand_variant_id,
        'Stock allocation adjustment'
      );
    END LOOP;
  END IF;

  -- Update cost on all opening-stock layers for this warehouse.
  IF p_unit_cost > 0 THEN
    UPDATE fifo_cost_layers
    SET unit_cost       = p_unit_cost,
        total_unit_cost = p_unit_cost
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id     = p_warehouse_id
      AND receival_id      IS NULL
      AND remaining_qty    > 0;
  END IF;

  PERFORM recalc_average_cost(p_brand_variant_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.append_shipment_events(p_shipment_id uuid, p_events jsonb, p_status_map jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  TEXT;
  v_current_weight  NUMERIC;
  v_max_new_weight  NUMERIC   := 0;
  v_best_new_status TEXT      := NULL;
  v_existing_events JSONB;
  v_events_to_add   JSONB     := '[]'::JSONB;
  v_updated_events  JSONB;
  v_event           JSONB;
  v_existing_evt    JSONB;
  v_hash            TEXT;
  v_ts              TEXT;
  v_loc             TEXT;
  v_status          TEXT;
  v_new_weight      NUMERIC;
  v_match_found     BOOLEAN;
  v_supersede_idx   INT;
  i                 INT;
  j                 INT;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'p_events must be a non-null JSON array';
  END IF;
  IF p_status_map IS NULL OR jsonb_typeof(p_status_map) <> 'object' THEN
    RAISE EXCEPTION 'p_status_map must be a non-null JSON object';
  END IF;

  SELECT status, events
  INTO v_current_status, v_existing_events
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing_events IS NULL THEN v_existing_events := '[]'::JSONB; END IF;

  v_current_weight := COALESCE((p_status_map->>v_current_status)::NUMERIC, 0);

  FOR i IN 0 .. jsonb_array_length(p_events) - 1 LOOP
    v_event         := p_events->i;
    v_hash          := v_event->>'hash';
    v_ts            := v_event->>'normalizedTimestamp';
    v_loc           := v_event->>'location';
    v_status        := v_event->>'status';
    v_match_found   := FALSE;
    v_supersede_idx := -1;

    FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
      v_existing_evt := v_existing_events->j;
      IF NULLIF(v_existing_evt->>'normalizedTimestamp', '')::TIMESTAMPTZ
         = NULLIF(v_ts, '')::TIMESTAMPTZ
         AND v_existing_evt->>'location' = v_loc THEN
        IF v_existing_evt->>'hash' = v_hash THEN
          v_match_found := TRUE;
          EXIT;
        ELSE
          v_supersede_idx := j;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    IF v_match_found THEN CONTINUE; END IF;

    IF v_supersede_idx >= 0 THEN
      v_updated_events := '[]'::JSONB;
      FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
        IF j = v_supersede_idx THEN
          v_updated_events := v_updated_events || jsonb_build_array(v_event);
        ELSE
          v_updated_events := v_updated_events || jsonb_build_array(v_existing_events->j);
        END IF;
      END LOOP;
      v_existing_events := v_updated_events;
    ELSE
      v_events_to_add := v_events_to_add || jsonb_build_array(v_event);
    END IF;

    IF v_status IS NOT NULL AND p_status_map ? v_status THEN
      v_new_weight := (p_status_map->>v_status)::NUMERIC;
      IF v_new_weight > v_max_new_weight THEN
        v_max_new_weight  := v_new_weight;
        v_best_new_status := v_status;
      END IF;
    END IF;
  END LOOP;

  UPDATE shipments
  SET
    events         = v_existing_events || v_events_to_add,
    is_syncing     = false,
    sync_error     = NULL,
    status         = CASE
                       WHEN v_best_new_status IS NOT NULL
                            AND v_max_new_weight > v_current_weight
                            AND v_best_new_status IN ('booked','in_transit','customs','delayed','delivered')
                       THEN v_best_new_status::shipment_status
                       ELSE status
                     END,
    updated_at     = NOW(),
    last_synced_at = NOW()
  WHERE id = p_shipment_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_adjustment(p_adjustment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj    RECORD;
  v_qty    INT;
  v_bv     RECORD;
BEGIN
  SELECT * INTO v_adj
  FROM inventory_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_adj.status <> 'pending' THEN
    RAISE EXCEPTION 'Adjustment already processed';
  END IF;

  v_qty := ABS(v_adj.qty);

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      'adjustment', p_adjustment_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_adj.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_in', v_qty, COALESCE(v_bv.average_cost, 0),
      'adjustment', p_adjustment_id
    FROM inventory_item_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;

  ELSE
    PERFORM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, TRUE);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_out', -v_qty, ibv.average_cost,
      'adjustment', p_adjustment_id
    FROM inventory_item_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;
  END IF;

  PERFORM recalc_average_cost(v_adj.brand_variant_id);

  UPDATE inventory_adjustments
  SET status = 'applied', updated_at = now()
  WHERE id = p_adjustment_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_inventory_check_adjustments(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check          RECORD;
  v_item           RECORD;
  v_variance       NUMERIC;
  v_adj_type       text;
  v_adj_qty        NUMERIC;
  v_check_number   text;
  v_approver_id    uuid;
  v_approver_name  text;
  v_new_adj_id     uuid;
  v_step           RECORD;
  v_ord            INT;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.check.create') THEN RAISE EXCEPTION 'Not authorized to apply inventory checks' USING ERRCODE = '42501'; END IF;
  SELECT id, warehouse_id, sub_container_id, status, check_number
  INTO   v_check
  FROM   inventory_checks
  WHERE  id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  v_check_number := v_check.check_number;

  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  SELECT profile_id, profile_name
  INTO   v_approver_id, v_approver_name
  FROM   inventory_check_approvals
  WHERE  check_id = p_check_id
    AND  status = 'approved'
  ORDER BY step_order DESC
  LIMIT 1;

  v_approver_name := COALESCE(v_approver_name, 'System (check ' || v_check_number || ')');

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty,
           variance, variance_type
    FROM   inventory_check_items
    WHERE  check_id = p_check_id
      AND  is_counted = true
      AND  variance IS NOT NULL
      AND  variance <> 0
  LOOP
    v_variance := v_item.variance;
    v_adj_qty  := ABS(v_variance);

    IF v_variance > 0 THEN
      v_adj_type := 'increase';
    ELSIF v_item.variance_type IN ('damage', 'write_off') THEN
      v_adj_type := v_item.variance_type;
    ELSE
      v_adj_type := 'decrease';
    END IF;

    INSERT INTO public.stock_adjustments (
      warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
      reason, notes, photo_urls, status,
      requested_by, requested_by_name,
      source_check_id, source_check_item_id
    ) VALUES (
      v_check.warehouse_id,
      v_check.sub_container_id,   -- may be NULL on legacy checks; D.4 create RPC
                                  -- falls back to _find_or_create_sub_container.
      v_item.brand_variant_id,
      v_adj_type::public.stock_adjustment_type,
      v_adj_qty,
      'Auto-generated from inventory check ' || v_check_number,
      'Counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
        || ' (variance ' || v_variance || ')',
      '{}'::text[],
      'pending_approval',
      v_approver_id,
      v_approver_name,
      p_check_id,
      v_item.id
    )
    RETURNING id INTO v_new_adj_id;

    v_ord := 0;
    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   approval_workflow_steps
      WHERE  workflow = 'stock_adj'
        AND  is_active = true
        AND  archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT (v_adj_type = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;

      v_ord := v_ord + 1;
      INSERT INTO stock_adjustment_approvals (
        adjustment_id, step_order, step_role, step_label
      ) VALUES (
        v_new_adj_id, v_ord, v_step.step_key, v_step.step_label
      );
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow — cannot auto-generate SA from check %', v_check_number;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_receival_edit(p_edit_request_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_bv_id           UUID;
  v_pli_id          UUID;
  v_ri_sub          UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;   -- PO currency
  v_new_cost        NUMERIC;   -- PO currency
  v_new_cost_qar    NUMERIC;
  v_old_cost_qar    NUMERIC;
  v_fx_rate         NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
  v_stock_level     INT;
  v_reserved_qty    INT;
BEGIN
  SELECT * INTO v_req FROM receival_edit_requests WHERE id = p_edit_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit request % not found', p_edit_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Edit request % is not approved (status: %)', p_edit_request_id, v_req.status;
  END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
    UPDATE receival_edit_requests SET status = 'expired' WHERE id = p_edit_request_id;
    RAISE EXCEPTION 'Edit window expired. Please request a new edit.';
  END IF;

  -- Load receival header including warehouse (needed for ISM inserts).
  SELECT id, date, warehouse_id, po_id
  INTO   v_receival
  FROM   receivals WHERE id = v_req.receival_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  IF v_receival.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Receival % has no warehouse_id; cannot stamp movement rows.', v_req.receival_id;
  END IF;

  -- Load PO's booked rate to convert cost edits into QAR.
  SELECT COALESCE(initial_exchange_rate, exchange_rate, 1)
  INTO   v_fx_rate
  FROM   purchase_orders
  WHERE  id = v_receival.po_id;
  v_fx_rate := COALESCE(v_fx_rate, 1);

  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id, ri.po_line_item_id, ri.sub_container_id
    INTO   v_old_qty, v_old_cost, v_bv_id, v_pli_id, v_ri_sub
    FROM   receival_items ri
    WHERE  ri.id = (v_item_input->>'receival_item_id')::UUID
      AND  ri.receival_id = v_req.receival_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found (or does not belong to receival %)',
        v_item_input->>'receival_item_id', v_req.receival_id;
    END IF;

    IF v_ri_sub IS NULL THEN
      RAISE EXCEPTION 'receival_item % has no sub_container_id; cannot stamp movement rows.',
        v_item_input->>'receival_item_id';
    END IF;

    v_new_qty  := (v_item_input->>'new_qty')::INT;
    v_new_cost := (v_item_input->>'new_unit_cost')::NUMERIC;
    v_delta    := v_new_qty - v_old_qty;

    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'new_qty must be a positive integer for item %', v_item_input->>'receival_item_id';
    END IF;
    IF v_new_cost IS NULL OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'new_unit_cost must be non-negative for item %', v_item_input->>'receival_item_id';
    END IF;

    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- Precompute QAR-converted costs for FIFO / COGS writes (C7).
    v_new_cost_qar := v_new_cost * v_fx_rate;
    v_old_cost_qar := v_old_cost * v_fx_rate;

    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        -- C6: stamp warehouse_id + sub_container_id from the receival.
        INSERT INTO inventory_stock_movements
          (warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
           movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_receival.warehouse_id, v_ri_sub, v_bv_id, ii.name_en, ibv.code,
               'receival_edit', v_delta, v_old_cost_qar,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;

      ELSE
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        SELECT COALESCE(stock_level, 0), COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_item_brand_variants
        WHERE id = v_bv_id
        FOR UPDATE;

        IF (v_stock_level - ABS(v_delta)) < v_reserved_qty THEN
          RAISE EXCEPTION
            'Cannot reduce qty by % for variant %: new stock level (%) would be below reserved qty (%)',
            ABS(v_delta), v_bv_id,
            v_stock_level - ABS(v_delta),
            v_reserved_qty;
        END IF;

        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        -- C6: stamp warehouse_id + sub_container_id from the receival.
        INSERT INTO inventory_stock_movements
          (warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
           movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_receival.warehouse_id, v_ri_sub, v_bv_id, ii.name_en, ibv.code,
               'receival_edit', -ABS(v_delta), v_old_cost_qar,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      -- H9: rewrite COGS scoped by source_id (this receival's FIFO layers).
      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost_qar,
            total_cost = v_new_cost_qar * qty
        WHERE brand_variant_id = v_bv_id
          AND source_id IN (
            SELECT id FROM fifo_cost_layers
            WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id
          );
      END IF;

      -- C7: write QAR value into fifo_cost_layers.unit_cost (was PO currency).
      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost_qar,
          total_unit_cost = v_new_cost_qar + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;
    END IF;

    PERFORM recalc_average_cost(v_bv_id);

    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id = ANY(v_lc_rec.attached_receival_ids);
        IF v_total_remaining = 0 THEN
          UPDATE landed_costs SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    UPDATE receival_items
    SET qty_received = v_new_qty, unit_cost = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;
  END LOOP;

  UPDATE receival_edit_requests
  SET status = 'completed'
  WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_sale_order_edit(p_so_id uuid, p_line_items jsonb, p_discount_amount numeric DEFAULT 0, p_discount_label text DEFAULT NULL::text, p_discount_type text DEFAULT 'fixed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so                RECORD;
  v_is_cash           BOOLEAN;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB   := '[]'::jsonb;
  v_new_status        sale_order_status;
  v_profile_id        UUID;
  v_prev_reservations JSONB;
  v_new_reservations  JSONB;
  v_delta_json        JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  -- 1. Guard: SO must exist and be in an editable status.
  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale order not found';
  END IF;
  IF v_so.status NOT IN ('quotation'::sale_order_status,
                         'confirmed'::sale_order_status,
                         'pending_approval'::sale_order_status) THEN
    RAISE EXCEPTION 'SO in status % is not editable — cancel and create a new one', v_so.status;
  END IF;

  -- 2. Snapshot current reservations so we can compute deltas.
  SELECT COALESCE(jsonb_object_agg(brand_variant_id::text, qty_sum), '{}'::jsonb)
    INTO v_prev_reservations
  FROM (
    SELECT brand_variant_id, SUM(qty)::int AS qty_sum
    FROM   sale_order_lines
    WHERE  sale_order_id  = p_so_id
      AND  brand_variant_id IS NOT NULL
    GROUP BY brand_variant_id
  ) prev;

  -- 3. Replace lines.
  DELETE FROM sale_order_lines WHERE sale_order_id = p_so_id;

  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type, brand_variant_id, avg_cost
  )
  SELECT p_so_id,
         (li->>'item_name'),
         NULLIF(li->>'sku', ''),
         (li->>'qty')::numeric,
         COALESCE(NULLIF(li->>'unit', ''), 'pcs'),
         (li->>'unit_price')::numeric,
         (li->>'total')::numeric,
         COALESCE(NULLIF(li->>'line_type', ''), 'products'),
         NULLIF(li->>'brand_variant_id', '')::uuid,
         COALESCE((li->>'avg_cost')::numeric, 0)
  FROM   jsonb_array_elements(p_line_items) li;

  -- 4. Rebalance reservations (delta = new - old per brand_variant).
  SELECT COALESCE(jsonb_object_agg(bv, qty_sum), '{}'::jsonb)
    INTO v_new_reservations
  FROM (
    SELECT NULLIF(li->>'brand_variant_id', '')::uuid AS bv,
           SUM((li->>'qty')::int)                    AS qty_sum
    FROM   jsonb_array_elements(p_line_items) li
    WHERE  NULLIF(li->>'brand_variant_id', '') IS NOT NULL
    GROUP BY NULLIF(li->>'brand_variant_id', '')::uuid
  ) newr;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bv_id', bv_id,
           'delta', new_qty - old_qty
         )) FILTER (WHERE new_qty <> old_qty), '[]'::jsonb)
    INTO v_delta_json
  FROM (
    SELECT COALESCE(k::uuid, k2::uuid) AS bv_id,
           COALESCE((v_new_reservations->k)::int,  0) AS new_qty,
           COALESCE((v_prev_reservations->k2)::int, 0) AS old_qty
    FROM   jsonb_object_keys(v_new_reservations)  k
    FULL OUTER JOIN jsonb_object_keys(v_prev_reservations) k2 ON k = k2
  ) merged;

  IF jsonb_array_length(v_delta_json) > 0 THEN
    PERFORM batch_update_reserved_qty(v_delta_json);
  END IF;

  -- 5. Recompute totals.
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * COALESCE(p_discount_amount, 0)) / 100
    ELSE COALESCE(p_discount_amount, 0)
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * COALESCE(v_so.exchange_rate, 1);

  -- 6. Below-cost detection.
  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name,
           'unit_price', unit_price,
           'avg_cost',   avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
    INTO v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  -- 7. Credit check.
  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
    INTO v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  IF NOT v_is_cash AND v_credit_limit IS NOT NULL THEN
    v_open_total := public.customer_credit_used(v_so.customer_id, p_so_id);
    v_available  := v_credit_limit - v_open_total;
    IF v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- 8. Supersede any existing pending approval rows for this SO.
  --    Fresh edit = fresh chain (new iteration via build_sales_approval_chain).
  UPDATE sale_order_approvals
     SET status    = 'rejected'::approval_status,
         is_active = false,
         reason    = 'Superseded by SO edit'
   WHERE source_id     = p_so_id
     AND source_type   = 'sale_order'::approval_source_type
     AND status        = 'pending'::approval_status;

  -- 9. Determine new status.
  IF v_so.status = 'quotation'::sale_order_status THEN
    v_new_status := 'quotation'::sale_order_status;
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_new_status := 'pending_approval'::sale_order_status;
  ELSE
    v_new_status := 'confirmed'::sale_order_status;
  END IF;

  UPDATE sale_orders
     SET subtotal                = v_subtotal,
         discount_amount          = p_discount_amount,
         discount_amount_resolved = v_discount_resolved,
         discount_label           = p_discount_label,
         discount_type            = p_discount_type,
         total                    = v_total,
         status                   = v_new_status
   WHERE id = p_so_id;

  -- 10. Build fresh approval chain(s) only when needed.
  IF v_new_status = 'pending_approval'::sale_order_status THEN
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit'::approval_type,
        jsonb_build_object(
          'available',    GREATEST(v_available, 0),
          'overage',      v_total_qar - COALESCE(v_available, 0),
          'requested_by', v_profile_id,
          'triggered_by', 'edit'
        )
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin'::approval_type,
        jsonb_build_object(
          'lines',        v_below_cost_lines,
          'requested_by', v_profile_id,
          'triggered_by', 'edit'
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'so_id',          p_so_id,
    'status',         v_new_status,
    'subtotal',       v_subtotal,
    'total',          v_total,
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost,
    'credit_limit',   COALESCE(v_credit_limit, 0),
    'available',      GREATEST(COALESCE(v_available, 0), 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_credit_group_change(p_approval_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row            RECORD;
  v_request        RECORD;
  v_profile_id     uuid;
  v_full_name      TEXT;
  v_all_done       BOOLEAN;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_row FROM customer_credit_group_approvals
    WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' OR NOT v_row.is_active THEN
    RAISE EXCEPTION 'Approval step not actionable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_row.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  decided_by  = v_profile_id
      AND  id          <> p_approval_id
  ) THEN
    RAISE EXCEPTION 'You have already actioned another step on this request';
  END IF;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         comment         = p_comment
  WHERE  id = p_approval_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  status     <> 'approved'
  ) INTO v_all_done;

  IF v_all_done THEN
    SELECT * INTO v_request FROM customer_credit_group_requests
      WHERE id = v_row.request_id FOR UPDATE;

    UPDATE customers
       SET credit_group_id = v_request.requested_group_id,
           block_reason    = NULL
     WHERE id = v_request.customer_id;

    UPDATE customer_credit_group_requests
       SET status     = 'approved',
           decided_by = v_profile_id,
           decided_at = now()
     WHERE id = v_request.id;

    INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
    VALUES (
      'Credit Group Change Approved',
      'customers',
      'customer',
      v_request.customer_id,
      v_full_name,
      'info',
      jsonb_build_object('request_id', v_request.id)::text
    );
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_receival_inventory(p_receival_id uuid, p_action text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receival   RECORD;
  v_item       RECORD;
  v_bv_ids     UUID[] := '{}';
  v_bv_id      UUID;
BEGIN
  SELECT id, po_id, receival_number, warehouse_id, date, status
  INTO v_receival
  FROM receivals
  WHERE id = p_receival_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', p_receival_id;
  END IF;

  IF v_receival.status NOT IN ('pending', 'pending_approval', 'draft') THEN
    RAISE EXCEPTION 'Receival % already processed with status %', p_receival_id, v_receival.status;
  END IF;

  UPDATE receivals SET status = p_action WHERE id = p_receival_id;

  IF p_action = 'rejected' THEN
    UPDATE po_line_items pli
    SET received_qty = GREATEST(0, pli.received_qty - ri.qty_received)
    FROM receival_items ri
    WHERE ri.receival_id = p_receival_id
      AND ri.po_line_item_id = pli.id
      AND ri.is_free = FALSE;

    RETURN v_receival.po_id;
  END IF;

  FOR v_item IN
    SELECT item_name, sku, qty_received, unit_cost, brand_variant_id
    FROM receival_items
    WHERE receival_id = p_receival_id
      AND is_free = FALSE
      AND brand_variant_id IS NOT NULL
      AND qty_received > 0
  LOOP
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_item.brand_variant_id, v_receival.warehouse_id, p_receival_id, v_receival.receival_number,
      v_receival.date, v_item.qty_received, v_item.unit_cost, 0, v_item.unit_cost, v_item.qty_received
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_item.qty_received,
        updated_at  = now()
    WHERE id = v_item.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_receival.warehouse_id, v_item.brand_variant_id, v_item.item_name, v_item.sku,
      'purchase_receival', v_item.qty_received, v_item.unit_cost, 'receival', p_receival_id
    );

    IF NOT (v_item.brand_variant_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_item.brand_variant_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id IN ARRAY v_bv_ids
  LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  RETURN v_receival.po_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_sales_request(p_request_id uuid, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  PERFORM set_config('mms.approval_active', '1', true);
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = v_req.source_id
      AND  approval_type = v_req.approval_type
      AND  iteration     = v_req.iteration
      AND  decided_by    = v_profile_id
      AND  id            <> p_request_id
  ) THEN
    RAISE EXCEPTION 'You have already approved another role on this slip';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = p_comment
  WHERE  id = p_request_id;

  PERFORM public.advance_sales_approval(v_req.source_id, v_req.approval_type);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_service_change(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id    UUID;
  v_req           RECORD;
  v_live          RECORD;
  v_key           TEXT;
  v_old_val       TEXT;
  v_live_val      TEXT;
  v_new_service_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  CASE v_req.change_type
    WHEN 'edit' THEN
      SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Service no longer exists'; END IF;

      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
        IF v_old_val IS DISTINCT FROM v_live_val THEN
          RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
            v_key, v_old_val, v_live_val;
        END IF;
      END LOOP;

      UPDATE services SET
        name_en           = CASE WHEN v_req.changes ? 'name_en'           THEN v_req.changes->'name_en'->>'new'                   ELSE name_en           END,
        name_ar           = CASE WHEN v_req.changes ? 'name_ar'           THEN v_req.changes->'name_ar'->>'new'                   ELSE name_ar           END,
        code              = CASE WHEN v_req.changes ? 'code'              THEN v_req.changes->'code'->>'new'                      ELSE code              END,
        price             = CASE WHEN v_req.changes ? 'price'             THEN (v_req.changes->'price'->>'new')::NUMERIC           ELSE price             END,
        emergency_price   = CASE WHEN v_req.changes ? 'emergency_price'   THEN (v_req.changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price   END,
        discount          = CASE WHEN v_req.changes ? 'discount'          THEN (v_req.changes->'discount'->>'new')::NUMERIC        ELSE discount          END,
        duration          = CASE WHEN v_req.changes ? 'duration'          THEN (v_req.changes->'duration'->>'new')::INT            ELSE duration          END,
        warranty          = CASE WHEN v_req.changes ? 'warranty'          THEN (v_req.changes->'warranty'->>'new')::INT            ELSE warranty          END,
        status            = CASE WHEN v_req.changes ? 'status'            THEN (v_req.changes->'status'->>'new')::service_status   ELSE status            END,
        item_kind         = CASE WHEN v_req.changes ? 'item_kind'         THEN v_req.changes->'item_kind'->>'new'                  ELSE item_kind         END,
        pricing_mode      = CASE WHEN v_req.changes ? 'pricing_mode'      THEN v_req.changes->'pricing_mode'->>'new'               ELSE pricing_mode      END,
        discount_scope    = CASE WHEN v_req.changes ? 'discount_scope'    THEN v_req.changes->'discount_scope'->>'new'             ELSE discount_scope    END,
        invoice_text_en   = CASE WHEN v_req.changes ? 'invoice_text_en'   THEN v_req.changes->'invoice_text_en'->>'new'            ELSE invoice_text_en   END,
        invoice_text_ar   = CASE WHEN v_req.changes ? 'invoice_text_ar'   THEN v_req.changes->'invoice_text_ar'->>'new'            ELSE invoice_text_ar   END,
        catalog_image_url = CASE WHEN v_req.changes ? 'catalog_image_url' THEN v_req.changes->'catalog_image_url'->>'new'          ELSE catalog_image_url END,
        updated_at        = now()
      WHERE id = v_req.service_id;

    WHEN 'add' THEN
      v_new_service_id := gen_random_uuid();
      BEGIN
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code,
          price, emergency_price, duration, warranty,
          status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement
        ) VALUES (
          v_new_service_id,
          (v_req.changes->'parent_id'->>'new')::UUID,
          v_req.changes->'tree_type'->>'new',
          0,
          v_req.division,
          v_req.changes->'name_en'->>'new',
          v_req.changes->'name_ar'->>'new',
          v_req.changes->'code'->>'new',
          (v_req.changes->'price'->>'new')::NUMERIC,
          (v_req.changes->'emergency_price'->>'new')::NUMERIC,
          (v_req.changes->'duration'->>'new')::INT,
          (v_req.changes->'warranty'->>'new')::INT,
          COALESCE(v_req.changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_req.changes ? 'category' AND v_req.changes->'category'->>'new' IS NOT NULL
               THEN (v_req.changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'service_type' AND v_req.changes->'service_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'contract_type' AND v_req.changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_req.changes->'item_kind'->>'new',
          v_req.changes->'pricing_mode'->>'new',
          v_req.changes->'discount_scope'->>'new',
          v_req.changes->'invoice_text_en'->>'new',
          v_req.changes->'invoice_text_ar'->>'new',
          v_req.changes->'photo_requirement'->>'new'
        );
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'A service with this name already exists in this division. Reject this request instead.';
      END;
      UPDATE service_edit_requests SET service_id = v_new_service_id WHERE id = p_request_id;

    WHEN 'delete' THEN
      IF EXISTS (
        SELECT 1 FROM order_services os
        JOIN orders o ON o.id = os.order_id
        WHERE os.service_id = v_req.service_id
          AND o.status NOT IN ('completed', 'cancelled')
          AND o.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot delete: service has active orders. Reject this request instead.';
      END IF;
      UPDATE services
      SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
      WHERE id = v_req.service_id;

  END CASE;

  UPDATE service_edit_requests
  SET status = 'approved', reviewed_by = v_profile_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'service_id', COALESCE(v_new_service_id, v_req.service_id));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj                 RECORD;
  v_bv                  RECORD;
  v_layer               RECORD;
  v_dl                  RECORD;
  v_qty                 INT;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
  v_layer_division      UUID;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id, source_pile
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  IF v_adj.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % has no sub_container_id; re-open the adjustment dialog and pick one.', p_adjustment_id;
  END IF;
  v_sub_container_id := v_adj.sub_container_id;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  -- ── Phase F: damaged-pile writeoff branch ──────────────────────────────────
  -- Per-layer: one damaged_write_off movement per consumed layer, carrying that
  -- layer's actual cost + source division so the P&L Scrap line is division-scoped.
  IF v_adj.source_pile = 'damaged' THEN
    IF v_adj.adjustment_type <> 'write_off' THEN
      RAISE EXCEPTION 'source_pile=damaged only supports adjustment_type=write_off (got %)', v_adj.adjustment_type;
    END IF;

    FOR v_dl IN
      SELECT * FROM public._consume_damaged_stock_fifo_returning(
                      v_adj.warehouse_id, v_adj.brand_variant_id, v_qty)
    LOOP
      INSERT INTO public.inventory_damaged_movements (
        movement_type, qty, warehouse_id, brand_variant_id, unit_cost, division_id, notes
      ) VALUES (
        'damaged_write_off', v_dl.qty_taken, v_adj.warehouse_id, v_adj.brand_variant_id,
        v_dl.unit_cost, v_dl.division_id, v_adj.reason
      );
    END LOOP;
    RETURN;
  END IF;

  SELECT * INTO v_bv FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id FOR UPDATE;

  IF v_adj.adjustment_type = 'increase' THEN
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id, source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id, 'adjustment', p_adjustment_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes,
      sub_container_id
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason,
      v_sub_container_id
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_item_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(
        v_adj.brand_variant_id,
        v_adj.warehouse_id,
        v_qty,
        false,
        v_sub_container_id
      )
    LOOP
      v_layer_sub_container := COALESCE(v_layer.sub_container_id, v_sub_container_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason,
        v_layer_sub_container
      );

      -- C3 fix: for 'damage' adjustments, materialise the damaged-pile
      -- rows so downstream damaged-stock operations can consume them.
      IF v_adj.adjustment_type = 'damage' THEN
        -- Division the stock is being damaged out of (source sub-container).
        SELECT wsc.division_id INTO v_layer_division
        FROM public.warehouse_sub_containers wsc
        WHERE wsc.id = v_layer_sub_container;

        INSERT INTO inventory_damaged_stock_layers (
          warehouse_id, brand_variant_id,
          qty_received, qty_remaining, unit_cost, layered_at, division_id
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.qty_taken, v_layer.unit_cost, now(), v_layer_division
        );

        INSERT INTO inventory_damaged_stock (
          warehouse_id, brand_variant_id, qty, weighted_unit_cost, updated_at
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.unit_cost, now()
        )
        ON CONFLICT (warehouse_id, brand_variant_id) DO UPDATE
          SET qty = inventory_damaged_stock.qty + EXCLUDED.qty,
              weighted_unit_cost =
                (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost
                   + EXCLUDED.qty * EXCLUDED.weighted_unit_cost)
                / NULLIF(inventory_damaged_stock.qty + EXCLUDED.qty, 0),
              updated_at = now();

        INSERT INTO inventory_damaged_movements (
          movement_type, qty, warehouse_id, brand_variant_id, unit_cost, division_id, notes
        ) VALUES (
          'damaged_adjust', v_layer.qty_taken, v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.unit_cost, v_layer_division, v_adj.reason
        );
      END IF;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_workflow_step(p_step_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
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
    RAISE EXCEPTION 'Only owners can archive approval chain steps';
  END IF;

  UPDATE approval_workflow_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_team_leader(p_team_id uuid, p_employee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE employees SET team_id = p_team_id, status = 'active'
  WHERE id = p_employee_id;

  UPDATE teams SET leader_id = p_employee_id WHERE id = p_team_id;

  INSERT INTO team_activity_log (action, entity_type, entity_id, after_data)
  VALUES (
    'leader-assigned', 'team', p_team_id,
    jsonb_build_object('leader_id', p_employee_id)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.attach_payment_to_bill(p_payment_id uuid, p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_amount NUMERIC;
BEGIN
  SELECT amount INTO v_payment_amount
  FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  PERFORM allocate_payment_to_bill(p_payment_id, p_bill_id, v_payment_amount);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.attach_payment_to_invoice(p_payment_id uuid, p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;                           -- row-level lock prevents concurrent attach

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already linked to an invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   so_invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Ownership guard: skip check for NULL customer_id (legacy backfill miss)
  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = p_invoice_id WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_generate_tool_serials(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sku       text;
  v_next_ord  int;
  v_unit      RECORD;
  v_serial    text;
  v_updated   int := 0;
BEGIN
  IF NOT (
    _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')
    OR _user_has_permission(_current_user_data_id(), 'purchase.receivals.create')
  ) THEN
    RAISE EXCEPTION 'not authorized to generate tool serials' USING ERRCODE = '42501';
  END IF;

  SELECT sku INTO v_sku FROM inventory_items WHERE id = p_item_id;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no SKU', p_item_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || p_item_id::text));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = p_item_id
    AND serial_number ~ ('^' || v_sku || '-\d+$');

  FOR v_unit IN
    SELECT id FROM tool_asset_units
    WHERE item_id = p_item_id
      AND is_placeholder = true
      AND serial_number IS NULL
    ORDER BY created_at
  LOOP
    v_next_ord := v_next_ord + 1;
    v_serial   := v_sku || '-' || LPAD(v_next_ord::text, 3, '0');

    UPDATE tool_asset_units
       SET serial_number  = v_serial,
           is_placeholder = false
     WHERE id = v_unit.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'sku_prefix',    v_sku
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_reject_pending_on_service_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_edit_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now(),
        updated_at = now()
    WHERE service_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_conversation_last_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
BEGIN
  UPDATE chat_conversations cc
  SET
    last_message    = sub.last_msg,
    last_message_at = GREATEST(
      COALESCE(cc.last_message_at, '1970-01-01'::timestamptz),
      sub.created_at
    )
  FROM (
    SELECT
      cc2.id AS conversation_id,
      COALESCE(NULLIF(m.text, ''), '[message]') AS last_msg,
      m.created_at
    FROM chat_conversations cc2
    CROSS JOIN LATERAL (
      SELECT text, created_at
      FROM chat_messages
      WHERE conversation_id = cc2.id
        AND message_kind = 'message'
      ORDER BY created_at DESC
      LIMIT 1
    ) m
    WHERE cc2.last_message IS NULL OR cc2.last_message = ''
  ) sub
  WHERE cc.id = sub.conversation_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_increment_received_qty(p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE po_line_items
    SET received_qty = GREATEST(0, received_qty + (rec->>'delta')::INT)
    WHERE id = (rec->>'id')::UUID;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_update_reserved_qty(p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE inventory_item_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty + (rec->>'delta')::INT),
        updated_at   = now()
    WHERE id = (rec->>'bv_id')::UUID;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_update_variant_prices(p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_update jsonb;
begin
  IF NOT (public._auth_user_has_permission('inventory.pricing.manage') OR public._auth_user_has_permission('inventory.catalog.manage')) THEN RAISE EXCEPTION 'Not authorized to update prices' USING ERRCODE = '42501'; END IF;
  for v_update in select * from jsonb_array_elements(p_updates) loop
    update inventory_item_brand_variants
       set selling_price = (v_update->>'selling_price')::numeric
     where id = (v_update->>'id')::uuid;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_bill_id UUID;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.bills
     SET pdf_url = NULL, needs_refresh = TRUE
   WHERE id = v_bill_id
     AND (pdf_url IS NOT NULL OR needs_refresh = FALSE);
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.bills_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- The set_bill_pdf_url RPC sets this GUC before writing the URL
  -- back, so the trigger lets the write through without invalidating.
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url       := NULL;
  NEW.needs_refresh := TRUE;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_first_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_count int;
  v_admin_role_id uuid;
  v_new_profile_id uuid;
  v_full_name text;
BEGIN
  -- Only the very first auth user gets auto-bootstrapped.
  SELECT COUNT(*) INTO v_profile_count FROM public.user_data;
  IF v_profile_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Prefer full_name from user_metadata, fall back to email local-part.
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(SPLIT_PART(NEW.email, '@', 1)), ''),
    'Admin'
  );

  INSERT INTO public.user_data (auth_user_id, email, full_name, user_type, is_active)
  VALUES (NEW.id, NEW.email, v_full_name, 'internal', true)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_new_profile_id;

  -- If ON CONFLICT skipped, fetch the existing profile id so we can still assign the role.
  IF v_new_profile_id IS NULL THEN
    SELECT id INTO v_new_profile_id
    FROM public.user_data
    WHERE auth_user_id = NEW.id;
  END IF;

  SELECT id INTO v_admin_role_id
  FROM public.custom_roles
  WHERE name = 'Admin' AND deleted_at IS NULL
  LIMIT 1;

  IF v_new_profile_id IS NOT NULL AND v_admin_role_id IS NOT NULL THEN
    INSERT INTO public.user_custom_roles (profile_id, role_id)
    VALUES (v_new_profile_id, v_admin_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.brands_propagate_name_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.inventory_item_brand_variants
      SET brand = NEW.name
    WHERE brand_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.build_inv_check_approval_chain(p_has_damage_or_writeoff boolean DEFAULT false, p_has_variance boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_steps JSONB;
BEGIN
  IF NOT p_has_variance THEN
    SELECT jsonb_agg(jsonb_build_object(
      'step_order', 1,
      'step_role',  step_key,
      'step_label', step_label
    ))
    INTO v_steps
    FROM approval_workflow_steps
    WHERE workflow = 'inv_check'
      AND step_key = 'inventory_manager'
      AND is_active = true
      AND archived_at IS NULL;

    RETURN COALESCE(v_steps, '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'step_order', rn,
      'step_role',  step_key,
      'step_label', step_label
    ) ORDER BY rn
  )
  INTO v_steps
  FROM (
    SELECT step_key, step_label,
           ROW_NUMBER() OVER (ORDER BY step_order) AS rn
    FROM   approval_workflow_steps
    WHERE  workflow = 'inv_check'
      AND  is_active = true
      AND  archived_at IS NULL
      AND  (
        NOT is_conditional
        OR (is_conditional AND p_has_damage_or_writeoff)
      )
  ) sub;

  RETURN COALESCE(v_steps, '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.build_sales_approval_chain(p_so_id uuid, p_approval_type approval_type, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workflow    TEXT;
  v_iteration   INT;
  v_step        RECORD;
BEGIN
  v_workflow := CASE p_approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;

  SELECT COALESCE(MAX(iteration), 0) + 1 INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles cr ON cr.id = was.role_id
    WHERE  was.workflow   = v_workflow
      AND  was.is_active  = true
      AND  was.archived_at IS NULL
    ORDER  BY was.step_order
  LOOP
    INSERT INTO sale_order_approvals (
      source_type, source_id, approval_type, status,
      requested_by, reason,
      step_role, step_order, is_active, iteration
    ) VALUES (
      'sale_order', p_so_id, p_approval_type, 'pending',
      (p_payload->>'requested_by')::uuid,
      p_payload::text,
      v_step.role_name, v_step.step_order,
      true,
      v_iteration
    );
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_credit_group_change(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  text;
  v_is_admin   boolean;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled (current: %)', v_request.status;
  END IF;

  -- Requester or admin may cancel. Admin = has any role flagged is_approval_slot
  -- with the credit_group scope (same gate rejection uses).
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) INTO v_is_admin;

  IF v_request.requested_by <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the requester or an approver can cancel this request';
  END IF;

  UPDATE customer_credit_group_requests
     SET status     = 'cancelled',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  UPDATE customer_credit_group_approvals
     SET status    = 'rejected',
         reason    = COALESCE(NULLIF(TRIM(p_reason), ''), 'Request cancelled by requester'),
         is_active = false
   WHERE request_id = v_request.id
     AND status     = 'pending';

  -- Unblock customer if the block was tied to this pending request
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Cancelled',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'info',
    jsonb_build_object(
      'request_id', v_request.id,
      'reason',     COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by requester')
    )::text
  );
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.cc_dedup_insert_message(p_conversation_id uuid, p_from_type text, p_source text, p_text text, p_agent_name text, p_attachments jsonb, p_delivery_status text, p_external_id text, p_wamid text, p_wati_id text, p_created_at timestamp with time zone, p_message_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_key  bigint;
  v_existing  uuid;
  v_new_id    uuid;
BEGIN
  v_lock_key := hashtext(
    coalesce(p_conversation_id::text, '') || ':' ||
    coalesce(p_from_type, '')              || ':' ||
    coalesce(p_text, '')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_external_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE external_id = p_external_id
       OR external_id = 'wati_' || p_external_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id    = p_external_id,
          wamid          = COALESCE(wamid, p_wamid),
          wati_id        = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_from_type = 'agent' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = 'agent'
      AND delivery_status IN ('sending', 'sent')
      AND (external_id IS NULL OR external_id LIKE 'wati_%')
      AND (
        (p_text IS NOT NULL AND p_text <> '' AND text = p_text)
        OR (p_text IS NULL OR p_text = '')
      )
      AND created_at >= now() - interval '60 seconds'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id     = COALESCE(p_external_id, external_id),
          wamid           = COALESCE(wamid, p_wamid),
          wati_id         = COALESCE(wati_id, p_wati_id),
          delivery_status = COALESCE(p_delivery_status, delivery_status),
          agent_name      = COALESCE(p_agent_name, agent_name)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_text IS NOT NULL AND p_text <> '' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = p_from_type
      AND text             = p_text
      AND created_at >= now() - interval '2 minutes'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid),
          wati_id     = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_wamid IS NOT NULL AND p_from_type = 'customer' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND (wamid = p_wamid OR external_id = p_wamid)
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  -- Explicit cast: text → message_source enum.
  INSERT INTO chat_messages (
    conversation_id, from_type, source, text, agent_name, attachments,
    delivery_status, external_id, wamid, wati_id, created_at, message_kind
  ) VALUES (
    p_conversation_id, p_from_type, p_source::message_source, p_text, p_agent_name, p_attachments,
    p_delivery_status, p_external_id, p_wamid, p_wati_id, p_created_at, p_message_kind
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_is_division_manager(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(is_division_manager, false) FROM public.user_data WHERE id = p_profile_id;
$function$
;

CREATE OR REPLACE FUNCTION public.check_low_stock_and_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_qty INT;
  v_reorder RECORD;
  v_old_qty INT;
  v_other_wh RECORD;
  v_field_rp RECORD;
  v_item_label TEXT;
  v_wh_name TEXT;
BEGIN
  IF NEW.qty >= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(remaining_qty), 0)::INT INTO v_new_qty
  FROM public.fifo_cost_layers
  WHERE brand_variant_id = NEW.brand_variant_id
    AND warehouse_id     = NEW.warehouse_id
    AND remaining_qty > 0;

  SELECT * INTO v_reorder
  FROM public.warehouse_reorder_points
  WHERE warehouse_id     = NEW.warehouse_id
    AND brand_variant_id = NEW.brand_variant_id;

  IF NOT FOUND OR v_reorder.reorder_point <= 0 THEN RETURN NEW; END IF;

  v_old_qty := v_new_qty - NEW.qty;

  IF NOT (v_old_qty > v_reorder.reorder_point AND v_new_qty <= v_reorder.reorder_point) THEN
    RETURN NEW;
  END IF;

  IF v_reorder.last_notified_at IS NOT NULL
     AND v_reorder.last_notified_at > now() - INTERVAL '24 hours' THEN
    RETURN NEW;
  END IF;

  SELECT f.warehouse_id, w.name, COALESCE(SUM(f.remaining_qty), 0)::INT AS qty
  INTO v_other_wh
  FROM public.fifo_cost_layers f
  JOIN public.warehouses w ON w.id = f.warehouse_id
  WHERE f.brand_variant_id = NEW.brand_variant_id
    AND f.warehouse_id    != NEW.warehouse_id
    AND f.remaining_qty > 0
  GROUP BY f.warehouse_id, w.name
  ORDER BY SUM(f.remaining_qty) DESC
  LIMIT 1;

  IF NOT FOUND OR v_other_wh.qty <= 0 THEN RETURN NEW; END IF;

  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = NEW.warehouse_id;
  v_item_label := NEW.item_name;

  FOR v_field_rp IN
    SELECT rid AS profile_id
    FROM public.recipients_for_permission('warehouse.stock.view', NEW.warehouse_id) AS rid
  LOOP
    INSERT INTO public.notifications (profile_id, type, title, body, related_type)
    VALUES (
      v_field_rp.profile_id,
      'low_stock_alert',
      'Low Stock Alert',
      'Low Stock Alert — ' || v_item_label || ' is at ' || v_new_qty || ' units in '
        || COALESCE(v_wh_name, 'warehouse') || ' (reorder point: ' || v_reorder.reorder_point
        || '). ' || v_other_wh.name || ' has ' || v_other_wh.qty
        || ' units available. Consider requesting a transfer.',
      'warehouse_stock'
    );
  END LOOP;

  UPDATE public.warehouse_reorder_points
  SET last_notified_at = now()
  WHERE id = v_reorder.id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_media_jobs(p_limit integer)
 RETURNS TABLE(id uuid, message_id uuid, attachment_index integer, attempts integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with claimed as (
    select j.id
      from public.media_download_jobs j
     where j.status = 'queued'
       and j.scheduled_for <= now()
     order by j.scheduled_for asc
     limit p_limit
     for update skip locked
  )
  update public.media_download_jobs j
     set status     = 'in_progress',
         claimed_at = now(),
         attempts   = j.attempts
    from claimed
   where j.id = claimed.id
  returning j.id, j.message_id, j.attachment_index, j.attempts;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE actioned_at IS NOT NULL
    AND actioned_at < NOW() - INTERVAL '45 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.close_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouse_sub_container_totals t ON t.sub_container_id = sc.id
    WHERE sc.project_id = p_project_id AND COALESCE(t.total_qty, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Cannot close a project while its disciplines still hold stock';
  END IF;
  UPDATE public.warehouse_sub_containers SET is_active = false, updated_at = now() WHERE project_id = p_project_id;
  UPDATE public.projects               SET is_active = false, updated_at = now() WHERE id = p_project_id;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_delivery_inventory(p_delivery_id uuid, p_so_id uuid, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery         RECORD;
  v_line             RECORD;
  v_wh_id            UUID;
  v_date             DATE;
  v_layer            RECORD;
  v_all_delivered    BOOLEAN;
  v_any_delivered    BOOLEAN;
  v_division_id      UUID;
  v_sub_container_id UUID;
  v_check_wh         UUID;
  v_check_div        UUID;
  v_check_active     BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  -- Resolve sub-container: explicit override (validated) or derive from SO.division_id
  SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id, sc.is_active
    INTO   v_check_wh, v_check_div, v_check_active
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id = p_sub_container_id;

    IF NOT FOUND OR v_check_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> v_wh_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, v_wh_id;
    END IF;
    IF v_division_id IS NOT NULL AND v_check_div IS DISTINCT FROM v_division_id THEN
      RAISE EXCEPTION 'Sub-container % is in a different division (%) than the SO (%)',
        p_sub_container_id, v_check_div, v_division_id;
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF v_division_id IS NULL THEN
    RAISE EXCEPTION 'SO % has no division set; pick a sub-container explicitly on the delivery form', p_so_id;
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
  END IF;

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  -- ── Warranty: create coverage records for every eligible line ──────────
  -- Same transaction. If this raises, the delivery flip is rolled back too.
  PERFORM public.create_warranty_records_for_delivery(p_delivery_id);

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    -- One COGS + one movement PER LAYER drained. Preserves per-receival
    -- cost detail on both ledgers (Scenario 2A).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false, v_sub_container_id)
    LOOP
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id
      ) VALUES (
        v_line.brand_variant_id, p_delivery_id, p_so_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, v_date,
        'sale', v_layer.layer_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_wh_id, v_sub_container_id, v_line.brand_variant_id,
        COALESCE(v_line.item_name, ''),
        v_line.sku,
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', p_delivery_id
      );
    END LOOP;

    -- Line-level bookkeeping (once per line, not per layer).
    UPDATE inventory_item_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;
  END LOOP;

  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_delivery_inventory(p_delivery_id uuid, p_so_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery  RECORD;
  v_line      RECORD;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
  v_all_delivered BOOLEAN;
  v_any_delivered BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false);

    UPDATE inventory_item_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;

    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date, source_type
    ) VALUES (
      v_line.brand_variant_id, p_delivery_id, p_so_id,
      v_line.qty_delivered, v_result.weighted_unit_cost, v_result.total_cost, v_date,
      'sale'
    );

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_line.brand_variant_id,
      COALESCE(v_line.item_name, ''),
      v_line.sku,
      'sale_delivery', -v_line.qty_delivered, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;

  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_warranty_expires_at()
 RETURNS trigger
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.warranty_months > 0 THEN
    NEW.warranty_expires_at := NEW.installed_at + (NEW.warranty_months || ' months')::interval;
  ELSE
    NEW.warranty_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_sale_order(p_so_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id   uuid;
  v_status        sale_order_status;
  v_total         numeric;
  v_total_qar     numeric;
  v_rate          numeric;
  v_is_cash       boolean;
  v_credit_limit  numeric;
  v_open_total    numeric;
  v_available     numeric := 0;
  v_new_status    sale_order_status;
  v_profile_id    uuid;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  -- Read the SO first (need customer_id), then serialize per-customer exactly
  -- like create_sale_order so the credit check can't race a concurrent order
  -- for the same customer.
  SELECT customer_id, status, total, total_qar, initial_exchange_rate
    INTO v_customer_id, v_status, v_total, v_total_qar, v_rate
  FROM sale_orders WHERE id = p_so_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Sale order not found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(v_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- Re-read status under the lock (TOCTOU): only a quotation can be confirmed.
  SELECT status INTO v_status FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF v_status <> 'quotation'::sale_order_status THEN
    RAISE EXCEPTION 'Only a quotation can be confirmed (current status: %)', v_status
      USING ERRCODE = '42501';
  END IF;

  v_total_qar := COALESCE(v_total_qar, v_total * COALESCE(v_rate, 1), 0);

  SELECT (c.credit_group_id IS NULL), cg.credit_limit
    INTO v_is_cash, v_credit_limit
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = v_customer_id;

  IF v_is_cash THEN
    v_new_status := 'confirmed'::sale_order_status;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;
    v_open_total := public.customer_credit_used(v_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;
    v_new_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      ELSE                                'confirmed'::sale_order_status
    END;
  END IF;

  UPDATE sale_orders SET status = v_new_status WHERE id = p_so_id;

  IF v_new_status = 'pending_approval'::sale_order_status THEN
    PERFORM public.build_sales_approval_chain(
      p_so_id, 'credit',
      jsonb_build_object(
        'available',    GREATEST(v_available, 0),
        'overage',      v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object('status', v_new_status, 'so_id', p_so_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_and_approve_receival(p_po_id uuid, p_warehouse_id uuid, p_date date, p_received_by_name text, p_receival_number text, p_notes text, p_items jsonb, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receival_id       UUID;
  v_receival_number   TEXT;
  v_item              JSONB;
  v_bv_id             UUID;
  v_bv_ids            UUID[] := '{}';
  v_bv_id_elem        UUID;
  v_qty               INT;
  v_cost              NUMERIC;
  v_cost_qar          NUMERIC;
  v_is_free           BOOLEAN;
  v_pli_id            UUID;
  v_po_currency       TEXT;
  v_po_rate           NUMERIC;
  v_division_id       UUID;
  v_division_ids      UUID[];
  v_allowed_divs      UUID[];
  v_sub_container_id  UUID;
  v_check_wh          UUID;
  v_check_div         UUID;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.receivals.create') AND NOT public._auth_user_has_permission('purchase.receivals.manage') THEN RAISE EXCEPTION 'Not authorized to create receivals' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1), division_id, division_ids
    INTO v_po_currency, v_po_rate, v_division_id, v_division_ids
    FROM public.purchase_orders
   WHERE id = p_po_id;

  -- Divisions this PO may receive into: the line-division set is authoritative;
  -- fall back to the header division for legacy rows with no set.
  v_allowed_divs := CASE
    WHEN cardinality(COALESCE(v_division_ids, '{}'::uuid[])) > 0 THEN v_division_ids
    WHEN v_division_id IS NOT NULL THEN ARRAY[v_division_id]
    ELSE '{}'::uuid[]
  END;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id
      INTO v_check_wh, v_check_div
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND sc.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> p_warehouse_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, p_warehouse_id;
    END IF;
    -- The sub-container's division must be one this PO uses (when the PO is
    -- division-scoped). Legacy POs with no divisions let the operator pick any.
    IF cardinality(v_allowed_divs) > 0 AND NOT (v_check_div = ANY(v_allowed_divs)) THEN
      RAISE EXCEPTION 'Sub-container % is in division % which is not on this PO',
        p_sub_container_id, v_check_div;
    END IF;
    -- Per-line routing: every PO line being received in this pass must belong to
    -- the chosen sub-container's division. (Non-PO extras / null-division lines
    -- are exempt.) This keeps each division's stock in its own bin.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS it
      JOIN public.po_line_items li ON li.id = NULLIF(it->>'po_line_item_id', '')::uuid
      WHERE COALESCE((it->>'qty_received')::int, 0) > 0
        AND li.division_id IS NOT NULL
        AND li.division_id IS DISTINCT FROM v_check_div
    ) THEN
      RAISE EXCEPTION 'Some lines being received belong to a different division than the chosen sub-container'
        USING HINT = 'Set the other divisions'' lines to 0 and receive them in a separate pass into their own warehouse / sub-container.';
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF cardinality(v_allowed_divs) <> 1 THEN
    -- Ambiguous destination (multi-division or no division) — require an
    -- explicit sub-container so each line lands in the right division.
    RAISE EXCEPTION 'This PO is not single-division; pick a sub-container so each line lands in its own division'
      USING HINT = 'Select a warehouse + sub-container on the receival form.';
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_allowed_divs[1]);
  END IF;

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id   := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty     := (v_item->>'qty_received')::INT;
    v_cost    := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id  := NULLIF(v_item->>'po_line_item_id', '')::UUID;
    v_is_free := COALESCE((v_item->>'is_free')::BOOLEAN, false);

    -- Free items cost nothing: force a zero cost basis so they add quantity but
    -- neither value nor moving-average cost. Paid items convert to QAR as before.
    v_cost_qar := CASE WHEN v_is_free THEN 0 ELSE v_cost * v_po_rate END;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free,
      sub_container_id
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost, v_is_free,
      v_sub_container_id
    );

    -- Only skip when we cannot place stock (no variant, or non-positive qty).
    -- Free items now DO enter stock (as a zero-cost layer).
    CONTINUE WHEN v_bv_id IS NULL OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate,
      sub_container_id
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    -- received_qty tracks ORDERED fulfilment; a free bonus unit does not count
    -- (otherwise a 100-unit line receiving 100 + 2 free reads 102/100).
    IF v_pli_id IS NOT NULL AND NOT v_is_free THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id,
      sub_container_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      -- Cast the CASE result to the enum: a CASE over string literals resolves to
      -- text, and text does not implicitly coerce to stock_movement_type.
      (CASE WHEN v_is_free THEN 'free_receival' ELSE 'purchase_receival' END)::public.stock_movement_type,
      v_qty, v_cost_qar,
      'receival', v_receival_id,
      v_sub_container_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_and_approve_receival(p_po_id uuid, p_warehouse_id uuid, p_date date, p_received_by_name text, p_receival_number text, p_notes text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receival_id UUID;
  v_receival_number TEXT;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_pli_id      UUID;
BEGIN
  -- Generate receival number atomically from sequence if not provided
  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false)
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, v_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.create_customer_with_phone(p_name text, p_phone text, p_link_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id   uuid;
  v_phone_id      uuid;
  v_existing_cid  uuid;
BEGIN
  IF NOT (public._auth_user_has_permission('master_data.customers.create') OR public._auth_user_has_permission('master_data.customers.manage')) THEN RAISE EXCEPTION 'Not authorized to create customers' USING ERRCODE = '42501'; END IF;
  -- Normalise phones
  p_phone      := regexp_replace(p_phone, '\s+', '', 'g');
  p_link_phone := regexp_replace(COALESCE(p_link_phone, ''), '\s+', '', 'g');

  -- If linkPhone already exists, use that customer
  IF p_link_phone <> '' THEN
    SELECT customer_id INTO v_existing_cid
      FROM customer_phones WHERE phone = p_link_phone;
  END IF;

  IF v_existing_cid IS NOT NULL THEN
    v_customer_id := v_existing_cid;
  ELSE
    INSERT INTO customers (name, phone, customer_type)
    VALUES (p_name, p_phone, 'cash')
    RETURNING id INTO v_customer_id;

    -- Also insert the linkPhone under the new customer if it doesn't exist yet
    IF p_link_phone <> '' THEN
      INSERT INTO customer_phones (customer_id, phone, is_primary)
      VALUES (v_customer_id, p_link_phone, false)
      ON CONFLICT (phone) DO NOTHING;
    END IF;
  END IF;

  -- Insert primary phone (ON CONFLICT: if phone already exists, return existing record)
  INSERT INTO customer_phones (customer_id, phone, is_primary)
  VALUES (v_customer_id, p_phone, true)
  ON CONFLICT (phone) DO UPDATE
    SET customer_id = EXCLUDED.customer_id
  RETURNING id INTO v_phone_id;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_inventory_receival(p_mode text, p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_unit_cost numeric, p_source_layer_id uuid, p_date date, p_notes text, p_sub_container_id uuid)
 RETURNS receivals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id           uuid := auth.uid();
  v_caller_id         uuid;
  v_caller_name       text;
  v_has_permission    boolean;
  v_receival_number   text;
  v_new_receival      public.receivals;
  v_source_layer      public.fifo_cost_layers;
  v_landed_cost       numeric := 0;
  v_source_total_cost numeric;
  v_new_total_cost    numeric;
  v_new_layer_id      uuid;
  v_sub_container_id  uuid := p_sub_container_id;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_caller_id
  FROM   public.user_data p
  WHERE  p.auth_user_id = v_auth_id;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for auth user' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_caller_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive' USING ERRCODE = '22023';
  END IF;
  IF p_warehouse_id IS NULL OR p_brand_variant_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and brand variant are required' USING ERRCODE = '22023';
  END IF;

  -- Phase D.2: sub-container is required (no PO to derive from).
  IF v_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Sub-container is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers sc
     WHERE sc.id = v_sub_container_id
       AND sc.warehouse_id = p_warehouse_id
       AND sc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sub-container % is inactive or not in warehouse %',
      v_sub_container_id, p_warehouse_id USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'Source layer is required for carve mode' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source layer % not found', p_source_layer_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION 'Source layer does not belong to warehouse %', p_warehouse_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.brand_variant_id <> p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to brand variant %', p_brand_variant_id USING ERRCODE = '22023';
    END IF;

    -- H10 guard: carve must stay within the source layer's sub-container.
    IF v_source_layer.sub_container_id IS DISTINCT FROM v_sub_container_id THEN
      RAISE EXCEPTION 'Carve cannot move stock across sub-containers (source layer sub-container % ≠ destination %). Use a warehouse transfer instead.',
        v_source_layer.sub_container_id, v_sub_container_id
        USING ERRCODE = '22023';
    END IF;

    IF p_qty > v_source_layer.remaining_qty THEN
      RAISE EXCEPTION 'Requested qty % exceeds source layer remaining %', p_qty, v_source_layer.remaining_qty USING ERRCODE = '22023';
    END IF;

    v_landed_cost       := COALESCE(v_source_layer.landed_cost_per_unit, 0);
    v_source_total_cost := COALESCE(v_source_layer.total_unit_cost,
                                    v_source_layer.unit_cost + v_landed_cost);
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.user_data p
  JOIN   auth.users au ON au.id = p.auth_user_id
  WHERE  p.id = v_caller_id;

  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    NULL, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free,
    sub_container_id
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false,
    v_sub_container_id
  FROM public.inventory_item_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  IF p_mode = 'carve' THEN
    UPDATE public.fifo_cost_layers
       SET remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    v_new_total_cost := p_unit_cost + v_landed_cost;
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, v_new_total_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;
  ELSE
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;
  END IF;

  IF p_mode = 'carve' THEN
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      -p_qty, v_source_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved out of source layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;

    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      p_qty, v_new_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved into new layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  ELSE
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_new'::stock_movement_type,
      p_qty, p_unit_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number,
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  END IF;

  PERFORM public.recalc_average_cost(p_brand_variant_id);

  RETURN v_new_receival;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_inventory_receival(p_mode text, p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_unit_cost numeric, p_source_layer_id uuid, p_date date, p_notes text)
 RETURNS receivals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id         uuid := auth.uid();
  v_caller_id       uuid;
  v_caller_name     text;
  v_has_permission  boolean;
  v_receival_number text;
  v_new_receival    public.receivals;
  v_source_layer    public.fifo_cost_layers;
  v_landed_cost     numeric := 0;
  v_new_layer_id    uuid;
  v_movement_type   text;
  v_movement_qty    integer;
BEGIN
  -- === Step 1: Permission check ===
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Look up user_data.id from auth_user_id (they are different UUIDs)
  SELECT p.id INTO v_caller_id
  FROM   public.user_data p
  WHERE  p.auth_user_id = v_auth_id;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for auth user' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_caller_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  -- === Step 2: Validate inputs ===
  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive' USING ERRCODE = '22023';
  END IF;
  IF p_warehouse_id IS NULL OR p_brand_variant_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and brand variant are required' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'Source layer is required for carve mode' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source layer % not found', p_source_layer_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION 'Source layer does not belong to warehouse %', p_warehouse_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.brand_variant_id <> p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to brand variant %', p_brand_variant_id USING ERRCODE = '22023';
    END IF;
    IF p_qty > v_source_layer.remaining_qty THEN
      RAISE EXCEPTION 'Requested qty % exceeds source layer remaining %', p_qty, v_source_layer.remaining_qty USING ERRCODE = '22023';
    END IF;

    v_landed_cost := v_source_layer.landed_cost_per_unit;
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- === Step 3: Look up caller name ===
  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.user_data p
  JOIN   auth.users au ON au.id = p.auth_user_id
  WHERE  p.id = v_caller_id;

  -- === Step 4: Generate INV-NNNNN receival number ===
  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  -- === Step 5: Insert the receivals row ===
  -- received_by is NULL because it FK-references employees(id) and we only
  -- have a user_data.id here. received_by_name carries the display identity.
  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    NULL, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  -- === Step 6: Insert receival_items row (single line) ===
  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false
  FROM public.inventory_item_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 7: Handle FIFO layers ===
  IF p_mode = 'carve' THEN
    -- Decrement source layer
    UPDATE public.fifo_cost_layers
       SET qty = qty - p_qty,
           remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    -- Insert new carved layer, inheriting landed_cost_per_unit
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, p_unit_cost + v_landed_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    v_movement_type := 'inventory_receival_carve';
    v_movement_qty  := 0;
  ELSE
    -- new_stock: add fresh layer + bump stock_level
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;

    v_movement_type := 'inventory_receival_new';
    v_movement_qty  := p_qty;
  END IF;

  -- === Step 8: Insert stock movement row ===
  INSERT INTO public.inventory_stock_movements (
    warehouse_id, brand_variant_id, item_name, sku,
    movement_type, qty, unit_cost,
    reference_type, reference_id, notes
  )
  SELECT
    p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
    v_movement_type, v_movement_qty, p_unit_cost,
    'receival', v_new_receival.id,
    'Inventory Receival ' || v_receival_number
  FROM public.inventory_item_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 9: Recompute average cost ===
  PERFORM public.recalc_average_cost(p_brand_variant_id);

  -- === Step 10: Return ===
  RETURN v_new_receival;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_landed_cost(p_description text, p_date date, p_currency text, p_lines jsonb, p_attached_receival_ids uuid[], p_attached_po_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_amount NUMERIC;
  v_id           UUID;
  v_line         JSONB;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.landed_costs.create') AND NOT public._auth_user_has_permission('purchase.landed_costs.manage') THEN RAISE EXCEPTION 'Not authorized to create landed costs' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL THEN
    RAISE EXCEPTION 'p_lines must not be null';
  END IF;

  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE(NULLIF((line->>'exchange_rate')::NUMERIC, 0), 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  -- Insert each line into the normalized table
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO landed_cost_lines (
      landed_cost_id, description, amount, currency, exchange_rate, bill_path
    ) VALUES (
      v_id,
      COALESCE(TRIM(v_line->>'description'), ''),
      COALESCE((v_line->>'amount')::NUMERIC, 0),
      COALESCE(v_line->>'currency', p_currency),
      COALESCE((v_line->>'exchange_rate')::NUMERIC, 1),
      NULLIF(TRIM(v_line->>'bill_path'), '')
    );
  END LOOP;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_with_dates(p_order_id text, p_service_customer_id uuid, p_type text, p_division text, p_status text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb, p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by
  ) VALUES (
    p_order_id,
    p_service_customer_id,
    p_type,
    NULLIF(p_division, ''),
    p_status::order_status,
    'not_sent'::confirmation_status,
    p_scheduled_date,
    p_total_amount,
    NULLIF(p_address, ''),
    p_address_id,
    NULLIF(p_notes, ''),
    false,
    NULLIF(p_arrival_phone, ''),
    p_attachments,
    p_created_by
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      (v_item->>'duration')::int,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      CASE WHEN v_item->'configuration' IS NULL OR v_item->>'configuration' = 'null'
           THEN NULL ELSE v_item->'configuration' END,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    IF EXISTS (
      SELECT 1
      FROM public.follow_up_requests fur
      WHERE fur.status = 'pending'
        AND fur.requested_team_id   = (v_item->>'team_id')::uuid
        AND fur.requested_date      = (v_item->>'scheduled_date')::date
        AND fur.requested_time_from IS NOT NULL
        AND fur.requested_time_to   IS NOT NULL
        AND (v_item->>'time_slot')::time
              < fur.requested_time_to
        AND fur.requested_time_from
              < ((v_item->>'time_slot')::time
                 + ((v_item->>'duration')::int * interval '1 hour'))
    ) THEN
      RAISE EXCEPTION 'slot_conflict: A customer follow-up request reserves that slot for the team on %', v_item->>'scheduled_date'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      INSERT INTO public.order_team_assignments (
        order_id, team_id, services, scheduled_date, time_slot, duration
      ) VALUES (
        v_order_id,
        (v_item->>'team_id')::uuid,
        COALESCE(v_item->'services', '[]'::jsonb),
        (v_item->>'scheduled_date')::date,
        v_item->>'time_slot',
        v_item->>'duration'
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'slot_conflict: Team is already booked for that time slot on %', v_item->>'scheduled_date'
          USING ERRCODE = 'P0001';
    END;
  END LOOP;

  RETURN v_order_id;
END;
$function$
;

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

  -- ONE stock pool sub-container (holds all project stock; no discipline). The
  -- RP is stamped here so custody consume/return authorises correctly.
  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by, project_id, discipline_id, responsible_person_profile_id)
  VALUES
    (p_warehouse_id, p_division_id, p_project_number, true, v_uid, v_project_id, NULL, p_responsible_person_profile_id);

  -- Record the project's disciplines (tags, not containers).
  INSERT INTO public.project_disciplines (project_id, discipline_id, created_by)
  SELECT v_project_id, d.id, v_uid
    FROM public.disciplines d
   WHERE d.id = ANY(p_discipline_ids) AND d.is_active
  ON CONFLICT (project_id, discipline_id) DO NOTHING;

  RETURN v_project_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_expected_delivery date, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_line_items jsonb, p_division_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so_number         TEXT;
  v_count             INTEGER;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_is_cash           BOOLEAN;
BEGIN
  IF NOT public._auth_user_has_permission('sales.orders.create') AND NOT public._auth_user_has_permission('sales.orders.manage') THEN RAISE EXCEPTION 'Not authorized to create sale orders' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  v_so_number := public.next_so_number();

  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - COALESCE(v_discount_resolved, 0);
  v_total_qar := v_total * p_exchange_rate;

  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
  INTO   v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF v_is_cash THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    v_open_total := public.customer_credit_used(p_customer_id, NULL);

    v_available := v_credit_limit - v_open_total;

    -- A quotation is a quote, not a credit commitment — it never needs approval.
    -- Only a *confirm* over the available limit goes to pending_approval.
    v_so_status := CASE
      WHEN p_intent <> 'confirm'     THEN 'quotation'::sale_order_status
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      ELSE                                'confirmed'::sale_order_status
    END;
  END IF;

  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate,
    initial_exchange_rate, initial_rate_captured_at, initial_rate_captured_by,
    total_qar,
    expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by, division_id
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate,
    p_exchange_rate, now(), v_profile_id,
    v_total_qar,
    p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id, p_division_id
  )
  RETURNING id INTO v_so_id;

  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, avg_cost,
    created_by
  )
  SELECT
    v_so_id,
    item->>'item_name',
    NULLIF(item->>'sku', ''),
    (item->>'qty')::INTEGER,
    COALESCE(NULLIF(item->>'unit', ''), 'pcs'),
    (item->>'unit_price')::NUMERIC,
    (item->>'total')::NUMERIC,
    COALESCE(NULLIF(item->>'line_type', ''), 'products'),
    CASE
      WHEN (item->>'brand_variant_id') IS NOT NULL
        AND (item->>'brand_variant_id') NOT IN ('', 'null')
      THEN (item->>'brand_variant_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER
       ))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  IF v_so_status = 'pending_approval'::sale_order_status THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available',    GREATEST(v_available, 0),
        'overage',      v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_subtotal numeric, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_notes text, p_line_items jsonb, p_division_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_type     TEXT;
  v_subtotal          NUMERIC := COALESCE(p_subtotal, 0);
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_so_number         TEXT;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB := '[]'::jsonb;
  v_line              JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  v_discount_resolved := COALESCE(p_discount_amount, 0);
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Margin gate (below-cost) ──────────────────────────────────────────
  SELECT jsonb_agg(jsonb_build_object(
           'item_name',  (li->>'item_name'),
           'unit_price', (li->>'unit_price')::numeric,
           'avg_cost',   COALESCE((li->>'avg_cost')::numeric, 0)
         )) FILTER (WHERE COALESCE((li->>'avg_cost')::numeric, 0) > 0
                       AND (li->>'unit_price')::numeric < COALESCE((li->>'avg_cost')::numeric, 0))
  INTO   v_below_cost_lines
  FROM   jsonb_array_elements(p_line_items) li;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  -- ── Credit gate (over limit) — credit customers only
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    -- New formula: outstanding on AR invoices + uninvoiced open SOs.
    v_open_total := public.customer_credit_used(p_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- ── Decide SO status
  IF p_intent = 'save_quote' THEN
    v_so_status := 'quotation';
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_so_status := 'pending_approval';
  ELSE
    v_so_status := 'confirmed';
  END IF;

  -- ── Insert SO
  v_so_number := generate_so_id();
  INSERT INTO sale_orders (
    so_number, customer_id, status, currency, exchange_rate,
    subtotal, discount_amount, discount_amount_resolved, discount_label, discount_type,
    total, validity_days, payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, customer_notes, notes,
    created_by, division_id
  ) VALUES (
    v_so_number, p_customer_id, v_so_status, p_currency, p_exchange_rate,
    v_subtotal, v_discount_resolved, v_discount_resolved, p_discount_label, p_discount_type,
    v_total, p_validity_days, p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes, p_customer_notes, p_notes,
    v_profile_id, p_division_id
  ) RETURNING id INTO v_so_id;

  -- ── Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    INSERT INTO sale_order_lines (
      sale_order_id, item_name, sku, qty, unit, unit_price, total,
      line_type, brand_variant_id, tool_asset_item_id, avg_cost
    ) VALUES (
      v_so_id,
      (v_line->>'item_name'),
      (v_line->>'sku'),
      (v_line->>'qty')::numeric,
      (v_line->>'unit'),
      (v_line->>'unit_price')::numeric,
      (v_line->>'total')::numeric,
      (v_line->>'line_type'),
      NULLIF((v_line->>'brand_variant_id'), '')::uuid,
      NULLIF((v_line->>'tool_asset_item_id'), '')::uuid,
      COALESCE((v_line->>'avg_cost')::numeric, 0)
    );
  END LOOP;

  -- ── Build approval chains
  IF v_exceeds_credit THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available',     GREATEST(v_available, 0),
        'overage',       v_total_qar - v_available,
        'requested_by',  v_profile_id
      )
    );
  END IF;
  IF v_has_below_cost THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'margin',
      jsonb_build_object(
        'lines',         v_below_cost_lines,
        'requested_by',  v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',          v_so_id,
    'so_number',      v_so_number,
    'status',         v_so_status,
    'credit_limit',   v_credit_limit,
    'group_name',     v_group_name,
    'open_total',     v_open_total,
    'available',      GREATEST(v_available, 0),
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_service_customer(p_name text, p_phone text, p_link_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id UUID;
  v_phone_id    UUID;
BEGIN
  IF NOT public._auth_user_has_permission('master_data.service_customers.create') THEN RAISE EXCEPTION 'Not authorized to create service customers' USING ERRCODE = '42501'; END IF;
  -- Check if phone already exists in service_customer_phones
  SELECT scp.customer_id, scp.id
    INTO v_customer_id, v_phone_id
    FROM public.service_customer_phones scp
   WHERE scp.phone = p_phone
   LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'customer_id',   v_customer_id,
      'phone_id',      v_phone_id,
      'customer_name', (SELECT name FROM public.service_customers WHERE id = v_customer_id)
    );
  END IF;

  -- Create new service_customer row
  INSERT INTO public.service_customers (name)
  VALUES (p_name)
  RETURNING id INTO v_customer_id;

  -- Insert primary phone
  INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
  VALUES (v_customer_id, p_phone, 'mobile', true)
  RETURNING id INTO v_phone_id;

  -- Insert optional second phone (not primary — partial index allows only one primary)
  IF p_link_phone IS NOT NULL AND p_link_phone <> '' AND p_link_phone <> p_phone THEN
    INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
    VALUES (v_customer_id, p_link_phone, 'mobile', false);
  END IF;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_site_visit(p_visit_id text, p_service_customer_id uuid, p_status text, p_mode text, p_scheduled_date date, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_visit_dates jsonb, p_assignments jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, service_customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments, created_by
  ) VALUES (
    p_visit_id,
    p_service_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments,
    p_created_by
  )
  RETURNING id INTO v_visit_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_dates (visit_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_visit_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_team_assignments (
      visit_id, team_id, scheduled_date, time_slot, duration
    ) VALUES (
      v_visit_id,
      (v_item->>'team_id')::uuid,
      (v_item->>'scheduled_date')::date,
      v_item->>'time_slot',
      COALESCE(v_item->>'duration', '1')
    );
  END LOOP;

  RETURN v_visit_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_stock_adjustment_v2(p_warehouse_id uuid, p_brand_variant_id uuid, p_adjustment_type text, p_qty numeric, p_reason text, p_notes text, p_photo_urls text[], p_requested_by uuid, p_requested_by_name text, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id             uuid;
  v_step           RECORD;
  v_ord            int := 0;
  v_check_wh       uuid;
  v_check_active   boolean;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.adjustment.request') THEN RAISE EXCEPTION 'Not authorized to create stock adjustments' USING ERRCODE = '42501'; END IF;
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  -- Phase E: sub_container_id is now REQUIRED. The old fallback derived it
  -- from warehouses.division_id, which is gone. Adjustment dialogs (D.4)
  -- already pass it.
  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'sub_container_id is required — pick one on the adjustment dialog.'
      USING HINT = 'Open the adjustment dialog and pick a sub-container from the picker.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
  FROM   public.warehouse_sub_containers sc
  WHERE  sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'Sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name
  ) VALUES (
    p_warehouse_id,
    p_sub_container_id,
    p_brand_variant_id,
    p_adjustment_type::public.stock_adjustment_type,
    p_qty,
    p_reason,
    NULLIF(p_notes,''),
    COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by,
    p_requested_by_name
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_stock_adjustment_v2(p_warehouse_id uuid, p_brand_variant_id uuid, p_adjustment_type text, p_qty numeric, p_reason text, p_notes text, p_photo_urls text[], p_requested_by uuid, p_requested_by_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id   UUID;
  v_step RECORD;
  v_ord  INT := 0;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name, created_by
  ) VALUES (
    p_warehouse_id, p_brand_variant_id, p_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes,''), COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by, p_requested_by_name, p_requested_by
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tool_item_with_default_variant(p_name_en text, p_name_ar text, p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_sku     text;
BEGIN
  IF NOT (public._auth_can_create_catalog()) THEN RAISE EXCEPTION 'Not authorized to create tool items' USING ERRCODE = '42501'; END IF;
  IF p_name_en IS NULL OR btrim(p_name_en) = '' THEN
    RAISE EXCEPTION 'name_en is required';
  END IF;

  v_item_id := gen_random_uuid();
  v_sku     := 'TOOL-' || SUBSTRING(v_item_id::text, 1, 8);

  INSERT INTO public.inventory_items (id, name_en, name_ar, category_id, sku, unit, cost_price)
  VALUES (v_item_id, btrim(p_name_en), NULLIF(btrim(p_name_ar), ''), p_category_id, v_sku, 'pcs', 0);

  INSERT INTO public.inventory_item_brand_variants (item_id, brand, cost_price, selling_price)
  VALUES (v_item_id, 'Default', 0, 0);

  RETURN v_item_id;
END $function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.create_transfer_v2(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_date date, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_bv_id UUID;
  v_qty INT;
  v_available INT;
BEGIN
  -- Generate transfer number
  v_transfer_number := generate_transfer_number();

  -- Insert the transfer header
  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name
  )
  RETURNING id INTO v_transfer_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation.
    -- If no row exists yet, lock the FIFO layers instead to serialize access.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id AND brand_variant_id = v_bv_id
    FOR UPDATE;

    -- Check available qty (stock - already allocated)
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id AND wsa.brand_variant_id = v_bv_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    -- Allocate stock (reserve it)
    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    -- Insert normalized item row
    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.create_warranty_records_for_delivery(p_delivery_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery      RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_country_id    integer;
  v_country_name  text;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_invoice_date  date;
  v_inserted      integer := 0;
BEGIN
  SELECT sd.id, sd.date, sd.sale_order_id,
         so.customer_id, so.division_id
  INTO   v_delivery
  FROM   public.sale_deliveries sd
  JOIN   public.sale_orders so ON so.id = sd.sale_order_id
  WHERE  sd.id = p_delivery_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_delivery.division_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Invoice date: look up via the SO (so_invoices has no sale_delivery_id)
  SELECT MAX(issued_date)
  INTO   v_invoice_date
  FROM   public.so_invoices
  WHERE  sale_order_id = v_delivery.sale_order_id;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty_delivered
    FROM   public.sale_delivery_lines
    WHERE  sale_delivery_id = p_delivery_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty_delivered IS NULL
       OR v_line.qty_delivered <= 0
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

    v_start_date := CASE
      WHEN v_policy.starts_from = 'invoice_date' AND v_invoice_date IS NOT NULL
        THEN v_invoice_date
      ELSE COALESCE(v_delivery.date, CURRENT_DATE)
    END;

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      sale_delivery_line_id,
      sale_order_id,
      customer_id,
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
      public.next_warranty_number('sale'::warranty_source_type, v_delivery.division_id),
      'sale'::warranty_source_type,
      v_line.id,
      v_delivery.sale_order_id,
      v_delivery.customer_id,
      v_delivery.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      v_line.sku,
      v_line.qty_delivered,
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
    ON CONFLICT (sale_delivery_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.credit_notes_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type          TEXT;
  v_division_ids       UUID[];
  v_active_division_id UUID;
  claims               JSONB;
BEGIN
  SELECT active_division_id
    INTO v_active_division_id
  FROM user_data
  WHERE auth_user_id = (event ->> 'user_id')::UUID;

  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   user_data p
  LEFT JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles           cr  ON cr.id          = ucr.role_id
                                       AND cr.is_approval_slot = true
                                       AND cr.deleted_at IS NULL
  LEFT JOIN user_company_divisions ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));
  claims := jsonb_set(
    claims,
    '{active_division_id}',
    CASE WHEN v_active_division_id IS NOT NULL
      THEN to_jsonb(v_active_division_id::text)
      ELSE 'null'::jsonb
    END
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.customer_credit_used(p_customer_id uuid, p_exclude_so_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    SUM(
      GREATEST(
        so.total * COALESCE(so.exchange_rate, 1) - COALESCE(sps.paid_qar, 0),
        0
      )
    ),
    0
  )
  FROM   sale_orders so
  LEFT   JOIN sale_order_paid_summary sps ON sps.sale_order_id = so.id
  WHERE  so.customer_id = p_customer_id
    AND  so.status      NOT IN ('cancelled')
    AND  so.deleted_at  IS NULL
    AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id);
$function$
;

CREATE OR REPLACE FUNCTION public.debit_notes_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.pdf_url IS NOT NULL
     AND (OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.status       IS DISTINCT FROM NEW.status) THEN
    NEW.pdf_url := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_fifo_layers(p_bv_id uuid, p_wh_id uuid, p_qty integer, p_is_transfer boolean, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(layer_id uuid, source_type text, source_id uuid, qty_taken integer, unit_cost numeric, total_cost numeric, sub_container_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  FOR r IN
    SELECT fcl.id,
           fcl.remaining_qty,
           fcl.total_unit_cost,
           fcl.source_type      AS r_source_type,
           fcl.source_id        AS r_source_id,
           fcl.sub_container_id AS r_sub_container_id
    FROM fifo_cost_layers fcl
    WHERE fcl.brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND fcl.warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND fcl.warehouse_id IS NULL)
      )
      AND fcl.remaining_qty > 0
      AND (p_sub_container_id IS NULL OR fcl.sub_container_id = p_sub_container_id)
    ORDER BY fcl.date ASC, fcl.receival_number ASC, fcl.created_at ASC, fcl.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id         := r.id;
    source_type      := r.r_source_type;
    source_id        := r.r_source_id;
    qty_taken        := v_take;
    unit_cost        := r.total_unit_cost;
    total_cost       := v_take * r.total_unit_cost;
    sub_container_id := r.r_sub_container_id;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  IF NOT p_is_transfer THEN
    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  PERFORM recalc_average_cost(p_bv_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_fifo_layers(p_bv_id uuid, p_wh_id uuid, p_qty integer, p_is_transfer boolean DEFAULT false)
 RETURNS TABLE(total_cost numeric, weighted_unit_cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r            RECORD;
  remaining    INT := p_qty;
  v_total_cost NUMERIC := 0;
  v_take       INT;
BEGIN
  -- Walk oldest layers first, locking each row before touching it.
  -- receival_number added between date and created_at so same-date receivals
  -- drain in arrival sequence (RCV-00010 before RCV-00011, etc.)
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
    ORDER BY date ASC, receival_number ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    v_total_cost := v_total_cost + (v_take * r.total_unit_cost);
    remaining    := remaining - v_take;
  END LOOP;

  -- Guard: if we couldn't satisfy the full quantity, roll everything back
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  -- Skip global stock_level update for warehouse-to-warehouse transfers
  IF NOT p_is_transfer THEN
    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  -- Recalculate weighted average after deduction
  PERFORM recalc_average_cost(p_bv_id);

  RETURN QUERY SELECT
    v_total_cost,
    CASE WHEN p_qty = 0 THEN 0::NUMERIC ELSE v_total_cost / p_qty END;
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.detach_payment_from_invoice(p_payment_id uuid, p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'Payment is not linked to this invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   so_invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = NULL WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_list_receival_triggers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_triggers jsonb;
  v_columns  jsonb;
  v_policies jsonb;
BEGIN
  -- All triggers on receival-related tables, with their function bodies
  SELECT jsonb_agg(jsonb_build_object(
    'table',       tgrelid::regclass::text,
    'trigger',     tgname,
    'enabled',     tgenabled,
    'function',    proname,
    'body_head',   substring(prosrc from 1 for 400)
  ) ORDER BY tgrelid::regclass::text, tgname)
  INTO v_triggers
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid IN (
    'public.receivals'::regclass,
    'public.receival_items'::regclass,
    'public.fifo_cost_layers'::regclass,
    'public.inventory_stock_movements'::regclass,
    'public.inventory_item_brand_variants'::regclass,
    'public.inventory_item_brand_variants'::regclass
  )
  AND NOT tgisinternal;

  -- Column types on the same tables — makes any text/uuid mismatch obvious
  SELECT jsonb_agg(jsonb_build_object(
    'table',    table_name,
    'column',   column_name,
    'type',     data_type,
    'nullable', is_nullable
  ) ORDER BY table_name, ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name  = 'receival_id'
    AND table_name IN ('receivals','receival_items','fifo_cost_layers',
                        'inventory_stock_movements','bills','shipments',
                        'invoices','receival_edit_requests','tool_asset_units');

  -- RLS policies on these tables (a bad policy could also throw)
  SELECT jsonb_agg(jsonb_build_object(
    'table',   tablename,
    'policy',  policyname,
    'cmd',     cmd,
    'expr',    substring(COALESCE(qual, with_check) from 1 for 400)
  ) ORDER BY tablename, policyname)
  INTO v_policies
  FROM pg_policies
  WHERE tablename IN ('receivals','receival_items','fifo_cost_layers',
                       'inventory_stock_movements','inventory_item_brand_variants',
                       'inventory_item_brand_variants');

  RETURN jsonb_build_object(
    'triggers', COALESCE(v_triggers, '[]'::jsonb),
    'receival_id_columns', COALESCE(v_columns, '[]'::jsonb),
    'policies', COALESCE(v_policies, '[]'::jsonb)
  );
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_refresh_incoming_qty(p_bv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE inventory_item_brand_variants
  SET incoming   = (
        SELECT COALESCE(
          SUM(GREATEST(pli.qty - COALESCE(pli.received_qty, 0), 0)),
          0
        )
        FROM po_line_items  pli
        JOIN purchase_orders po ON po.id = pli.po_id
        WHERE pli.brand_variant_id = p_bv_id
          AND po.status IN ('approved', 'partially_received')
          AND po.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_refresh_reserved_qty(p_bv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE inventory_item_brand_variants
  SET reserved_qty = (
        SELECT COALESCE(SUM(sol.qty), 0)
        FROM sale_order_lines sol
        JOIN sale_orders so ON so.id = sol.sale_order_id
        WHERE sol.brand_variant_id = p_bv_id
          AND so.status IN ('confirmed', 'partial_delivery')
          AND so.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_refresh_warehouse_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_wh_id UUID;
BEGIN
  -- When a row moves from warehouse A → warehouse B, refresh BOTH sides
  IF (TG_OP = 'UPDATE') AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id) THEN
    IF OLD.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = OLD.warehouse_id;
    END IF;
    IF NEW.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = NEW.warehouse_id;
    END IF;
    RETURN NULL;
  END IF;

  -- Normal case: INSERT, DELETE, or UPDATE where warehouse_id did not change
  v_wh_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  IF v_wh_id IS NULL THEN RETURN NULL; END IF;

  UPDATE warehouses SET
    item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    updated_at  = now()
  WHERE id = v_wh_id;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_linked_services_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory_item_brand_variants
    SET linked_services_count = linked_services_count + 1
    WHERE id = NEW.brand_variant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inventory_item_brand_variants
    SET linked_services_count = GREATEST(0, linked_services_count - 1)
    WHERE id = OLD.brand_variant_id;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.force_approve_credit_group_change(p_request_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id   uuid;
  v_full_name    TEXT;
  v_is_owner     BOOLEAN;
  v_request      RECORD;
  v_iteration    INT;
  v_count        INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit-group request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending (status: %)', v_request.status;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   customer_credit_group_approvals
  WHERE  request_id = p_request_id;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         comment         = COALESCE(comment, p_comment)
  WHERE  request_id = p_request_id
    AND  iteration  = v_iteration
    AND  status     = 'pending'
    AND  is_active  = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this request';
  END IF;

  -- customer_type and is_blocked columns were dropped; both are derived now
  -- (customer_type from credit_group_id IS NULL, is_blocked from block_reason
  -- IS NOT NULL). Only the group id and unblock reason need updating.
  UPDATE customers
     SET credit_group_id = v_request.requested_group_id,
         block_reason    = NULL
   WHERE id = v_request.customer_id;

  UPDATE customer_credit_group_requests
     SET status     = 'approved',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id, performer_name, severity, details
  ) VALUES (
    'Credit Group Change Force-Approved',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'critical',
    jsonb_build_object(
      'request_id',     v_request.id,
      'iteration',      v_iteration,
      'forced_count',   v_count,
      'force_comment',  NULLIF(TRIM(COALESCE(p_comment, '')), '')
    )::text
  );

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.force_approve_sales_request(p_so_id uuid, p_approval_type approval_type, p_comment text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_is_owner    BOOLEAN;
  v_iteration   INT;
  v_count       INT;
BEGIN
  PERFORM set_config('mms.approval_active', '1', true);
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  UPDATE sale_order_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = COALESCE(comment, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         is_active       = true
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type
    AND  iteration     = v_iteration
    AND  status        = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this slip';
  END IF;

  PERFORM public.advance_sales_approval(p_so_id, p_approval_type);

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.force_approve_stock_adjustment(p_adjustment_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id  uuid;
  v_full_name   text;
  v_is_owner    boolean;
  v_status      text;
  v_count       INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT status INTO v_status
  FROM   stock_adjustments
  WHERE  id = p_adjustment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment is not pending_approval (current: %)', v_status;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status          = 'approved',
         profile_id      = v_profile_id,
         profile_name    = v_full_name,
         action_at       = now(),
         notes           = COALESCE(notes, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), '')
  WHERE  adjustment_id = p_adjustment_id
    AND  status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this adjustment';
  END IF;

  PERFORM public.approve_stock_adjustment_inventory(
    p_adjustment_id => p_adjustment_id,
    p_approved_by   => v_full_name
  );

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_brand_variant_sku()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cat_name  text;
  v_item_name text;
  v_cat_abbr  text;
  v_item_abbr text;
  v_prefix    text;
  v_next_seq  integer;
BEGIN
  -- Only generate if code is null or empty
  IF NEW.code IS NOT NULL AND trim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  -- Look up item and category names
  SELECT i.name_en, c.name_en
    INTO v_item_name, v_cat_name
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
   WHERE i.id = NEW.item_id;

  -- Build abbreviations (fallback to 'XXX' if null/empty)
  v_cat_abbr  := coalesce(nullif(public.sku_abbreviation(v_cat_name, 3), ''), 'XXX');
  v_item_abbr := coalesce(nullif(public.sku_abbreviation(v_item_name, 3), ''), 'XXX');
  v_prefix    := v_cat_abbr || '-' || v_item_abbr || '-';

  -- Find next sequential number for this prefix
  SELECT coalesce(max(
    (regexp_match(code, v_prefix || '(\d+)$'))[1]::integer
  ), 0) + 1
    INTO v_next_seq
    FROM public.inventory_item_brand_variants
   WHERE code LIKE v_prefix || '%';

  NEW.code := v_prefix || lpad(v_next_seq::text, 3, '0');

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_check_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'IC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('inventory_check_seq')::TEXT, 5, '0')
$function$
;

CREATE OR REPLACE FUNCTION public.generate_consumption_number(p_consumer_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_contract_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(contract_id, '-', 3) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE contract_id LIKE 'CTR-' || current_year || '-%'
    AND contract_id NOT LIKE 'CTR-Q-%';

  PERFORM setval('contract_id_seq',
    GREATEST(existing_max + 1, nextval('contract_id_seq')), false);
  next_seq := nextval('contract_id_seq');

  RETURN 'CTR-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_order_quotation_id()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_num   INT  := nextval('order_quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_quotation_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(quotation_number, '-', 4) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE quotation_number LIKE 'CTR-Q-' || current_year || '-%';

  PERFORM setval('quotation_number_seq',
    GREATEST(existing_max + 1, nextval('quotation_number_seq')), false);
  next_seq := nextval('quotation_number_seq');

  RETURN 'CTR-Q-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_service_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prefix text;
  v_parent_code text;
  v_sibling_count int;
  v_seq text;
BEGIN
  -- Skip if code already provided (legacy data)
  IF NEW.code IS NOT NULL AND NEW.code != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.tree_type
    WHEN 'normal'   THEN 'SVC'
    WHEN 'contract'  THEN 'CTR'
    WHEN 'mobile'    THEN 'MOB'
    ELSE 'SVC'
  END;

  IF NEW.parent_id IS NULL THEN
    -- Root level: PREFIX-NNN
    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE tree_type = NEW.tree_type
      AND parent_id IS NULL
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 3, '0');
    NEW.code := v_prefix || '-' || v_seq;
  ELSE
    -- Child: PARENT_CODE-NN
    SELECT code INTO v_parent_code
    FROM services
    WHERE id = NEW.parent_id;

    -- If parent has no code yet, build a placeholder
    IF v_parent_code IS NULL OR v_parent_code = '' THEN
      v_parent_code := v_prefix || '-000';
    END IF;

    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE parent_id = NEW.parent_id
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 2, '0');
    NEW.code := v_parent_code || '-' || v_seq;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_tl_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.invoice_number := 'SINV/' ||
    EXTRACT(YEAR FROM now())::text || '/' ||
    LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '/' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_transfer_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_category_stock_aggregates(p_type text, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(category_id uuid, total_stock bigint, total_reserved bigint, total_damaged bigint, total_incoming bigint, avg_cost numeric, variant_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  leaf_cats AS (
    SELECT id FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'
  ),
  -- Global per-leaf figures. Always the source for damaged / incoming /
  -- variant_count, and for stock / reserved / value when no division filter.
  leaf_global AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(ibv.stock_level), 0)                    AS total_stock,
      COALESCE(SUM(ibv.reserved_qty), 0)                   AS total_reserved,
      COALESCE(SUM(ibv.damaged_qty), 0)                    AS total_damaged,
      COALESCE(SUM(ibv.incoming), 0)                       AS total_incoming,
      COALESCE(SUM(ibv.average_cost * ibv.stock_level), 0) AS value_num,
      COALESCE(SUM(ibv.stock_level), 0)                    AS cost_denom,
      COUNT(ibv.id)                                        AS variant_count
    FROM inventory_items ii
    JOIN inventory_item_brand_variants ibv ON ibv.item_id = ii.id
    WHERE ii.status <> 'archived' AND ibv.status <> 'archived'
    GROUP BY ii.category_id
  ),
  -- Division-scoped per-leaf good stock from warehouse_stock_summary
  -- (sub_container -> division). Only populated when p_division_ids is set.
  leaf_scoped AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(wss.qty), 0)           AS total_stock,
      COALESCE(SUM(wss.allocated_qty), 0) AS total_reserved,
      COALESCE(SUM(wss.total_value), 0)   AS value_num,
      COALESCE(SUM(wss.qty), 0)           AS cost_denom
    FROM warehouse_stock_summary wss
    JOIN inventory_item_brand_variants ibv ON ibv.id = wss.brand_variant_id
    JOIN inventory_items ii ON ii.id = ibv.item_id
    JOIN warehouse_sub_containers wsc ON wsc.id = wss.sub_container_id
    WHERE p_division_ids IS NOT NULL
      AND ii.status <> 'archived' AND ibv.status <> 'archived'
      AND wsc.division_id = ANY(p_division_ids)
    GROUP BY ii.category_id
  ),
  -- Merge: scoped stock / reserved / value when a division filter is active,
  -- else global. Damaged / incoming / variant_count always global.
  leaf_stock AS (
    SELECT
      lg.category_id,
      CASE WHEN p_division_ids IS NULL THEN lg.total_stock    ELSE COALESCE(ls.total_stock, 0)    END AS total_stock,
      CASE WHEN p_division_ids IS NULL THEN lg.total_reserved ELSE COALESCE(ls.total_reserved, 0) END AS total_reserved,
      lg.total_damaged,
      lg.total_incoming,
      CASE WHEN p_division_ids IS NULL THEN lg.value_num  ELSE COALESCE(ls.value_num, 0)  END AS value_num,
      CASE WHEN p_division_ids IS NULL THEN lg.cost_denom ELSE COALESCE(ls.cost_denom, 0) END AS cost_denom,
      lg.variant_count
    FROM leaf_global lg
    LEFT JOIN leaf_scoped ls ON ls.category_id = lg.category_id
  ),
  -- Expand each leaf's figures up to every ancestor (including itself).
  ancestors_expanded AS (
    SELECT
      ancestor.id AS ancestor_id,
      lsm.total_stock, lsm.total_reserved, lsm.total_damaged, lsm.total_incoming,
      lsm.value_num, lsm.cost_denom, lsm.variant_count
    FROM leaf_stock lsm
    JOIN (
      WITH RECURSIVE climb AS (
        SELECT id, id AS leaf_id FROM leaf_cats
        UNION ALL
        SELECT ic.parent_id, climb.leaf_id
        FROM climb
        JOIN inventory_categories ic ON ic.id = climb.id
        WHERE ic.parent_id IS NOT NULL
      )
      SELECT id AS id, leaf_id FROM climb
    ) ancestor ON ancestor.leaf_id = lsm.category_id
  )
  SELECT
    ae.ancestor_id AS category_id,
    SUM(ae.total_stock)::BIGINT    AS total_stock,
    SUM(ae.total_reserved)::BIGINT AS total_reserved,
    SUM(ae.total_damaged)::BIGINT  AS total_damaged,
    SUM(ae.total_incoming)::BIGINT AS total_incoming,
    CASE WHEN SUM(ae.cost_denom) > 0
      THEN ROUND(SUM(ae.value_num) / SUM(ae.cost_denom), 2)
      ELSE 0
    END AS avg_cost,
    SUM(ae.variant_count)::BIGINT  AS variant_count
  FROM ancestors_expanded ae
  GROUP BY ae.ancestor_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_category_stock_aggregates(p_type text)
 RETURNS TABLE(category_id uuid, total_stock bigint, total_reserved bigint, total_damaged bigint, total_incoming bigint, avg_cost numeric, variant_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE cat_tree AS (
    SELECT id, parent_id
    FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'

    UNION ALL

    SELECT child.id, child.parent_id
    FROM inventory_categories child
    JOIN cat_tree parent ON child.parent_id = parent.id
    WHERE child.status <> 'archived'
  ),
  -- Map each leaf category to all its ancestors (including itself)
  leaf_cats AS (
    SELECT id FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'
  ),
  -- Get stock per leaf category from brand variants
  leaf_stock AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(ibv.stock_level), 0) AS total_stock,
      COALESCE(SUM(ibv.reserved_qty), 0) AS total_reserved,
      COALESCE(SUM(ibv.damaged_qty), 0) AS total_damaged,
      COALESCE(SUM(ibv.incoming), 0) AS total_incoming,
      CASE WHEN COUNT(ibv.id) > 0
        THEN ROUND(SUM(ibv.average_cost * ibv.stock_level) / NULLIF(SUM(ibv.stock_level), 0), 2)
        ELSE 0
      END AS avg_cost,
      COUNT(ibv.id) AS variant_count
    FROM inventory_items ii
    JOIN inventory_item_brand_variants ibv ON ibv.item_id = ii.id
    WHERE ii.status <> 'archived'
      AND ibv.status <> 'archived'
    GROUP BY ii.category_id
  ),
  -- Expand: for each ancestor, sum the stock of all its descendant leaf categories
  ancestors_expanded AS (
    SELECT
      ancestor.id AS ancestor_id,
      ls.total_stock,
      ls.total_reserved,
      ls.total_damaged,
      ls.total_incoming,
      ls.avg_cost,
      ls.variant_count,
      ls.total_stock AS weighted_cost_numerator
    FROM leaf_stock ls
    JOIN (
      WITH RECURSIVE climb AS (
        SELECT id, id AS leaf_id FROM leaf_cats
        UNION ALL
        SELECT ic.parent_id, climb.leaf_id
        FROM climb
        JOIN inventory_categories ic ON ic.id = climb.id
        WHERE ic.parent_id IS NOT NULL
      )
      SELECT id AS id, leaf_id FROM climb
    ) ancestor ON ancestor.leaf_id = ls.category_id
  )
  SELECT
    ae.ancestor_id AS category_id,
    SUM(ae.total_stock)::BIGINT AS total_stock,
    SUM(ae.total_reserved)::BIGINT AS total_reserved,
    SUM(ae.total_damaged)::BIGINT AS total_damaged,
    SUM(ae.total_incoming)::BIGINT AS total_incoming,
    CASE WHEN SUM(ae.total_stock) > 0
      THEN ROUND(SUM(ae.avg_cost * ae.total_stock) / SUM(ae.total_stock), 2)
      ELSE 0
    END AS avg_cost,
    SUM(ae.variant_count)::BIGINT AS variant_count
  FROM ancestors_expanded ae
  GROUP BY ae.ancestor_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cogs_breakdown(p_brand_variant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sold_at_sale  NUMERIC;
  v_lc_list       JSONB;
  v_total         NUMERIC;
BEGIN
  -- Sale-time COGS total (rows with no landed_cost_id)
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_sold_at_sale
    FROM cogs_entries
   WHERE brand_variant_id = p_brand_variant_id
     AND landed_cost_id IS NULL;

  -- Per-LC net total. Original + any reversal pair cancels to zero — filter out.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lc_id',       lc.id,
        'lc_number',   lc.lc_number,
        'applied_at',  lc.applied_at,
        'total_cost',  agg.net_total
      )
      ORDER BY lc.applied_at NULLS LAST
    ),
    '[]'::JSONB
  )
  INTO v_lc_list
  FROM (
    SELECT landed_cost_id, SUM(total_cost) AS net_total
      FROM cogs_entries
     WHERE brand_variant_id = p_brand_variant_id
       AND landed_cost_id  IS NOT NULL
     GROUP BY landed_cost_id
    HAVING SUM(total_cost) <> 0
  ) agg
  JOIN landed_costs lc ON lc.id = agg.landed_cost_id;

  v_total := v_sold_at_sale + COALESCE(
    (SELECT SUM((entry->>'total_cost')::NUMERIC) FROM jsonb_array_elements(v_lc_list) AS entry),
    0
  );

  RETURN jsonb_build_object(
    'sold_at_sale',    v_sold_at_sale,
    'lc_adjustments',  v_lc_list,
    'total',           v_total
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_custody_master_list(p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, warehouse_id uuid, warehouse_name text, division_id uuid, division_name text, is_active boolean, responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_pending_balances()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(grouped))
  INTO result
  FROM (
    SELECT
      c.id                                        AS customer_id,
      c.name                                      AS customer_name,
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at
                 ),
                 '[]'::jsonb)
        FROM public.customer_phones cp
        WHERE cp.customer_id = c.id
      )                                           AS phones,
      i.division_id                               AS division_id,
      d.name                                      AS division_name,
      SUM(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0))
                                                  AS total_pending,
      COUNT(i.id)                                 AS invoice_count,
      COUNT(i.id) FILTER (WHERE i.payment_status = 'overdue')
                                                  AS overdue_count,
      jsonb_agg(
        jsonb_build_object(
          'id',             i.id,
          'invoice_id',     i.invoice_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status::text
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   so_invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  COALESCE(i.status::text, 'draft') NOT IN ('void', 'cancelled')
      AND  i.payment_status != 'paid'
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_date_team_availability(p_dates date[], p_from_time time without time zone, p_to_time time without time zone)
 RETURNS TABLE(visit_date date, available_teams_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH total_teams AS (
    SELECT COUNT(*)::integer AS cnt
    FROM   teams
    WHERE  deleted_at IS NULL
  ),
  booked_teams AS (
    SELECT DISTINCT
      ota.scheduled_date AS visit_date,
      ota.team_id
    FROM   order_team_assignments ota
    WHERE  ota.scheduled_date = ANY(p_dates)
      AND  p_from_time IS NOT NULL
      AND  p_to_time   IS NOT NULL
      -- Cast TEXT duration column to integer minutes for arithmetic
      AND  ota.time_slot::time < p_to_time
      AND  (ota.time_slot::time + (COALESCE(ota.duration::integer, 0) || ' minutes')::interval)::time > p_from_time
  ),
  booked_counts AS (
    SELECT visit_date, COUNT(DISTINCT team_id)::integer AS booked
    FROM   booked_teams
    GROUP  BY visit_date
  )
  SELECT
    d::date                                                                  AS visit_date,
    GREATEST(0, (SELECT cnt FROM total_teams) - COALESCE(bc.booked, 0))     AS available_teams_count
  FROM   UNNEST(p_dates) AS d
  LEFT   JOIN booked_counts bc ON bc.visit_date = d::date
  ORDER  BY visit_date;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dead_stock_report()
 RETURNS TABLE(brand_variant_id uuid, item_name text, category_name text, brand text, sku text, stock_level numeric, average_cost numeric, total_value numeric, last_movement_date timestamp with time zone, last_movement_source text, days_idle integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
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
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                               AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)             AS total_value,
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
    WHERE ibv.stock_level > 0
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_effective_attributes(p_category_id uuid)
 RETURNS TABLE(definition_id uuid, category_id uuid, category_name text, attribute_key text, label_en text, label_ar text, sort_order integer, depth integer, is_inherited boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, name_en, 0 AS depth
    FROM inventory_categories
    WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, t.depth + 1
    FROM inventory_categories c
    JOIN tree t ON t.parent_id = c.id
    WHERE t.depth < 10
  )
  SELECT
    d.id,
    d.category_id,
    t.name_en,
    d.attribute_key,
    d.label_en,
    d.label_ar,
    d.sort_order,
    t.depth,
    (t.depth > 0) AS is_inherited
  FROM inventory_attribute_definitions d
  JOIN tree t ON t.id = d.category_id
  ORDER BY d.sort_order ASC, t.depth ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_effective_warranty_policy(p_item_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE item AS (
    SELECT warranty_policy_id, category_id
    FROM public.inventory_items
    WHERE id = p_item_id
  ),
  -- Walk the category chain from the item's own category up toward the
  -- root. depth 0 = leaf. First row with a non-null default_warranty_policy_id
  -- (ordered by depth ASC) is the answer.
  category_chain AS (
    SELECT
      ic.id,
      ic.parent_id,
      ic.default_warranty_policy_id,
      0 AS depth
    FROM public.inventory_categories ic
    WHERE ic.id = (SELECT category_id FROM item)

    UNION ALL

    SELECT
      parent.id,
      parent.parent_id,
      parent.default_warranty_policy_id,
      child.depth + 1
    FROM public.inventory_categories parent
    JOIN category_chain child ON child.parent_id = parent.id
  ),
  category_hit AS (
    SELECT default_warranty_policy_id
    FROM category_chain
    WHERE default_warranty_policy_id IS NOT NULL
    ORDER BY depth ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT warranty_policy_id FROM item),
    (SELECT default_warranty_policy_id FROM category_hit)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_invoice_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(payment_status, cnt)
      FROM (
        SELECT payment_status::text, COUNT(*)::int AS cnt
        FROM   so_invoices
        WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
        GROUP BY payment_status
      ) sc
    ),
    'outstanding', (
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      FROM   so_invoices
      WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
        AND  payment_status != 'paid'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_responsible_warehouses()
 RETURNS TABLE(id uuid, name text, warehouse_kind text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name, w.warehouse_kind
  FROM public.warehouse_responsible_persons wrp
  JOIN public.warehouses w ON w.id = wrp.warehouse_id
  WHERE wrp.profile_id = public._current_user_data_id()
    AND COALESCE(w.is_virtual, false) = false
  ORDER BY w.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_transfer_sources()
 RETURNS TABLE(warehouse_id uuid, warehouse_name text, sub_container_id uuid, sub_container_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name, sc.id, sc.name
  FROM public.warehouse_responsible_persons wrp
  JOIN public.warehouses w
    ON w.id = wrp.warehouse_id AND COALESCE(w.is_virtual, false) = false
  JOIN public.warehouse_sub_containers sc
    ON sc.warehouse_id = w.id AND sc.is_active
  WHERE wrp.profile_id = public._current_user_data_id()
  UNION
  SELECT w.id, w.name, sc.id, sc.name
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w
    ON w.id = sc.warehouse_id AND COALESCE(w.is_virtual, false) = false
  WHERE sc.responsible_person_profile_id = public._current_user_data_id()
    AND sc.is_active;
$function$
;

CREATE OR REPLACE FUNCTION public.get_often_moved_variants(p_from_warehouse_id uuid, p_limit integer DEFAULT 8)
 RETURNS TABLE(brand_variant_id uuid, move_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ti.brand_variant_id, count(*) AS move_count
  FROM public.warehouse_transfers t
  JOIN public.warehouse_transfer_items ti ON ti.transfer_id = t.id
  WHERE t.from_warehouse_id = p_from_warehouse_id
    AND t.created_at >= (now() - interval '90 days')
    AND ti.brand_variant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.warehouse_responsible_persons wrp
      WHERE wrp.warehouse_id = p_from_warehouse_id
        AND wrp.profile_id = public._current_user_data_id()
    )
  GROUP BY ti.brand_variant_id
  ORDER BY move_count DESC, ti.brand_variant_id
  LIMIT GREATEST(p_limit, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_open_tool_check_session(p_division_id uuid)
 RETURNS TABLE(id uuid, initiated_at timestamp with time zone, initiated_by_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.initiated_at, ud.full_name
  FROM public.tool_check_sessions s
  LEFT JOIN public.user_data ud ON ud.id = s.initiated_by
  WHERE s.division_id = p_division_id AND s.status = 'in_progress'
  ORDER BY s.initiated_at DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payment_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(COALESCE(status, 'pending'), cnt)
      FROM (
        SELECT status, COUNT(*)::int AS cnt
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL
        GROUP BY status
      ) sc
    ),
    'collected', (
      SELECT COALESCE(SUM(amount), 0)
      FROM   payments
      WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
    ),
    'method_totals', (
      SELECT COALESCE(jsonb_object_agg(method, total), '{}'::jsonb)
      FROM (
        SELECT method, SUM(amount) AS total
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
        GROUP BY method
      ) mt
    )
  );
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_return_destinations()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name
  FROM public.warehouses w
  WHERE w.is_virtual = false
  ORDER BY w.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stock_value_cogs_summary(p_brand_variant_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(brand_variant_id uuid, sold_at_sale_total numeric, lc_adjustments_total numeric, lc_adjustment_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH per_lc AS (
    SELECT
      brand_variant_id,
      landed_cost_id,
      SUM(total_cost) AS lc_net_total
    FROM cogs_entries
    WHERE landed_cost_id IS NOT NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id, landed_cost_id
    HAVING SUM(total_cost) <> 0
  ),
  lc_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(lc_net_total), 0)        AS lc_adjustments_total,
      COUNT(DISTINCT landed_cost_id)::INT   AS lc_adjustment_count
    FROM per_lc
    GROUP BY brand_variant_id
  ),
  sale_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(total_cost), 0) AS sold_at_sale_total
    FROM cogs_entries
    WHERE landed_cost_id IS NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id
  )
  SELECT
    bv.id                                          AS brand_variant_id,
    COALESCE(sale_agg.sold_at_sale_total, 0)       AS sold_at_sale_total,
    COALESCE(lc_agg.lc_adjustments_total, 0)       AS lc_adjustments_total,
    COALESCE(lc_agg.lc_adjustment_count, 0)        AS lc_adjustment_count
  FROM inventory_item_brand_variants bv
  LEFT JOIN sale_agg ON sale_agg.brand_variant_id = bv.id
  LEFT JOIN lc_agg   ON lc_agg.brand_variant_id   = bv.id
  WHERE (p_brand_variant_ids IS NULL OR bv.id = ANY(p_brand_variant_ids))
    AND (
      COALESCE(sale_agg.sold_at_sale_total, 0) <> 0
      OR COALESCE(lc_agg.lc_adjustments_total, 0) <> 0
    );
$function$
;

CREATE OR REPLACE FUNCTION public.get_sub_container_division_map()
 RETURNS TABLE(sub_container_id uuid, warehouse_id uuid, division_id uuid, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, warehouse_id, division_id, is_active
  FROM public.warehouse_sub_containers;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_leader_visits(p_team_id uuid, p_from_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, date date, scheduled_time text, status text, type text, source_id uuid, source_type text, team_id uuid, customer_name text, customer_phone text, location_phone text, address text, waze_link text, services_json jsonb, team_ids uuid[], order_id text, notes text, other_teams_names text[], has_invoice boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
    -- customer_phone: strictly the primary phone on the customer record
    (SELECT p.phone FROM public.service_customer_phones p
     WHERE p.customer_id = o.service_customer_id AND p.is_primary LIMIT 1),
    -- location_phone: arrival phone captured on the order
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
    -- other_teams_names: names of every team on this order except the current one
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
    -- customer_phone: primary phone from the customer record
    (SELECT p.phone FROM public.service_customer_phones p
     WHERE p.customer_id = sv.service_customer_id AND p.is_primary LIMIT 1),
    -- location_phone: arrival phone captured on the site visit
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

CREATE OR REPLACE FUNCTION public.get_team_tool_units(p_team_id uuid)
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text, status text, assigned_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand,
         u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL)
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_tool_units_v2(p_team_id uuid)
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text, status text, assigned_at timestamp with time zone, last_inspected_at timestamp with time zone, inspection_due boolean, lifecycle_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL),
         li.last_at,
         (li.last_at IS NULL OR li.last_at < date_trunc('month', now())),
         u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN LATERAL (
    SELECT max(ins.inspected_at) AS last_at FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id
  ) li ON true
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$function$
;

CREATE OR REPLACE FUNCTION public.get_teams_with_tool_counts(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(team_id uuid, team_name text, division_id uuid, division_name text, responsible_person_name text, held_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sc.id, sc.name, sc.division_id, cd.name,
         ud.full_name,
         (SELECT count(*)::int FROM public.tool_asset_units u
            WHERE u.current_custody_location_id = sc.id AND u.status = 'assigned')
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w ON w.id = sc.warehouse_id AND w.warehouse_kind = 'custody'
  LEFT JOIN public.company_divisions cd ON cd.id = sc.division_id
  LEFT JOIN public.user_data ud ON ud.id = sc.responsible_person_profile_id
  WHERE sc.is_active IS DISTINCT FROM false
    AND (p_division_ids IS NULL OR sc.division_id = ANY(p_division_ids))
  ORDER BY cd.name, sc.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tool_check_session_progress(p_session_id uuid)
 RETURNS TABLE(checked integer, total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(DISTINCT ins.unit_id)::int FROM public.tool_unit_inspections ins WHERE ins.session_id = p_session_id),
    (SELECT count(*)::int
       FROM public.tool_asset_units u
       JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
       JOIN public.tool_check_sessions s ON s.id = p_session_id
      WHERE sc.division_id = s.division_id AND u.status = 'assigned');
$function$
;

CREATE OR REPLACE FUNCTION public.get_tool_check_session_report(p_session_id uuid)
 RETURNS TABLE(item_name text, serial_number text, lifecycle_type text, condition text, inspected_at timestamp with time zone, division_name text, session_initiated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (ins.unit_id)
         i.name_en, u.serial_number, u.lifecycle_type::text, u.condition::text, ins.inspected_at,
         cd.name, s.initiated_at
  FROM public.tool_unit_inspections ins
  JOIN public.tool_check_sessions s ON s.id = ins.session_id
  JOIN public.tool_asset_units u ON u.id = ins.unit_id
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = s.division_id
  WHERE ins.session_id = p_session_id
  ORDER BY ins.unit_id, ins.inspected_at DESC;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_tool_unit_timeline(p_unit_id uuid)
 RETURNS TABLE(assignment_id uuid, team_id uuid, team_name text, assigned_at timestamp with time zone, released_at timestamp with time zone, days numeric, is_current boolean, returned_to_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.custody_location_id, sc.name,
         a.assigned_at, a.released_at,
         round((EXTRACT(EPOCH FROM (COALESCE(a.released_at, now()) - a.assigned_at)) / 86400.0)::numeric, 1),
         (a.released_at IS NULL),
         w.name
  FROM public.tool_unit_assignments a
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
  LEFT JOIN public.warehouses w ON w.id = a.returned_to_warehouse_id
  WHERE a.unit_id = p_unit_id
  ORDER BY a.assigned_at;
$function$
;

CREATE OR REPLACE FUNCTION public.get_warehouse_names(p_ids uuid[])
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name
  FROM   public.warehouses w
  WHERE  w.id = ANY(p_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.get_warehouse_sub_containers(p_warehouse_id uuid)
 RETURNS TABLE(id uuid, name text, division_id uuid, division_name text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sc.id, sc.name, sc.division_id, cd.name, sc.is_active
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions cd ON cd.id = sc.division_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.get_warehouse_sub_containers_admin(p_warehouse_id uuid)
 RETURNS TABLE(id uuid, warehouse_id uuid, division_id uuid, division_name text, name text, is_active boolean, team_id uuid, responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sc.id,
         sc.warehouse_id,
         sc.division_id,
         d.name           AS division_name,
         sc.name,
         sc.is_active,
         sc.team_id,
         sc.responsible_person_profile_id,
         u.full_name      AS responsible_person_name,
         u.phone          AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions d ON d.id = sc.division_id
  LEFT   JOIN public.user_data         u ON u.id = sc.responsible_person_profile_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.is_active DESC, d.name NULLS LAST, sc.name;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_credit_notes_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.total_amount     IS DISTINCT FROM OLD.total_amount
    OR NEW.status           IS DISTINCT FROM OLD.status
    OR NEW.original_total   IS DISTINCT FROM OLD.original_total
    OR NEW.new_total        IS DISTINCT FROM OLD.new_total
    OR NEW.invoice_id       IS DISTINCT FROM OLD.invoice_id
    OR NEW.customer_id      IS DISTINCT FROM OLD.customer_id
    OR NEW.source_return_id IS DISTINCT FROM OLD.source_return_id
  ) THEN
    RAISE EXCEPTION 'A credit note''s amount / status / linkage cannot be edited by a direct client write — issuance/redemption/resolution run through their DEFINER RPCs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_customer_credit_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_limit numeric;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_group_id IS DISTINCT FROM OLD.credit_group_id
     AND NEW.credit_group_id IS NOT NULL THEN
    SELECT credit_limit INTO v_new_limit
    FROM credit_groups WHERE id = NEW.credit_group_id;

    IF COALESCE(v_new_limit, 0) > 0 THEN
      RAISE EXCEPTION 'A credit group with a limit can only be assigned through the credit-group approval workflow (submit_credit_group_change), not a direct update.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_debit_notes_money_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.total_amount      IS DISTINCT FROM OLD.total_amount
    OR NEW.original_total    IS DISTINCT FROM OLD.original_total
    OR NEW.new_total         IS DISTINCT FROM OLD.new_total
    OR NEW.remaining_amount  IS DISTINCT FROM OLD.remaining_amount
    OR NEW.bill_id           IS DISTINCT FROM OLD.bill_id
    OR NEW.supplier_id       IS DISTINCT FROM OLD.supplier_id
    OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
    OR NEW.source_return_id  IS DISTINCT FROM OLD.source_return_id
  ) THEN
    RAISE EXCEPTION 'A debit note''s amount / linkage cannot be edited by a direct client write — application/offset runs through rpc_apply_debit_note_to_bill.'
      USING ERRCODE = '42501';
  END IF;

  -- NB: status and resolution_type are intentionally NOT guarded — the client
  -- legitimately sets status='resolved' + resolution_type on manual resolution.

  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.guard_payments_money_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.amount        IS DISTINCT FROM OLD.amount
    OR NEW.amount_qar    IS DISTINCT FROM OLD.amount_qar
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.currency      IS DISTINCT FROM OLD.currency
    OR NEW.direction     IS DISTINCT FROM OLD.direction
    OR NEW.status        IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'A payment''s amount / fx / currency / direction / status cannot be edited by a direct client write — use rpc_edit_*_payment / rpc_delete_*_payment.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_po_locked_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'partially_received', 'received', 'completed', 'cancelled')
     AND NEW.status = OLD.status   -- staying locked; a transition out (amend) is allowed
     AND (
          NEW.supplier_id           IS DISTINCT FROM OLD.supplier_id
       OR NEW.supplier_name         IS DISTINCT FROM OLD.supplier_name
       OR NEW.currency              IS DISTINCT FROM OLD.currency
       OR NEW.exchange_rate         IS DISTINCT FROM OLD.exchange_rate
       OR NEW.initial_exchange_rate IS DISTINCT FROM OLD.initial_exchange_rate
       OR NEW.subtotal              IS DISTINCT FROM OLD.subtotal
       OR NEW.total_qar             IS DISTINCT FROM OLD.total_qar
       OR NEW.discount_amount       IS DISTINCT FROM OLD.discount_amount
       OR NEW.discount_label        IS DISTINCT FROM OLD.discount_label
       OR NEW.payment_terms         IS DISTINCT FROM OLD.payment_terms
       OR NEW.payment_terms_notes   IS DISTINCT FROM OLD.payment_terms_notes
       OR NEW.payment_milestones    IS DISTINCT FROM OLD.payment_milestones
       OR NEW.delivery_terms        IS DISTINCT FROM OLD.delivery_terms
       OR NEW.delivery_terms_notes  IS DISTINCT FROM OLD.delivery_terms_notes
       OR NEW.expected_delivery     IS DISTINCT FROM OLD.expected_delivery
       OR NEW.quote_deadline        IS DISTINCT FROM OLD.quote_deadline
     )
  THEN
    RAISE EXCEPTION 'A "%" purchase order''s amounts/terms cannot be edited directly — amend it (which returns it to pending approval) first.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_po_privileged_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER RPCs (and the service
  -- role) run as a non-client role and are the only legitimate source of a
  -- privileged status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_approval') THEN
      RAISE EXCEPTION 'A purchase order cannot be created with status "%" — that is set by the approval/receival workflow.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('draft', 'pending_approval', 'cancelled') THEN
      RAISE EXCEPTION 'PO status "%" can only be set by the approval/receival workflow, not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_sale_delivery_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER workflow RPCs (and the
  -- service role) run as a non-client role and are the only legitimate source of
  -- a workflow status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'A sale delivery cannot be created with status "%" — the delivery workflow sets that.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('delivered', 'in_progress', 'cancelled') THEN
      RAISE EXCEPTION 'Sale delivery status "%" can only be set by the delivery workflow (complete/cancel RPCs), not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_so_invoice_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.total_amount  IS DISTINCT FROM OLD.total_amount
    OR NEW.subtotal      IS DISTINCT FROM OLD.subtotal
    OR NEW.customer_id   IS DISTINCT FROM OLD.customer_id
    OR NEW.sale_order_id IS DISTINCT FROM OLD.sale_order_id
  ) THEN
    RAISE EXCEPTION 'so_invoice totals / linkage are set by the invoice builder RPCs and cannot be changed by a direct client write.'
      USING ERRCODE = '42501';
  END IF;

  -- Only 'void' is a client-settable status transition; every other status is
  -- workflow/DEFINER-owned (generate/sync/mark_overdue).
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'void' THEN
    RAISE EXCEPTION 'so_invoice status "%" can only be set by the invoice workflow (only void is client-settable).', NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_so_po_returns_rpc_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    OR NEW.restocked_at  IS DISTINCT FROM OLD.restocked_at
  ) THEN
    RAISE EXCEPTION 'so_po_returns.dispatched_at / restocked_at are set only by the dispatch / restock RPCs, not by a direct client write.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_so_privileged_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER workflow RPCs (and the
  -- service role) run as a non-client role and are the only legitimate source
  -- of a workflow status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('quotation', 'pending_approval') THEN
      RAISE EXCEPTION 'A sale order cannot be created with status "%" — that is set by the workflow.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 'confirmed' now routes through confirm_sale_order (credit gate); only
    -- 'cancelled' remains a direct client transition.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status <> 'cancelled'::sale_order_status THEN
      RAISE EXCEPTION 'Sale order status "%" can only be set by the confirm/delivery/invoice/approval workflow, not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.guard_tool_unit_division_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.division_id IS NOT DISTINCT FROM OLD.division_id THEN
    RETURN NEW;
  END IF;

  IF NOT _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to change the owning division of a tool unit'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.has_admin_permission()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_data p
    JOIN public.user_custom_roles ur ON ur.profile_id = p.id
    JOIN public.custom_roles      cr ON cr.id        = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (
        cr.is_system_admin = true
        OR 'master_data.users.manage' = ANY (cr.permissions)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_inventory_manager_role(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'inventory_manager'
      AND cr.deleted_at IS NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.increment_credit_balance(p_customer_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE customers
  SET credit_balance = COALESCE(credit_balance, 0) + p_amount,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.inventory_pricing_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.cost_price    IS DISTINCT FROM OLD.cost_price
   OR NEW.selling_price IS DISTINCT FROM OLD.selling_price)
   AND NOT public._user_has_permission(public._current_user_data_id(),'inventory.pricing.manage')
  THEN
    RAISE EXCEPTION 'Permission denied: inventory.pricing.manage required to change prices'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.so_invoices
     SET pdf_url = NULL
   WHERE id = v_invoice_id
     AND pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(amount), 0) AS paid  -- FIX: was COALESCE(amount_qar, amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.so_invoices i
  SET    paid_amount    = summed.paid,
         payment_status = (CASE
           WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0                                      THEN 'partially_paid'
           ELSE                                                           'unpaid'
         END)::public.invoice_payment_status
  FROM   summed
  WHERE  i.id = v_invoice_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(amount), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.so_invoices i
      SET    paid_amount    = summed.paid,
             payment_status = (CASE
               WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0                                      THEN 'partially_paid'
               ELSE                                                           'unpaid'
             END)::public.invoice_payment_status
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invoices_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_any_division_visible(p_division_ids uuid[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_division_ids, '{}'::uuid[])) AS d(id)
    WHERE public.is_division_visible(d.id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    -- (a) System Admin role
    EXISTS (
      SELECT 1
      FROM user_data p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      WHERE p.auth_user_id = auth.uid()
        AND cr.is_system = true
    )
    OR
    -- (b) Super-viewer (owner / accountant) via JWT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- (c) Has any contracts permission AND division overlap
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN user_data p ON p.auth_user_id = auth.uid()
      JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
      JOIN custom_roles           cr  ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      JOIN user_company_divisions ud  ON ud.profile_id = p.id
      JOIN company_divisions      d   ON d.id = ud.division_id
      WHERE c.id = p_contract_id
        AND d.slug = ANY(c.divisions)
        AND (
          'contracts.quotations.view'   = ANY(cr.permissions) OR
          'contracts.quotations.manage' = ANY(cr.permissions) OR
          'contracts.live.view'         = ANY(cr.permissions) OR
          'contracts.live.manage'       = ANY(cr.permissions) OR
          'contracts.activate'          = ANY(cr.permissions)
        )
    )
    OR
    -- (d) Legacy JWT-based division match
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN company_divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_division_member(row_division_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    row_division_id IS NULL
    OR (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR row_division_id = ANY(
      ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::uuid[]
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT
      auth.jwt() ->> 'user_type'                             AS user_type,
      NULLIF(auth.jwt() ->> 'active_division_id', '')::uuid  AS active_div
  )
  SELECT
    row_division_id IS NULL
    OR (
      (SELECT user_type FROM c) IN ('owner', 'accountant')
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    )
    OR (
      row_division_id = ANY(
        ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::UUID[]
      )
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_field_rp_of(p_profile_id uuid, p_warehouse_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_responsible_persons wrp
    WHERE  wrp.profile_id   = p_profile_id
      AND  wrp.warehouse_id = p_warehouse_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_sub_container_rp(p_profile_id uuid, p_sub_container_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id                            = p_sub_container_id
      AND  sc.responsible_person_profile_id = p_profile_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_sub_container_visible(p_sub_container_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND (
         -- Branch A: user's division access covers the sub-container's
         -- division. is_division_visible(NULL) returns TRUE, so virtual
         -- repair-vendor sub-containers are visible to all authenticated.
         public.is_division_visible(sc.division_id)
         OR
         -- Branch B: user is a responsible person of the parent warehouse.
         EXISTS (
           SELECT 1
             FROM public.warehouse_responsible_persons rp
            WHERE rp.warehouse_id = sc.warehouse_id
              AND rp.profile_id   = public._current_user_data_id()
         )
       )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.list_assigned_tool_units(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, current_team_id uuid, current_team_name text, status text, condition text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name,
         u.status::text, u.condition::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE u.status = 'assigned'::public.tool_status
    AND (
      p_division_ids IS NULL
      OR array_length(p_division_ids, 1) IS NULL
      OR u.division_id = ANY (p_division_ids)
    )
  ORDER BY i.name_en NULLS LAST, u.serial_number
  LIMIT 200;
$function$
;

CREATE OR REPLACE FUNCTION public.log_activity_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module    text := TG_ARGV[0];
  v_mode      text := COALESCE(TG_ARGV[1], 'lean');
  v_verb      text := CASE TG_OP
                        WHEN 'INSERT' THEN 'created'
                        WHEN 'UPDATE' THEN 'updated'
                        WHEN 'DELETE' THEN 'deleted'
                        ELSE lower(TG_OP)
                      END;
  v_entity    uuid;
  v_performer text;
  v_old       jsonb;
  v_new       jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity := OLD.id;
  ELSE
    v_entity := NEW.id;
  END IF;

  -- Resolve the acting user; never let a lookup failure block the write.
  BEGIN
    SELECT full_name INTO v_performer
    FROM public.user_data
    WHERE auth_user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_performer := NULL;
  END;

  IF v_mode = 'full' THEN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  END IF;

  INSERT INTO public.activity_log
    (action, module, entity_id, entity_type, performer_name, old_data, new_data, severity)
  VALUES
    (v_module || '.' || v_verb, v_module, v_entity, v_module, v_performer, v_old, v_new, 'info');

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Audit is best-effort; a logging failure must never abort the operation.
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_sales_approval_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action  TEXT;
  v_details TEXT;
BEGIN
  IF NEW.source_type <> 'sale_order' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status      THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' AND NEW.force_approved THEN
    v_action := format('Sales Approval Force-Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSIF NEW.status = 'approved' THEN
    v_action := format('Sales Approval Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSE
    v_action := format('Sales Approval Rejected — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  END IF;

  v_details := jsonb_build_object(
    'approval_type', NEW.approval_type,
    'step_role',     NEW.step_role,
    'iteration',     NEW.iteration,
    'comment',       NULLIF(NEW.comment, ''),
    'reason',        CASE WHEN NEW.status = 'rejected' THEN NEW.reason ELSE NULL END,
    'force',         NEW.force_approved
  )::text;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id,
    performer_name, severity, details
  ) VALUES (
    v_action,
    'sale_orders',
    'sale_order',
    NEW.source_id,
    NEW.decided_by_name,
    (CASE
      WHEN NEW.status = 'rejected'        THEN 'warning'
      WHEN NEW.force_approved              THEN 'critical'
      ELSE                                       'info'
    END)::audit_severity,
    v_details
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_overdue_bills()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE bills
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE so_invoices
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.next_delivery_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'DEL-' || LPAD(nextval('delivery_number_seq')::TEXT, 5, '0');
$function$
;

CREATE OR REPLACE FUNCTION public.next_follow_up_order_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr       INT  := EXTRACT(YEAR  FROM now())::INT;
  mo       INT  := EXTRACT(MONTH FROM now())::INT;
  seq      INT;
  seq_name TEXT := 'follow_up_order_seq_' || yr || '_' || LPAD(mo::TEXT, 2, '0');
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FU/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.next_follow_up_request_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr   INT := EXTRACT(YEAR FROM now())::INT;
  seq  INT;
  seq_name TEXT := 'follow_up_request_seq_' || yr;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FUR-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.next_po_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'PO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  -- Serialize concurrent creates within the same year+month.
  PERFORM pg_advisory_xact_lock(hashtext('po_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.purchase_orders
  WHERE  po_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $function$
;

CREATE OR REPLACE FUNCTION public.next_so_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'SO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('so_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.sale_orders
  WHERE  so_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $function$
;

CREATE OR REPLACE FUNCTION public.next_warranty_claim_number(p_division_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n integer; v_slug text;
BEGIN
  INSERT INTO warranty_claim_counters(division_id, next_value)
  VALUES (p_division_id, 1)
  ON CONFLICT (division_id) DO UPDATE SET next_value = warranty_claim_counters.next_value + 1
  RETURNING next_value INTO v_n;
  v_slug := public.resolve_warranty_division_slug(p_division_id);  -- reuse existing slug helper
  RETURN 'WC-' || v_slug || '-' || lpad(v_n::text, 5, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.next_warranty_number(p_source_type warranty_source_type, p_division_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug     text;
  v_counter  integer;
  v_source_s text;
BEGIN
  v_slug := public.resolve_warranty_division_slug(p_division_id);

  INSERT INTO public.warranty_number_counters (source_type, division_id, next_value)
  VALUES (p_source_type, p_division_id, 2)
  ON CONFLICT (source_type, division_id)
  DO UPDATE SET next_value = warranty_number_counters.next_value + 1
  RETURNING next_value - 1 INTO v_counter;

  v_source_s := upper(p_source_type::text);

  RETURN 'WAR-' || v_source_s || '-' || v_slug || '-' || lpad(v_counter::text, 3, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_approvers_on_service_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_approver_id UUID;
  v_service_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Only fire on new pending requests
  IF NEW.status != 'pending' THEN
    RETURN NULL;
  END IF;

  -- Resolve service name (for edits/deletes) or from changes payload (for adds)
  IF NEW.service_id IS NOT NULL THEN
    SELECT name_en INTO v_service_name FROM services WHERE id = NEW.service_id;
  ELSE
    v_service_name := NEW.changes->'name_en'->>'new';
  END IF;
  v_service_name := COALESCE(v_service_name, 'Unknown Service');

  -- Resolve requester name
  SELECT full_name INTO v_requester_name FROM user_data WHERE id = NEW.requested_by;
  v_requester_name := COALESCE(v_requester_name, 'Unknown User');

  -- Insert notification for each approver (except the requester themselves)
  FOR v_approver_id IN
    SELECT DISTINCT ucr.profile_id
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE (cr.is_system_admin = true OR 'master_data.services.approve' = ANY(cr.permissions))
      AND ucr.profile_id != NEW.requested_by
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, related_id, related_type)
    VALUES (
      v_approver_id,
      'service_change_pending',
      'Service change pending approval',
      v_requester_name || ' requested a ' || NEW.change_type || ' on "' || v_service_name || '"',
      COALESCE(NEW.service_id, NEW.id),
      'service'
    );
  END LOOP;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payment_bill_allocations_trigger_recompute_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.bill_recompute_paid_fn(NEW.bill_id);
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.bill_id IS DISTINCT FROM COALESCE(NEW.bill_id, OLD.bill_id) THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payments_redirect_to_invoice_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF NEW.source_type <> 'sale_order' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice_id
  FROM   public.so_invoices
  WHERE  sale_order_id = NEW.source_id
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
    NEW.invoice_id  := v_invoice_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payments_sync_invoice_id_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.source_type = 'invoice' AND NEW.source_id IS NOT NULL THEN
    NEW.invoice_id := NEW.source_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payments_trigger_bill_recompute_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_bill_id uuid;
  v_old_bill_id uuid;
  v_new_po_id   uuid;
  v_old_po_id   uuid;
  b_rec         RECORD;
BEGIN
  -- Collect all bill_ids and po_ids potentially affected by this change.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_new_bill_id := NEW.bill_id;
    IF NEW.source_type = 'bill'           THEN v_new_bill_id := NEW.source_id; END IF;
    IF NEW.source_type = 'purchase_order' THEN v_new_po_id   := NEW.source_id; END IF;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_bill_id := OLD.bill_id;
    IF OLD.source_type = 'bill'           THEN v_old_bill_id := OLD.source_id; END IF;
    IF OLD.source_type = 'purchase_order' THEN v_old_po_id   := OLD.source_id; END IF;
  END IF;

  -- Recompute directly-referenced bills.
  IF v_new_bill_id IS NOT NULL THEN
    PERFORM public.bill_recompute_paid_fn(v_new_bill_id);
  END IF;
  IF v_old_bill_id IS NOT NULL AND v_old_bill_id IS DISTINCT FROM v_new_bill_id THEN
    PERFORM public.bill_recompute_paid_fn(v_old_bill_id);
  END IF;

  -- Recompute bills linked via PO (1 PO = 1 bill in this app, but loop for safety).
  IF v_new_po_id IS NOT NULL THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_new_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;
  IF v_old_po_id IS NOT NULL AND v_old_po_id IS DISTINCT FROM v_new_po_id THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_old_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.po_approval_action(p_po_id uuid, p_step_id uuid, p_approver_email text, p_approver_name text, p_approver_profile_id uuid, p_action text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today          DATE := CURRENT_DATE;
  v_now            TIMESTAMPTZ := now();
  v_step           RECORD;
  v_iteration      INT;
  v_po             RECORD;
  v_approved_roles TEXT[] := '{}';
  v_pending_ids    UUID[];
  v_is_owner       BOOLEAN;
  -- Real caller identity, derived from the JWT. Never trust the p_approver_* args.
  v_uid            UUID := auth.uid();
  v_profile_id     UUID;
  v_email          TEXT;
  v_name           TEXT;
  v_roles          TEXT[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, email, full_name
    INTO v_profile_id, v_email, v_name
    FROM user_data WHERE auth_user_id = v_uid;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for the authenticated user';
  END IF;
  v_name := COALESCE(NULLIF(trim(v_name), ''), v_email);

  -- Caller's approval-slot role names (e.g. 'Owner', 'Purchase Manager').
  SELECT COALESCE(array_agg(cr.name), '{}')
    INTO v_roles
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
   WHERE ucr.profile_id = v_profile_id
     AND cr.is_approval_slot = true
     AND cr.deleted_at IS NULL;
  v_is_owner := ('Owner' = ANY(v_roles));

  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- ── APPROVE ──────────────────────────────────────────────────────────
  IF p_action = 'approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for approve action';
    END IF;

    SELECT tier_rank, iteration, role, status, is_active
      INTO v_step
      FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;
    IF v_step.status != 'pending' OR v_step.is_active != true THEN
      RAISE EXCEPTION 'Step is not pending/active';
    END IF;

    -- AUTHZ: the caller must actually hold this step's approval role.
    IF NOT (v_step.role = ANY(v_roles)) THEN
      RAISE EXCEPTION 'You do not hold the "%" approval role', v_step.role;
    END IF;

    IF EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id
         AND tier_rank = v_step.tier_rank
         AND iteration = v_step.iteration
         AND status = 'approved'
         AND approved_by = v_email
         AND id != p_step_id
    ) THEN
      RAISE EXCEPTION 'Four-eyes violation: you already approved another role in this tier';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Approved: ' || v_step.role, p_comment, v_name, 'info');

  -- ── FORCE APPROVE (single step) ─────────────────────────────────────
  ELSIF p_action = 'force_approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for force_approve action';
    END IF;
    IF p_comment IS NULL OR trim(p_comment) = '' THEN
      RAISE EXCEPTION 'A comment is required for force-approve';
    END IF;

    -- AUTHZ: the REAL caller must be an Owner (not a claimed profile_id).
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, force_approved = true, force_comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Force Approved: ' || v_step.role, p_comment, v_name, 'critical');

  -- ── FORCE APPROVE ALL ────────────────────────────────────────────────
  ELSIF p_action = 'force_approve_all' THEN
    -- AUTHZ: the REAL caller must be an Owner.
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT array_agg(id), array_agg(role)
      INTO v_pending_ids, v_approved_roles
      FROM po_approvals
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true;

    IF v_pending_ids IS NULL OR array_length(v_pending_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'No pending steps to force-approve';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = v_email,
      date = v_today, force_approved = true,
      force_comment = CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END
    WHERE id = ANY(v_pending_ids);

    FOR i IN 1..array_length(v_approved_roles, 1) LOOP
      INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
      VALUES ('purchase_order', p_po_id, 'purchase_orders',
              'Force Approved: ' || v_approved_roles[i],
              CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END,
              v_name, 'critical');
    END LOOP;

  -- ── REJECT (cancel or send-back-to-draft) ───────────────────────────
  ELSIF p_action IN ('reject_cancel', 'reject_draft') THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for reject action';
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id AND po_id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    -- AUTHZ: the caller must hold this step's role to reject through it.
    IF NOT (v_step.role = ANY(v_roles)) THEN
      RAISE EXCEPTION 'You do not hold the "%" approval role', v_step.role;
    END IF;

    UPDATE po_approvals SET
      status = 'rejected', approved_by = v_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    UPDATE po_approvals SET status = 'rejected'
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true AND id != p_step_id;

    IF p_action = 'reject_cancel' THEN
      UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id;
    ELSE
      UPDATE purchase_orders SET status = 'draft' WHERE id = p_po_id;
    END IF;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            CASE WHEN p_action = 'reject_cancel'
              THEN 'Rejected by ' || v_step.role || ' — PO Cancelled'
              ELSE 'Rejected by ' || v_step.role || ' — Sent Back to Draft'
            END,
            p_comment, v_name, 'warning');

    SELECT created_by, po_number INTO v_po
      FROM purchase_orders WHERE id = p_po_id;
    IF v_po.created_by IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, related_id, related_type)
      VALUES (v_po.created_by, 'po_rejected',
              'PO ' || v_po.po_number || ' was rejected by ' || v_email,
              p_po_id, 'purchase_order');
    END IF;

    UPDATE notifications SET read_at = v_now
     WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true, 'po_status',
      CASE WHEN p_action = 'reject_cancel' THEN 'cancelled' ELSE 'draft' END,
      'action', p_action, 'roles', to_jsonb(v_approved_roles)
    );

  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  -- ── Common post-approve path: clear notifications + advance/complete ──
  UPDATE notifications SET read_at = v_now
   WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

  DECLARE
    v_adv_iteration INT;
    v_next_rank     INT;
    v_all_done      BOOLEAN;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM purchase_orders WHERE id = p_po_id AND status = 'pending_approval'
    ) THEN
      SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
      RETURN jsonb_build_object('ok', true, 'po_status', v_po.status, 'action', p_action, 'roles', to_jsonb(v_approved_roles));
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_adv_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT NOT EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = true AND status != 'approved'
    ) INTO v_all_done;

    IF v_all_done THEN
      SELECT MIN(tier_rank) INTO v_next_rank
        FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = false AND status = 'pending';

      IF v_next_rank IS NOT NULL THEN
        UPDATE po_approvals SET is_active = true
         WHERE po_id = p_po_id AND iteration = v_adv_iteration AND tier_rank = v_next_rank;
      ELSE
        UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;

        SELECT created_by, po_number INTO v_po FROM purchase_orders WHERE id = p_po_id;
        IF v_po.created_by IS NOT NULL THEN
          INSERT INTO notifications (profile_id, type, title, related_id, related_type)
          VALUES (v_po.created_by, 'po_approved',
                  'PO ' || v_po.po_number || ' has been fully approved',
                  p_po_id, 'purchase_order');
        END IF;

        INSERT INTO activity_log (entity_type, entity_id, module, action, performer_name, severity)
        VALUES ('purchase_order', p_po_id, 'purchase_orders',
                CASE WHEN p_action LIKE 'force%' THEN 'PO Fully Approved (Force)' ELSE 'PO Fully Approved' END,
                v_name,
                (CASE WHEN p_action LIKE 'force%' THEN 'critical' ELSE 'info' END)::audit_severity);
      END IF;
    END IF;
  END;

  SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object(
    'ok', true, 'po_status', v_po.status,
    'action', p_action, 'roles', to_jsonb(v_approved_roles)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.po_line_items_invalidate_parent_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF v_po_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.purchase_orders
     SET pdf_rfq_url       = NULL,
         pdf_draft_url     = NULL,
         pdf_po_url        = NULL,
         pdf_confirmed_url = NULL,
         pdf_payment_hash  = NULL
   WHERE id = v_po_id
     AND (pdf_rfq_url IS NOT NULL
       OR pdf_draft_url IS NOT NULL
       OR pdf_po_url IS NOT NULL
       OR pdf_confirmed_url IS NOT NULL
       OR pdf_payment_hash IS NOT NULL);
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_rfq_url       := NULL;
  NEW.pdf_draft_url     := NULL;
  NEW.pdf_po_url        := NULL;
  NEW.pdf_confirmed_url := NULL;
  NEW.pdf_payment_hash  := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reason_list_categories_no_orphan_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  -- Hard delete blocked when reasons exist; soft delete still works because
  -- it's an UPDATE not a DELETE, and reasons can also be soft-archived
  -- separately by toggling reason_lists.active.
  SELECT COUNT(*) INTO v_count
  FROM   public.reason_lists
  WHERE  category = OLD.slug AND deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % active reason(s) still reference it. Soft-delete (set deleted_at) or move the reasons first.',
      OLD.slug, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reason_lists_category_must_exist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reason_list_categories
    WHERE slug = NEW.category AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unknown reason category: %. Add it to reason_list_categories first.', NEW.category
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recalc_average_cost(p_bv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT
    CASE
      WHEN SUM(remaining_qty) = 0 THEN 0
      ELSE SUM(remaining_qty * total_unit_cost) / SUM(remaining_qty)
    END
  INTO v_avg
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_bv_id
    AND remaining_qty > 0
    AND total_unit_cost > 0;  -- exclude free/zero-cost layers

  UPDATE inventory_item_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC;
  v_paid  NUMERIC;
  v_new   public.invoice_payment_status;
BEGIN
  SELECT total_amount INTO v_total FROM so_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid  -- FIX: was COALESCE(amount_qar, amount)
  FROM   payments
  WHERE  (
           (source_type = 'invoice' AND source_id = p_invoice_id)
           OR invoice_id = p_invoice_id
         )
    AND  deleted_at IS NULL
    AND  direction  = 'incoming';

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0                                     THEN 'partially_paid'
    ELSE                                                     'unpaid'
  END;

  UPDATE so_invoices
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_invoice_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receival_items_invalidate_parent_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_receival_id UUID;
BEGIN
  v_receival_id := COALESCE(NEW.receival_id, OLD.receival_id);
  IF v_receival_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.receivals
     SET check_sheet_pdf_url = NULL
   WHERE id = v_receival_id
     AND check_sheet_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receivals_invalidate_check_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.check_sheet_pdf_url := NULL;
  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.recipients_for_permission(p_perm text, p_warehouse_id uuid DEFAULT NULL::uuid, p_override text DEFAULT NULL::text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct ucr.profile_id
  from public.user_custom_roles ucr
  join public.custom_roles cr on cr.id = ucr.role_id
  where cr.deleted_at is null
    -- role grants the permission (or is a full system admin, or holds the override)
    and (
      p_perm = any(cr.permissions)
      or 'system.admin' = any(cr.permissions)
      or coalesce(cr.is_system_admin, false)
      or (p_override is not null and p_override = any(cr.permissions))
    )
    -- warehouse scope: perm-holders must be an RP of the warehouse; override-holders bypass
    and (
      p_warehouse_id is null
      or exists (
        select 1 from public.warehouse_responsible_persons rp
        where rp.warehouse_id = p_warehouse_id
          and rp.profile_id = ucr.profile_id
      )
      or (p_override is not null and p_override = any(cr.permissions))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_all_stock_summaries()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  TRUNCATE warehouse_stock_summary;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  )
  SELECT
    f.warehouse_id,
    f.sub_container_id,
    f.brand_variant_id,
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    SUM(f.remaining_qty)::integer,
    -- avg cost over PAID layers only (exclude free/zero-cost).
    COALESCE(
      SUM(f.remaining_qty::numeric * f.total_unit_cost) FILTER (WHERE f.total_unit_cost > 0)
      / NULLIF(SUM(f.remaining_qty) FILTER (WHERE f.total_unit_cost > 0), 0),
      0),
    SUM(f.remaining_qty::numeric * f.total_unit_cost),
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text,
    COALESCE(wsa.allocated_qty, 0),
    GREATEST(SUM(f.remaining_qty)::integer - COALESCE(wsa.allocated_qty, 0), 0),
    now()
  FROM fifo_cost_layers f
  JOIN inventory_item_brand_variants ibv ON ibv.id = f.brand_variant_id
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  LEFT JOIN warehouse_stock_allocations wsa
    ON wsa.warehouse_id     = f.warehouse_id
   AND wsa.sub_container_id = f.sub_container_id
   AND wsa.brand_variant_id = f.brand_variant_id
  WHERE f.remaining_qty     > 0
    AND f.warehouse_id     IS NOT NULL
    AND f.sub_container_id IS NOT NULL
  GROUP BY
    f.warehouse_id, f.sub_container_id, f.brand_variant_id,
    ii.name_en, ibv.brand, ii.sku, ii.unit,
    ic.name_en, ic.type, ic_parent.id, ic_parent.name_en, ic_parent.type,
    wsa.allocated_qty;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_po_status(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status  po_status;
  v_total_qar       NUMERIC;
  v_total_paid_qar  NUMERIC;
  v_line_count      INT;
  v_fully_received  INT;
  v_any_received    INT;
  v_new_status      po_status;
BEGIN
  SELECT status, COALESCE(total_qar, 0)
  INTO   v_current_status, v_total_qar
  FROM   purchase_orders
  WHERE  id = p_po_id;

  IF v_current_status IN ('draft', 'pending_approval', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)                                                 AS total_lines,
    COUNT(*) FILTER (WHERE received_qty > 0)                 AS any_received,
    COUNT(*) FILTER (WHERE received_qty >= qty AND qty > 0)  AS fully_received
  INTO v_line_count, v_any_received, v_fully_received
  FROM po_line_items
  WHERE po_id = p_po_id;

  SELECT COALESCE(SUM(amount_qar), 0)
  INTO   v_total_paid_qar
  FROM   payments
  WHERE  source_type = 'purchase_order'
    AND  source_id   = p_po_id
    AND  status NOT IN ('failed', 'refunded');

  v_new_status := v_current_status;

  IF v_current_status = 'approved' AND v_any_received > 0 THEN
    IF v_line_count > 0 AND v_fully_received = v_line_count THEN
      v_new_status := 'received';
    ELSE
      v_new_status := 'partially_received';
    END IF;
  END IF;

  IF v_new_status = 'partially_received'
     AND v_line_count > 0
     AND v_fully_received = v_line_count
  THEN
    v_new_status := 'received';
  END IF;

  IF v_new_status = 'received'
     AND v_total_qar > 0
     AND v_total_paid_qar >= v_total_qar
  THEN
    v_new_status := 'completed';
  END IF;

  IF v_new_status <> v_current_status THEN
    UPDATE purchase_orders
    SET    status     = v_new_status,
           updated_at = now()
    WHERE  id = p_po_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_stock_summary_row(p_warehouse_id uuid, p_brand_variant_id uuid, p_sub_container_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty         integer;
  v_avg_cost    numeric;
  v_total_value numeric;
  v_alloc       integer;
  v_item_name   text;
  v_brand       text;
  v_sku         text;
  v_unit        text;
  v_category    text;
  v_subcategory text;
  v_item_type   text;
BEGIN
  IF p_warehouse_id IS NULL OR p_sub_container_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(remaining_qty), 0)::integer,
    -- avg cost = value / qty over PAID layers only (exclude free/zero-cost),
    -- so free units do not dilute the displayed unit cost.
    COALESCE(
      SUM(remaining_qty::numeric * total_unit_cost) FILTER (WHERE total_unit_cost > 0)
      / NULLIF(SUM(remaining_qty) FILTER (WHERE total_unit_cost > 0), 0),
      0),
    -- total value counts every remaining layer (free layers add 0).
    COALESCE(SUM(remaining_qty::numeric * total_unit_cost), 0)
  INTO v_qty, v_avg_cost, v_total_value
  FROM fifo_cost_layers
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id
    AND remaining_qty    > 0;

  SELECT COALESCE(allocated_qty, 0)
  INTO v_alloc
  FROM warehouse_stock_allocations
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id;

  v_alloc := COALESCE(v_alloc, 0);

  IF v_qty = 0 AND v_alloc = 0 THEN
    DELETE FROM warehouse_stock_summary
    WHERE warehouse_id     = p_warehouse_id
      AND sub_container_id = p_sub_container_id
      AND brand_variant_id = p_brand_variant_id;
    RETURN;
  END IF;

  SELECT
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text
  INTO v_item_name, v_brand, v_sku, v_unit,
       v_category, v_subcategory, v_item_type
  FROM inventory_item_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  WHERE ibv.id = p_brand_variant_id;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    v_item_name, v_brand, v_sku, v_unit,
    v_qty, v_avg_cost, v_total_value,
    v_category, v_subcategory, v_item_type,
    v_alloc, GREATEST(v_qty - v_alloc, 0), now()
  )
  ON CONFLICT (warehouse_id, sub_container_id, brand_variant_id) DO UPDATE SET
    item_name        = EXCLUDED.item_name,
    brand            = EXCLUDED.brand,
    sku              = EXCLUDED.sku,
    unit             = EXCLUDED.unit,
    qty              = EXCLUDED.qty,
    avg_cost         = EXCLUDED.avg_cost,
    total_value      = EXCLUDED.total_value,
    category_name    = EXCLUDED.category_name,
    subcategory_name = EXCLUDED.subcategory_name,
    item_type        = EXCLUDED.item_type,
    allocated_qty    = EXCLUDED.allocated_qty,
    available_qty    = EXCLUDED.available_qty,
    updated_at       = EXCLUDED.updated_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_credit_group_change(p_approval_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row        RECORD;
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  TEXT;
BEGIN
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_row FROM customer_credit_group_approvals
    WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' OR NOT v_row.is_active THEN
    RAISE EXCEPTION 'Approval step not actionable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_row.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  UPDATE customer_credit_group_approvals
  SET    status    = 'rejected',
         reason    = 'Cancelled — sibling step rejected',
         is_active = false
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = v_row.request_id FOR UPDATE;

  UPDATE customer_credit_group_requests
     SET status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  -- Unblock customer (if they were blocked for pending approval)
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Rejected',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'warning',
    jsonb_build_object(
      'request_id', v_request.id,
      'step_role',  v_row.step_role,
      'reason',     p_reason
    )::text
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_sales_request(p_request_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required to reject this approval step';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         reason          = p_reason
  WHERE  id = p_request_id;

  UPDATE sale_order_approvals
  SET    status   = 'rejected',
         reason   = 'Cancelled — sibling step rejected'
  WHERE  source_id     = v_req.source_id
    AND  approval_type = v_req.approval_type
    AND  iteration     = v_req.iteration
    AND  status        = 'pending'
    AND  id            <> p_request_id;

  UPDATE sale_orders SET status = 'quotation' WHERE id = v_req.source_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_service_change(p_request_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE service_edit_requests
  SET
    status           = 'rejected',
    reviewed_by      = v_profile_id,
    reviewed_at      = now(),
    rejection_reason = trim(p_reason),
    updated_at       = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_tool_placeholders_on_layer_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ri_id       uuid;
  v_receival_id uuid;
BEGIN
  IF OLD.source_type <> 'receival' THEN RETURN OLD; END IF;

  BEGIN
    v_receival_id := OLD.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN OLD;
  END;

  IF v_receival_id IS NULL THEN RETURN OLD; END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = v_receival_id
    AND ri.brand_variant_id = OLD.brand_variant_id
  LIMIT 1;

  IF v_ri_id IS NULL THEN RETURN OLD; END IF;

  DELETE FROM tool_asset_units
  WHERE receival_item_id = v_ri_id
    AND is_placeholder    = true;

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_payment_method(p_id uuid, p_new_name text, p_new_slug text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_id) THEN
    RAISE EXCEPTION 'payment method % not found', p_id;
  END IF;

  UPDATE payment_methods
     SET name = p_new_name, slug = p_new_slug
   WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_user_custom_roles(p_user_id uuid, p_role_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;
  IF p_role_ids IS NOT NULL AND array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (profile_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_user_custom_roles_v2(p_user_id uuid, p_assignments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;

  IF p_assignments IS NOT NULL AND jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO user_custom_roles (profile_id, role_id, approval_scopes)
    SELECT
      p_user_id,
      (a->>'role_id')::uuid,
      CASE
        WHEN a->'approval_scopes' IS NULL OR a->'approval_scopes' = 'null'::jsonb
          THEN NULL
        WHEN jsonb_array_length(a->'approval_scopes') = 0
          THEN NULL
        ELSE ARRAY(SELECT jsonb_array_elements_text(a->'approval_scopes'))
      END
    FROM jsonb_array_elements(p_assignments) AS a;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_warehouse_field_rps(p_warehouse_id uuid, p_profile_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM warehouse_field_rps WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO warehouse_field_rps (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_warehouse_responsible_persons(p_warehouse_id uuid, p_profile_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('master_data.warehouses.manage') THEN RAISE EXCEPTION 'Not authorized to assign warehouse responsible persons' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.warehouse_responsible_persons WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO public.warehouse_responsible_persons (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_category_sub_container(p_category_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, default_sub_container_id, 0 AS depth
      FROM public.inventory_categories
     WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.default_sub_container_id, chain.depth + 1
      FROM public.inventory_categories c
      JOIN chain ON chain.parent_id = c.id
     WHERE chain.depth < 32
  )
  SELECT default_sub_container_id
    FROM chain
   WHERE default_sub_container_id IS NOT NULL
   ORDER BY depth ASC
   LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ud.email
  FROM   public.user_data ud
  WHERE  ud.is_active = true
    AND  ud.email IS NOT NULL
    AND  (
           lower(ud.email) = lower(btrim(p_username))                        -- typed a full email
        OR lower(split_part(ud.email, '@', 1)) = lower(btrim(p_username))     -- typed just the username
    )
  ORDER BY (lower(ud.email) = lower(btrim(p_username))) DESC                  -- prefer an exact-email hit
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_warranty_division_slug(p_division_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_short_name text;
  v_name       text;
  v_words      text[];
  v_first      text;
  v_second     text;
BEGIN
  SELECT short_name, name
  INTO   v_short_name, v_name
  FROM   public.company_divisions
  WHERE  id = p_division_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Division % not found', p_division_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_short_name IS NOT NULL AND btrim(v_short_name) <> '' THEN
    RETURN upper(btrim(v_short_name));
  END IF;

  IF v_name IS NULL OR btrim(v_name) = '' THEN
    RAISE EXCEPTION 'Division % has no short_name and no name — cannot build warranty slug', p_division_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_words := regexp_split_to_array(btrim(v_name), '\s+');

  -- Collapse 'Al Faytri X' → treat 'AlFaytri' as one word so the rule
  -- still produces 'AFM' from 'Al Faytri Maintenance'.
  IF array_length(v_words, 1) >= 3 AND lower(v_words[1]) = 'al' THEN
    v_words := ARRAY[v_words[1] || v_words[2]] || v_words[3:array_length(v_words, 1)];
  END IF;

  IF array_length(v_words, 1) < 2 THEN
    RAISE EXCEPTION 'Division % name "%" has no second word — set short_name on this division', p_division_id, v_name
      USING ERRCODE = 'check_violation';
  END IF;

  v_first  := v_words[1];
  v_second := v_words[2];

  IF length(v_second) <= 3 THEN
    RETURN upper(substring(v_first FROM 1 FOR 1) || v_second);
  ELSE
    RETURN upper(substring(v_first FROM 1 FOR 2) || substring(v_second FROM 1 FOR 1));
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resubmit_sale_order(p_so_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so               RECORD;
  v_customer         RECORD;
  v_total_qar        NUMERIC;
  v_open_total       NUMERIC;
  v_available        NUMERIC;
  v_exceeds_credit   BOOLEAN := false;
  v_has_below_cost   BOOLEAN := false;
  v_below_cost_lines JSONB := '[]'::jsonb;
  v_profile_id       uuid;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  -- customer_type column was dropped (20260724170001); credit vs cash is now
  -- derived from credit_group_id IS NULL. credit_limit IS NOT NULL implies a
  -- credit customer, so the check below is sufficient.
  SELECT cg.credit_limit
  INTO   v_customer
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  v_total_qar := v_so.total * COALESCE(v_so.exchange_rate, 1);

  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name, 'unit_price', unit_price, 'avg_cost', avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
  INTO   v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  IF v_customer.credit_limit IS NOT NULL THEN
    v_open_total := public.customer_credit_used(v_so.customer_id, p_so_id);
    v_available  := v_customer.credit_limit - v_open_total;
    IF v_total_qar > v_available THEN v_exceeds_credit := true; END IF;
  END IF;

  IF v_exceeds_credit OR v_has_below_cost THEN
    UPDATE sale_orders SET status = 'pending_approval' WHERE id = p_so_id;
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit',
        jsonb_build_object('available', GREATEST(v_available,0),
                           'overage',   v_total_qar - COALESCE(v_available, 0),
                           'requested_by', v_profile_id)
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin',
        jsonb_build_object('lines', v_below_cost_lines, 'requested_by', v_profile_id)
      );
    END IF;
  ELSE
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;

  RETURN jsonb_build_object(
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_archive_inventory_category(p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  UPDATE public.inventory_item_brand_variants v SET status='archived'
    WHERE v.item_id IN (SELECT id FROM public.inventory_items WHERE category_id = p_category_id);
  UPDATE public.inventory_items SET status='archived' WHERE category_id = p_category_id;
  UPDATE public.inventory_categories SET status='archived' WHERE id = p_category_id;
END; $function$
;

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
$function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_attribute_picker_step(p_category_id uuid, p_picks jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_result           jsonb;
  v_candidate_ids    uuid[];
  v_next_def_id      uuid;
  v_next_def_key     text;
  v_next_def_label_en text;
  v_next_def_label_ar text;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id FROM inventory_categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM inventory_categories c JOIN subtree s ON c.parent_id = s.id
  ),
  ancestors AS (
    SELECT c.parent_id AS ancestor_id, 1 AS depth
    FROM inventory_categories c WHERE c.id = p_category_id
    UNION ALL
    SELECT c.parent_id, a.depth + 1
    FROM inventory_categories c JOIN ancestors a ON c.id = a.ancestor_id
    WHERE a.depth < 10 AND c.parent_id IS NOT NULL
  ),
  relevant_categories AS (
    SELECT id FROM subtree
    UNION
    SELECT ancestor_id FROM ancestors WHERE ancestor_id IS NOT NULL
  ),
  base_items AS (
    SELECT i.id FROM inventory_items i WHERE i.category_id IN (SELECT id FROM subtree)
  ),
  matching_items AS (
    SELECT bi.id
    FROM base_items bi
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p_picks) pick(k, v)
      JOIN inventory_attribute_definitions def
        ON def.attribute_key = pick.k
       AND def.category_id IN (SELECT id FROM relevant_categories)
      JOIN inventory_item_attributes ia
        ON ia.item_id = bi.id
       AND ia.definition_id = def.id
      WHERE ia.option_id::text <> pick.v
    )
  )
  SELECT array_agg(id) INTO v_candidate_ids FROM matching_items;

  IF v_candidate_ids IS NULL THEN v_candidate_ids := ARRAY[]::uuid[]; END IF;

  IF COALESCE(array_length(v_candidate_ids, 1), 0) > 1 THEN
    -- get_effective_attributes returns the column as `definition_id`, not `id`.
    SELECT definition_id, attribute_key, label_en, label_ar
    INTO v_next_def_id, v_next_def_key, v_next_def_label_en, v_next_def_label_ar
    FROM get_effective_attributes(p_category_id)
    WHERE NOT (p_picks ? attribute_key)
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name_en', i.name_en,
        'name_ar', i.name_ar,
        'sku', i.sku,
        'image_url', i.image_url,
        'brand_variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', bv.id,
            'brand', bv.brand,
            'code', bv.code,
            'stock_level', bv.stock_level
          ) ORDER BY bv.brand)
          FROM inventory_item_brand_variants bv
          WHERE bv.item_id = i.id AND bv.status = 'active'
        ), '[]'::jsonb)
      ) ORDER BY i.name_en)
      FROM inventory_items i
      WHERE i.id = ANY(v_candidate_ids)
    ), '[]'::jsonb),
    'next_attribute', CASE WHEN v_next_def_id IS NOT NULL THEN jsonb_build_object(
      'id', v_next_def_id,
      'key', v_next_def_key,
      'label_en', v_next_def_label_en,
      'label_ar', v_next_def_label_ar
    ) ELSE null END,
    'next_options', CASE WHEN v_next_def_id IS NULL THEN '[]'::jsonb ELSE (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'value_en', o.value_en,
        'value_ar', o.value_ar,
        'item_count', (
          SELECT count(*) FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
      ) ORDER BY o.sort_order), '[]'::jsonb)
      FROM inventory_attribute_options o
      WHERE o.definition_id = v_next_def_id
        AND NOT o.is_archived
        AND EXISTS (
          SELECT 1 FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
    ) END
  );

  RETURN v_result;
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_cancel_po_return_dispatch(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return        RECORD;
  v_mv            RECORD;
  v_qty_returned  INT;
  v_legacy_count  INT;
BEGIN
  IF NOT (public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to cancel PO return dispatch' USING ERRCODE = '42501'; END IF;
  SELECT id, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    -- Never dispatched, or already cancelled. Idempotent no-op.
    RETURN;
  END IF;

  -- Guard: dispatch ISM rows without source_id come from the pre-fix RPC.
  -- Their per-layer breakdown is lost, so we cannot reverse them safely.
  SELECT count(*) INTO v_legacy_count
  FROM   inventory_stock_movements m
  WHERE  m.reference_type = 'po_return'
    AND  m.reference_id   = p_return_id
    AND  m.movement_type  = 'purchase_return'
    AND  m.source_id IS NULL;

  IF v_legacy_count > 0 THEN
    RAISE EXCEPTION
      'Cannot cancel PO return %: % dispatch movement(s) predate the FIFO-restore fix (missing source_id). Their per-layer breakdown is lost.',
      p_return_id, v_legacy_count
      USING HINT = 'Reconcile FIFO for the affected brand variants manually, then mark the return closed with a stock adjustment.';
  END IF;

  -- Walk each unpaired dispatch drain, restore its layer, insert reversal.
  FOR v_mv IN
    SELECT m.id, m.warehouse_id, m.sub_container_id, m.brand_variant_id,
           m.item_name, m.sku, m.qty, m.unit_cost, m.source_id
    FROM   inventory_stock_movements m
    WHERE  m.reference_type = 'po_return'
      AND  m.reference_id   = p_return_id
      AND  m.movement_type  = 'purchase_return'
      AND  m.source_id IS NOT NULL
      AND  NOT EXISTS (
        -- Defensive: skip drains that already have a matching reversal
        -- from a previous cancel of an earlier dispatch cycle.
        SELECT 1 FROM inventory_stock_movements c
        WHERE  c.reference_type = 'po_return'
          AND  c.reference_id   = p_return_id
          AND  c.movement_type  = 'purchase_return_cancelled'
          AND  c.source_id      = m.source_id
          AND  c.qty            = -m.qty
          AND  c.sub_container_id IS NOT DISTINCT FROM m.sub_container_id
      )
  LOOP
    v_qty_returned := ABS(v_mv.qty);

    -- Restore the exact FIFO layer dispatch drained.
    UPDATE fifo_cost_layers
    SET    remaining_qty = remaining_qty + v_qty_returned
    WHERE  id = v_mv.source_id;

    -- Bump variant stock_level (deduct_fifo_layers decremented it on dispatch).
    UPDATE inventory_item_brand_variants
    SET    stock_level = stock_level + v_qty_returned,
           updated_at  = now()
    WHERE  id = v_mv.brand_variant_id;

    -- Mirror reversing movement — carries the SAME warehouse_id + sub_container_id.
    INSERT INTO inventory_stock_movements (
      warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, source_id, notes
    ) VALUES (
      v_mv.warehouse_id,
      v_mv.sub_container_id,
      v_mv.brand_variant_id,
      v_mv.item_name,
      v_mv.sku,
      'purchase_return_cancelled',
      v_qty_returned,
      v_mv.unit_cost,
      'po_return',
      p_return_id,
      v_mv.source_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  -- Refresh weighted average cost for each brand variant we touched.
  PERFORM recalc_average_cost(t.bv_id)
  FROM (
    SELECT DISTINCT brand_variant_id AS bv_id
    FROM   inventory_stock_movements
    WHERE  reference_type = 'po_return'
      AND  reference_id   = p_return_id
      AND  movement_type  = 'purchase_return_cancelled'
      AND  brand_variant_id IS NOT NULL
  ) t;

  UPDATE so_po_returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_clear_po_approval_steps(p_po_id uuid, p_only_pending boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_div uuid;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, true INTO v_div, v_found FROM purchase_orders WHERE id = p_po_id;
  IF NOT v_found THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: PO % not found', p_po_id;
  END IF;
  IF v_div IS NOT NULL AND NOT public.is_division_visible(v_div) THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: not authorized for this PO' USING ERRCODE = '42501';
  END IF;

  IF p_only_pending THEN
    DELETE FROM po_approvals WHERE po_id = p_po_id AND status = 'pending';
  ELSE
    DELETE FROM po_approvals WHERE po_id = p_po_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_close_return(p_return_id uuid, p_resolution text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new_status public.return_status;
  v_credit_note_id uuid;
begin
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage') OR public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to close returns' USING ERRCODE = '42501'; END IF;
  if p_resolution not in ('refund', 'replacement', 'store_credit', 'partial') then
    raise exception 'rpc_close_return: invalid resolution %', p_resolution;
  end if;

  v_new_status := case p_resolution
    when 'refund'        then 'resolved_credit'
    when 'store_credit'  then 'resolved_credit'
    when 'replacement'   then 'resolved_replacement'
    when 'partial'       then 'resolved_partial'
  end::public.return_status;

  update public.so_po_returns
    set status = v_new_status,
        updated_at = now()
    where id = p_return_id
      and status = 'restocked'
    returning credit_note_id into v_credit_note_id;

  if not found then
    raise exception 'rpc_close_return: return % is not in restocked status (or does not exist)', p_return_id;
  end if;

  if v_credit_note_id is not null and p_resolution <> 'partial' then
    update public.credit_notes
      set resolution_type = p_resolution::public.credit_note_resolution_type
      where id = v_credit_note_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_complete_delivery_with_followup(p_delivery_id uuid, p_so_id uuid, p_sub_container_id uuid DEFAULT NULL::uuid, p_remaining_items jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_delivery_id   uuid;
  v_delivery_number   text;
  v_orig_so_id        uuid;
  v_item              jsonb;
BEGIN
  -- 1. Deduct FIFO + write COGS + movements + mark delivered
  PERFORM public.complete_delivery_inventory(
    p_delivery_id      => p_delivery_id,
    p_so_id            => p_so_id,
    p_sub_container_id => p_sub_container_id
  );

  IF p_remaining_items IS NULL OR jsonb_array_length(p_remaining_items) = 0 THEN
    RETURN NULL;
  END IF;

  -- 2. Look up parent SO from the original delivery, generate a new
  --    delivery number, and create the follow-up stub + lines in the
  --    same transaction.
  SELECT sale_order_id INTO v_orig_so_id
    FROM sale_deliveries
   WHERE id = p_delivery_id;
  IF v_orig_so_id IS NULL THEN
    RAISE EXCEPTION 'rpc_complete_delivery_with_followup: original delivery % has no sale_order_id', p_delivery_id;
  END IF;

  v_delivery_number := public.next_delivery_number();

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id, warehouse_id, date, status
  ) VALUES (
    v_delivery_number,
    v_orig_so_id,
    NULL,                                -- follow-up stub has no assigned warehouse yet
    CURRENT_DATE,
    'pending'
  )
  RETURNING id INTO v_new_delivery_id;

  FOR v_item IN SELECT jsonb_array_elements(p_remaining_items) LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_delivery_id,
      NULLIF(v_item->>'brand_variant_id', '')::uuid,
      v_item->>'item_name',
      v_item->>'sku',
      COALESCE((v_item->>'qty_delivered')::int, 0)
    );
  END LOOP;

  RETURN v_new_delivery_id;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_confirm_tool_serial(p_unit_id uuid, p_serial text, p_brand text, p_expiry date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')
    OR _user_has_permission(_current_user_data_id(), 'purchase.receivals.create')
  ) THEN
    RAISE EXCEPTION 'not authorized to confirm tool serials' USING ERRCODE = '42501';
  END IF;
  IF p_serial IS NULL OR btrim(p_serial) = '' THEN
    RAISE EXCEPTION 'serial number is required';
  END IF;

  UPDATE public.tool_asset_units
     SET serial_number  = btrim(p_serial),
         brand          = COALESCE(NULLIF(btrim(p_brand), ''), brand),
         expiry         = p_expiry,
         is_placeholder = false
   WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tool unit % not found', p_unit_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_custody_assign(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_dest_sub_container_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text, p_request_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    created_by_profile_id, created_by_name,
    request_group_id
  ) values (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'pending',
    current_date, nullif(p_notes, ''),
    v_creator, p_created_by_name,
    p_request_group_id
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
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_bill(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_id     uuid;
  v_po_row      purchase_orders%ROWTYPE;
  v_bill_row    bills%ROWTYPE;
  v_bill_number text;
  v_subtotal    numeric := 0;
  v_discount    numeric := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_total       numeric;
  v_line        jsonb;
  v_lines       jsonb := COALESCE(p_payload->'line_items', '[]'::jsonb);
BEGIN
  IF NOT public._auth_user_has_permission('purchase.bills.create') AND NOT public._auth_user_has_permission('purchase.bills.manage') THEN RAISE EXCEPTION 'Not authorized to create bills' USING ERRCODE = '42501'; END IF;
  IF (p_payload->>'purchase_order_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: purchase_order_id is required';
  END IF;
  IF (p_payload->>'supplier_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: supplier_id is required';
  END IF;
  IF (p_payload->>'due_date') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: due_date is required';
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount_amount cannot be negative (got %)', v_discount;
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: at least one line item is required';
  END IF;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    IF COALESCE((v_line->>'total')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'rpc_create_purchase_bill: line total cannot be negative (got %)', v_line->>'total';
    END IF;
    v_subtotal := v_subtotal + COALESCE((v_line->>'total')::numeric, 0);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount % exceeds subtotal % — bill total would be negative',
      v_discount, v_subtotal;
  END IF;
  v_total := v_subtotal - v_discount;

  SELECT * INTO v_po_row FROM purchase_orders WHERE id = (p_payload->>'purchase_order_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: PO % not found', p_payload->>'purchase_order_id';
  END IF;
  v_bill_number := v_po_row.po_number || '-B';

  INSERT INTO bills (
    bill_number, supplier_id, purchase_order_id,
    receival_id, division_id, payment_status, needs_refresh,
    source_label, subtotal, discount_amount, discount_label,
    total_amount, issued_date, due_date, notes
  ) VALUES (
    v_bill_number,
    (p_payload->>'supplier_id')::uuid,
    v_po_row.id,
    NULLIF(p_payload->>'receival_id', '')::uuid,
    v_po_row.division_id,
    'unpaid',
    false,
    p_payload->>'source_label',
    v_subtotal, v_discount, p_payload->>'discount_label',
    v_total,
    CURRENT_DATE,
    (p_payload->>'due_date')::date,
    NULLIF(p_payload->>'notes', '')
  )
  RETURNING id INTO v_bill_id;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    INSERT INTO bill_line_items (
      bill_id, description, qty, unit_price, total,
      match_status, match_note, brand_variant_id
    ) VALUES (
      v_bill_id,
      v_line->>'description',
      COALESCE((v_line->>'qty')::int, 1),
      COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE((v_line->>'total')::numeric, 0),
      NULLIF(v_line->>'match_status', ''),
      NULLIF(v_line->>'match_note', ''),
      NULLIF(v_line->>'brand_variant_id', '')::uuid
    );
  END LOOP;

  SELECT * INTO v_bill_row FROM bills WHERE id = v_bill_id;
  RETURN to_jsonb(v_bill_row);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po_id           uuid;
  v_po_number       text;
  v_creator         uuid := public._current_user_data_id();
  v_subtotal        numeric := 0;
  v_discount        numeric := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_exchange_rate   numeric := COALESCE((p_payload->>'exchange_rate')::numeric, 1);
  v_total_qar       numeric;
  v_approval_level  int;
  v_line            jsonb;
  v_lines           jsonb := COALESCE(p_payload->'line_items', '[]'::jsonb);
  v_rfq_suppliers   jsonb := COALESCE(p_payload->'rfq_supplier_ids', '[]'::jsonb);
  v_po_type         text  := COALESCE(p_payload->>'po_type', 'draft');
  v_resolved_name   text;
  v_line_div        uuid;
  v_po_row          purchase_orders%ROWTYPE;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.orders.create') AND NOT public._auth_user_has_permission('purchase.orders.manage') THEN RAISE EXCEPTION 'Not authorized to create purchase orders' USING ERRCODE = '42501'; END IF;
  IF v_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: exchange_rate must be > 0 (got %)', v_exchange_rate;
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: discount_amount cannot be negative (got %)', v_discount;
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: at least one line item is required';
  END IF;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    v_subtotal := v_subtotal + COALESCE((v_line->>'total_price')::numeric, 0);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: discount % exceeds subtotal %', v_discount, v_subtotal;
  END IF;

  v_total_qar := (v_subtotal - v_discount) * v_exchange_rate;
  v_approval_level := CASE
    WHEN v_total_qar < 5000  THEN 1
    WHEN v_total_qar < 50000 THEN 2
    ELSE 3
  END;

  v_po_number := (SELECT public.next_po_number());

  INSERT INTO purchase_orders (
    po_number, supplier_id, supplier_name, status,
    currency, exchange_rate, initial_exchange_rate,
    subtotal, total_qar, approval_level,
    created_date, expected_delivery, quote_deadline,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, vendor_notes,
    discount_amount, discount_label,
    created_by, division_id, po_type, rfq_supplier_ids,
    show_specifications
  ) VALUES (
    v_po_number,
    NULLIF(p_payload->>'supplier_id', '')::uuid,
    p_payload->>'supplier_name',
    'draft',
    COALESCE(p_payload->>'currency', 'QAR'),
    v_exchange_rate,
    v_exchange_rate,
    v_subtotal, v_total_qar, v_approval_level,
    CURRENT_DATE,
    NULLIF(p_payload->>'expected_delivery', '')::date,
    NULLIF(p_payload->>'quote_deadline', '')::date,
    p_payload->>'payment_terms',
    p_payload->>'payment_terms_notes',
    CASE WHEN p_payload->'payment_milestones' IS NULL THEN NULL
         ELSE p_payload->'payment_milestones' END,
    p_payload->>'delivery_terms',
    p_payload->>'delivery_terms_notes',
    p_payload->>'vendor_notes',
    v_discount,
    p_payload->>'discount_label',
    v_creator,
    NULLIF(p_payload->>'division_id', '')::uuid,
    v_po_type::po_type,
    ARRAY(SELECT jsonb_array_elements_text(v_rfq_suppliers))::uuid[],
    COALESCE((p_payload->>'show_specifications')::boolean, true)
  )
  RETURNING id INTO v_po_id;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    v_resolved_name := NULLIF(TRIM(v_line->>'item_name'), '');
    IF v_resolved_name IS NULL AND (v_line->>'brand_variant_id') IS NOT NULL THEN
      SELECT ii.name_en INTO v_resolved_name
        FROM inventory_item_brand_variants biv
        JOIN inventory_items ii ON ii.id = biv.item_id
       WHERE biv.id = (v_line->>'brand_variant_id')::uuid;
    END IF;

    -- Per-line division: explicit value, else fall back to the PO header
    -- division (legacy / single-division payloads). Enforce MEMBERSHIP so a
    -- caller cannot stamp a line with a division they cannot access.
    v_line_div := COALESCE(
      NULLIF(v_line->>'division_id', '')::uuid,
      NULLIF(p_payload->>'division_id', '')::uuid
    );
    IF v_line_div IS NOT NULL AND NOT public.is_division_member(v_line_div) THEN
      RAISE EXCEPTION 'rpc_create_purchase_order: no access to division %', v_line_div;
    END IF;

    INSERT INTO po_line_items (
      po_id, item_name, sku, qty, unit, unit_price, total_price,
      brand_variant_id, free_qty, received_qty, brand_id,
      show_specification, division_id
    ) VALUES (
      v_po_id,
      COALESCE(v_resolved_name, 'Item'),
      v_line->>'sku',
      COALESCE((v_line->>'qty')::int, 0),
      COALESCE(v_line->>'unit', 'ea'),
      COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE((v_line->>'total_price')::numeric, 0),
      NULLIF(v_line->>'brand_variant_id', '')::uuid,
      COALESCE((v_line->>'free_qty')::int, 0),
      COALESCE((v_line->>'received_qty')::int, 0),
      NULLIF(v_line->>'brand_id', '')::uuid,
      COALESCE((v_line->>'show_specification')::boolean, false),
      v_line_div
    );
  END LOOP;

  IF v_po_type = 'rfq' AND jsonb_array_length(v_rfq_suppliers) > 0 THEN
    INSERT INTO po_rfq_quotes (po_id, supplier_id, currency, status)
    SELECT v_po_id, sid::uuid,
           COALESCE(p_payload->>'currency', 'QAR'),
           'pending'
    FROM jsonb_array_elements_text(v_rfq_suppliers) AS sid;
  END IF;

  SELECT * INTO v_po_row FROM purchase_orders WHERE id = v_po_id;
  RETURN to_jsonb(v_po_row);
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_customer_statement_v2(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result        jsonb;
  cust_name     text;
  cust_phone    text;
  cust_type     text;
  account_type  text;
  orders        jsonb;
  totals        jsonb;
  open_count    bigint;
BEGIN
  SELECT c.name, (CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END)::text, cg.name
  INTO cust_name, cust_type, account_type
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = p_customer_id;

  IF cust_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  -- Phone: prefer the primary row, else the first available row.
  SELECT phone INTO cust_phone
  FROM customer_phones
  WHERE customer_id = p_customer_id
  ORDER BY is_primary DESC NULLS LAST, created_at ASC
  LIMIT 1;

  WITH sos AS (
    SELECT so.id, so.so_number, so.created_at, so.status, so.total
    FROM sale_orders so
    WHERE so.customer_id = p_customer_id
      AND so.status != 'cancelled'
      AND so.deleted_at IS NULL
  ),
  so_inv AS (
    SELECT sos.id AS so_id, inv.id AS invoice_id
    FROM sos
    LEFT JOIN so_invoices inv
           ON inv.sale_order_id = sos.id
  ),
  so_paid AS (
    SELECT si.so_id,
           COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
    FROM so_inv si
    LEFT JOIN payments p
           ON p.deleted_at IS NULL
          AND (
                (p.source_type = 'sale_order' AND p.source_id = si.so_id)
             OR (si.invoice_id IS NOT NULL
                 AND p.source_type = 'invoice'
                 AND p.source_id = si.invoice_id)
             OR (si.invoice_id IS NOT NULL AND p.invoice_id = si.invoice_id)
              )
    GROUP BY si.so_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO orders
  FROM (
    SELECT sos.id,
           sos.so_number,
           sos.created_at,
           sos.status::text AS status,
           sos.total::numeric AS total,
           COALESCE(sp.paid, 0)::numeric AS paid,
           GREATEST(0, sos.total - COALESCE(sp.paid, 0))::numeric AS outstanding
    FROM sos
    LEFT JOIN so_paid sp ON sp.so_id = sos.id
  ) t;

  SELECT jsonb_build_object(
           'total_orders_value', COALESCE(SUM((o->>'total')::numeric), 0),
           'total_paid',         COALESCE(SUM((o->>'paid')::numeric), 0),
           'total_outstanding',  COALESCE(SUM((o->>'outstanding')::numeric), 0)
         )
  INTO totals
  FROM jsonb_array_elements(orders) o;

  SELECT COALESCE(COUNT(*), 0)
  INTO open_count
  FROM jsonb_array_elements(orders) o
  WHERE (o->>'outstanding')::numeric > 0;

  result := jsonb_build_object(
    'customer', jsonb_build_object(
      'name',         cust_name,
      'phone',        cust_phone,
      'account_type', COALESCE(account_type, INITCAP(cust_type), 'Cash')
    ),
    'orders',            orders,
    'totals',            COALESCE(totals, jsonb_build_object(
                            'total_orders_value', 0,
                            'total_paid',         0,
                            'total_outstanding',  0)),
    'open_orders_count', open_count
  );

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_decide_consumption_edit(p_request_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid := public._current_user_data_id();
  v_request        RECORD;
  v_is_approver    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: not authenticated';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: decision must be approved|rejected (got %)', p_decision;
  END IF;

  SELECT id, consumption_id, status, requested_by
    INTO v_request
    FROM public.consumption_edit_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % not found', p_request_id;
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % is % (expected pending)', p_request_id, v_request.status;
  END IF;

  -- H12 fix: block self-approval (separation of duties).
  IF v_request.requested_by = v_uid THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: cannot approve your own request';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_custom_roles ucr
    JOIN public.custom_roles cr ON cr.id = ucr.role_id
    JOIN public.approval_workflow_steps aws ON aws.role_id = cr.id
    WHERE ucr.profile_id = v_uid
      AND cr.deleted_at IS NULL
      AND aws.workflow = 'consumption_edit'
      AND aws.archived_at IS NULL
  ) INTO v_is_approver;

  IF NOT v_is_approver THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: caller is not configured as a consumption_edit approver';
  END IF;

  UPDATE public.consumption_edit_requests
     SET status         = p_decision,
         reviewed_by    = v_uid,
         reviewed_at    = now(),
         review_comment = NULLIF(btrim(coalesce(p_comment, '')), '')
   WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    PERFORM public.rpc_cancel_consumption(v_request.consumption_id);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_delete_customer_payment(p_payment_id uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row      public.payments;
  v_actor    uuid;
  v_plan_ids uuid[];
  v_inst_ids uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'sales.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: sales.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    -- Idempotent.
    RETURN v_row;
  END IF;
  IF v_row.direction <> 'incoming' THEN
    RAISE EXCEPTION 'Only incoming (customer) payments can be deleted here' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.credit_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'Credit-note redemptions cannot be deleted directly — void via the credit-note flow'
      USING ERRCODE = 'P0001';
  END IF;

  -- Installment reversal: capture ids BEFORE clearing payment_id, then
  -- reverse the settled amount and re-derive installment + plan state.
  SELECT array_agg(DISTINCT plan_id), array_agg(id)
  INTO v_plan_ids, v_inst_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount - v_row.amount),
        payment_id  = NULL,
        updated_at  = now()
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
  END IF;

  UPDATE public.payments
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_delete_supplier_payment(p_payment_id uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row      public.payments;
  v_actor    uuid;
  v_alloc_ct int;
  v_plan_ids uuid[];
  v_inst_ids uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'purchase.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: purchase.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    -- Idempotent: already deleted → no-op, return the existing row.
    RETURN v_row;
  END IF;
  IF v_row.direction <> 'outgoing' THEN
    RAISE EXCEPTION 'Only outgoing (supplier) payments can be deleted here' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_alloc_ct
  FROM public.payment_bill_allocations
  WHERE payment_id = p_payment_id;
  IF v_alloc_ct > 1 THEN
    RAISE EXCEPTION
      'Payment is allocated to % bills — detach the extra allocations before deleting',
      v_alloc_ct
      USING ERRCODE = 'P0001';
  END IF;

  -- Installment linkage: capture plan + installment ids BEFORE clearing
  -- payment_id, then reverse the settled amount and re-derive status.
  -- Status recompute targets ONLY the reversed installments — other rows in
  -- the plan keep their state (e.g. 'overdue' set by the due-date job).
  SELECT array_agg(DISTINCT plan_id), array_agg(id)
  INTO v_plan_ids, v_inst_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount - v_row.amount),
        payment_id  = NULL,
        updated_at  = now()
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
  END IF;

  -- Reverse the single-allocation row (if any) so the recompute trigger
  -- doesn't double-count it against a bill that just lost its payment.
  DELETE FROM public.payment_bill_allocations WHERE payment_id = p_payment_id;

  UPDATE public.payments
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_edit_customer_payment(p_payment_id uuid, p_amount numeric, p_method text, p_date date, p_reference text, p_notes text, p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row        public.payments;
  v_actor      uuid;
  v_rate       numeric;
  v_old_amount numeric;
  v_plan_ids   uuid[];
  v_inst_ids   uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'sales.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: sales.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is already deleted', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  IF v_row.direction <> 'incoming' THEN
    RAISE EXCEPTION 'Only incoming (customer) payments can be edited here' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.credit_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'Credit-note redemptions cannot be edited directly — void and re-issue via the credit-note flow'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_old_amount := v_row.amount;

  -- Currency + exchange_rate handling. If caller passed a rate, honour it;
  -- otherwise keep the stored rate. QAR always locks to 1.
  v_rate := CASE
    WHEN v_row.currency = 'QAR' THEN 1
    WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN p_exchange_rate
    ELSE v_row.exchange_rate
  END;

  UPDATE public.payments
  SET amount        = p_amount,
      amount_qar    = p_amount * v_rate,
      method        = p_method,
      date          = p_date,
      reference     = NULLIF(TRIM(p_reference), ''),
      notes         = NULLIF(TRIM(p_notes),     ''),
      exchange_rate = v_rate,
      updated_at    = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  -- Installment linkage: shift paid_amount by delta, recompute status,
  -- re-derive plan state. Only the affected installments are touched.
  SELECT array_agg(DISTINCT plan_id), array_agg(id)
  INTO v_plan_ids, v_inst_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount + (p_amount - v_old_amount)),
        updated_at  = now()
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_edit_supplier_payment(p_payment_id uuid, p_amount numeric, p_method text, p_date date, p_reference text, p_notes text, p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row        public.payments;
  v_actor      uuid;
  v_alloc_ct   int;
  v_rate       numeric;
  v_old_amount numeric;
  v_plan_ids   uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'purchase.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: purchase.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is already deleted', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  IF v_row.direction <> 'outgoing' THEN
    RAISE EXCEPTION 'Only outgoing (supplier) payments can be edited here' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_alloc_ct
  FROM public.payment_bill_allocations
  WHERE payment_id = p_payment_id;
  IF v_alloc_ct > 1 THEN
    RAISE EXCEPTION
      'Payment is allocated to % bills — detach the extra allocations before editing',
      v_alloc_ct
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_old_amount := v_row.amount;

  -- Currency + exchange_rate handling. If caller passed an exchange rate,
  -- honour it; otherwise keep the payment's stored rate. QAR always locks
  -- to 1 regardless of what was sent.
  v_rate := CASE
    WHEN v_row.currency = 'QAR' THEN 1
    WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN p_exchange_rate
    ELSE v_row.exchange_rate
  END;

  UPDATE public.payments
  SET amount        = p_amount,
      amount_qar    = p_amount * v_rate,
      method        = p_method,
      date          = p_date,
      reference     = NULLIF(TRIM(p_reference), ''),
      notes         = NULLIF(TRIM(p_notes),     ''),
      exchange_rate = v_rate,
      updated_at    = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  -- Keep any single allocation row in sync with the new amount so the
  -- bill balance recompute sees the right allocated total.
  IF v_alloc_ct = 1 THEN
    UPDATE public.payment_bill_allocations
    SET amount = p_amount
    WHERE payment_id = p_payment_id;
  END IF;

  -- Installment linkage (payments created by rpc_settle_installment):
  -- shift paid_amount by the delta, recompute status, re-derive plan state.
  SELECT array_agg(DISTINCT plan_id) INTO v_plan_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount + (p_amount - v_old_amount)),
        updated_at  = now()
    WHERE payment_id = p_payment_id;

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE payment_id = p_payment_id;

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
  END IF;

  RETURN v_row;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_finalize_tool_check_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to finalize a check' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tool_check_sessions SET status = 'completed', completed_at = now()
    WHERE id = p_session_id AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'session % not found or already completed', p_session_id; END IF;
END $function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_initiate_tool_check_session(p_division_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to start a check' USING ERRCODE = '42501';
  END IF;
  IF p_division_id IS NULL THEN RAISE EXCEPTION 'division is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.tool_check_sessions WHERE division_id = p_division_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'a check is already in progress for this division';
  END IF;
  INSERT INTO public.tool_check_sessions(division_id, initiated_by)
    VALUES (p_division_id, public._current_user_data_id()) RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

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
$function$
;

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
$function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_my_consumption_sources()
 RETURNS TABLE(warehouse_id uuid, warehouse_name text, warehouse_kind text, sub_container_id uuid, sub_container_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name, w.warehouse_kind, sc.id, sc.name
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses w ON w.id = sc.warehouse_id
  WHERE  sc.is_active
    AND  COALESCE(w.warehouse_kind, 'general') <> 'repair'
    AND (
          public._has_custody_admin_role(public._current_user_data_id())
       OR sc.responsible_person_profile_id = public._current_user_data_id()
       OR public.is_field_rp_of(public._current_user_data_id(), w.id)
    )
  ORDER BY w.name, sc.name;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return              RECORD;
  v_line                RECORD;
  v_bv_id               UUID;
  v_line_warehouse_id   UUID;
  v_line_sub_container  UUID;
  v_layer               RECORD;
  v_recv_qty            INT;
  v_prior_returned      INT;
BEGIN
  IF NOT (public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to dispatch PO returns' USING ERRCODE = '42501'; END IF;
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, receival_item_id
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_item_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_line.receival_item_id IS NULL THEN
      RAISE EXCEPTION 'PO return line % has no receival_item_id link; cannot derive source warehouse / sub-container.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.a. Cancel and re-issue through the current PO-return dialog.';
    END IF;

    -- H4 guard: lock the receival_item row and reject over-return.
    -- Sums prior *active* returns (excluding this return and any cancelled
    -- ones — cancelled returns must not burn returnable qty; see H3).
    SELECT ri.qty_received
      INTO v_recv_qty
      FROM public.receival_items ri
     WHERE ri.id = v_line.receival_item_id
     FOR UPDATE;

    SELECT COALESCE(SUM(rl.qty), 0)
      INTO v_prior_returned
      FROM public.return_lines rl
      JOIN public.so_po_returns spr ON spr.id = rl.return_id
     WHERE rl.receival_item_id = v_line.receival_item_id
       AND rl.return_id <> p_return_id
       AND spr.deleted_at IS NULL
       AND spr.status IN ('dispatched', 'supplier_confirmed', 'closed');

    IF v_prior_returned + v_line.qty > v_recv_qty THEN
      RAISE EXCEPTION 'PO return over-limit on receival item %: attempted % + prior % > qty_received %',
        v_line.receival_item_id, v_line.qty, v_prior_returned, v_recv_qty
        USING HINT = 'Reduce this return qty or cancel a prior return.';
    END IF;

    SELECT r.warehouse_id, ri.sub_container_id
    INTO   v_line_warehouse_id, v_line_sub_container
    FROM   public.receival_items ri
    LEFT JOIN public.receivals r ON r.id = ri.receival_id
    WHERE  ri.id = v_line.receival_item_id;

    IF v_line_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no warehouse_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival header before re-dispatching this return.';
    END IF;

    IF v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no sub_container_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival before re-dispatching this return.';
    END IF;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_bv_id,
        v_line_warehouse_id,
        v_line.qty,
        false,
        v_line_sub_container
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, source_id, notes
      ) VALUES (
        v_line_warehouse_id,
        v_line_sub_container,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        v_layer.layer_id,
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_recompute_document_fx(p_document_type text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sum_gain numeric;
  v_sum_loss numeric;
BEGIN
  IF p_document_type NOT IN ('purchase_order', 'sale_order') THEN
    RAISE EXCEPTION 'rpc_recompute_document_fx: p_document_type must be purchase_order or sale_order (got %)', p_document_type;
  END IF;

  PERFORM set_config('mms.fx_recompute_active', '1', true);

  -- Re-fire the BEFORE trigger by touching each payment (UPDATE of
  -- exchange_rate to itself). Idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  PERFORM set_config('mms.fx_recompute_active', '', true);

  SELECT COALESCE(SUM(exchange_gain),0), COALESCE(SUM(exchange_loss),0)
    INTO v_sum_gain, v_sum_loss
    FROM public.payments
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  -- exchange_net is a generated column (gain - loss); don't assign.
  IF p_document_type = 'purchase_order' THEN
    UPDATE public.purchase_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  ELSE
    UPDATE public.sale_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  END IF;
END $function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_record_return_refund(p_return_id uuid, p_lines jsonb, p_refund_method text DEFAULT NULL::text, p_refund_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage') OR public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to process return refunds' USING ERRCODE = '42501'; END IF;
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_refund: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_refund: p_lines must be a non-empty array';
  end if;

  if p_refund_method is not null or p_refund_reference is not null then
    update public.credit_notes
      set refund_method = coalesce(p_refund_method, refund_method),
          refund_reference = coalesce(p_refund_reference, refund_reference)
      where id = v_cn_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'refund',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_refund: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_record_return_store_credit(p_return_id uuid, p_lines jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to record return store credit' USING ERRCODE = '42501'; END IF;
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_store_credit: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_store_credit: p_lines must be a non-empty array';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'store_credit',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_store_credit: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_record_tool_inspection(p_unit_id uuid, p_verdict text, p_notes text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to record inspections' USING errcode = '42501';
  END IF;
  IF p_verdict NOT IN ('good','bad','under_repair') THEN
    RAISE EXCEPTION 'invalid verdict: %', p_verdict;
  END IF;

  SELECT current_custody_location_id, status INTO v_team, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'cannot inspect a retired unit'; END IF;

  INSERT INTO public.tool_unit_inspections(unit_id, custody_location_id, inspected_by, verdict, notes, session_id)
    VALUES (p_unit_id, v_team, public._current_user_data_id(), p_verdict, NULLIF(p_notes,''), p_session_id)
    RETURNING id INTO v_id;

  IF p_verdict = 'good' THEN
    UPDATE public.tool_asset_units SET condition = 'Good' WHERE id = p_unit_id;
  ELSIF p_verdict = 'bad' THEN
    UPDATE public.tool_asset_units SET condition = 'Fair' WHERE id = p_unit_id;
  ELSE
    UPDATE public.tool_asset_units SET status = 'maintenance' WHERE id = p_unit_id;
  END IF;

  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_redeem_credit_note(p_invoice_id uuid, p_credit_note_id uuid, p_amount numeric, p_method text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_date date DEFAULT NULL::date, p_source_type text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cn             credit_notes%ROWTYPE;
  v_inv_customer   uuid;
  v_inv_total      numeric;
  v_paid           numeric;
  v_outstanding    numeric;
  v_prior_redeemed numeric;
  v_cn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.credit_notes.view') OR public._auth_user_has_permission('sales.credit_notes.create') OR public._auth_user_has_permission('sales.credit_notes.manage')) THEN RAISE EXCEPTION 'Not authorized to redeem credit notes' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount must be > 0 (got %)', p_amount;
  END IF;
  IF p_method NOT IN ('credit_note', 'store_credit') THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: method must be credit_note or store_credit (got %)', p_method;
  END IF;
  IF p_invoice_id IS NULL AND (p_source_type IS NULL OR p_source_id IS NULL) THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: must provide p_invoice_id OR (p_source_type + p_source_id)';
  END IF;
  IF p_source_type IS NOT NULL AND p_source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: p_source_type must be sale_order (got %)', p_source_type;
  END IF;

  SELECT * INTO v_cn
    FROM credit_notes
   WHERE id = p_credit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: credit note % not found', p_credit_note_id;
  END IF;

  IF p_method = 'store_credit'
     AND v_cn.resolution_type IS DISTINCT FROM 'store_credit' THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN % is not resolved as store credit (resolution_type=%)',
      v_cn.credit_note_id, COALESCE(v_cn.resolution_type, 'null');
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT customer_id, total_amount
      INTO v_inv_customer, v_inv_total
      FROM so_invoices
     WHERE id = p_invoice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: invoice % not found', p_invoice_id;
    END IF;
  ELSE
    SELECT customer_id INTO v_inv_customer
      FROM sale_orders
     WHERE id = p_source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: sale order % not found', p_source_id;
    END IF;
  END IF;
  IF v_cn.customer_id IS NULL OR v_cn.customer_id <> v_inv_customer THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN customer_id (%) does not match target customer_id (%)',
      COALESCE(v_cn.customer_id::text, 'null'), v_inv_customer;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_prior_redeemed
    FROM payments
   WHERE credit_note_id = p_credit_note_id
     AND deleted_at IS NULL;
  v_cn_remaining := v_cn.total_amount - v_prior_redeemed;
  IF p_amount > v_cn_remaining THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds CN remaining balance % (total %, prior redemptions %)',
      p_amount, v_cn_remaining, v_cn.total_amount, v_prior_redeemed;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid
      FROM payments
     WHERE invoice_id = p_invoice_id
       AND direction = 'incoming'
       AND deleted_at IS NULL;
    v_outstanding := v_inv_total - v_paid;
    IF p_amount > v_outstanding THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds invoice outstanding %', p_amount, v_outstanding;
    END IF;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 6))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'CPAY-%';
  v_payment_id := 'CPAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, source_type, source_id, customer_id, credit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, reference, notes, direction, status
  ) VALUES (
    v_payment_id, p_invoice_id,
    p_source_type::public.payment_source_type,
    p_source_id, v_cn.customer_id, p_credit_note_id,
    p_amount, 'QAR', 1, p_amount,
    p_method, COALESCE(p_date, CURRENT_DATE),
    p_reference, p_notes, 'incoming', 'completed'
  )
  RETURNING id INTO v_payment_uuid;

  IF p_invoice_id IS NOT NULL THEN
    UPDATE so_invoices
       SET payment_status = (CASE
             WHEN (v_paid + p_amount) >= v_inv_total THEN 'paid'
             WHEN (v_paid + p_amount) > 0            THEN 'partially_paid'
             ELSE 'unpaid'
           END)::public.invoice_payment_status
     WHERE id = p_invoice_id;
  END IF;

  -- Auto-resolve the CN when this redemption drains it. Skip if the CN is
  -- already resolved / voided so we don't clobber sale-return lifecycle
  -- states.
  IF (v_prior_redeemed + p_amount) >= v_cn.total_amount
     AND v_cn.status IN ('open', 'in_progress') THEN
    UPDATE credit_notes
       SET status     = 'resolved',
           updated_at = now()
     WHERE id = p_credit_note_id;
  END IF;

  RETURN v_payment_uuid;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_replace_po_lines(p_po_id uuid, p_lines jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blocked_receival int;
  v_blocked_rfq int;
  v_hdr_div uuid;
BEGIN
  IF p_po_id IS NULL THEN
    RAISE EXCEPTION 'p_po_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Enforce division access for any explicitly-set line division.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS r
    WHERE NULLIF(r->>'division_id','') IS NOT NULL
      AND NOT public.is_division_member((r->>'division_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'Cannot assign a PO line to a division you do not have access to'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT division_id INTO v_hdr_div FROM public.purchase_orders WHERE id = p_po_id;

  -- Lock existing rows before we make any decisions.
  PERFORM 1 FROM public.po_line_items WHERE po_id = p_po_id FOR UPDATE;

  -- Guard C1: block replace when any existing line has receival rows.
  SELECT count(*) INTO v_blocked_receival
  FROM public.receival_items ri
  JOIN public.po_line_items pli ON pli.id = ri.po_line_item_id
  WHERE pli.po_id = p_po_id;

  IF v_blocked_receival > 0 THEN
    RAISE EXCEPTION
      'Cannot replace PO lines: % receival record(s) reference existing lines on this PO. Cancel the receival(s) before editing PO lines.',
      v_blocked_receival
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Guard C2: block replace when any existing line has RFQ quote rows.
  SELECT count(*) INTO v_blocked_rfq
  FROM public.po_rfq_quote_items qi
  JOIN public.po_line_items pli ON pli.id = qi.po_line_item_id
  WHERE pli.po_id = p_po_id;

  IF v_blocked_rfq > 0 THEN
    RAISE EXCEPTION
      'Cannot replace PO lines: % supplier RFQ quote row(s) reference existing lines on this PO. Cancel or invalidate the RFQ quotes before editing PO lines.',
      v_blocked_rfq
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Safe to replace.
  DELETE FROM public.po_line_items WHERE po_id = p_po_id;

  IF jsonb_array_length(p_lines) > 0 THEN
    INSERT INTO public.po_line_items (
      po_id, item_name, sku, qty, received_qty, unit, unit_price, total_price,
      brand_variant_id, free_qty, brand_id,
      show_specification, division_id
    )
    SELECT
      p_po_id,
      (r->>'item_name')::text,
      NULLIF(r->>'sku','')::text,
      (r->>'qty')::int,
      COALESCE((r->>'received_qty')::int, 0),
      (r->>'unit')::text,
      (r->>'unit_price')::numeric,
      (r->>'total_price')::numeric,
      NULLIF(r->>'brand_variant_id','')::uuid,
      COALESCE((r->>'free_qty')::int, 0),
      NULLIF(r->>'brand_id','')::uuid,
      COALESCE((r->>'show_specification')::boolean, false),
      COALESCE(NULLIF(r->>'division_id','')::uuid, v_hdr_div)
    FROM jsonb_array_elements(p_lines) AS r;
  END IF;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_report_accounts_receivable(p_division_ids uuid[] DEFAULT NULL::uuid[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(invoice_no text, customer text, so_no text, sale_order_id uuid, issued_date date, due_date date, amount numeric, paid numeric, due numeric, status text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.invoice_no, r.customer, r.so_no, r.sale_order_id, r.issued_date, r.due_date,
         r.amount, r.paid, r.due, r.status, r.division_id, r.division_name
  FROM (
    SELECT
      si.invoice_id AS invoice_no,
      cust.name     AS customer,
      so.so_number  AS so_no,
      si.sale_order_id,
      si.issued_date,
      si.due_date,
      si.total_amount                       AS amount,
      si.paid_amount                        AS paid,
      (si.total_amount - si.paid_amount)    AS due,
      CASE
        WHEN si.payment_status = 'paid' OR (si.total_amount - si.paid_amount) <= 0 THEN 'Paid'
        WHEN si.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      si.division_id,
      d.name AS division_name
    FROM public.so_invoices si
    LEFT JOIN public.customers cust        ON cust.id = si.customer_id
    LEFT JOIN public.sale_orders so        ON so.id   = si.sale_order_id
    LEFT JOIN public.company_divisions d   ON d.id    = si.division_id
    WHERE public.is_division_visible(si.division_id)
      AND (p_division_ids IS NULL OR si.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR si.issued_date >= p_from)
      AND (p_to   IS NULL OR si.issued_date <= p_to)
      AND (p_customer_id IS NULL OR si.customer_id = p_customer_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.invoice_no;
$function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_report_pnl_fx_detail(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(payment_id uuid, payment_date date, doc_type text, doc_number text, doc_id uuid, currency text, amount numeric, amount_qar numeric, exchange_gain numeric, exchange_loss numeric, net_fx numeric, counterparty text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      p.id                                                    AS payment_id,
      p.date                                                  AS payment_date,
      CASE
        WHEN po.id IS NOT NULL THEN 'Purchase Order'
        WHEN so.id IS NOT NULL THEN 'Sale Order'
        WHEN bl.id IS NOT NULL THEN 'Bill'
        WHEN si.id IS NOT NULL THEN 'Invoice'
        ELSE '—'
      END                                                     AS doc_type,
      COALESCE(po.po_number, so.so_number, bl.bill_number)    AS doc_number,
      COALESCE(po.id, so.id, bl.id, si.id)                    AS doc_id,
      COALESCE(NULLIF(p.currency, ''), po.currency)           AS currency,
      p.amount                                                AS amount,
      p.amount_qar                                            AS amount_qar,
      COALESCE(p.exchange_gain, 0)                            AS exchange_gain,
      COALESCE(p.exchange_loss, 0)                            AS exchange_loss,
      COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0) AS net_fx,
      COALESCE(sup.name, cust.name)                           AS counterparty,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
      COALESCE(po.id, bl.purchase_order_id)                   AS po_id
    FROM public.payments p
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    LEFT JOIN public.suppliers sup      ON sup.id = COALESCE(po.supplier_id, bl.supplier_id, p.supplier_id)
    LEFT JOIN public.customers cust     ON cust.id = COALESCE(so.customer_id, p.customer_id)
    WHERE p.deleted_at IS NULL
      AND p.date BETWEEN p_start AND p_end
      AND (COALESCE(p.exchange_gain, 0) <> 0 OR COALESCE(p.exchange_loss, 0) <> 0)
  ),
  attr AS (
    -- Purchase payment on a PO with per-division weights → split pro-rata.
    SELECT b.payment_id, b.payment_date, b.doc_type, b.doc_number, b.doc_id, b.currency,
           b.amount        * w.weight AS amount,
           b.amount_qar    * w.weight AS amount_qar,
           b.exchange_gain * w.weight AS exchange_gain,
           b.exchange_loss * w.weight AS exchange_loss,
           b.net_fx        * w.weight AS net_fx,
           b.counterparty,
           w.division_id            AS division_id
    FROM base b
    CROSS JOIN LATERAL public._po_division_weights(b.po_id) w
    UNION ALL
    -- Sales / non-PO / unweighted → header division, whole payment.
    SELECT b.payment_id, b.payment_date, b.doc_type, b.doc_number, b.doc_id, b.currency,
           b.amount, b.amount_qar, b.exchange_gain, b.exchange_loss, b.net_fx, b.counterparty,
           b.hdr_div AS division_id
    FROM base b
    WHERE NOT EXISTS (SELECT 1 FROM public._po_division_weights(b.po_id))
  )
  SELECT a.payment_id, a.payment_date, a.doc_type, a.doc_number, a.doc_id, a.currency,
         a.amount, a.amount_qar, a.exchange_gain, a.exchange_loss, a.net_fx, a.counterparty,
         a.division_id, d.name AS division_name
  FROM attr a
  LEFT JOIN public.company_divisions d ON d.id = a.division_id
  WHERE public.is_division_visible(a.division_id)
    AND (p_division_ids IS NULL OR a.division_id = ANY(p_division_ids))
  ORDER BY a.payment_date, a.payment_id, a.division_id;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_report_product_cost(p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[], p_po_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_brand_variant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(layer_id uuid, po_no text, po_id uuid, product_type text, category text, sub_category text, product_name text, barcode text, qty integer, unit_cost numeric, total_cost numeric, sales_price numeric, division_id uuid, division_name text, warehouse_id uuid, warehouse_name text, brand_variant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    fcl.id AS layer_id,
    COALESCE(po.po_number, initcap(replace(fcl.source_type, '_', ' '))) AS po_no,
    r.po_id,
    initcap(replace(COALESCE(c.type::text, ''), '-', ' '))              AS product_type,
    COALESCE(cp.name_en, c.name_en)                                     AS category,
    CASE WHEN cp.id IS NOT NULL THEN c.name_en ELSE NULL END            AS sub_category,
    it.name_en                                                          AS product_name,
    v.code                                                              AS barcode,
    fcl.remaining_qty                                                   AS qty,
    fcl.total_unit_cost                                                 AS unit_cost,
    (fcl.remaining_qty * fcl.total_unit_cost)                           AS total_cost,
    v.selling_price                                                     AS sales_price,
    sc.division_id,
    d.name                                                              AS division_name,
    fcl.warehouse_id,
    w.name                                                              AS warehouse_name,
    fcl.brand_variant_id
  FROM public.fifo_cost_layers fcl
  JOIN public.warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
  JOIN public.inventory_item_brand_variants v ON v.id = fcl.brand_variant_id
  JOIN public.inventory_items it ON it.id = v.item_id
  LEFT JOIN public.inventory_categories c  ON c.id  = it.category_id
  LEFT JOIN public.inventory_categories cp ON cp.id = c.parent_id
  LEFT JOIN public.receivals r         ON r.id  = fcl.receival_id
  LEFT JOIN public.purchase_orders po  ON po.id = r.po_id
  LEFT JOIN public.warehouses w        ON w.id  = fcl.warehouse_id
  LEFT JOIN public.company_divisions d ON d.id  = sc.division_id
  WHERE fcl.remaining_qty > 0
    AND public.is_division_visible(sc.division_id)
    AND (p_division_ids   IS NULL OR sc.division_id   = ANY(p_division_ids))
    AND (p_warehouse_ids  IS NULL OR fcl.warehouse_id = ANY(p_warehouse_ids))
    AND (p_po_id          IS NULL OR r.po_id          = p_po_id)
    AND (p_category_id    IS NULL OR it.category_id   = p_category_id)
    AND (p_brand_variant_id IS NULL OR fcl.brand_variant_id = p_brand_variant_id)
  ORDER BY d.name, w.name, it.name_en, fcl.total_unit_cost;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_report_revenue_cogs(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[], p_customer_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_brand_variant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cogs_id uuid, date date, source_type text, customer text, so_no text, sale_order_id uuid, product_type text, category text, product_name text, barcode text, qty integer, unit_cost numeric, total_cost numeric, sales_price numeric, total_sales numeric, gross_profit numeric, margin_pct numeric, division_id uuid, division_name text, warehouse_id uuid, warehouse_name text, brand_variant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    base.cogs_id, base.date, base.source_type, base.customer, base.so_no, base.sale_order_id,
    base.product_type, base.category, base.product_name, base.barcode,
    base.qty, base.unit_cost, base.total_cost, base.sales_price, base.total_sales,
    (base.total_sales - base.total_cost)                                          AS gross_profit,
    CASE WHEN base.total_sales <> 0
         THEN ((base.total_sales - base.total_cost) / base.total_sales) * 100
         ELSE NULL END                                                            AS margin_pct,
    base.division_id, base.division_name, base.warehouse_id, base.warehouse_name, base.brand_variant_id
  FROM (
    SELECT
      ce.id AS cogs_id, ce.date, ce.source_type,
      cust.name AS customer, so.so_number AS so_no, ce.sale_order_id,
      initcap(replace(COALESCE(c.type::text, ''), '-', ' '))            AS product_type,
      COALESCE(cp.name_en, c.name_en)                                   AS category,
      it.name_en AS product_name, v.code AS barcode,
      ce.qty, ce.unit_cost, ce.total_cost,
      (sol.unit_price * COALESCE(so.exchange_rate, 1))                  AS sales_price,
      (ce.qty * sol.unit_price * COALESCE(so.exchange_rate, 1))         AS total_sales,
      COALESCE(ce.consumer_division_id, ce.division_id)                 AS division_id,
      d.name AS division_name,
      fl.warehouse_id, w.name AS warehouse_name,
      ce.brand_variant_id
    FROM public.cogs_entries ce
    JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
    JOIN public.inventory_items it ON it.id = v.item_id
    LEFT JOIN public.inventory_categories c  ON c.id  = it.category_id
    LEFT JOIN public.inventory_categories cp ON cp.id = c.parent_id
    LEFT JOIN public.sale_orders so   ON so.id = ce.sale_order_id
    LEFT JOIN public.customers cust   ON cust.id = so.customer_id
    LEFT JOIN LATERAL (
      SELECT sol2.unit_price
      FROM public.sale_order_lines sol2
      WHERE sol2.sale_order_id = ce.sale_order_id
        AND sol2.brand_variant_id = ce.brand_variant_id
      LIMIT 1
    ) sol ON true
    LEFT JOIN public.fifo_cost_layers fl ON fl.id = ce.source_id
    LEFT JOIN public.warehouses w ON w.id = fl.warehouse_id
    LEFT JOIN public.company_divisions d ON d.id = COALESCE(ce.consumer_division_id, ce.division_id)
    WHERE ce.source_type IN ('sale', 'sale_return')
      AND ce.date BETWEEN p_start AND p_end
      AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
      AND (p_division_ids   IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
      AND (p_warehouse_ids  IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
      AND (p_customer_id    IS NULL OR so.customer_id = p_customer_id)
      AND (p_category_id    IS NULL OR it.category_id = p_category_id)
      AND (p_brand_variant_id IS NULL OR ce.brand_variant_id = p_brand_variant_id)
  ) base
  ORDER BY base.division_name, base.customer, base.so_no, base.product_name, base.unit_cost;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_request_consumption_edit(p_consumption_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := public._current_user_data_id();
  v_status    text;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: not authenticated';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: reason is required';
  END IF;

  SELECT status INTO v_status
    FROM public.consumption_entries
    WHERE id = p_consumption_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % not found', p_consumption_id;
  END IF;
  IF v_status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % is % (only posted entries can be requested)', p_consumption_id, v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.consumption_edit_requests
    WHERE consumption_id = p_consumption_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: a pending request already exists for this consumption';
  END IF;

  INSERT INTO public.consumption_edit_requests (
    consumption_id, requested_by, reason
  ) VALUES (
    p_consumption_id, v_uid, btrim(p_reason)
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_request_warehouse_item(p_warehouse_id uuid, p_item_name text, p_qty numeric, p_dest_sub_container_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_request_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid        uuid := public._current_user_data_id();
  v_requester  text;
  v_wh_name    text;
  v_dest_name  text;
  v_title      text;
  v_body       text;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'You need to be signed in to request an item.';
  end if;
  if p_item_name is null or btrim(p_item_name) = '' then
    raise exception 'Item name is required.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  if v_wh_name is null then
    raise exception 'Warehouse not found.';
  end if;

  select full_name into v_requester from public.user_data where id = v_uid;
  if p_dest_sub_container_id is not null then
    select name into v_dest_name from public.warehouse_sub_containers where id = p_dest_sub_container_id;
  end if;

  insert into public.warehouse_item_requests
    (warehouse_id, requested_by, requester_name, dest_sub_container_id, dest_name, item_name, qty, notes, request_group_id)
  values
    (p_warehouse_id, v_uid, v_requester, p_dest_sub_container_id, v_dest_name,
     btrim(p_item_name), p_qty, nullif(btrim(coalesce(p_notes, '')), ''), p_request_group_id)
  returning id into v_request_id;

  v_title := 'Item needed: ' || btrim(p_item_name);
  v_body  := format(
    '%s needs %s x %s (not in stock at %s)%s%s',
    coalesce(v_requester, 'A user'),
    p_qty,
    btrim(p_item_name),
    v_wh_name,
    case when v_dest_name is not null then ' - for ' || v_dest_name else '' end,
    case when coalesce(btrim(p_notes), '') <> '' then '. Note: ' || btrim(p_notes) else '' end
  );

  -- Phase 2: recipients via the shared resolver (item_requests.view holders who
  -- are RPs of this warehouse), replacing the previous all-RPs loop.
  insert into public.notifications (profile_id, type, title, body, related_id, related_type)
  select rid, 'item_request', v_title, v_body, v_request_id, 'item_request'
  from public.recipients_for_permission('warehouse.item_requests.view', p_warehouse_id) as rid;

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_resolve_item_request(p_request_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid    := public._current_user_data_id();
  v_wh    uuid;
  v_is_rp boolean;
  v_super boolean := coalesce((auth.jwt() ->> 'user_type') in ('owner', 'accountant'), false);
  v_admin boolean := public._auth_user_has_permission('system.admin');
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;
  if p_status not in ('fulfilled', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select warehouse_id into v_wh from public.warehouse_item_requests where id = p_request_id;
  if v_wh is null then
    raise exception 'Request not found.';
  end if;

  select exists (
    select 1 from public.warehouse_responsible_persons
    where warehouse_id = v_wh and profile_id = v_uid
  ) into v_is_rp;

  if not (v_is_rp or v_super or v_admin) then
    raise exception 'You are not allowed to resolve this request.';
  end if;

  update public.warehouse_item_requests
     set status          = p_status,
         resolved_by     = v_uid,
         resolved_at     = now(),
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request_id and status = 'pending';

  update public.notifications
     set actioned_at = now(),
         read_at     = coalesce(read_at, now())
   where related_type = 'item_request' and related_id = p_request_id and actioned_at is null;
end;
$function$
;

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
END $function$
;

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
$function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_return_tool_unit(p_unit_id uuid, p_notes text DEFAULT NULL::text, p_to_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to return tools' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'returned',
        notes = COALESCE(p_notes, notes),
        returned_to_warehouse_id = p_to_warehouse_id
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available',
        lifecycle_type = CASE WHEN lifecycle_type = 'new' THEN 'used'::public.tool_lifecycle_type ELSE lifecycle_type END
    WHERE id = p_unit_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_sales_aging_report()
 RETURNS TABLE(customer_id uuid, customer_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, invoice_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    i.customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS invoice_count
  FROM so_invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.payment_status != 'paid'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_seed_payment_plan_from_so(p_invoice_id uuid, p_so_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expected_delivery date;
  v_milestones        jsonb;
  v_invoice_type      text;
  v_total             numeric;
  v_plan_id           uuid;
  v_plan_type         text := 'schedule';
  v_milestone         jsonb;
  v_amount            numeric;
  v_due               date;
  v_label             text;
  v_pct               numeric;
  v_sum_pct           numeric := 0;
  v_running           numeric := 0;
  v_n                 int;
  v_i                 int := 0;
BEGIN
  SELECT so.expected_delivery, so.payment_milestones,
         si.invoice_type::text, si.total_amount
    INTO v_expected_delivery, v_milestones, v_invoice_type, v_total
    FROM sale_orders so
    JOIN so_invoices si ON si.id = p_invoice_id
   WHERE so.id = p_so_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_invoice_type <> 'credit' THEN RETURN NULL; END IF;
  IF v_milestones IS NULL OR jsonb_array_length(v_milestones) = 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM payment_plans WHERE invoice_id = p_invoice_id) THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_total, 0) <= 0 THEN RETURN NULL; END IF;

  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_sum_pct := v_sum_pct + COALESCE((v_milestone->>'percent')::numeric, 0);
  END LOOP;
  IF abs(v_sum_pct - 100) > 0.5 THEN RETURN NULL; END IF;

  v_n := jsonb_array_length(v_milestones);

  -- First pass — decide plan_type. Prefer explicit `due_date` on the
  -- milestone; fall back to the label heuristic.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_label := lower(COALESCE(v_milestone->>'label', ''));
    v_due := CASE
      WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
        THEN (v_milestone->>'due_date')::date
      WHEN v_label ~ 'advance'                                              THEN CURRENT_DATE
      WHEN v_label ~ 'delivery' AND v_expected_delivery IS NOT NULL         THEN v_expected_delivery
      WHEN v_label ~ 'net\s*[0-9]+'
        THEN CURRENT_DATE + (substring(v_label FROM 'net\s*([0-9]+)'))::int
      ELSE NULL
    END;
    IF v_due IS NULL THEN v_plan_type := 'adhoc'; END IF;
  END LOOP;

  INSERT INTO payment_plans (invoice_id, plan_type, total_amount)
  VALUES (p_invoice_id, v_plan_type, v_total)
  RETURNING id INTO v_plan_id;

  -- Second pass — insert installments with the resolved due dates.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_i     := v_i + 1;
    v_pct   := COALESCE((v_milestone->>'percent')::numeric, 0);
    v_label := lower(COALESCE(v_milestone->>'label', ''));

    IF v_i = v_n THEN
      v_amount := v_total - v_running;
    ELSE
      v_amount := round(v_total * v_pct / 100.0, 2);
      v_running := v_running + v_amount;
    END IF;

    IF v_plan_type = 'schedule' THEN
      v_due := CASE
        WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
          THEN (v_milestone->>'due_date')::date
        WHEN v_label ~ 'advance'                                              THEN CURRENT_DATE
        WHEN v_label ~ 'delivery' AND v_expected_delivery IS NOT NULL         THEN v_expected_delivery
        WHEN v_label ~ 'net\s*[0-9]+'
          THEN CURRENT_DATE + (substring(v_label FROM 'net\s*([0-9]+)'))::int
        ELSE NULL
      END;
    ELSE
      -- Ad-hoc: preserve explicit dates the user typed; otherwise NULL.
      v_due := CASE
        WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
          THEN (v_milestone->>'due_date')::date
        ELSE NULL
      END;
    END IF;

    INSERT INTO payment_installments (plan_id, due_date, amount)
    VALUES (v_plan_id, v_due, v_amount);
  END LOOP;

  RETURN v_plan_id;
END $function$
;

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
$function$
;

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
$function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_send_tool_to_repair_bucket(p_unit_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status public.tool_status;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to send tools for repair' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is retired'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = p_unit_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'only a tool currently held by a team can be sent for repair';
  END IF;

  -- Close the assignment (keeps which team it came from) + remove it from the team.
  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'sent_for_repair', notes = COALESCE(p_notes, notes)
    WHERE unit_id = p_unit_id AND released_at IS NULL;
  UPDATE public.tool_asset_units
    SET status = 'maintenance', current_custody_location_id = NULL
    WHERE id = p_unit_id;
END $function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_tool_lifecycle_type(p_unit_id uuid, p_lifecycle_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to change the tool type' USING ERRCODE = '42501';
  END IF;
  IF p_lifecycle_type NOT IN ('new','used','repaired') THEN
    RAISE EXCEPTION 'invalid lifecycle type: %', p_lifecycle_type;
  END IF;
  UPDATE public.tool_asset_units
    SET lifecycle_type = p_lifecycle_type::public.tool_lifecycle_type
    WHERE id = p_unit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_settle_installment(p_installment_id uuid, p_amount_paid numeric, p_method text, p_date date, p_reference text DEFAULT NULL::text, p_currency text DEFAULT 'QAR'::text, p_exchange_rate numeric DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          payment_installments%ROWTYPE;
  v_plan          payment_plans%ROWTYPE;
  v_new_paid      numeric;
  v_new_status    text;
  v_payment_id    text;
  v_payment_uuid  uuid;
  v_last_num      int;
  v_all_paid      boolean;
  v_so_id         uuid;
  v_customer_id   uuid;
  v_inv_total     numeric;
  v_total_paid    numeric;
BEGIN
  IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
    RAISE EXCEPTION 'rpc_settle_installment: amount_paid must be > 0 (got %)', p_amount_paid;
  END IF;
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'rpc_settle_installment: currency is required';
  END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'rpc_settle_installment: exchange_rate must be > 0 (got %)', p_exchange_rate;
  END IF;

  SELECT * INTO v_inst
    FROM payment_installments
   WHERE id = p_installment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_settle_installment: installment % not found', p_installment_id;
  END IF;
  IF v_inst.status = 'paid' THEN
    RAISE EXCEPTION 'rpc_settle_installment: installment % is already fully paid', p_installment_id;
  END IF;

  v_new_paid := COALESCE(v_inst.paid_amount, 0) + p_amount_paid;
  IF v_new_paid > v_inst.amount THEN
    RAISE EXCEPTION 'rpc_settle_installment: paid_amount % would exceed installment total % (prior paid %)',
      v_new_paid, v_inst.amount, v_inst.paid_amount;
  END IF;
  v_new_status := CASE WHEN v_new_paid >= v_inst.amount THEN 'paid' ELSE 'partial' END;

  SELECT * INTO v_plan
    FROM payment_plans
   WHERE id = v_inst.plan_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_settle_installment: plan % not found', v_inst.plan_id;
  END IF;
  IF v_plan.invoice_id IS NULL AND v_plan.bill_id IS NULL THEN
    RAISE EXCEPTION 'rpc_settle_installment: plan % has neither invoice_id nor bill_id', v_plan.id;
  END IF;

  -- Resolve SO id + customer from the invoice for source_type/source_id
  IF v_plan.invoice_id IS NOT NULL THEN
    SELECT sale_order_id, customer_id, COALESCE(total_amount, 0)
      INTO v_so_id, v_customer_id, v_inv_total
      FROM so_invoices
     WHERE id = v_plan.invoice_id;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, bill_id,
    source_type, source_id, customer_id,
    amount, method, date, reference,
    direction, status,
    currency, exchange_rate, amount_qar
  ) VALUES (
    v_payment_id,
    v_plan.invoice_id,
    v_plan.bill_id,
    CASE
      WHEN v_so_id IS NOT NULL THEN 'sale_order'::public.payment_source_type
      WHEN v_plan.bill_id IS NOT NULL THEN 'purchase_order'::public.payment_source_type
      ELSE NULL
    END,
    COALESCE(v_so_id, NULL),
    v_customer_id,
    p_amount_paid,
    p_method,
    p_date,
    p_reference,
    (CASE WHEN v_plan.invoice_id IS NOT NULL THEN 'incoming' ELSE 'outgoing' END)::public.payment_direction,
    'completed'::public.payment_status,
    p_currency, p_exchange_rate, p_amount_paid * p_exchange_rate
  )
  RETURNING id INTO v_payment_uuid;

  UPDATE payment_installments
     SET paid_amount = v_new_paid,
         status      = v_new_status,
         payment_id  = v_payment_uuid,
         updated_at  = now()
   WHERE id = p_installment_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM payment_installments
     WHERE plan_id = v_plan.id
       AND status <> 'paid'
  ) INTO v_all_paid;

  IF v_all_paid AND v_plan.status <> 'completed' THEN
    UPDATE payment_plans
       SET status     = 'completed',
           updated_at = now()
     WHERE id = v_plan.id;
  END IF;

  -- Recompute invoice payment_status (same pattern as rpc_redeem_credit_note)
  IF v_plan.invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM payments
     WHERE invoice_id = v_plan.invoice_id
       AND deleted_at IS NULL;

    UPDATE so_invoices
       SET payment_status = (CASE
             WHEN v_total_paid >= v_inv_total THEN 'paid'
             WHEN v_total_paid > 0            THEN 'partially_paid'
             ELSE 'unpaid'
           END)::public.invoice_payment_status
     WHERE id = v_plan.invoice_id;
  END IF;

  RETURN v_payment_uuid;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_sync_invoice_from_so(p_so_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so                RECORD;
  v_invoice           RECORD;
  v_total             numeric;
  v_needs_refresh     boolean;
  v_new_inv_id        uuid;
  v_new_inv_display   text;
  v_last_num          int;
  v_invoice_type      text;
BEGIN
  SELECT so.id, so.so_number, so.status, so.customer_id, so.division_id,
         CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type
    INTO v_so
    FROM sale_orders so
    JOIN customers c ON c.id = so.customer_id
   WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_sync_invoice_from_so: SO % not found', p_so_id;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_total
    FROM sale_order_lines
   WHERE sale_order_id = p_so_id;

  -- Look for an existing non-paid invoice (auto-draft flow only handles
  -- the pre-issue draft; a paid invoice is off-limits for this path).
  SELECT id, payment_status
    INTO v_invoice
    FROM so_invoices
   WHERE sale_order_id = p_so_id
     AND payment_status <> 'paid'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_needs_refresh := v_invoice.payment_status IN ('partially_paid', 'overdue');

    -- Rebuild lines atomically (delete + insert both under this tx).
    DELETE FROM invoice_line_items WHERE invoice_id = v_invoice.id;

    INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
    SELECT v_invoice.id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
      FROM sale_order_lines sol
     WHERE sol.sale_order_id = p_so_id;

    UPDATE so_invoices
       SET total_amount   = v_total,
           subtotal       = v_total,
           needs_refresh  = v_needs_refresh
     WHERE id = v_invoice.id;

    -- Seed payment plan from SO milestones (idempotent no-op if a plan exists).
    PERFORM public.rpc_seed_payment_plan_from_so(v_invoice.id, p_so_id);

    RETURN jsonb_build_object(
      'action',      'updated',
      'invoice_id',  v_invoice.id
    );
  END IF;

  -- No existing invoice — only auto-create on confirmed SOs.
  IF v_so.status <> 'confirmed' THEN
    RETURN jsonb_build_object('action', 'noop', 'reason', 'so_not_confirmed');
  END IF;

  -- Advisory lock serialises the max-based INV numbering.
  PERFORM pg_advisory_xact_lock(hashtext('inv_serial'));

  SELECT COALESCE(MAX((substring(invoice_id from 5))::int), 0)
    INTO v_last_num
    FROM so_invoices
   WHERE invoice_id ILIKE 'INV-%';
  v_new_inv_display := 'INV-' || LPAD((v_last_num + 1)::text, 5, '0');

  v_invoice_type := v_so.customer_type;  -- 'cash' | 'credit'

  INSERT INTO so_invoices (
    invoice_id, customer_id, division_id, sale_order_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_new_inv_display,
    v_so.customer_id,
    v_so.division_id,
    p_so_id,
    v_invoice_type::public.invoice_type,
    'draft',
    'unpaid'::public.invoice_payment_status,
    false,
    v_total, v_total,
    CURRENT_DATE,
    CASE v_invoice_type WHEN 'cash' THEN CURRENT_DATE ELSE CURRENT_DATE + 30 END,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id INTO v_new_inv_id;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
    FROM sale_order_lines sol
   WHERE sol.sale_order_id = p_so_id;

  -- Auto-seed payment plan from SO milestones (idempotent).
  PERFORM public.rpc_seed_payment_plan_from_so(v_new_inv_id, p_so_id);

  RETURN jsonb_build_object(
    'action',           'created',
    'invoice_id',       v_new_inv_id,
    'invoice_display',  v_new_inv_display
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_team_item_variant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT v.id
  FROM public.inventory_item_brand_variants v
  JOIN public.inventory_items      i ON i.id = v.item_id
  JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE COALESCE(i.is_team_item, c.is_team_item, false)
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_transfer_tool_unit(p_unit_id uuid, p_to_division_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from uuid;
BEGIN
  IF NOT _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_to_division_id IS NULL THEN
    RAISE EXCEPTION 'target division required';
  END IF;

  SELECT division_id INTO v_from FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit % not found', p_unit_id;
  END IF;

  -- Division owns, person holds: division_id moves, assigned_to is preserved.
  UPDATE public.tool_asset_units
     SET division_id = p_to_division_id
   WHERE id = p_unit_id;

  -- ISSUE-8: a unit can't be held by a team outside its (new) division. If the
  -- division actually changed, release any open team assignment + clear pointer.
  IF p_to_division_id IS DISTINCT FROM v_from THEN
    UPDATE public.tool_unit_assignments
       SET released_at = now(), release_reason = 'moved'
     WHERE unit_id = p_unit_id AND released_at IS NULL;

    UPDATE public.tool_asset_units
       SET current_custody_location_id = NULL
     WHERE id = p_unit_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_update_document_initial_rate(p_document_type text, p_document_id uuid, p_new_rate numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_rate    numeric;
  v_auth_uid    uuid := auth.uid();
  v_user_data_id uuid;
BEGIN
  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'new_rate must be positive';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason must be at least 5 characters';
  END IF;
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be called by an authenticated user';
  END IF;

  SELECT id INTO v_user_data_id
    FROM public.user_data
   WHERE auth_user_id = v_auth_uid
   LIMIT 1;

  IF v_user_data_id IS NULL THEN
    RAISE EXCEPTION 'no user_data row for auth user %', v_auth_uid;
  END IF;

  IF p_document_type = 'po' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.purchase_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO % not found', p_document_id; END IF;

    UPDATE public.purchase_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.sale_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SO % not found', p_document_id; END IF;

    UPDATE public.sale_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;

  INSERT INTO public.exchange_rate_change_log
    (document_type, document_id, old_rate, new_rate, reason, changed_by)
  VALUES (p_document_type, p_document_id, v_old_rate, p_new_rate, p_reason, v_user_data_id);

  PERFORM public.rpc_recompute_document_fx(p_document_type, p_document_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_update_inventory_sort_orders(p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT public._user_can_edit_catalog(public._current_user_data_id()) THEN
    RAISE EXCEPTION 'Permission denied: inventory.catalog.manage required' USING ERRCODE='42501';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_updates) AS x(table_name text, id uuid, sort_order int) LOOP
    IF r.table_name = 'inventory_categories' THEN
      UPDATE public.inventory_categories SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_items' THEN
      UPDATE public.inventory_items SET sort_order = r.sort_order WHERE id = r.id;
    ELSIF r.table_name = 'inventory_item_brand_variants' THEN
      UPDATE public.inventory_item_brand_variants SET sort_order = r.sort_order WHERE id = r.id;
    END IF;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_warehouse_sub_container(p_warehouse_id uuid, p_name text, p_division_id uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT NULL::boolean, p_responsible_person_profile_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_so_id UUID;
BEGIN
  v_so_id := COALESCE(NEW.sale_order_id, OLD.sale_order_id);
  IF v_so_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.sale_orders
     SET quotation_pdf_url = NULL
   WHERE id = v_so_id
     AND quotation_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sale_orders_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.quotation_pdf_url := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_customer_credit_docs(p_customer_id uuid, p_docs jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cr text;
  v_es text;
  v_sg text;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'save_customer_credit_docs: customer_id is required';
  END IF;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_cr
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'cr'
   LIMIT 1;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_es
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'establishment_id'
   LIMIT 1;

  SELECT NULLIF(d->>'file_url', '')
    INTO v_sg
    FROM jsonb_array_elements(COALESCE(p_docs, '[]'::jsonb)) AS d
   WHERE d->>'doc_type' = 'signed_credit_form'
   LIMIT 1;

  -- If every URL is NULL, delete the row rather than leaving an all-NULL shell.
  IF v_cr IS NULL AND v_es IS NULL AND v_sg IS NULL THEN
    DELETE FROM public.customer_credit_docs WHERE customer_id = p_customer_id;
    RETURN;
  END IF;

  INSERT INTO public.customer_credit_docs (customer_id, cr_url, establishment_id_url, signed_credit_form_url)
  VALUES (p_customer_id, v_cr, v_es, v_sg)
  ON CONFLICT (customer_id) DO UPDATE
    SET cr_url                 = EXCLUDED.cr_url,
        establishment_id_url   = EXCLUDED.establishment_id_url,
        signed_credit_form_url = EXCLUDED.signed_credit_form_url;
END $function$
;

CREATE OR REPLACE FUNCTION public.save_customer_phones(p_customer_id uuid, p_phones jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phones        text[];
  v_primary_count int;
  v_conflict_row  record;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF p_phones IS NULL OR jsonb_typeof(p_phones) <> 'array' OR jsonb_array_length(p_phones) = 0 THEN
    RAISE EXCEPTION 'At least one phone is required';
  END IF;

  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_phones) elem
  WHERE (elem->>'is_primary')::boolean IS TRUE;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one phone must be marked primary (got %)', v_primary_count;
  END IF;

  SELECT array_agg(elem->>'phone') INTO v_phones
  FROM jsonb_array_elements(p_phones) elem;

  -- Cross-customer collision check.
  SELECT cp.phone, cp.customer_id
    INTO v_conflict_row
    FROM public.customer_phones cp
   WHERE cp.phone = ANY(v_phones)
     AND cp.customer_id <> p_customer_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Phone number % is already assigned to another customer', v_conflict_row.phone
      USING ERRCODE = '23505';
  END IF;

  -- Remove rows on this customer that aren't in the new list.
  DELETE FROM public.customer_phones
   WHERE customer_id = p_customer_id
     AND phone <> ALL(v_phones);

  -- Upsert. ON CONFLICT (phone) is safe here — the collision check above
  -- already established that every phone in the list either doesn't
  -- exist yet or already belongs to this customer.
  INSERT INTO public.customer_phones (customer_id, phone, is_primary)
  SELECT p_customer_id,
         elem->>'phone',
         (elem->>'is_primary')::boolean
    FROM jsonb_array_elements(p_phones) elem
   ON CONFLICT (phone) DO UPDATE
     SET is_primary = EXCLUDED.is_primary;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_employee(p_employee_id uuid, p_name text, p_phone text, p_nationality text, p_join_date date, p_status text, p_avatar_url text, p_service_ids uuid[], p_division_id uuid DEFAULT NULL::uuid)
 RETURNS employees
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name        = p_name,
    phone       = p_phone,
    nationality = p_nationality,
    join_date   = p_join_date,
    status      = p_status::employee_status,
    avatar_url  = p_avatar_url,
    division_id = p_division_id
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_inventory_check_item_count(p_item_id uuid, p_counted_qty numeric, p_variance_type text, p_assignment_id uuid DEFAULT NULL::uuid, p_profile_id uuid DEFAULT NULL::uuid, p_profile_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_id uuid;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.check.count') THEN RAISE EXCEPTION 'Not authorized to count inventory checks' USING ERRCODE = '42501'; END IF;
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;

  -- Idempotent assignment transition + log event on first count-save.
  IF p_assignment_id IS NOT NULL THEN
    UPDATE inventory_check_assignments
    SET status     = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE id     = p_assignment_id
      AND status = 'pending'
    RETURNING check_id INTO v_check_id;

    -- Only insert the log row when the UPDATE actually fired
    -- (i.e. the assignment was still pending). v_check_id stays
    -- NULL for the second-and-later save on the same assignment.
    IF v_check_id IS NOT NULL THEN
      INSERT INTO inventory_check_log (
        check_id, event_type, profile_id, profile_name, meta
      ) VALUES (
        v_check_id,
        'user_started',
        p_profile_id,
        p_profile_name,
        jsonb_build_object('assignment_id', p_assignment_id)
      );
    END IF;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_inventory_check_item_count(p_item_id uuid, p_counted_qty numeric, p_variance_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_order_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text DEFAULT 'flat'::text, p_discount_value numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.order_quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::order_quotation_status,
    p_total_amount,
    NULLIF(p_notes, ''),
    CURRENT_DATE,
    p_expiry_date,
    p_sent_date,
    COALESCE(p_discount_type, 'flat'),
    COALESCE(p_discount_value, 0)
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    service_customer_id = EXCLUDED.service_customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, order_quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  DELETE FROM public.order_quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.order_quotation_line_items (
      quotation_id, service_id, name, path, qty, price, duration
    ) VALUES (
      v_uuid,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      NULLIF(v_item->>'duration', '')::int
    );
  END LOOP;

  RETURN v_uuid;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.schedule_day_end(days jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    MAX(
      CASE
        WHEN (split_part(d.v->>'end', ':', 2)::integer) > 0
          THEN split_part(d.v->>'end', ':', 1)::integer + 1
        ELSE split_part(d.v->>'end', ':', 1)::integer
      END
    ),
    18
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'end' IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.schedule_day_start(days jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    MIN(split_part(d.v->>'start', ':', 1)::integer),
    7
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'start' IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.search_customers(p_query text DEFAULT NULL::text, p_only_active boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm    text := NULLIF(BTRIM(COALESCE(p_query, '')), '');
  v_pattern text := CASE WHEN v_norm IS NULL THEN NULL
                         ELSE '%' || REPLACE(REPLACE(v_norm, '\', '\\'), '%', '\%') || '%'
                    END;
  v_total   bigint;
  v_rows    jsonb;
BEGIN
  WITH matched AS (
    SELECT DISTINCT c.id
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
  )
  SELECT COUNT(*) INTO v_total FROM matched;

  WITH matched AS (
    SELECT DISTINCT c.id, c.name
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
    ORDER BY c.name
    LIMIT  GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_agg(row)
  INTO   v_rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.email,
      CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type,
      c.entity_type,
      (c.block_reason IS NOT NULL) AS is_blocked,
      c.is_active,
      c.credit_group_id,
      (
        SELECT jsonb_build_object(
                 'name',                  cg.name,
                 'credit_limit',          cg.credit_limit,
                 'default_payment_terms', cg.default_payment_terms
               )
        FROM   public.credit_groups cg
        WHERE  cg.id = c.credit_group_id
      ) AS credit_groups,
      COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object('phone', cp.phone, 'is_primary', cp.is_primary)
                  ORDER BY cp.is_primary DESC
                )
         FROM   public.customer_phones cp
         WHERE  cp.customer_id = c.id),
        '[]'::jsonb
      ) AS customer_phones
    FROM   matched m
    JOIN   public.customers c ON c.id = m.id
    ORDER  BY m.name
  ) AS row;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows, '[]'::jsonb),
    'total_count', v_total
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_tool_units(p_query text)
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, current_team_id uuid, current_team_name text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name, u.status::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE p_query IS NOT NULL AND length(trim(p_query)) > 0
    AND (u.serial_number ILIKE '%'||p_query||'%' OR i.name_en ILIKE '%'||p_query||'%')
  ORDER BY u.serial_number
  LIMIT 100;
$function$
;

CREATE OR REPLACE FUNCTION public.service_inventory_bulk_upsert(p_service_ids uuid[], p_brand_variant_id uuid, p_link_type text DEFAULT 'supply'::text, p_quantity numeric DEFAULT 1, p_warranty_months integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public._auth_can_write_catalog()) THEN RAISE EXCEPTION 'Not authorized to bulk-update inventory' USING ERRCODE = '42501'; END IF;
  IF array_length(p_service_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO service_inventory
    (service_id, brand_variant_id, link_type, quantity, warranty_months)
  SELECT
    unnest(p_service_ids),
    p_brand_variant_id,
    p_link_type,
    p_quantity,
    p_warranty_months
  ON CONFLICT (service_id, brand_variant_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_active_division(p_division_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_user_type  text;
  v_allowed    boolean;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF p_division_id IS NULL THEN
    UPDATE user_data SET active_division_id = NULL WHERE id = v_profile_id;
    RETURN;
  END IF;

  v_user_type := auth.jwt() ->> 'user_type';

  IF v_user_type IN ('owner', 'accountant') THEN
    v_allowed := EXISTS (
      SELECT 1 FROM company_divisions WHERE id = p_division_id AND is_active
    );
  ELSE
    v_allowed := EXISTS (
      SELECT 1 FROM user_company_divisions ucd
      JOIN company_divisions cd ON cd.id = ucd.division_id
      WHERE ucd.profile_id = v_profile_id
        AND ucd.division_id = p_division_id
        AND cd.is_active
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Division % is not accessible to this user', p_division_id;
  END IF;

  UPDATE user_data SET active_division_id = p_division_id WHERE id = v_profile_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_approval_request_decided_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
    NEW.decided_at = now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bill_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- is_local = true → resets at COMMIT.
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.bills
     SET pdf_url = p_url, needs_refresh = FALSE
   WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_consumer_division_from_sale_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.consumer_division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id
      INTO NEW.consumer_division_id
      FROM public.sale_orders
     WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_credit_note_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.credit_notes SET pdf_url = p_url WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_division_from_sale_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.sale_orders WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_invoice_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.so_invoices SET pdf_url = p_url WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_po_pdf_url(p_id uuid, p_variant text, p_url text, p_payment_hash text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);

  IF p_variant = 'rfq' THEN
    UPDATE public.purchase_orders SET pdf_rfq_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'draft' THEN
    UPDATE public.purchase_orders SET pdf_draft_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'po' THEN
    UPDATE public.purchase_orders
       SET pdf_po_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSIF p_variant = 'confirmed' THEN
    UPDATE public.purchase_orders
       SET pdf_confirmed_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Invalid PDF variant: %', p_variant;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_responsible_person(p_project_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects
     SET responsible_person_profile_id = p_profile_id, updated_at = now()
   WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  -- Mirror onto the active stock pool (discipline_id IS NULL) so the custody
  -- card + consume/return authorisation see the same RP. NULL clears it.
  UPDATE public.warehouse_sub_containers
     SET responsible_person_profile_id = p_profile_id, updated_at = now()
   WHERE project_id = p_project_id AND discipline_id IS NULL AND is_active;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_receival_check_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.receivals SET check_sheet_pdf_url = p_url WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_sale_order_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.sale_orders SET quotation_pdf_url = p_url WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_service_customers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sku_abbreviation(input text, len integer DEFAULT 3)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT upper(left(regexp_replace(input, '[^A-Za-z]', '', 'g'), len))
$function$
;

CREATE OR REPLACE FUNCTION public.snapshot_inventory_check_system_qty(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_id     UUID;
  v_sub_container_id UUID;
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.check.create') THEN RAISE EXCEPTION 'Not authorized to start inventory checks' USING ERRCODE = '42501'; END IF;
  SELECT warehouse_id, sub_container_id
  INTO   v_warehouse_id, v_sub_container_id
  FROM   inventory_checks
  WHERE  id = p_check_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_sub_container_id IS NOT NULL THEN
    -- Sub-container-scoped snapshot: sum remaining_qty from fifo_cost_layers
    -- restricted to that sub-container. `warehouse_stock_view` doesn't yet
    -- expose sub_container_id (D.5), so we go straight to the layers.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(sq.qty, 0)
    FROM (
      SELECT brand_variant_id, SUM(remaining_qty)::NUMERIC AS qty
      FROM   fifo_cost_layers
      WHERE  warehouse_id     = v_warehouse_id
        AND  sub_container_id = v_sub_container_id
        AND  remaining_qty    > 0
      GROUP BY brand_variant_id
    ) sq
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND sq.brand_variant_id = ici.brand_variant_id;
  ELSE
    -- Legacy path (pre-D.4.c checks): warehouse-wide snapshot.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(wsv.qty, 0)
    FROM warehouse_stock_view wsv
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND wsv.warehouse_id = v_warehouse_id
      AND wsv.brand_variant_id = ici.brand_variant_id;
  END IF;

  -- Items absent from the stock source — pin at 0 so the recon row has a
  -- frozen value.
  UPDATE inventory_check_items
  SET system_qty_at_close = 0
  WHERE check_id = p_check_id
    AND is_counted = true
    AND system_qty_at_close IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.storage_customer_credit_docs_write_allowed()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   user_data p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id           = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system_admin = true
      OR 'master_data.customers.manage' = ANY(cr.permissions)
      OR 'master_data.customers.change_credit_group' = ANY(cr.permissions)
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.storage_delete_object(p_bucket text, p_path text, p_source_table text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_key      text;
  v_base_url text := 'https://mwvblpgbgxipvrevkeff.supabase.co';
  v_url      text;
BEGIN
  IF p_path IS NULL OR p_path = '' THEN RETURN; END IF;

  IF p_path LIKE 'http%' THEN
    p_path := regexp_replace(p_path, '^.*/storage/v1/object/(public/)?[^/]+/', '');
    p_path := regexp_replace(p_path, '\?.*$', '');
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'storage_cleanup_service_role_key';

  IF v_key IS NULL THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id,
            'Vault secret storage_cleanup_service_role_key missing');
    RETURN;
  END IF;

  v_url := v_base_url || '/storage/v1/object/' || p_bucket || '/' || p_path;

  BEGIN
    PERFORM net.http_delete(
      url     := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'apikey',        v_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id, SQLERRM);
  END;
END $function$
;

CREATE OR REPLACE FUNCTION public.storage_lc_bills_write_allowed()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   user_data p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    p.is_active = true
    AND    cr.deleted_at IS NULL
    AND    (
      cr.is_system_admin = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.submit_credit_group_change(p_customer_id uuid, p_requested_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer        RECORD;
  v_new_group       RECORD;
  v_profile_id      uuid;
  v_request_id      uuid;
  v_step            RECORD;
  v_step_count      integer := 0;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Credit docs live in customer_credit_docs (wide, one row per customer), NOT
  -- on customers. LEFT JOIN so a customer with no docs row still returns, with
  -- NULL doc urls, and the required-docs checks below fire correctly.
  SELECT c.id, c.credit_group_id, c.entity_type,
         d.cr_url,
         d.establishment_id_url,
         d.signed_credit_form_url
    INTO v_customer
  FROM customers c
  LEFT JOIN customer_credit_docs d ON d.customer_id = c.id
  WHERE c.id = p_customer_id;
  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT id, name, credit_limit INTO v_new_group
  FROM credit_groups WHERE id = p_requested_group_id;
  IF v_new_group.id IS NULL THEN
    RAISE EXCEPTION 'Credit group not found';
  END IF;

  IF COALESCE(v_new_group.credit_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Approval only required for credit groups with a non-zero limit. Assign this group directly.';
  END IF;

  IF v_customer.credit_group_id = p_requested_group_id THEN
    RAISE EXCEPTION 'Customer is already on this credit group';
  END IF;

  IF COALESCE(v_customer.entity_type::text, 'individual') = 'business' THEN
    IF v_customer.cr_url IS NULL
       OR v_customer.establishment_id_url IS NULL
       OR v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload all 3 required docs (CR, Establishment ID, Signed Credit Form) for business customers'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload the Signed Credit Form before requesting a credit group'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_requests
    WHERE customer_id = p_customer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending credit-group change for this customer';
  END IF;

  INSERT INTO customer_credit_group_requests (
    customer_id, requested_group_id, previous_group_id, status, requested_by
  ) VALUES (
    p_customer_id, p_requested_group_id, v_customer.credit_group_id, 'pending', v_profile_id
  )
  RETURNING id INTO v_request_id;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles            cr ON cr.id = was.role_id
    WHERE  was.workflow    = 'credit_group'
      AND  was.is_active   = true
      AND  was.archived_at IS NULL
    ORDER BY was.step_order
  LOOP
    INSERT INTO customer_credit_group_approvals (
      request_id, step_role, step_order, status, is_active, iteration
    ) VALUES (
      v_request_id, v_step.role_name, v_step.step_order, 'pending', true, 1
    );
    v_step_count := v_step_count + 1;
  END LOOP;

  IF v_step_count = 0 THEN
    -- No steps configured → auto-approve
    UPDATE customers
       SET credit_group_id = p_requested_group_id,
           block_reason    = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM user_data WHERE id = v_profile_id),
    'info',
    jsonb_build_object(
      'request_id',       v_request_id,
      'requested_group',  v_new_group.name,
      'previous_group_id',v_customer.credit_group_id,
      'auto_approved',    v_step_count = 0
    )::text
  );

  RETURN jsonb_build_object(
    'request_id',  v_request_id,
    'step_count',  v_step_count,
    'status',      CASE WHEN v_step_count = 0 THEN 'approved' ELSE 'pending' END
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_service_change(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id     UUID;
  v_has_approve    BOOLEAN;
  v_has_manage     BOOLEAN;
  v_service_id     UUID;
  v_change_type    service_change_type;
  v_changes        JSONB;
  v_division       TEXT[];
  v_tree_type      TEXT;
  v_parent_id      UUID;
  v_has_pending    BOOLEAN;
  v_new_id         UUID;
  v_needs_approval BOOLEAN := false;
  v_key            TEXT;
  v_approval_fields TEXT[] := ARRAY['name_en', 'name_ar', 'price', 'emergency_price', 'status'];
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  v_has_approve := _user_has_permission(v_profile_id, 'master_data.services.approve');
  v_has_manage  := _user_has_permission(v_profile_id, 'master_data.services.manage');

  IF NOT v_has_manage THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.manage required';
  END IF;

  v_service_id  := (p_payload->>'service_id')::UUID;
  v_change_type := (p_payload->>'change_type')::service_change_type;
  v_changes     := p_payload->'changes';
  v_tree_type   := p_payload->>'tree_type';
  v_parent_id   := (p_payload->>'parent_id')::UUID;

  SELECT COALESCE(array_agg(elem::TEXT), '{}')
  INTO v_division
  FROM jsonb_array_elements_text(p_payload->'division') AS elem;

  IF v_change_type IN ('add', 'delete') THEN
    v_needs_approval := true;
  ELSIF v_change_type = 'edit' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
      IF v_key = ANY(v_approval_fields) THEN
        v_needs_approval := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_has_approve OR NOT v_needs_approval THEN
    CASE v_change_type
      WHEN 'add' THEN
        v_new_id := gen_random_uuid();
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code, legacy_service_id,
          price, emergency_price, discount, price_unit,
          duration, warranty, status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement,
          catalog_image_url, brands_supported, includes_notes,
          spare_parts, qc_checklist, instructions, reminder_days,
          booking_time_matrix, inventory_items, components, qc_items
        ) VALUES (
          v_new_id, v_parent_id, v_tree_type, 0, v_division,
          v_changes->'name_en'->>'new',
          v_changes->'name_ar'->>'new',
          v_changes->'code'->>'new',
          v_changes->'legacy_service_id'->>'new',
          (v_changes->'price'->>'new')::NUMERIC,
          (v_changes->'emergency_price'->>'new')::NUMERIC,
          (v_changes->'discount'->>'new')::NUMERIC,
          v_changes->'price_unit'->>'new',
          (v_changes->'duration'->>'new')::INT,
          (v_changes->'warranty'->>'new')::INT,
          COALESCE(v_changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_changes ? 'category' AND v_changes->'category'->>'new' IS NOT NULL
               THEN (v_changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_changes ? 'service_type' AND v_changes->'service_type'->>'new' IS NOT NULL
               THEN (v_changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_changes ? 'contract_type' AND v_changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_changes->'item_kind'->>'new',
          v_changes->'pricing_mode'->>'new',
          v_changes->'discount_scope'->>'new',
          v_changes->'invoice_text_en'->>'new',
          v_changes->'invoice_text_ar'->>'new',
          v_changes->'photo_requirement'->>'new',
          v_changes->'catalog_image_url'->>'new',
          COALESCE((v_changes->'brands_supported'->>'new')::INT, 0),
          COALESCE((v_changes->'includes_notes'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'spare_parts'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'qc_checklist'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'instructions'->>'new')::BOOLEAN, false),
          (v_changes->'reminder_days'->>'new')::INT,
          CASE WHEN v_changes ? 'booking_time_matrix' THEN v_changes->'booking_time_matrix'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'inventory_items'     THEN v_changes->'inventory_items'->'new'     ELSE NULL END,
          CASE WHEN v_changes ? 'components'          THEN v_changes->'components'->'new'          ELSE NULL END,
          CASE WHEN v_changes ? 'qc_items'            THEN v_changes->'qc_items'->'new'            ELSE NULL END
        );
        v_service_id := v_new_id;

      WHEN 'edit' THEN
        UPDATE services SET
          name_en           = CASE WHEN v_changes ? 'name_en'           THEN v_changes->'name_en'->>'new'                    ELSE name_en           END,
          name_ar           = CASE WHEN v_changes ? 'name_ar'           THEN v_changes->'name_ar'->>'new'                    ELSE name_ar           END,
          code              = CASE WHEN v_changes ? 'code'              THEN v_changes->'code'->>'new'                       ELSE code              END,
          legacy_service_id = CASE WHEN v_changes ? 'legacy_service_id' THEN v_changes->'legacy_service_id'->>'new'          ELSE legacy_service_id END,
          price             = CASE WHEN v_changes ? 'price'             THEN (v_changes->'price'->>'new')::NUMERIC            ELSE price             END,
          emergency_price   = CASE WHEN v_changes ? 'emergency_price'   THEN (v_changes->'emergency_price'->>'new')::NUMERIC  ELSE emergency_price   END,
          discount          = CASE WHEN v_changes ? 'discount'          THEN (v_changes->'discount'->>'new')::NUMERIC         ELSE discount          END,
          price_unit        = CASE WHEN v_changes ? 'price_unit'        THEN v_changes->'price_unit'->>'new'                  ELSE price_unit        END,
          duration          = CASE WHEN v_changes ? 'duration'          THEN (v_changes->'duration'->>'new')::INT             ELSE duration          END,
          warranty          = CASE WHEN v_changes ? 'warranty'          THEN (v_changes->'warranty'->>'new')::INT             ELSE warranty          END,
          status            = CASE WHEN v_changes ? 'status'            THEN (v_changes->'status'->>'new')::service_status    ELSE status            END,
          service_type      = CASE WHEN v_changes ? 'service_type'      THEN (v_changes->'service_type'->>'new')::service_type ELSE service_type     END,
          contract_type     = CASE WHEN v_changes ? 'contract_type'     THEN
                                CASE WHEN v_changes->'contract_type'->>'new' IS NOT NULL
                                     THEN (v_changes->'contract_type'->>'new')::contract_type
                                     ELSE NULL END                                                                            ELSE contract_type     END,
          item_kind         = CASE WHEN v_changes ? 'item_kind'         THEN v_changes->'item_kind'->>'new'                   ELSE item_kind         END,
          pricing_mode      = CASE WHEN v_changes ? 'pricing_mode'      THEN v_changes->'pricing_mode'->>'new'                ELSE pricing_mode      END,
          discount_scope    = CASE WHEN v_changes ? 'discount_scope'    THEN v_changes->'discount_scope'->>'new'              ELSE discount_scope    END,
          invoice_text_en   = CASE WHEN v_changes ? 'invoice_text_en'   THEN v_changes->'invoice_text_en'->>'new'             ELSE invoice_text_en   END,
          invoice_text_ar   = CASE WHEN v_changes ? 'invoice_text_ar'   THEN v_changes->'invoice_text_ar'->>'new'             ELSE invoice_text_ar   END,
          photo_requirement = CASE WHEN v_changes ? 'photo_requirement' THEN v_changes->'photo_requirement'->>'new'           ELSE photo_requirement END,
          catalog_image_url = CASE WHEN v_changes ? 'catalog_image_url' THEN v_changes->'catalog_image_url'->>'new'           ELSE catalog_image_url END,
          brands_supported  = CASE WHEN v_changes ? 'brands_supported'  THEN (v_changes->'brands_supported'->>'new')::INT  ELSE brands_supported  END,
          includes_notes    = CASE WHEN v_changes ? 'includes_notes'    THEN (v_changes->'includes_notes'->>'new')::BOOLEAN    ELSE includes_notes    END,
          spare_parts       = CASE WHEN v_changes ? 'spare_parts'       THEN (v_changes->'spare_parts'->>'new')::BOOLEAN       ELSE spare_parts       END,
          qc_checklist      = CASE WHEN v_changes ? 'qc_checklist'      THEN (v_changes->'qc_checklist'->>'new')::BOOLEAN      ELSE qc_checklist      END,
          instructions      = CASE WHEN v_changes ? 'instructions'      THEN (v_changes->'instructions'->>'new')::BOOLEAN      ELSE instructions      END,
          reminder_days     = CASE WHEN v_changes ? 'reminder_days'     THEN (v_changes->'reminder_days'->>'new')::INT         ELSE reminder_days     END,
          updated_at        = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

      WHEN 'delete' THEN
        IF EXISTS (
          SELECT 1 FROM order_services os
          JOIN orders o ON o.id = os.order_id
          WHERE os.service_id = v_service_id
            AND o.status NOT IN ('completed', 'cancelled')
            AND o.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Cannot delete: service has active orders';
        END IF;
        UPDATE services
        SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

    END CASE;

    INSERT INTO activity_log (action, module, entity_type, entity_id, details)
    VALUES (
      'services/service-' || v_change_type || 'd',
      'services',
      'service',
      v_service_id,
      jsonb_build_object('change_type', v_change_type, 'applied_by', v_profile_id)::TEXT
    );

    RETURN jsonb_build_object('action', 'applied', 'id', v_service_id);

  ELSE
    IF v_service_id IS NOT NULL THEN
      SELECT has_pending_change INTO v_has_pending FROM services WHERE id = v_service_id;
      IF v_has_pending THEN
        RAISE EXCEPTION 'This service already has a pending change awaiting approval';
      END IF;
    END IF;

    INSERT INTO service_edit_requests (service_id, division, change_type, changes, requested_by)
    VALUES (v_service_id, v_division, v_change_type, v_changes, v_profile_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('action', 'pending', 'id', v_new_id);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.swap_visit_team(p_assignment_id uuid, p_new_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id        uuid;
  v_scheduled_date  date;
  v_time_slot       text;
  v_duration        text;
  v_time_conflict   int;
  v_performer       text;
BEGIN
  -- 1. Fetch the assignment being swapped
  SELECT order_id, scheduled_date, time_slot, duration
  INTO   v_order_id, v_scheduled_date, v_time_slot, v_duration
  FROM   public.order_team_assignments
  WHERE  id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- 2. Ensure new team is not a QC team
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_new_team_id AND is_qc = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'QC teams cannot be assigned via calendar swap');
  END IF;

  -- 3. Check time conflict: only block when BOTH visits have time slots that actually overlap.
  --    If either visit has no time_slot, skip the conflict check —
  --    no-time visits are considered flexible and never block a timed assignment.
  SELECT COUNT(*) INTO v_time_conflict
  FROM   public.order_team_assignments
  WHERE  team_id        = p_new_team_id
    AND  id            <> p_assignment_id
    AND  scheduled_date = v_scheduled_date
    AND  v_time_slot IS NOT NULL
    AND  time_slot IS NOT NULL
    AND  time_slot::time <
         CASE WHEN v_duration ~ '^\d+$'
              THEN v_time_slot::time + (v_duration::int * interval '1 hour')
              ELSE v_time_slot::time + interval '2 hours'
         END
    AND (
         CASE WHEN duration ~ '^\d+$'
              THEN time_slot::time + (duration::int * interval '1 hour')
              ELSE time_slot::time + interval '2 hours'
         END
        ) > v_time_slot::time;

  IF v_time_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time conflict with existing visit');
  END IF;

  -- 4. Perform the swap
  UPDATE public.order_team_assignments
  SET    team_id = p_new_team_id
  WHERE  id      = p_assignment_id;

  -- 5. Write audit log
  SELECT COALESCE(raw_user_meta_data->>'full_name', email, 'unknown')
  INTO   v_performer
  FROM   auth.users
  WHERE  id = auth.uid();

  INSERT INTO public.activity_log
    (entity_type, entity_id, action, module, performer_name, new_data)
  VALUES
    ('order_team_assignment', p_assignment_id, 'team_swapped', 'calendar',
     v_performer,
     jsonb_build_object('new_team_id', p_new_team_id, 'order_id', v_order_id));

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_brand_variant_brand_text()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT name INTO NEW.brand FROM public.brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_service_pending_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_edit_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_team_active_schedule(p_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_schedule_id UUID;
BEGIN
  SELECT tsa.schedule_id INTO v_schedule_id
  FROM team_schedule_assignments tsa
  JOIN schedules s ON s.id = tsa.schedule_id
  WHERE tsa.team_id = p_team_id
    AND tsa.start_date <= CURRENT_DATE
    AND (tsa.end_date IS NULL OR tsa.end_date >= CURRENT_DATE)
    AND s.deleted_at IS NULL
  ORDER BY tsa.start_date DESC
  LIMIT 1;

  UPDATE teams SET schedule_id = v_schedule_id WHERE id = p_team_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tl_invoice_paid_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.tl_invoice_id, OLD.tl_invoice_id);
  v_paid       numeric;
  v_total      numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.tl_invoice_payments
    WHERE tl_invoice_id = v_invoice_id;

  SELECT total_amount INTO v_total
    FROM public.tl_invoices
    WHERE id = v_invoice_id;

  UPDATE public.tl_invoices
     SET paid_amount    = v_paid,
         payment_status = CASE
                            WHEN v_paid <= 0        THEN 'unpaid'
                            WHEN v_paid >= v_total  THEN 'paid'
                            ELSE 'partial'
                          END,
         updated_at     = now()
   WHERE id = v_invoice_id;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.toggle_workflow_step(p_step_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  UPDATE approval_workflow_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_alloc_refresh_stock_summary()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_company_assets_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_company_assets_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_consumption_attachments_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.attachments LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_consumption_attachments_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.attachments)
    EXCEPT
    SELECT unnest(COALESCE(NEW.attachments, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url,                 'customer_credit_docs', OLD.customer_id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url,   'customer_credit_docs', OLD.customer_id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customer_credit_docs', OLD.customer_id::text);
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_customer_credit_docs_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.cr_url IS DISTINCT FROM NEW.cr_url AND OLD.cr_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  IF OLD.establishment_id_url IS DISTINCT FROM NEW.establishment_id_url AND OLD.establishment_id_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  IF OLD.signed_credit_form_url IS DISTINCT FROM NEW.signed_credit_form_url AND OLD.signed_credit_form_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customer_credit_docs', OLD.customer_id::text);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_division_assets_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_division_assets_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_inventory_item_image_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_inventory_item_image_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.image_url IS DISTINCT FROM NEW.image_url AND OLD.image_url IS NOT NULL THEN
    PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_landed_cost_bill_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_landed_cost_bill_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.bill_path IS DISTINCT FROM NEW.bill_path AND OLD.bill_path IS NOT NULL THEN
    PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.photo_urls LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.photo_urls)
    EXCEPT
    SELECT unnest(COALESCE(NEW.photo_urls, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_fifo_refresh_stock_summary()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_landed_cost_block_void_after_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only care about transitions that turn voided_at ON from OFF.
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    IF OLD.applied_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot void landed cost % — it is already applied. Run revert_landed_cost first, then void.',
        OLD.lc_number
        USING ERRCODE = 'restrict_violation',
              HINT    = 'revert_landed_cost undoes the FIFO/COGS impact; after it succeeds applied_at is cleared and voiding is permitted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_po_line_items_incoming()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_incoming_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_purchase_orders_incoming()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_incoming_qty(pli.brand_variant_id)
    FROM po_line_items pli
    WHERE pli.po_id          = NEW.id
      AND pli.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_so_reserved_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_reserved_qty(sol.brand_variant_id)
    FROM sale_order_lines sol
    WHERE sol.sale_order_id   = NEW.id
      AND sol.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_sol_reserved_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_reserved_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_po_recompute_division_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders po
    SET division_ids = COALESCE(
      (SELECT array_agg(DISTINCT li.division_id)
         FROM public.po_line_items li
        WHERE li.po_id = v_po AND li.division_id IS NOT NULL),
      '{}'::uuid[])
    WHERE po.id = v_po;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.trg_recalc_ar_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    -- If invoice_id was re-pointed, recalc the old invoice too
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      IF OLD.invoice_id IS NOT NULL THEN
        PERFORM recalculate_ar_invoice_payment_status(OLD.invoice_id);
      END IF;
    END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM recalculate_ar_invoice_payment_status(v_invoice_id);
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_pending_service_change(p_request_id uuid, p_new_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can update this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  UPDATE service_edit_requests
  SET changes = p_new_changes, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_reserved_qty(p_bv_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE inventory_item_brand_variants
  SET reserved_qty = GREATEST(0, reserved_qty + p_delta),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tl_payment_batches_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workflow_step_conditions(p_step_id uuid, p_is_conditional boolean, p_condition_types text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  UPDATE approval_workflow_steps
  SET is_conditional  = p_is_conditional,
      condition_types = CASE
        WHEN p_is_conditional THEN COALESCE(p_condition_types, ARRAY[]::TEXT[])
        ELSE ARRAY[]::TEXT[]
      END
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workflow_step_role(p_step_id uuid, p_role_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_name TEXT;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501'; END IF;
  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  UPDATE approval_workflow_steps
  SET role_id    = p_role_id,
      step_label = v_role_name
  WHERE id = p_step_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_employee_services(p_employee_id uuid, p_service_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_package_with_services(p_package jsonb, p_services jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._auth_user_has_permission('master_data.services.manage') THEN RAISE EXCEPTION 'Not authorized to manage service packages' USING ERRCODE = '42501'; END IF;
  IF (p_package->>'id') IS NOT NULL THEN
    -- UPDATE existing package
    v_id := (p_package->>'id')::uuid;
    UPDATE subscription_packages SET
      name               = p_package->>'name',
      name_ar            = NULLIF(p_package->>'name_ar', ''),
      description        = NULLIF(p_package->>'description', ''),
      discount_percent   = (p_package->>'discount_percent')::numeric,
      initial_fee        = (p_package->>'initial_fee')::numeric,
      duration_months    = (p_package->>'duration_months')::int,
      priority_response  = p_package->>'priority_response',
      response_hours     = CASE
                             WHEN p_package->>'response_hours' IS NULL THEN NULL
                             ELSE (p_package->>'response_hours')::int
                           END,
      auto_renew_default = (p_package->>'auto_renew_default')::boolean,
      updated_at         = now()
    WHERE id = v_id;
  ELSE
    -- INSERT new package
    INSERT INTO subscription_packages (
      name, name_ar, description,
      discount_percent, initial_fee, duration_months,
      priority_response, response_hours, auto_renew_default,
      created_by_name
    ) VALUES (
      p_package->>'name',
      NULLIF(p_package->>'name_ar', ''),
      NULLIF(p_package->>'description', ''),
      (p_package->>'discount_percent')::numeric,
      (p_package->>'initial_fee')::numeric,
      (p_package->>'duration_months')::int,
      p_package->>'priority_response',
      CASE
        WHEN p_package->>'response_hours' IS NULL THEN NULL
        ELSE (p_package->>'response_hours')::int
      END,
      (p_package->>'auto_renew_default')::boolean,
      NULLIF(p_package->>'created_by_name', '')
    )
    RETURNING id INTO v_id;
  END IF;

  -- Atomically replace all services for this package
  DELETE FROM subscription_package_services WHERE package_id = v_id;

  INSERT INTO subscription_package_services (package_id, service_id, discount_override)
  SELECT
    v_id,
    (svc->>'service_id')::uuid,
    CASE
      WHEN svc->>'discount_override' IS NULL THEN NULL
      ELSE (svc->>'discount_override')::numeric
    END
  FROM jsonb_array_elements(p_services) AS svc;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_can_action_adjustment_step(p_profile_id uuid, p_step_role text, p_warehouse_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_responsible_persons
        WHERE  profile_id   = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
    )
    OR (
      p_step_role <> 'responsible_person'
      AND EXISTS (
        SELECT 1
        FROM   approval_workflow_steps was
        JOIN   user_custom_roles      ucr ON ucr.role_id = was.role_id
        WHERE  was.workflow    = 'stock_adj'
          AND  was.step_key    = p_step_role
          AND  was.archived_at IS NULL
          AND  ucr.profile_id  = p_profile_id
      )
    )
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_approval_role_in_scope(p_profile_id uuid, p_role_names text[], p_scope text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.name = ANY(p_role_names)
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at IS NULL
      AND  (ucr.approval_scopes IS NULL OR p_scope = ANY(ucr.approval_scopes))
  )
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.warranty_policies_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_service_change(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_edit_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  DELETE FROM service_edit_requests WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;
