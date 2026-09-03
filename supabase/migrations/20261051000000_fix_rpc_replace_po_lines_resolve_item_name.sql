-- Fix: rpc_replace_po_lines persisted a blank item_name when the edit payload
-- carried an empty name, even though the line had a valid brand_variant_id.
--
-- rpc_create_purchase_order already resolves a blank name from the variant
-- (inventory_items.name_en, else 'Item'); the edit/amend save path did NOT — it
-- inserted (r->>'item_name')::text raw. So a PO amended via useSubmitPoVersion
-- (which, unlike useUpdatePO / useSavePoAsDraft, does not client-side resolve
-- names) could store item_name = ''. That row then renders with a blank name on
-- the PO approval page, the PO PDF, and every surface that reads the
-- denormalized item_name column.
--
-- Symptom found on prod: PO-2026-08-005, line sku WIT-JUM-002 (variant "Jumbo"),
-- item_name = ''. One row app-wide.
--
-- This makes the edit path authoritative and consistent with the create path:
-- item_name := COALESCE(NULLIF(TRIM(payload name),''), variant name_en, 'Item').
-- Body is otherwise byte-for-byte the live definition (guards, division access,
-- locking unchanged).

BEGIN;

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
      -- Resolve a blank name from the variant (mirrors rpc_create_purchase_order),
      -- so the edit/amend path can never persist an empty item_name.
      COALESCE(
        NULLIF(TRIM(r->>'item_name'), ''),
        (SELECT ii.name_en
           FROM inventory_item_brand_variants biv
           JOIN inventory_items ii ON ii.id = biv.item_id
          WHERE biv.id = NULLIF(r->>'brand_variant_id','')::uuid),
        'Item'
      ),
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

-- ── Heal existing data ──────────────────────────────────────────────────────
-- Backfill any line that was already persisted with a blank item_name but has a
-- resolvable variant. Idempotent (the WHERE stops matching once healed) and
-- environment-agnostic (a no-op where there are no blanks). On prod this fixes
-- PO-2026-08-005's WIT-JUM-002 line → "Jumbo".
UPDATE public.po_line_items pli
SET    item_name = ii.name_en
FROM   public.inventory_item_brand_variants biv
JOIN   public.inventory_items ii ON ii.id = biv.item_id
WHERE  pli.brand_variant_id = biv.id
  AND  btrim(coalesce(pli.item_name, '')) = ''
  AND  btrim(coalesce(ii.name_en, '')) <> '';

COMMIT;

NOTIFY pgrst, 'reload schema';
