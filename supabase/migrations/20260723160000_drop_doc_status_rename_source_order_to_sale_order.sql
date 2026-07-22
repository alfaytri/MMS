-- SO Invoices cleanup:
--   1. Drop so_invoices.doc_status column entirely (feature retired — invoices
--      are internal documents, not sent through the app).
--   2. Drop the invoice_doc_status enum type (no other table uses it).
--   3. Rename invoice_source enum value 'order' → 'sale_order' for clarity
--      (matches the sale_orders table + the sales.* permission namespace).
--
-- Downstream:
--   • public.customer_invoices view depends on doc_status + source — drop and
--     recreate without doc_status (source column carries the renamed value).
--   • generate_invoice_from_so writes doc_status='draft' and source='order' —
--     rewritten below to drop the doc_status insert and use 'sale_order'.
--   • rpc_customer_statement, rpc_financial_dashboard, rpc_sales_aging_report
--     filter on `doc_status != 'rejected'` — regex-stripped from each body
--     (the concept is gone, so the filter is trivially satisfied by every row).
--
-- Postgres binds the customer_invoices view + all RPC OIDs by identity so the
-- ALTER TYPE ... RENAME VALUE step doesn't require rewriting anything that
-- READS the enum — Postgres updates the label everywhere transparently. Only
-- literals in RPC bodies that WRITE 'order' need updating.

BEGIN;

-- 1. Rename the enum value first. This propagates to every existing row
--    (source='order' becomes source='sale_order' automatically). Cheap +
--    atomic in Postgres — no full-table rewrite.
ALTER TYPE public.invoice_source RENAME VALUE 'order' TO 'sale_order';

-- 2. Strip `doc_status != 'rejected'` filter from any RPC body that has it.
--    Matches both `AND doc_status != 'rejected'` (inline / trailing) and the
--    less-common `WHERE doc_status != 'rejected' AND` (leading). Also strips
--    the standalone `doc_status != 'rejected'` if it's the only condition.
DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prokind = 'f'
      AND  pg_get_functiondef(p.oid) ~ 'doc_status'
  LOOP
    new_def := r.def;
    -- Inline / trailing: ` AND doc_status != 'rejected'`
    new_def := regexp_replace(new_def, '\s+AND\s+doc_status\s*!=\s*''rejected''', '', 'g');
    -- Leading: `WHERE doc_status != 'rejected' AND ` → `WHERE `
    new_def := regexp_replace(new_def, 'WHERE\s+doc_status\s*!=\s*''rejected''\s+AND\s+', 'WHERE ', 'g');
    -- Standalone: `WHERE doc_status != 'rejected'` → drop the WHERE
    new_def := regexp_replace(new_def, 'WHERE\s+doc_status\s*!=\s*''rejected''', '', 'g');

    IF new_def <> r.def THEN
      EXECUTE new_def;
      RAISE NOTICE 'Stripped doc_status filter from: %', r.proname;
    END IF;
  END LOOP;
END $$;

-- 3. Rewrite generate_invoice_from_so:
--    a) stops writing doc_status='draft'
--    b) uses 'sale_order' instead of 'order' as the source value
--    Everything else preserved from the Task 5 version.
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
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', v_payment_status::public.invoice_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
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

-- 4. Rebuild customer_invoices without doc_status. The Task 2 rebuild selected
--    doc_status explicitly; drop + recreate the view to remove it.
DROP VIEW IF EXISTS public.customer_invoices;

CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, notes, qb_synced,
        created_at, updated_at,
        sale_order_id, sale_delivery_id,
        needs_refresh, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid,
        phone_id, division_id
   FROM public.so_invoices;

-- 5. Drop the column now that no view / RPC references it.
ALTER TABLE public.so_invoices DROP COLUMN IF EXISTS doc_status;

-- 6. Drop the enum type — safe because no other column uses it (verified via
--    information_schema.columns before writing this migration).
DROP TYPE IF EXISTS public.invoice_doc_status;

COMMIT;
