-- Six-Domains fixes bundled for consumption workflow:
--   C4  rpc_cancel_consumption never restored inventory_item_brand_variants.stock_level
--       (deduct_fifo_layers decremented it on post; only FIFO layers were restored).
--   H12 rpc_decide_consumption_edit lets the requester approve their own
--       cancellation request → self-approval bypass.
--   H13 generate_consumption_number uses COUNT(*) → concurrent inserts race
--       to the same CE-number, second INSERT fails on the UNIQUE constraint.

-- ── H13. Sequence-based consumption number ──────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.consumption_entry_seq
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Prime the sequence past the highest existing CE-number so we don't collide.
DO $$
DECLARE
  v_max_ord int;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(ce_number FROM 'CE-(\d+)') AS int)),
    0
  ) INTO v_max_ord
  FROM public.consumption_entries
  WHERE ce_number ~ '^CE-\d+$';

  IF v_max_ord > 0 THEN
    PERFORM setval('public.consumption_entry_seq', v_max_ord, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_consumption_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CE-' || lpad(nextval('public.consumption_entry_seq')::text, 5, '0');
$$;

COMMENT ON FUNCTION public.generate_consumption_number() IS
'Generates the next CE-##### number via consumption_entry_seq. Race-safe
under concurrent inserts (previous COUNT(*)-based impl was not).';

-- ── C4. cancel_consumption restores stock_level ──────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_cancel_consumption(
  p_consumption_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ce                RECORD;
  v_cogs              RECORD;
  v_sub_container_id  uuid;
  v_uid               uuid := public._current_user_data_id();
  v_touched_variants  uuid[] := '{}';
  v_variant           uuid;
BEGIN
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
    WHERE  consumption_id = p_consumption_id
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

-- ── H12. decide_consumption_edit blocks self-approval ───────────────────

CREATE OR REPLACE FUNCTION public.rpc_decide_consumption_edit(
  p_request_id uuid,
  p_decision   text,
  p_comment    text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
$function$;

NOTIFY pgrst, 'reload schema';
