-- ============================================================
-- Bills table cleanup — drop 5 unused columns
--
-- Section 1.4 of docs/next-work-plan.md. All 5 columns were carried
-- over from the legacy `invoices` table during the July 21 split.
--
--   bill_type       — always hardcoded 'credit' by useSupplierBills;
--                     no reader; AP bills are always a payable.
--   source          — always hardcoded 'order'; the bill_source enum
--                     has only that one value.
--   source_id       — writer sets it to purchase_order_id; every
--                     reader uses purchase_order_id directly.
--   status          — populated only by the July 21 backfill; no
--                     app writer/reader; superseded by doc_status +
--                     payment_status.
--   manually_paid   — override hatch for the payment-status auto-
--                     recompute trigger; the "Mark as Paid" UI was
--                     removed by spec 2026-07-22 and every row was
--                     reset to false by migration 20260722180000.
--                     No new writes possible; column is dormant.
--
-- Also rewrites the two functions that still referenced manually_paid:
--   bill_recompute_paid_fn(uuid)     — trigger-side recompute
--   allocate_payment_to_bill(uuid,uuid,numeric)
-- Both now unconditionally set payment_status to the computed value.
-- Same opportunity fixes the CASE-type-mismatch that would have
-- surfaced in allocate_payment_to_bill after Pass 1 retyped
-- bills.payment_status to invoice_payment_status enum (the sibling
-- hotfix 20260726005000 fixed only bill_recompute_paid_fn).
--
-- After the ALTER, the unused `bill_source` enum is dropped since
-- nothing else references it. `invoice_type` stays — it's still in
-- use by AR invoices / so_invoices.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Rewrite bill_recompute_paid_fn without manually_paid branch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bill_recompute_paid_fn(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total  NUMERIC;
  v_po_id  UUID;
  v_paid   NUMERIC := 0;
  v_new    public.invoice_payment_status;
BEGIN
  SELECT total_amount, purchase_order_id
  INTO   v_total, v_po_id
  FROM   public.bills WHERE id = p_bill_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'bill' AND source_id = p_bill_id)
             OR bill_id = p_bill_id
           )
      AND  direction = 'outgoing'
      AND  deleted_at IS NULL
  ), 0);

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payment_bill_allocations
    WHERE  bill_id = p_bill_id
  ), 0);

  IF v_po_id IS NOT NULL THEN
    v_paid := v_paid + COALESCE((
      SELECT SUM(amount)
      FROM   public.payments
      WHERE  source_type = 'purchase_order'
        AND  source_id   = v_po_id
        AND  direction   = 'outgoing'
        AND  deleted_at  IS NULL
    ), 0);
  END IF;

  v_paid := LEAST(v_paid, COALESCE(v_total, 0));

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'::public.invoice_payment_status
    WHEN v_paid > 0                                     THEN 'partially_paid'::public.invoice_payment_status
    ELSE                                                     'unpaid'::public.invoice_payment_status
  END;

  UPDATE public.bills
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_bill_id;
END;
$$;

-- ------------------------------------------------------------
-- 2. Rewrite allocate_payment_to_bill without manually_paid branch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid,
  p_amount     numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_total_paid      NUMERIC;
  v_new_status      public.invoice_payment_status;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount INTO v_bill_total
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'::public.invoice_payment_status
    WHEN v_total_paid > 0             THEN 'partially_paid'::public.invoice_payment_status
    ELSE                                   'unpaid'::public.invoice_payment_status
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = v_new_status
   WHERE id = p_bill_id;
END;
$$;

-- ------------------------------------------------------------
-- 3. Drop the 5 dead columns
-- ------------------------------------------------------------
ALTER TABLE public.bills
  DROP COLUMN IF EXISTS bill_type,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS manually_paid;

-- ------------------------------------------------------------
-- 4. Drop the now-orphaned bill_source enum
--    (invoice_type stays — still used by AR invoices / so_invoices)
-- ------------------------------------------------------------
DROP TYPE IF EXISTS public.bill_source;

NOTIFY pgrst, 'reload schema';

COMMIT;
