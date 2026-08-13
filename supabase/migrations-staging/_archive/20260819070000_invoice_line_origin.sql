-- Capture country-of-origin onto invoice lines (Phase 2 — SO/quotation origin, Item 1b).
--
-- invoice_line_items had no link back to the product/variant — each line is a
-- free-text `description` copied from sale_order_lines.item_name by the two
-- server-side invoice builders. To surface origin on the invoice PDF we add a
-- nullable brand_variant_id FK, populate it in both builders (metadata only —
-- NO amount / price / total change), and backfill the existing rows through the
-- shared sale order. The PDF then resolves origin via the same
-- fetchOriginsByBrandVariant helper the delivery-note PDF uses.
--
-- Live-verified before writing (staging mwvblpgbgxipvrevkeff, 2026-08-09):
--  * invoice_line_items cols today: id, invoice_id, description, qty,
--    unit_price, total, team_name, created_at — no variant / origin reference.
--  * generate_invoice_from_so + rpc_sync_invoice_from_so are the ONLY inserters
--    (the old client-side path was removed; invoiceSync.ts just calls the RPC).
--    Each does INSERT ... SELECT sol.item_name, sol.qty, sol.unit_price,
--    sol.total FROM sale_order_lines sol WHERE sale_order_id = p_so_id.
--  * each RPC has exactly one (uuid) overload; both are SECURITY DEFINER.
--  * sale_order_lines.brand_variant_id -> inventory_item_brand_variants(id),
--    which carries country_id -> country_codes(name) (the origin chain).
--  * backfill match is 100% unambiguous on staging (8/8 lines -> one SO line).
--
-- The two CREATE OR REPLACE bodies below are byte-faithful copies of the live
-- pg_get_functiondef output; the ONLY change is brand_variant_id added to each
-- invoice_line_items INSERT column list + its SELECT list.

-- 1. Column + FK. Nullable: ad-hoc / non-SO invoice lines simply carry no
--    origin. ON DELETE SET NULL — never cascade-delete a financial line if the
--    catalog variant is later removed; origin just stops resolving.
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS brand_variant_id uuid
    REFERENCES public.inventory_item_brand_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_brand_variant_id
  ON public.invoice_line_items (brand_variant_id);

-- 2. Backfill existing lines through the shared sale order, ONLY where the
--    description maps to exactly one SO line (skip ambiguous / unmatched — they
--    keep NULL and simply show no origin).
UPDATE public.invoice_line_items il
SET    brand_variant_id = sol.brand_variant_id
FROM   public.so_invoices si,
       public.sale_order_lines sol
WHERE  si.id                = il.invoice_id
  AND  sol.sale_order_id    = si.sale_order_id
  AND  sol.item_name        = il.description
  AND  il.brand_variant_id  IS NULL
  AND  sol.brand_variant_id IS NOT NULL
  AND  (
    SELECT count(*) FROM public.sale_order_lines s2
    WHERE  s2.sale_order_id = si.sale_order_id
      AND  s2.item_name     = il.description
  ) = 1;

-- 3a. Explicit "Issue Invoice" builder (SO-XXXXX-I numbering).
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
BEGIN
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

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  direction   = 'incoming'
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
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
    v_so.total_amount, v_so.subtotal, v_paid_amount,
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
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$function$;

-- 3b. Auto-draft sync builder (INV-XXXXX numbering; rebuilds lines on refresh).
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
$function$;
