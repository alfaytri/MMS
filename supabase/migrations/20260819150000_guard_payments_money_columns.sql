-- Security P1 — lock a payment's money / value columns against direct client writes.
--
-- Finding: the ONLY direct client UPDATE of payments in the app is
-- useBulkQbSyncPayments toggling qb_synced (usePayments.ts:161). Creation is three
-- INSERT hooks (customer/PO/SO payment); every edit/delete goes through SECURITY
-- DEFINER RPCs (rpc_edit_*/rpc_delete_* payment, rpc_redeem_credit_note,
-- rpc_settle_installment, rpc_apply_debit_note_to_bill). Writes are already gated on
-- purchase.payments.manage (20260806000000), so the actor is a permitted clerk — but
-- such a clerk can still rewrite amount / amount_qar / exchange_rate on a recorded
-- payment via raw PostgREST.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * all guarded columns exist.
--  * payment writers: rpc_edit/delete_* payment, rpc_redeem_credit_note,
--    rpc_settle_installment, rpc_apply_debit_note_to_bill, generate_invoice_from_so,
--    rpc_recompute_document_fx are all prosecdef=true (DEFINER) → pass the gate.
--  * TWO writers are SECURITY INVOKER: attach_payment_to_invoice /
--    detach_payment_from_invoice — they `UPDATE payments SET invoice_id = …` and are
--    called DIRECTLY by the client (useAttachPaymentToInvoice / useDetach…). They run
--    as `authenticated`, so guarding invoice_id here WOULD BREAK the legit attach/detach
--    flow. => invoice_id (and all linkage columns) are deliberately NOT guarded here.
--    Locking payment linkage is deferred to a follow-up that first hardens attach/detach
--    into DEFINER RPCs with their own auth/division checks (see docs/future-plans.md).
--  * only qb_synced is a direct-client-editable column (grep src/), so blocking the
--    money/value columns below breaks nothing.
--
-- Guards ONLY the pure money/value columns — no legit direct-client or INVOKER-RPC
-- path writes any of them via UPDATE.

CREATE OR REPLACE FUNCTION public.guard_payments_money_columns()
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
       NEW.amount        IS DISTINCT FROM OLD.amount
    OR NEW.amount_qar    IS DISTINCT FROM OLD.amount_qar
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.currency      IS DISTINCT FROM OLD.currency
    OR NEW.direction     IS DISTINCT FROM OLD.direction
    OR NEW.status        IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'A payment''s amount / fx / currency / direction / status cannot be edited by a direct client write — use rpc_edit_*_payment / rpc_delete_*_payment.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payments_money_columns ON public.payments;
CREATE TRIGGER trg_guard_payments_money_columns
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_payments_money_columns();

REVOKE ALL ON public.payments FROM anon;
