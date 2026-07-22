-- Task 5 (SO/Invoice Parity) — new numbering scheme:
--   • SO number:      SO-YYYY-MM-NNN — 3-digit counter resets each month.
--   • Invoice number: <SO number>-I — one per SO (Task 4 enforces UNIQUE).
--
-- Mirror of the PO/Bill monthly rework (20260722200000).
--
-- This migration:
--   1. Creates next_so_number() with an advisory lock keyed by year+month.
--   2. Patches create_sale_order to call next_so_number() instead of the
--      inline `SO-NNNNN` generation. Uses pg_get_functiondef +
--      regexp_replace to preserve the rest of the (large) function body.
--   3. Rewrites generate_invoice_from_so:
--       a) invoice_id becomes <so_number>-I (not INV-NNNNN)
--       b) fixes the residual currency bug in the paid-so-far sum
--          (matches Task 1's fix: SUM(amount), not SUM(COALESCE(amount_qar, amount)),
--          and filters direction='incoming').
--
-- Historical SOs and invoices keep their old numbers until Task 6.

BEGIN;

-- ── 1. next_so_number() ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_so_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'SO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('so_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.sale_orders
  WHERE  so_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.next_so_number() TO authenticated;

-- ── 2. Patch create_sale_order — swap its inline `SO-NNNNN` generation ─────
--
-- Uses pg_get_functiondef + regexp_replace to modify only the two lines
-- that generate the SO number, preserving the ~350-line body otherwise.
-- Verifies exactly one replacement site exists first — refuses to run if
-- the body has already been changed or the pattern isn't found.

DO $$
DECLARE
  v_def      TEXT;
  v_new_def  TEXT;
  v_pattern  TEXT := 'SELECT COUNT\(\*\) \+ 1 INTO v_count FROM sale_orders;\s*\n\s*v_so_number := ''SO-'' \|\| LPAD\(v_count::text, 5, ''0''\);';
  v_replace  TEXT := 'v_so_number := public.next_so_number();';
  v_hits     INT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM   pg_proc
  WHERE  proname = 'create_sale_order'
    AND  pronamespace = 'public'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'create_sale_order not found';
  END IF;

  SELECT COUNT(*) INTO v_hits
  FROM   regexp_matches(v_def, v_pattern, 'g');

  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 match of the SO-number inline pattern in create_sale_order body; found %', v_hits;
  END IF;

  v_new_def := regexp_replace(v_def, v_pattern, v_replace);
  EXECUTE v_new_def;
  RAISE NOTICE 'create_sale_order patched: now calls next_so_number()';
END $$;

-- ── 3. Rewrite generate_invoice_from_so ────────────────────────────────────
--
-- Changes vs current body:
--   • Removes the v_inv_count declaration + the two lines that compute
--     'INV-NNNNN'. invoice_id now := v_so.so_number || '-I'.
--   • paid-so-far sum: SUM(amount) filtered by direction='incoming' (was
--     SUM(COALESCE(amount_qar, amount)) — same currency bug we fixed on
--     the trigger in Task 1).
--   • Rest of the function body preserved verbatim.

CREATE OR REPLACE FUNCTION public.generate_invoice_from_so(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    COALESCE(so.tax, 0)                 AS tax,
    so.total                            AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
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
    invoice_type, doc_status, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', 'draft', v_payment_status::public.invoice_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
    v_issued_date, v_due_date,
    'order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$$;

COMMIT;
