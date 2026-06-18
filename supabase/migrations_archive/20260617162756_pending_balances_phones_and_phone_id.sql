-- ============================================================================
-- Migration: Update get_customer_pending_balances to return all phones per
-- customer (not just primary) and include phone_id on each invoice row.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_customer_pending_balances()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(grouped))
  INTO result
  FROM (
    SELECT
      c.id                                        AS customer_id,
      c.name                                      AS customer_name,
      -- New: full list of phones (id + number + is_primary + label)
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at ASC
                 ),
                 '[]'::jsonb
               )
        FROM   customer_phones cp
        WHERE  cp.customer_id = c.id
      )                                           AS phones,
      i.division_id,
      d.name                                      AS division_name,
      SUM(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0))
                                                  AS total_pending,
      COUNT(i.id)                                 AS invoice_count,
      COUNT(i.id) FILTER (WHERE i.payment_status = 'overdue')
                                                  AS overdue_count,
      jsonb_agg(
        jsonb_build_object(
          'id',             i.id,
          'invoice_id',     i.invoice_id,
          -- New: phone_id so the UI can group invoices per phone
          'phone_id',       i.phone_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          -- Column is named `source` (enum invoice_source). Older RPC code
          -- referenced i.source_type which doesn't exist on this table; we
          -- alias as 'source_type' in the JSON so the existing TS hook
          -- contract is preserved.
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   invoices i
    JOIN   customers c  ON c.id = i.customer_id
    LEFT JOIN divisions d ON d.id = i.division_id
    WHERE  i.direction = 'ar'
      AND  i.status NOT IN ('void', 'cancelled')
      AND  i.payment_status NOT IN ('paid')
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
