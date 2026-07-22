-- Fix bill_recompute_paid_fn to sum payments in the bill's currency, not QAR.
--
-- Previous version summed COALESCE(amount_qar, amount), which mixes
-- currencies: bill.total_amount is stored in the PO's currency (e.g. USD),
-- but amount_qar is the payment converted to QAR. Comparing them treated
-- a $15,000 USD payment as QAR 54,750 and marked a $53,500 USD bill as
-- fully paid.
--
-- Payments are recorded in the parent (PO/bill) currency. amount is
-- authoritative and comparable to bill.total_amount directly. amount_qar
-- is a bookkeeping mirror for QAR-denominated reporting only.

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

  -- Direct payments (source_type='bill' or bill_id set).
  -- Use amount (original currency) so we compare like-for-like with total_amount.
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

  -- payment_bill_allocations — already in the bill's currency.
  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payment_bill_allocations
    WHERE  bill_id = p_bill_id
  ), 0);

  -- PO-level payments — original currency, same as PO/bill.
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
         payment_status = CASE WHEN v_manually THEN payment_status ELSE v_new END
  WHERE  id = p_bill_id;
END;
$$;

-- Rerun for every bill so historical rows correct themselves.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.bills LOOP
    PERFORM public.bill_recompute_paid_fn(r.id);
  END LOOP;
END $$;

-- Force PDF regeneration.
UPDATE public.bills SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

COMMIT;
