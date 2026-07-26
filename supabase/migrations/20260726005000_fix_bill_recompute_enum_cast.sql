-- Hotfix: bill_recompute_paid_fn CASE type mismatch after Pass 1.
--
-- Pass 1 (20260726000000) retyped bills.payment_status from text to the
-- invoice_payment_status enum. The recompute function's UPDATE uses
--   payment_status = CASE WHEN v_manually THEN payment_status ELSE v_new END
-- where v_new is TEXT and payment_status is now enum. Postgres can't
-- unify the CASE branches at plan time, so the trigger throws
-- "CASE types text and invoice_payment_status cannot be matched" on
-- every payments write.
--
-- Fix: cast the text branch to the enum explicitly.

BEGIN;

CREATE OR REPLACE FUNCTION public.bill_recompute_paid_fn(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total     NUMERIC;
  v_manually  BOOLEAN;
  v_po_id     UUID;
  v_paid      NUMERIC := 0;
  v_new       TEXT;
BEGIN
  SELECT total_amount, manually_paid, purchase_order_id
  INTO   v_total, v_manually, v_po_id
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
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0                                     THEN 'partially_paid'
    ELSE                                                     'unpaid'
  END;

  UPDATE public.bills
  SET    paid_amount    = v_paid,
         payment_status = CASE
           WHEN v_manually THEN payment_status
           ELSE v_new::public.invoice_payment_status
         END
  WHERE  id = p_bill_id;
END;
$$;

COMMIT;
