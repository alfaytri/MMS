-- ============================================================
-- Drop 5 dead columns from so_invoices
--
-- Section 1.7 of docs/next-work-plan.md. customer_invoices is a
-- compat view over so_invoices; the real audit is against the
-- underlying table.
--
-- Dropped:
--   tax               always written as 0 by invoiceSync; sole
--                     reader is a "> 0" conditional so nothing
--                     ever rendered.
--   sale_delivery_id  no writer anywhere; the sale_delivery_id
--                     references in COGS code are on
--                     cogs_entries, not so_invoices.
--   updated_at        no trigger sets it, no reader.
--   manually_paid     mirrors bills.manually_paid — the
--                     Mark-as-Paid UI was removed by spec
--                     2026-07-22-so-invoice-parity, migration
--                     20260723120000 reset every row to false,
--                     and the current recalculate_ar_invoice_
--                     payment_status fn no longer honors it.
--   phone_id          no writer in app or DB; sole reader groups
--                     invoices by it (CustomerInvoiceDetailContent)
--                     but with no writer every invoice landed in
--                     the "Other" bucket, collapsing the feature
--                     to a flat list.
--
-- Also updates the compat view public.customer_invoices to drop
-- these columns from its column list, and rewrites the
-- get_customer_pending_balances RPC to stop emitting phone_id in
-- its jsonb output.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the compat view before altering the underlying table
--    (Postgres blocks column drops referenced by a view).
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.customer_invoices;

-- ------------------------------------------------------------
-- 2. Drop the 5 dead columns
-- ------------------------------------------------------------
ALTER TABLE public.so_invoices
  DROP COLUMN IF EXISTS tax,
  DROP COLUMN IF EXISTS sale_delivery_id,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS manually_paid,
  DROP COLUMN IF EXISTS phone_id;

-- ------------------------------------------------------------
-- 3. Recreate the compat view without the dropped columns
--    (kept for the few call sites still using it — the pending-
--    payments UI, older audit tooling).
-- ------------------------------------------------------------
CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, total_amount,
        paid_amount, agent_name, notes, qb_synced,
        created_at,
        sale_order_id,
        needs_refresh, payment_status, invoice_type,
        discount_amount, discount_label,
        division_id
   FROM public.so_invoices;

-- ------------------------------------------------------------
-- 4. Rewrite get_customer_pending_balances — drop phone_id from
--    the per-invoice jsonb payload. Everything else preserved
--    verbatim from 20260721140000.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_pending_balances()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
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
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at
                 ),
                 '[]'::jsonb)
        FROM public.customer_phones cp
        WHERE cp.customer_id = c.id
      )                                           AS phones,
      i.division_id                               AS division_id,
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
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status::text
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   so_invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  COALESCE(i.status::text, 'draft') NOT IN ('void', 'cancelled')
      AND  i.payment_status != 'paid'
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
