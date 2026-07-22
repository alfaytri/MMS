-- ============================================================================
-- Auto-recompute bills.paid_amount from payments
-- ============================================================================
-- Missing AP mirror of invoice_recompute_paid_fn: when a supplier payment is
-- recorded against a PO, bills.paid_amount stays $0. The invoice/bill split
-- spec (§7.2) listed this as required but it was never created.
--
-- This migration adds:
--   • bill_recompute_paid_fn(bill_id uuid) — recomputes paid_amount +
--     payment_status for one bill.
--   • payments_trigger_bill_recompute_fn — AFTER INSERT/UPDATE/DELETE on
--     payments, recomputes bills for any bill touched directly (via
--     payments.bill_id / source_type='bill') OR indirectly (via the payment's
--     purchase_order_id, since 1 PO = 1 bill in this app).
--   • bill_recompute_paid_trg — the trigger itself.
--
-- Also backfills every existing bill's paid_amount so historical rows are
-- correct after the migration runs.
--
-- manually_paid is retained as a column and honored as an override — if a
-- bill is explicitly manually_paid=true, its status is not overwritten by
-- the recompute. New writes of manually_paid come exclusively from data
-- fixes; the UI toggle is removed in a follow-up code change.
-- ============================================================================

BEGIN;

-- ── 1. Per-bill recompute function ─────────────────────────────────────────

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

  -- Direct payments (source_type='bill' or bill_id set)
  v_paid := v_paid + COALESCE((
    SELECT SUM(COALESCE(amount_qar, amount))
    FROM   public.payments
    WHERE  (
             (source_type = 'bill' AND source_id = p_bill_id)
             OR bill_id = p_bill_id
           )
      AND  direction = 'outgoing'
      AND  deleted_at IS NULL
  ), 0);

  -- payment_bill_allocations (explicit multi-allocation)
  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payment_bill_allocations
    WHERE  bill_id = p_bill_id
  ), 0);

  -- PO-level payments (source_type='purchase_order' with source_id=this bill's PO)
  IF v_po_id IS NOT NULL THEN
    v_paid := v_paid + COALESCE((
      SELECT SUM(COALESCE(amount_qar, amount))
      FROM   public.payments
      WHERE  source_type = 'purchase_order'
        AND  source_id   = v_po_id
        AND  direction   = 'outgoing'
        AND  deleted_at  IS NULL
    ), 0);
  END IF;

  -- Cap at total_amount so paid_amount never exceeds total
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

-- ── 2. Trigger function on payments ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payments_trigger_bill_recompute_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_bill_id uuid;
  v_old_bill_id uuid;
  v_new_po_id   uuid;
  v_old_po_id   uuid;
  b_rec         RECORD;
BEGIN
  -- Collect all bill_ids and po_ids potentially affected by this change.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_new_bill_id := NEW.bill_id;
    IF NEW.source_type = 'bill'           THEN v_new_bill_id := NEW.source_id; END IF;
    IF NEW.source_type = 'purchase_order' THEN v_new_po_id   := NEW.source_id; END IF;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_bill_id := OLD.bill_id;
    IF OLD.source_type = 'bill'           THEN v_old_bill_id := OLD.source_id; END IF;
    IF OLD.source_type = 'purchase_order' THEN v_old_po_id   := OLD.source_id; END IF;
  END IF;

  -- Recompute directly-referenced bills.
  IF v_new_bill_id IS NOT NULL THEN
    PERFORM public.bill_recompute_paid_fn(v_new_bill_id);
  END IF;
  IF v_old_bill_id IS NOT NULL AND v_old_bill_id IS DISTINCT FROM v_new_bill_id THEN
    PERFORM public.bill_recompute_paid_fn(v_old_bill_id);
  END IF;

  -- Recompute bills linked via PO (1 PO = 1 bill in this app, but loop for safety).
  IF v_new_po_id IS NOT NULL THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_new_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;
  IF v_old_po_id IS NOT NULL AND v_old_po_id IS DISTINCT FROM v_new_po_id THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_old_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 3. Wire up the trigger ─────────────────────────────────────────────────

DROP TRIGGER IF EXISTS bill_recompute_paid_trg ON public.payments;

CREATE TRIGGER bill_recompute_paid_trg
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_trigger_bill_recompute_fn();

-- ── 4. Also recompute when payment_bill_allocations changes ────────────────

CREATE OR REPLACE FUNCTION public.payment_bill_allocations_trigger_recompute_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.bill_recompute_paid_fn(NEW.bill_id);
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.bill_id IS DISTINCT FROM COALESCE(NEW.bill_id, OLD.bill_id) THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payment_bill_allocations_recompute_trg ON public.payment_bill_allocations;

CREATE TRIGGER payment_bill_allocations_recompute_trg
AFTER INSERT OR UPDATE OR DELETE ON public.payment_bill_allocations
FOR EACH ROW EXECUTE FUNCTION public.payment_bill_allocations_trigger_recompute_fn();

-- ── 5. Backfill existing bills ─────────────────────────────────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.bills LOOP
    PERFORM public.bill_recompute_paid_fn(r.id);
  END LOOP;
END $$;

COMMIT;
