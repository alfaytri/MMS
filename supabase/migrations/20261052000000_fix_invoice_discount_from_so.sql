-- Fix: SO discount was dropped when the invoice was built from the SO.
--
-- rpc_sync_invoice_from_so set  total_amount = subtotal = SUM(lines)  and never
-- touched discount_amount → the invoice carried a 0 discount AND an un-discounted
-- (inflated) total. generate_invoice_from_so scaled the delivered total by the
-- SO's total/subtotal ratio (so its total was discounted) but likewise never
-- recorded discount_amount → the PDF showed "Discount 0.00" with subtotal-total
-- mismatch. Either way the sales-invoice PDF (which reads so_invoices.discount_amount
-- + total_amount) showed no discount, and rpc_sync also over-stated the amount due.
--
-- Symptom on prod: INV-00012 (SO-2026-09-004, discount 1.84) had total 6871.84
-- (= subtotal) and discount 0, so a customer who paid the correct 6870.00 shows as
-- partially_paid with a phantom 1.84 balance.
--
-- Both builders now record discount_amount and a consistent total
-- (total = subtotal - discount). Bodies are otherwise the live definitions.

BEGIN;

-- ── Builder 1: rpc_sync_invoice_from_so (confirm/auto-sync path) ─────────────
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
  v_discount          numeric;
  v_needs_refresh     boolean;
  v_new_inv_id        uuid;
  v_new_inv_display   text;
  v_last_num          int;
  v_invoice_type      text;
BEGIN
  SELECT so.id, so.so_number, so.status, so.customer_id, so.division_id,
         COALESCE(so.discount_amount_resolved, 0) AS discount,
         so.discount_label                        AS discount_label,
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

  -- Clamp the SO discount into [0, subtotal].
  v_discount := LEAST(GREATEST(v_so.discount, 0), v_total);

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

    DELETE FROM invoice_line_items WHERE invoice_id = v_invoice.id;

    INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
    SELECT v_invoice.id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
      FROM sale_order_lines sol
     WHERE sol.sale_order_id = p_so_id;

    UPDATE so_invoices
       SET total_amount    = v_total - v_discount,
           subtotal        = v_total,
           discount_amount = v_discount,
           discount_label  = v_so.discount_label,
           needs_refresh   = v_needs_refresh
     WHERE id = v_invoice.id;

    PERFORM public.rpc_seed_payment_plan_from_so(v_invoice.id, p_so_id);

    RETURN jsonb_build_object('action', 'updated', 'invoice_id', v_invoice.id);
  END IF;

  IF v_so.status <> 'confirmed' THEN
    RETURN jsonb_build_object('action', 'noop', 'reason', 'so_not_confirmed');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inv_serial'));

  SELECT COALESCE(MAX((substring(invoice_id from 5))::int), 0)
    INTO v_last_num
    FROM so_invoices
   WHERE invoice_id ILIKE 'INV-%';
  v_new_inv_display := 'INV-' || LPAD((v_last_num + 1)::text, 5, '0');

  v_invoice_type := v_so.customer_type;

  INSERT INTO so_invoices (
    invoice_id, customer_id, division_id, sale_order_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, discount_amount, discount_label,
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
    v_total - v_discount, v_total, v_discount, v_so.discount_label,
    CURRENT_DATE,
    CASE v_invoice_type WHEN 'cash' THEN CURRENT_DATE ELSE CURRENT_DATE + 30 END,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id INTO v_new_inv_id;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total, brand_variant_id)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total, sol.brand_variant_id
    FROM sale_order_lines sol
   WHERE sol.sale_order_id = p_so_id;

  PERFORM public.rpc_seed_payment_plan_from_so(v_new_inv_id, p_so_id);

  RETURN jsonb_build_object(
    'action',           'created',
    'invoice_id',       v_new_inv_id,
    'invoice_display',  v_new_inv_display
  );
END;
$function$;

-- ── Builder 2: generate_invoice_from_so (delivered-qty invoice path) ─────────
-- Total was already discounted (delivered_subtotal × SO total/subtotal ratio);
-- only discount_amount was missing → record it so the PDF math is consistent.
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

  IF EXISTS (SELECT 1 FROM so_invoices WHERE sale_order_id = p_so_id) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.division_id,
    so.subtotal,
    so.total                            AS total_amount,
    so.discount_label                   AS discount_label,
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
  v_due_date     := CASE v_invoice_type WHEN 'cash' THEN CURRENT_DATE ELSE CURRENT_DATE + 30 END;

  INSERT INTO so_invoices (
    invoice_id, customer_id, sale_order_id,
    division_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, discount_amount, discount_label, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', v_payment_status::public.invoice_payment_status, false,
    v_delivered_total, v_delivered_subtotal, (v_delivered_subtotal - v_delivered_total), v_so.discount_label, v_paid_amount,
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

-- ── Heal existing data ──────────────────────────────────────────────────────
-- Fix invoices that dropped the SO discount (discount_amount = 0 while the SO
-- has one). Two shapes:
--   (a) total == subtotal (rpc_sync bug): apply the discount, lower the total,
--       and recompute payment_status from paid_amount vs the corrected total.
--   (b) total < subtotal already (generate bug): total is right, just record
--       the implied discount; payment_status unchanged.
-- Idempotent (stops matching once discount_amount <> 0). Nulls pdf_url so the
-- next view regenerates the PDF with the discount line. Runs as the migration
-- role, which bypasses the authenticated-only guard_so_invoice_amounts trigger.

-- (a) rpc_sync-shaped: total was not discounted.
UPDATE so_invoices i
SET total_amount    = round(i.subtotal - so.discount_amount_resolved, 2),
    discount_amount = so.discount_amount_resolved,
    discount_label  = so.discount_label,
    payment_status  = (CASE
        WHEN i.paid_amount >= round(i.subtotal - so.discount_amount_resolved, 2) THEN 'paid'
        WHEN i.paid_amount > 0 THEN 'partially_paid'
        ELSE 'unpaid'
      END)::public.invoice_payment_status,
    pdf_url = NULL
FROM sale_orders so
WHERE so.id = i.sale_order_id
  AND COALESCE(so.discount_amount_resolved, 0) > 0
  AND i.discount_amount = 0
  AND round(i.subtotal - i.total_amount, 2) = 0;

-- (b) generate-shaped: total already discounted, discount_amount not recorded.
UPDATE so_invoices i
SET discount_amount = round(i.subtotal - i.total_amount, 2),
    discount_label  = so.discount_label,
    pdf_url = NULL
FROM sale_orders so
WHERE so.id = i.sale_order_id
  AND COALESCE(so.discount_amount_resolved, 0) > 0
  AND i.discount_amount = 0
  AND round(i.subtotal - i.total_amount, 2) > 0;

COMMIT;

NOTIFY pgrst, 'reload schema';
