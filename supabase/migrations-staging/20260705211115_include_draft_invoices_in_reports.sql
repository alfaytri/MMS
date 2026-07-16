-- Include draft invoices in statement + aging RPCs.
-- Reason: invoices are created as doc_status='draft' by default and only
-- leave that state when a user clicks "Send Invoice". In this codebase's
-- current usage most real invoices sit as drafts forever, so excluding
-- them made the reports show QAR 0 for customers with real charges.

-- ── Customer Statement ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_customer_statement(
  p_customer_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  txn_date   date,
  txn_type   text,
  reference  text,
  description text,
  debit      numeric,
  credit     numeric
)
LANGUAGE sql STABLE
AS $$
  -- Invoices issued (debit)
  SELECT
    i.issued_date AS txn_date,
    'invoice' AS txn_type,
    i.invoice_id AS reference,
    CASE
      WHEN i.due_date IS NOT NULL THEN 'Invoice — due ' || TO_CHAR(i.due_date, 'DD Mon YYYY')
      ELSE 'Invoice'
    END AS description,
    i.total_amount AS debit,
    0::numeric AS credit
  FROM invoices i
  WHERE i.direction = 'ar'
    AND i.customer_id = p_customer_id
    AND i.doc_status != 'rejected'
    AND (p_date_from IS NULL OR i.issued_date >= p_date_from)
    AND (p_date_to IS NULL OR i.issued_date <= p_date_to)

  UNION ALL

  -- Payments received (credit)
  SELECT
    p.date AS txn_date,
    'payment' AS txn_type,
    p.payment_id AS reference,
    'Payment — ' || COALESCE(p.method::text, 'unknown')
      || CASE WHEN p.reference IS NOT NULL THEN ' · ' || p.reference ELSE '' END AS description,
    0::numeric AS debit,
    p.amount AS credit
  FROM payments p
  LEFT JOIN sale_orders so ON so.id = p.source_id AND p.source_type = 'sale_order'
  LEFT JOIN invoices inv ON inv.id = p.invoice_id
  WHERE p.direction = 'incoming'
    AND p.deleted_at IS NULL
    AND p.status IN ('completed', 'pending', 'processing')
    AND COALESCE(p.customer_id, so.customer_id, inv.customer_id) = p_customer_id
    AND (p_date_from IS NULL OR p.date >= p_date_from)
    AND (p_date_to IS NULL OR p.date <= p_date_to)

  UNION ALL

  -- Credit notes (credit)
  SELECT
    cn.created_at::date AS txn_date,
    'credit_note' AS txn_type,
    cn.credit_note_id AS reference,
    'Credit Note — ' || COALESCE(cn.reason, cn.type) AS description,
    0::numeric AS debit,
    cn.total_amount AS credit
  FROM credit_notes cn
  JOIN invoices inv ON inv.id = cn.invoice_id
  WHERE cn.note_type = 'credit'
    AND cn.status != 'draft'
    AND inv.customer_id = p_customer_id
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)

  ORDER BY txn_date, txn_type;
$$;

-- ── Purchase Aging ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_purchase_aging_report()
RETURNS TABLE (
  supplier_id       uuid,
  supplier_name     text,
  current_amt       numeric,
  days_1_30         numeric,
  days_31_60        numeric,
  days_61_90        numeric,
  days_over_90      numeric,
  total_outstanding numeric,
  bill_count        bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM invoices i
  JOIN suppliers s ON s.id = i.supplier_id
  WHERE i.direction = 'ap'
    AND i.payment_status != 'paid'
    AND i.doc_status != 'rejected'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;

-- ── Sales Aging ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_sales_aging_report()
RETURNS TABLE (
  customer_id       uuid,
  customer_name     text,
  current_amt       numeric,
  days_1_30         numeric,
  days_31_60        numeric,
  days_61_90        numeric,
  days_over_90      numeric,
  total_outstanding numeric,
  invoice_count     bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS invoice_count
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.direction = 'ar'
    AND i.payment_status != 'paid'
    AND i.doc_status != 'rejected'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$$;

-- ── Financial Dashboard ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_financial_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  receivables_total numeric;
  receivables_overdue numeric;
  receivables_overdue_count bigint;
  payables_total numeric;
  payables_overdue numeric;
  payables_overdue_count bigint;
  monthly_trend jsonb;
  top_overdue_customers jsonb;
  top_overdue_suppliers jsonb;
BEGIN
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM invoices
  WHERE direction = 'ar'
    AND payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM invoices
  WHERE direction = 'ap'
    AND payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE direction = 'ar'
          AND DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE direction = 'ap'
          AND DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS billed
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_customers
  FROM (
    SELECT
      c.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      MIN(i.due_date) AS oldest_due
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.direction = 'ar'
      AND i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.doc_status != 'rejected'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      MIN(i.due_date) AS oldest_due
    FROM invoices i
    JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.direction = 'ap'
      AND i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.doc_status != 'rejected'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY s.id, s.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'receivables', jsonb_build_object('total', receivables_total, 'overdue', receivables_overdue, 'overdue_count', receivables_overdue_count),
    'payables', jsonb_build_object('total', payables_total, 'overdue', payables_overdue, 'overdue_count', payables_overdue_count),
    'monthly_trend', monthly_trend,
    'top_overdue_customers', top_overdue_customers,
    'top_overdue_suppliers', top_overdue_suppliers
  );

  RETURN result;
END;
$$;
