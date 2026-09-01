-- 20260831002000_consumption_returns_p3b.sql
-- Consumption returns (Phase 3b). Spec: docs/plans/2026-08-29-consumption-
-- sales-returns-warranty-design.md §5.4. Requires 20260831001900 (enum values).
--
-- A consumption (custody consumption = a "sale" of cost) can now be returned,
-- mirroring sales returns and reversing the consumption COGS on every path.
-- Reuses so_po_returns / return_lines / return_line_inventory_dispositions and
-- the now-fixed disposition recorders (rpc_record_inventory_disposition /
-- rpc_send_damaged_for_repair) — those are already source-agnostic and resolve
-- the division via coalesce(return.division_id, …), so with the shared reversal
-- helper generalized below they reverse CONSUMPTION COGS unchanged.
--
-- Changes:
--   1. return_lines.consumption_line_id + relaxed provenance CHECK + trigger.
--   2. _reverse_sale_cogs_for_return — add a consumption branch (reverse
--      cogs_entries('consumption') by consumption_id → negative
--      cogs_entries('consumption_return')). Sale branch unchanged.
--   3. rpc_process_consumption_return_restock — good-line restock (mirror of
--      rpc_process_return_restock, operator-chosen warehouse + division sub).
--   4. _maybe_close_return — consumption branch (no customer/CN dimension;
--      close when good lines are restocked AND damaged dispositions are done).
--
-- Live bodies fetched via pg_get_functiondef before editing; enums confirmed via
-- pg_enum; cogs_entries.source_type is text (no enum to extend); RLS on
-- so_po_returns/return_lines is source-agnostic (no policy change needed).
BEGIN;

-- ─── 1. Provenance: consumption_line_id ───────────────────────────────────
ALTER TABLE public.return_lines
  ADD COLUMN IF NOT EXISTS consumption_line_id uuid REFERENCES public.consumption_lines(id);

ALTER TABLE public.return_lines DROP CONSTRAINT IF EXISTS return_lines_provenance_required;
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_provenance_required
  CHECK (
    receival_item_id IS NOT NULL
    OR sale_delivery_line_id IS NOT NULL
    OR consumption_line_id IS NOT NULL
  );

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

-- ─── 2. Shared COGS reversal — add consumption branch ─────────────────────
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
      ORDER  BY date ASC, unit_cost ASC, id ASC
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
      ORDER  BY date ASC, unit_cost ASC, id ASC
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

-- ─── 3. Good-line restock for consumption returns ─────────────────────────
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
             consumer_type, consumer_sub_container_id, consumer_customer_id, date
      FROM   public.cogs_entries
      WHERE  consumption_id = v_return.source_id AND brand_variant_id = v_line.brand_variant_id
        AND  source_type = 'consumption' AND qty > 0
      ORDER  BY date ASC, unit_cost ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;
      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      INSERT INTO public.fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id, sub_container_id
      ) VALUES (
        v_line.brand_variant_id, v_warehouse, current_date,
        v_qty_this_chunk, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_qty_this_chunk,
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
  END LOOP;

  UPDATE public.so_po_returns
    SET status = 'restocked', restocked_at = now(), updated_at = now()
    WHERE id = p_return_id;

  PERFORM public._maybe_close_return(p_return_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_process_consumption_return_restock(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_consumption_return_restock(uuid) TO authenticated;

-- ─── 4. Closer — consumption branch ───────────────────────────────────────
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

NOTIFY pgrst, 'reload schema';
COMMIT;
