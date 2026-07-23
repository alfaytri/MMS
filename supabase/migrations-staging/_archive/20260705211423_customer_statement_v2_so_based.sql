-- Customer Statement v2 — SO-based (one row per Sale Order with Total/Paid/Outstanding).
-- Replaces the ledger-style rpc_customer_statement. Matches the mockup at
-- public/brand/customer-statement-preview.html.
--
-- Payment matching handles the three payment shapes:
--   1. source_type='sale_order' AND source_id=so.id           (pre-invoice)
--   2. source_type='invoice'    AND source_id=invoice.id      (post-invoice via triggers)
--   3. invoice_id=invoice.id                                   (legacy)
-- Where invoice.id = invoices.id WHERE sale_order_id=so.id AND direction='ar'.

CREATE OR REPLACE FUNCTION rpc_customer_statement_v2(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
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
  -- ── Customer info ─────────────────────────────────────────────
  SELECT c.name, c.phone, c.customer_type::text, cg.name
  INTO cust_name, cust_phone, cust_type, account_type
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = p_customer_id;

  IF cust_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  -- ── Orders ────────────────────────────────────────────────────
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
    LEFT JOIN invoices inv
           ON inv.sale_order_id = sos.id AND inv.direction = 'ar'
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

  -- ── Aggregate totals & open count ─────────────────────────────
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

  -- ── Build result ──────────────────────────────────────────────
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
$$;
