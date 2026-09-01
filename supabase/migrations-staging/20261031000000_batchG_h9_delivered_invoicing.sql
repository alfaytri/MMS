-- 20261031000000_batchG_h9_delivered_invoicing.sql  (audit H9)
--
-- H9 (HIGH, product-decided): generate_invoice_from_so invoiced the ORDERED value
-- (so.total, line qty) even when nothing / only part had shipped — overstating AR
-- by the undelivered value. Per the owner's decision, AR must reflect what was
-- DELIVERED. sale_order_lines is tax-free (total = qty * unit_price), so delivered
-- value = SUM(delivered_qty * unit_price).
--
-- Changes (drift-proof in-place transforms on the live body):
--   1. declare v_delivered_subtotal / v_delivered_total
--   2. compute delivered subtotal/total (preserving any SO-level tax ratio) and
--      REFUSE to invoice when nothing has been delivered
--   3. payment_status compares paid vs delivered total
--   4. so_invoices.total_amount / subtotal store the delivered value
--   5. invoice_line_items use delivered_qty and delivered value (delivered lines only)
--
-- NOTE (workflow, not fixed here): the function still allows one invoice per SO, so
-- topping up a partially-invoiced SO after later deliveries needs a separate
-- multi-invoice-per-SO enhancement.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.generate_invoice_from_so(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'generate_invoice_from_so not found'; END IF;
  IF v_def ~ 'v_delivered_total' THEN
    RAISE NOTICE 'H9 already delivered-based — skip';
    RETURN;
  END IF;

  v_new := v_def;

  -- 1. declarations
  v_new := regexp_replace(v_new,
    '(v_payment_status   TEXT;)',
    E'\\1\n  v_delivered_subtotal NUMERIC;\n  v_delivered_total    NUMERIC;', 'g');

  -- 2. delivered computation + nothing-delivered guard (after the invoiceable check)
  v_new := regexp_replace(v_new,
    '(RAISE EXCEPTION ''so_not_invoiceable'';\s+END IF;)',
    E'\\1\n\n  SELECT COALESCE(SUM(sol.delivered_qty * sol.unit_price), 0)\n    INTO v_delivered_subtotal\n    FROM sale_order_lines sol\n   WHERE sol.sale_order_id = p_so_id;\n  v_delivered_total := round(v_delivered_subtotal * COALESCE(v_so.total_amount / NULLIF(v_so.subtotal, 0), 1), 2);\n  IF v_delivered_subtotal <= 0 THEN\n    RAISE EXCEPTION ''nothing_delivered'';\n  END IF;', 'g');

  -- 3. payment_status vs delivered total
  v_new := regexp_replace(v_new,
    '(v_paid_amount >= )v_so\.total_amount( THEN ''paid'')',
    '\1v_delivered_total\2', 'g');

  -- 4. store delivered value on the invoice
  v_new := regexp_replace(v_new,
    'v_so\.total_amount, v_so\.subtotal, v_paid_amount,',
    'v_delivered_total, v_delivered_subtotal, v_paid_amount,', 'g');

  -- 5. line items at delivered qty/value, delivered lines only
  v_new := regexp_replace(v_new,
    '(SELECT v_new_inv_id, sol\.item_name, )sol\.qty, sol\.unit_price, sol\.total(, sol\.brand_variant_id\s+FROM   sale_order_lines sol\s+WHERE  sol\.sale_order_id = p_so_id)',
    '\1sol.delivered_qty, sol.unit_price, round(sol.delivered_qty * sol.unit_price, 2)\2 AND sol.delivered_qty > 0', 'g');

  IF v_new !~ 'v_delivered_subtotal NUMERIC'
     OR v_new !~ 'nothing_delivered'
     OR v_new !~ 'v_paid_amount >= v_delivered_total'
     OR v_new !~ 'v_delivered_total, v_delivered_subtotal, v_paid_amount'
     OR v_new !~ 'sol\.delivered_qty, sol\.unit_price, round\(sol\.delivered_qty'
     OR v_new !~ 'sol\.sale_order_id = p_so_id AND sol\.delivered_qty > 0'
     OR v_new ~ 'v_so\.total_amount, v_so\.subtotal, v_paid_amount' THEN
    RAISE EXCEPTION 'H9: not all edits landed — aborting';
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'H9: generate_invoice_from_so now invoices delivered value';
END
$do$;

NOTIFY pgrst, 'reload schema';
