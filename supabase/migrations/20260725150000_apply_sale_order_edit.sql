-- apply_sale_order_edit: SO edit path that re-runs credit + margin approval
-- checks, mirroring how POs work today. Replaces sale_order_lines wholesale,
-- rebalances stock reservations, and either keeps the SO confirmed or flips
-- it back to pending_approval + builds a fresh approval chain.
--
-- Editable statuses: quotation, confirmed, pending_approval.
--   quotation        → stays quotation (edits before confirmation are free).
--   confirmed        → stays confirmed if no credit/margin issue; else flips.
--   pending_approval → recomputes; supersedes any existing pending chain.
-- Delivered/invoiced/closed/cancelled SOs are rejected — the user must
-- cancel + create new for those.
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_sale_order_edit(
  p_so_id             uuid,
  p_line_items        jsonb,
  p_discount_amount   numeric DEFAULT 0,
  p_discount_label    text    DEFAULT NULL,
  p_discount_type     text    DEFAULT 'fixed'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.apply_sale_order_edit(uuid, jsonb, numeric, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
