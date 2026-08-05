-- Money-Path Fix C1 + C2: atomic PO line replacement with reference guards.
--
-- Replaces the client-side .delete()/.insert() pattern in usePurchaseOrders
-- (useUpdatePO, useSubmitPoVersion / amend, useSavePoAsDraft) which:
--   (C1) swallowed the .delete() error when receival_items referenced a line
--        (no ON DELETE action on receival_items.po_line_item_id) — the delete
--        failed silently, the insert still ran, and PO lines drifted from
--        purchase_orders.subtotal for every received PO edited afterwards.
--   (C2) silently CASCADE-deleted every po_rfq_quote_items row via the
--        ON DELETE CASCADE FK on po_line_items — every supplier RFQ quote
--        was wiped on any PO line edit with no warning and no audit trail.
--
-- This RPC:
--   1. FOR UPDATE locks the existing po_line_items rows for the PO.
--   2. RAISES if any existing line is referenced by receival_items.
--   3. RAISES if any existing line is referenced by po_rfq_quote_items.
--   4. Only then DELETEs existing lines and INSERTs the new payload inside
--      the function's implicit transaction.
--
-- SECURITY INVOKER: relies on the caller's own RLS on po_line_items,
-- receival_items and po_rfq_quote_items — same access that the previous
-- client-side .delete()/.insert() calls required.

CREATE OR REPLACE FUNCTION public.rpc_replace_po_lines(
  p_po_id uuid,
  p_lines jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_blocked_receival int;
  v_blocked_rfq int;
BEGIN
  IF p_po_id IS NULL THEN
    RAISE EXCEPTION 'p_po_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

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
      brand_variant_id, free_qty, brand_id
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
      NULLIF(r->>'brand_id','')::uuid
    FROM jsonb_array_elements(p_lines) AS r;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_replace_po_lines(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_replace_po_lines(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_replace_po_lines(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_replace_po_lines(uuid, jsonb) IS
  'Atomic replacement of po_line_items for a PO with guards against silently breaking '
  'receival_items (C1) and po_rfq_quote_items (C2). Money-path review 2026-08-05.';
