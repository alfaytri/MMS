-- Capture country-of-origin onto supplier-bill lines (mirrors invoice Item 1b).
--
-- bill_line_items had no link to the product/variant (free-text `description`
-- copied from the PO line by rpc_create_purchase_bill). To surface origin on the
-- purchase-bill PDF we add a nullable brand_variant_id FK, populate it in the
-- (sole, SECURITY DEFINER) builder from the client payload line, and backfill
-- existing rows through the bill's parent PO. The PDF then resolves origin via
-- the shared fetchOriginsByBrandVariant helper. Metadata only — NO amount change.
--
-- Live-verified before writing (staging mwvblpgbgxipvrevkeff, 2026-08-09):
--  * bill_line_items cols today: id, bill_id, description, qty, unit_price, total,
--    match_status, match_note, created_at — no variant/origin reference.
--  * rpc_create_purchase_bill(jsonb) is the ONLY inserter (bill_line_items is
--    RPC-only after the P0b grant lockdown). It requires purchase_order_id, so
--    every bill is PO-derived → backfill is always resolvable.
--  * po_line_items has po_id (FK), item_name, brand_variant_id.
--  * The two creation dialogs build lines from po_line_items (carrying
--    brand_variant_id), so the payload can pass it through.
--
-- The CREATE OR REPLACE below is a byte-faithful copy of the live
-- pg_get_functiondef; the ONLY change is brand_variant_id added to the
-- bill_line_items INSERT column list + its VALUES.

-- 1. Column + FK (nullable — ad-hoc lines carry no origin). ON DELETE SET NULL:
--    never cascade-delete a financial line if the catalog variant is removed.
ALTER TABLE public.bill_line_items
  ADD COLUMN IF NOT EXISTS brand_variant_id uuid
    REFERENCES public.inventory_item_brand_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bill_line_items_brand_variant_id
  ON public.bill_line_items (brand_variant_id);

-- 2. Backfill through the parent PO, ONLY where the description maps to exactly
--    one PO line (skip ambiguous / unmatched — they keep NULL / no origin).
UPDATE public.bill_line_items bli
SET    brand_variant_id = pli.brand_variant_id
FROM   public.bills b,
       public.po_line_items pli
WHERE  b.id                = bli.bill_id
  AND  pli.po_id           = b.purchase_order_id
  AND  pli.item_name       = bli.description
  AND  bli.brand_variant_id IS NULL
  AND  pli.brand_variant_id IS NOT NULL
  AND  (
    SELECT count(*) FROM public.po_line_items p2
    WHERE  p2.po_id     = b.purchase_order_id
      AND  p2.item_name = bli.description
  ) = 1;

-- 3. Re-create the builder with brand_variant_id threaded into the line INSERT.
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
$function$;
