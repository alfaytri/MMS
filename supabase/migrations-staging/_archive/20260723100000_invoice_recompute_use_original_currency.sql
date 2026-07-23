-- Fix invoice_recompute_paid_fn + recalculate_ar_invoice_payment_status
-- to sum payments in the invoice's currency, not QAR. Mirror of the
-- bill_recompute fix in 20260722190000.

BEGIN;

CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(amount), 0) AS paid  -- FIX: was COALESCE(amount_qar, amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.invoices i
  SET    paid_amount    = summed.paid,
         payment_status = (CASE
           WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0                                      THEN 'partially_paid'
           ELSE                                                           'unpaid'
         END)::public.invoice_payment_status
  FROM   summed
  WHERE  i.id = v_invoice_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(amount), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.invoices i
      SET    paid_amount    = summed.paid,
             payment_status = (CASE
               WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0                                      THEN 'partially_paid'
               ELSE                                                           'unpaid'
             END)::public.invoice_payment_status
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total NUMERIC;
  v_paid  NUMERIC;
  v_new   public.invoice_payment_status;
BEGIN
  SELECT total_amount INTO v_total FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid  -- FIX: was COALESCE(amount_qar, amount)
  FROM   payments
  WHERE  (
           (source_type = 'invoice' AND source_id = p_invoice_id)
           OR invoice_id = p_invoice_id
         )
    AND  deleted_at IS NULL
    AND  direction  = 'incoming';

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0                                     THEN 'partially_paid'
    ELSE                                                     'unpaid'
  END;

  UPDATE invoices
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_invoice_id;
END;
$$;

-- Rerun the recompute for every invoice to correct paid_amount + status.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.invoices LOOP
    PERFORM public.recalculate_ar_invoice_payment_status(r.id);
  END LOOP;
END $$;

COMMIT;
