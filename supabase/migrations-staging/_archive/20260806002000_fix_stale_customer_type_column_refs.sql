-- Fix another latent post-column-rename bug. `customers.customer_type`
-- was dropped on 2026-07-24 (migration
-- 20260724170001_drop_customer_type_derive_from_credit_group.sql) and
-- replaced with the derived expression:
--   (CASE WHEN credit_group_id IS NULL THEN 'cash' ELSE 'credit' END)
--
-- But `generate_invoice_from_so` and `rpc_customer_statement_v2` still
-- read `c.customer_type` from customers. These paths were only exercised
-- when generating an invoice from a sale order or viewing a customer
-- statement — which surfaced the "column c.customer_type does not exist"
-- error today.
--
-- Bodies pulled from live pg_proc, only the column reads swapped to the
-- derived expression. Column aliases and record-field accesses stay as
-- they are.

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
    COALESCE(so.tax, 0)                 AS tax,
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
$function$

;


CREATE OR REPLACE FUNCTION public.rpc_customer_statement_v2(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result        jsonb;
  cust_name     text;
  cust_phone    text;
  cust_type     text;
  account_type  text;
  orders        jsonb;
  totals        jsonb;
  open_count    bigint;
BEGIN
  SELECT c.name, (CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END)::text, cg.name
  INTO cust_name, cust_type, account_type
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = p_customer_id;

  IF cust_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  -- Phone: prefer the primary row, else the first available row.
  SELECT phone INTO cust_phone
  FROM customer_phones
  WHERE customer_id = p_customer_id
  ORDER BY is_primary DESC NULLS LAST, created_at ASC
  LIMIT 1;

  WITH sos AS (
    SELECT so.id, so.so_number, so.created_at, so.status, so.total
    FROM sale_orders so
    WHERE so.customer_id = p_customer_id
      AND so.status != 'cancelled'
      AND so.deleted_at IS NULL
  ),
  so_inv AS (
    SELECT sos.id AS so_id, inv.id AS invoice_id
    FROM sos
    LEFT JOIN so_invoices inv
           ON inv.sale_order_id = sos.id
  ),
  so_paid AS (
    SELECT si.so_id,
           COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
    FROM so_inv si
    LEFT JOIN payments p
           ON p.deleted_at IS NULL
          AND (
                (p.source_type = 'sale_order' AND p.source_id = si.so_id)
             OR (si.invoice_id IS NOT NULL
                 AND p.source_type = 'invoice'
                 AND p.source_id = si.invoice_id)
             OR (si.invoice_id IS NOT NULL AND p.invoice_id = si.invoice_id)
              )
    GROUP BY si.so_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO orders
  FROM (
    SELECT sos.id,
           sos.so_number,
           sos.created_at,
           sos.status::text AS status,
           sos.total::numeric AS total,
           COALESCE(sp.paid, 0)::numeric AS paid,
           GREATEST(0, sos.total - COALESCE(sp.paid, 0))::numeric AS outstanding
    FROM sos
    LEFT JOIN so_paid sp ON sp.so_id = sos.id
  ) t;

  SELECT jsonb_build_object(
           'total_orders_value', COALESCE(SUM((o->>'total')::numeric), 0),
           'total_paid',         COALESCE(SUM((o->>'paid')::numeric), 0),
           'total_outstanding',  COALESCE(SUM((o->>'outstanding')::numeric), 0)
         )
  INTO totals
  FROM jsonb_array_elements(orders) o;

  SELECT COALESCE(COUNT(*), 0)
  INTO open_count
  FROM jsonb_array_elements(orders) o
  WHERE (o->>'outstanding')::numeric > 0;

  result := jsonb_build_object(
    'customer', jsonb_build_object(
      'name',         cust_name,
      'phone',        cust_phone,
      'account_type', COALESCE(account_type, INITCAP(cust_type), 'Cash')
    ),
    'orders',            orders,
    'totals',            COALESCE(totals, jsonb_build_object(
                            'total_orders_value', 0,
                            'total_paid',         0,
                            'total_outstanding',  0)),
    'open_orders_count', open_count
  );

  RETURN result;
END;
$function$

;
