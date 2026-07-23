-- Purchase Aging Report: groups outstanding bills (invoices where direction='ap') by supplier
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
    AND i.payment_status NOT IN ('paid')
    AND i.doc_status NOT IN ('draft', 'rejected')
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;

-- Sales Aging Report: groups outstanding invoices (direction='ar') by customer
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
    AND i.payment_status NOT IN ('paid')
    AND i.doc_status NOT IN ('draft', 'rejected')
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$$;

-- Financial Dashboard: receivables, payables, overdue counts, monthly trend, top overdue
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
  -- Receivables (AR invoices)
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM invoices
  WHERE direction = 'ar'
    AND payment_status NOT IN ('paid')
    AND doc_status NOT IN ('draft', 'rejected')
    AND total_amount - paid_amount > 0;

  -- Payables (AP bills)
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM invoices
  WHERE direction = 'ap'
    AND payment_status NOT IN ('paid')
    AND doc_status NOT IN ('draft', 'rejected')
    AND total_amount - paid_amount > 0;

  -- Monthly trend (last 6 months): sales invoiced vs purchase billed
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
          AND doc_status NOT IN ('draft', 'rejected')
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE direction = 'ap'
          AND DATE_TRUNC('month', issued_date) = m.month
          AND doc_status NOT IN ('draft', 'rejected')
      ), 0) AS billed
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  -- Top 5 overdue customers
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
      AND i.payment_status NOT IN ('paid')
      AND i.doc_status NOT IN ('draft', 'rejected')
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  -- Top 5 overdue suppliers
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
      AND i.payment_status NOT IN ('paid')
      AND i.doc_status NOT IN ('draft', 'rejected')
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
