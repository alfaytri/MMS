-- Multi-division PO (Phase 1) — edit path + access-check correctness.
--
-- Two fixes:
--  1. Access checks for per-line division must test MEMBERSHIP (is the division
--     in the caller's division_ids / owner-accountant), NOT is_division_visible
--     — the latter narrows by the caller's ACTIVE division, so a multi-division
--     user viewing Maintenance would be wrongly blocked from adding a Trading
--     line they actually have access to. New helper: is_division_member(uuid).
--  2. rpc_replace_po_lines (the edit save path) dropped division_id on every
--     line — editing a PO wiped line divisions. It now carries division_id
--     (falling back to the PO header division for legacy/omitted values) and
--     enforces membership.

BEGIN;

-- ── Access helper: division membership, NOT narrowed by the active division ──
CREATE OR REPLACE FUNCTION public.is_division_member(row_division_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT
    row_division_id IS NULL
    OR (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR row_division_id = ANY(
      ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::uuid[]
    );
$fn$;

-- ── Create RPC: swap the per-line check to membership (else active-division
--    narrowing blocks legit cross-division lines). Body identical to
--    20260824000200 except the one is_division_visible → is_division_member. ──
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
$function$;

-- ── Edit save path: carry division_id (fallback to header) + enforce access.
--    Body is the live definition; adds v_hdr_div, the membership pre-check, and
--    division_id in the INSERT. ──
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
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
