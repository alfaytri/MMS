-- Hotfix: infinite recursion between the payments FX BEFORE/AFTER triggers.
--
-- Reproduces on: Record Payment on a foreign-currency PO/SO that already has
-- >=1 payment. Postgres raises "stack depth limit exceeded" and the payment
-- is not written.
--
-- Cause (introduced in 20260729214428_fx_gain_loss_rpcs_triggers.sql):
--   1. Client INSERTs a payment.
--   2. BEFORE trigger _trg_payments_compute_fx runs (correctly sets NEW.exchange_gain/loss).
--   3. AFTER trigger _trg_payments_refresh_document_fx runs and calls
--      rpc_recompute_document_fx(v_type, v_id).
--   4. rpc_recompute_document_fx issues
--        UPDATE public.payments SET exchange_rate = exchange_rate
--          WHERE source_type = ... AND source_id = ...
--      to re-fire the BEFORE trigger for every existing payment on the parent
--      document. That is the intended self-touch — but the UPDATE ALSO fires
--      the AFTER trigger for every row it touches.
--   5. Each nested AFTER firing calls rpc_recompute_document_fx again, each of
--      which UPDATEs every payment again -> exponential fan-out until the
--      Postgres call stack overflows.
--
-- Fix: transaction-local guard flag. rpc_recompute_document_fx sets
-- mms.fx_recompute_active='1' before the self-touch UPDATE and clears it
-- after. The AFTER trigger short-circuits when the flag is set. First-level
-- (user-originated) INSERT/UPDATE/DELETE on payments still fires the AFTER
-- trigger normally so the parent PO/SO rollup happens exactly once per
-- top-level write. set_config(..., true) scopes the flag to the current
-- transaction, so a rollback (or normal COMMIT) also resets it — no manual
-- cleanup required on the error path.
--
-- No signature changes. Both functions get CREATE OR REPLACE with the same
-- return type / language / security clauses as the originals.

BEGIN;

-- ── AFTER trigger fn: skip when the recompute-active guard is set ────────
CREATE OR REPLACE FUNCTION public._trg_payments_refresh_document_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
  -- Guard: if we're already inside rpc_recompute_document_fx's self-touch
  -- UPDATE cycle, skip. The outer call has already committed to running
  -- the parent-document rollup itself after the loop completes.
  IF current_setting('mms.fx_recompute_active', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_type := OLD.source_type::text; v_id := OLD.source_id;
  ELSE
    v_type := NEW.source_type::text; v_id := NEW.source_id;
  END IF;

  IF v_type IN ('po','so') AND v_id IS NOT NULL THEN
    PERFORM public.rpc_recompute_document_fx(v_type, v_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- ── RPC: set/clear the guard around the self-touch UPDATE ────────────────
CREATE OR REPLACE FUNCTION public.rpc_recompute_document_fx(
  p_document_type text,
  p_document_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sum_gain numeric;
  v_sum_loss numeric;
BEGIN
  -- Suppress the AFTER trigger during the self-touch cascade so it does not
  -- recursively call this RPC once per row. set_config with is_local=true
  -- scopes the flag to the current transaction; a COMMIT or ROLLBACK also
  -- resets it, so we don't need a cleanup path on exceptions.
  PERFORM set_config('mms.fx_recompute_active', '1', true);

  -- Re-fire the BEFORE trigger by touching each payment (UPDATE of
  -- exchange_rate to itself). Idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  -- Clear the guard immediately after the cascade completes so any later
  -- top-level writes in the same transaction still fire the AFTER trigger.
  PERFORM set_config('mms.fx_recompute_active', '', true);

  -- Sum the (now-current) gain/loss values.
  SELECT COALESCE(SUM(exchange_gain),0), COALESCE(SUM(exchange_loss),0)
    INTO v_sum_gain, v_sum_loss
    FROM public.payments
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  IF p_document_type = 'po' THEN
    UPDATE public.purchase_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  ELSE
    UPDATE public.sale_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_recompute_document_fx(text, uuid) TO authenticated;

COMMIT;
