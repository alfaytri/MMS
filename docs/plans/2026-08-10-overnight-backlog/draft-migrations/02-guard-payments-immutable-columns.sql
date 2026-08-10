-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_payments_immutable_columns.sql + mirror.
-- ============================================================================
-- Security P1 — lock a payment's money / linkage / status columns against direct
-- client writes.
--
-- Finding (audit ../security-p1-audit.md §1): the ONLY legitimate direct client
-- UPDATE of payments in the whole app is useBulkQbSyncPayments (usePayments.ts:160)
-- toggling `qb_synced`. Creation is three INSERT hooks (customer / PO / SO payment);
-- every edit/delete goes through SECURITY DEFINER RPCs (rpc_edit_customer_payment,
-- rpc_delete_customer_payment [20260818000000], rpc_edit_supplier_payment,
-- rpc_delete_supplier_payment [20260817000000], rpc_redeem_credit_note,
-- rpc_settle_installment, rpc_apply_debit_note_to_bill, allocate_payment_to_bill).
-- Writes are already gated on purchase.payments.manage (20260806000000), so the
-- actor is a permitted clerk — but such a clerk can still rewrite `amount` /
-- `amount_qar` / `exchange_rate` on a recorded payment via raw PostgREST.
--
-- This BEFORE UPDATE trigger blocks a direct client write that changes any money /
-- linkage / status column, allowing only the qb_synced toggle (and untouched
-- metadata). DEFINER RPCs run as the owner role and pass. INSERT is NOT guarded
-- (the three creation hooks are legit; a direct credit_note-carrying INSERT is
-- already blocked by the restrictive policy payments_no_direct_cn_insert).
--
-- NOTE: metadata columns (method, date, reference, notes) are intentionally left
-- editable here — they carry no financial weight and locking them adds no security
-- value. If the operator wants payments fully immutable post-insert except qb_synced,
-- add them to the check.

CREATE OR REPLACE FUNCTION public.guard_payments_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller.
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.amount         IS DISTINCT FROM OLD.amount
    OR NEW.amount_qar     IS DISTINCT FROM OLD.amount_qar
    OR NEW.exchange_rate  IS DISTINCT FROM OLD.exchange_rate
    OR NEW.currency       IS DISTINCT FROM OLD.currency
    OR NEW.direction      IS DISTINCT FROM OLD.direction
    OR NEW.status         IS DISTINCT FROM OLD.status
    OR NEW.invoice_id     IS DISTINCT FROM OLD.invoice_id
    OR NEW.bill_id        IS DISTINCT FROM OLD.bill_id
    OR NEW.credit_note_id IS DISTINCT FROM OLD.credit_note_id
    OR NEW.source_type    IS DISTINCT FROM OLD.source_type
    OR NEW.source_id      IS DISTINCT FROM OLD.source_id
    OR NEW.supplier_id    IS DISTINCT FROM OLD.supplier_id
    OR NEW.customer_id    IS DISTINCT FROM OLD.customer_id
  ) THEN
    RAISE EXCEPTION 'A payment''s amount / fx / direction / status / linkage cannot be edited by a direct client write — use rpc_edit_*_payment / rpc_delete_*_payment.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payments_immutable_columns ON public.payments;
CREATE TRIGGER trg_guard_payments_immutable_columns
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_payments_immutable_columns();

REVOKE ALL ON public.payments FROM anon;
