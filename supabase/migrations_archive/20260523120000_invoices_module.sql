-- supabase/migrations/20260523120000_invoices_module.sql

-- ── 1. Add qb_synced columns ────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS qb_synced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS qb_synced BOOLEAN NOT NULL DEFAULT false;

-- ── 2. mark_overdue_invoices RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET    payment_status = 'overdue'
  WHERE  direction = 'ar'
    AND  payment_status NOT IN ('paid')
    AND  status NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;

-- ── 3. pg_cron job — daily at midnight ──────────────────────────────────
-- NOTE: pg_cron is not enabled on this Supabase project.
-- Uncomment the lines below once pg_cron is enabled via the Supabase dashboard.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule(
--   'cron_mark_overdue_invoices',
--   '0 0 * * *',
--   $$SELECT mark_overdue_invoices()$$
-- );

-- ── 4. get_customer_pending_balances RPC ────────────────────────────────
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
      (
        SELECT cp.phone
        FROM   customer_phones cp
        WHERE  cp.customer_id = c.id
          AND  cp.is_primary = true
        LIMIT  1
      )                                           AS phone,
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
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source_type,
          'source_id',      i.source_id,
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

-- ── 5. Aggregate RPCs for page-level metrics ───────────────────────────
-- Invoice summary (status counts + total outstanding) — independent of pagination
CREATE OR REPLACE FUNCTION get_invoice_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(payment_status, cnt)
      FROM (
        SELECT payment_status, COUNT(*)::int AS cnt
        FROM   invoices
        WHERE  direction = 'ar'
          AND  status NOT IN ('void', 'cancelled')
        GROUP BY payment_status
      ) sc
    ),
    'outstanding', (
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      FROM   invoices
      WHERE  direction = 'ar'
        AND  status NOT IN ('void', 'cancelled')
        AND  payment_status != 'paid'
    )
  );
$$;

-- Payment summary (status counts + total collected + method totals) — independent of pagination
CREATE OR REPLACE FUNCTION get_payment_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(COALESCE(status, 'pending'), cnt)
      FROM (
        SELECT status, COUNT(*)::int AS cnt
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL
        GROUP BY status
      ) sc
    ),
    'collected', (
      SELECT COALESCE(SUM(amount), 0)
      FROM   payments
      WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
    ),
    'method_totals', (
      SELECT COALESCE(jsonb_object_agg(method, total), '{}'::jsonb)
      FROM (
        SELECT method, SUM(amount) AS total
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
        GROUP BY method
      ) mt
    )
  );
$$;

-- ── 6. RBAC: restrict void updates to accounting/admin ──────────────────
-- Drop the overly broad existing FOR-ALL policy
DROP POLICY IF EXISTS "Internal users can manage invoices" ON invoices;

-- Also drop in case this migration is being re-applied after a partial run
DROP POLICY IF EXISTS "Authenticated can update invoices (non-void)" ON invoices;
DROP POLICY IF EXISTS "Accounting/admin can void invoices" ON invoices;

-- Read / select: all authenticated users
CREATE POLICY "Authenticated can select invoices"
  ON invoices FOR SELECT TO authenticated
  USING (true);

-- Insert: all authenticated users
CREATE POLICY "Authenticated can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (true);

-- General updates allowed for all authenticated (doc_status, etc.) — excludes void
CREATE POLICY "Authenticated can update invoices (non-void)"
  ON invoices FOR UPDATE TO authenticated
  USING (status IS DISTINCT FROM 'void')
  WITH CHECK (status IS DISTINCT FROM 'void');

-- Void-specific policy: only users with Admin role (is_system) or 'invoices.edit' permission
CREATE POLICY "Accounting/admin can void invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    status = 'void'
    AND EXISTS (
      SELECT 1
      FROM   profiles p
      JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN   custom_roles cr       ON cr.id           = ucr.role_id
      WHERE  p.auth_user_id = (SELECT auth.uid())
        AND  cr.deleted_at IS NULL
        AND  (cr.is_system = true OR 'invoices.edit' = ANY(cr.permissions))
    )
  );

-- Delete: all authenticated users (soft-delete via status change, but keep policy)
CREATE POLICY "Authenticated can delete invoices"
  ON invoices FOR DELETE TO authenticated
  USING (true);

-- RBAC: restrict credit note inserts to accounting/admin
DROP POLICY IF EXISTS "Internal can insert credit_notes" ON credit_notes;
DROP POLICY IF EXISTS "Accounting/admin can insert credit_notes" ON credit_notes;

CREATE POLICY "Accounting/admin can insert credit_notes"
  ON credit_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   profiles p
      JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN   custom_roles cr       ON cr.id           = ucr.role_id
      WHERE  p.auth_user_id = (SELECT auth.uid())
        AND  cr.deleted_at IS NULL
        AND  (cr.is_system = true OR 'invoices.edit' = ANY(cr.permissions))
    )
  );

-- ── 7. Seed reason_lists for void/refund ────────────────────────────────
INSERT INTO reason_lists (category, label, sort_order, active)
VALUES
  ('invoice_cancel', 'Duplicate Invoice',         10, true),
  ('invoice_cancel', 'Incorrect Amount',          20, true),
  ('invoice_cancel', 'Customer Dispute',          30, true),
  ('invoice_cancel', 'Order Cancelled',           40, true),
  ('invoice_cancel', 'Other',                     50, true),
  ('refund',         'Defective Product/Service', 10, true),
  ('refund',         'Customer Dissatisfaction',  20, true),
  ('refund',         'Overcharge',                30, true),
  ('refund',         'Order Cancelled',           40, true),
  ('refund',         'Other',                     50, true)
ON CONFLICT DO NOTHING;

-- ── 8. Indexes for performance ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_qb_synced     ON invoices(qb_synced) WHERE qb_synced = false;
CREATE INDEX IF NOT EXISTS idx_payments_qb_synced     ON payments(qb_synced) WHERE qb_synced = false;
CREATE INDEX IF NOT EXISTS idx_invoices_ar_status      ON invoices(direction, status, payment_status) WHERE direction = 'ar';
CREATE INDEX IF NOT EXISTS idx_payments_incoming       ON payments(direction, deleted_at) WHERE direction = 'incoming';
