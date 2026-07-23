-- Customer Statement: all transactions for a customer in a date range
-- Returns invoices (debit), payments (credit), credit notes (credit)
-- ordered by date. Running balance is calculated client-side.
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
  -- Invoices issued (debit — customer owes)
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
    AND i.doc_status NOT IN ('draft', 'rejected')
    AND i.payment_status != 'void'
    AND (p_date_from IS NULL OR i.issued_date >= p_date_from)
    AND (p_date_to IS NULL OR i.issued_date <= p_date_to)

  UNION ALL

  -- Payments received (credit — reduces balance)
  SELECT
    p.date AS txn_date,
    'payment' AS txn_type,
    p.payment_id AS reference,
    'Payment — ' || COALESCE(p.method::text, 'unknown') AS description,
    0::numeric AS debit,
    p.amount AS credit
  FROM payments p
  WHERE p.direction = 'incoming'
    AND p.customer_id = p_customer_id
    AND p.status = 'completed'
    AND p.deleted_at IS NULL
    AND (p_date_from IS NULL OR p.date >= p_date_from)
    AND (p_date_to IS NULL OR p.date <= p_date_to)

  UNION ALL

  -- Credit notes (credit — reduces balance)
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
    AND cn.status NOT IN ('draft')
    AND inv.customer_id = p_customer_id
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)

  ORDER BY txn_date, txn_type;
$$;
