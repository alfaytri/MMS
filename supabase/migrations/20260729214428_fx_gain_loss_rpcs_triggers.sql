-- Foreign-currency exchange gain/loss — RPCs + triggers
-- Requires 20260729201528_fx_gain_loss_schema.sql
-- See docs/superpowers/specs/2026-07-29-foreign-currency-exchange-gain-loss-design.md

BEGIN;

-- ── Helper: read booked rate + currency for a PO or SO ────────
CREATE OR REPLACE FUNCTION public._fx_document_booking(
  p_document_type text,
  p_document_id   uuid,
  OUT o_currency  text,
  OUT o_rate      numeric,
  OUT o_direction text  -- 'outgoing' for PO, 'incoming' for SO
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_document_type = 'po' THEN
    SELECT currency, initial_exchange_rate, 'outgoing'
      INTO o_currency, o_rate, o_direction
      FROM public.purchase_orders WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT currency, initial_exchange_rate, 'incoming'
      INTO o_currency, o_rate, o_direction
      FROM public.sale_orders WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._fx_document_booking(text, uuid) FROM public;

-- ── Trigger fn: compute payment FX gain/loss BEFORE INSERT/UPDATE ─
CREATE OR REPLACE FUNCTION public._trg_payments_compute_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc_currency text;
  v_doc_rate     numeric;
  v_direction    text;
  v_booked_qar   numeric;
  v_paid_qar     numeric;
  v_delta        numeric;
BEGIN
  -- Only compute for foreign-currency payments linked to a PO or SO
  IF NEW.source_type::text NOT IN ('po','so') OR NEW.source_id IS NULL
     OR COALESCE(NEW.currency,'QAR') = 'QAR' THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  SELECT o_currency, o_rate, o_direction
    INTO v_doc_currency, v_doc_rate, v_direction
    FROM public._fx_document_booking(NEW.source_type::text, NEW.source_id);

  -- Document is QAR-only or currency mismatch → no gain/loss
  IF v_doc_currency IS NULL OR v_doc_currency = 'QAR'
     OR v_doc_currency <> NEW.currency THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  v_booked_qar := NEW.amount * COALESCE(v_doc_rate, 1);
  v_paid_qar   := NEW.amount * COALESCE(NEW.exchange_rate, 1);

  IF v_direction = 'outgoing' THEN
    -- Supplier payment (PO): we paid less QAR than we booked → gain
    v_delta := v_booked_qar - v_paid_qar;
  ELSE
    -- Customer payment (SO): we received more QAR than we booked → gain
    v_delta := v_paid_qar - v_booked_qar;
  END IF;

  IF v_delta >= 0 THEN
    NEW.exchange_gain := v_delta;
    NEW.exchange_loss := 0;
  ELSE
    NEW.exchange_gain := 0;
    NEW.exchange_loss := -v_delta;
  END IF;

  -- Also keep amount_qar in sync (belt-and-braces)
  NEW.amount_qar := v_paid_qar;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payments_compute_fx ON public.payments;
CREATE TRIGGER trg_payments_compute_fx
  BEFORE INSERT OR UPDATE OF amount, exchange_rate, currency, source_type, source_id
  ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._trg_payments_compute_fx();

-- ── RPC: recompute document rollup ────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_recompute_document_fx(
  p_document_type text,
  p_document_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sum_gain numeric;
  v_sum_loss numeric;
BEGIN
  -- Re-run BEFORE trigger by touching each payment (UPDATE of exchange_rate
  -- to itself triggers the recompute path). This is idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  -- Now sum
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

-- ── Trigger fn: refresh parent rollup after payment change ────
CREATE OR REPLACE FUNCTION public._trg_payments_refresh_document_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
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

DROP TRIGGER IF EXISTS trg_payments_refresh_document_fx ON public.payments;
CREATE TRIGGER trg_payments_refresh_document_fx
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._trg_payments_refresh_document_fx();

-- ── RPC: change booked rate with audit ────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_document_initial_rate(
  p_document_type text,
  p_document_id   uuid,
  p_new_rate      numeric,
  p_reason        text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_rate numeric;
  v_uid uuid := auth.uid();
BEGIN
  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'new_rate must be positive';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason must be at least 5 characters';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be called by an authenticated user';
  END IF;

  IF p_document_type = 'po' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.purchase_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO % not found', p_document_id; END IF;

    UPDATE public.purchase_orders
       SET initial_exchange_rate = p_new_rate,
           exchange_rate         = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_uid
     WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.sale_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SO % not found', p_document_id; END IF;

    UPDATE public.sale_orders
       SET initial_exchange_rate = p_new_rate,
           exchange_rate         = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_uid
     WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;

  INSERT INTO public.exchange_rate_change_log
    (document_type, document_id, old_rate, new_rate, reason, changed_by)
  VALUES (p_document_type, p_document_id, v_old_rate, p_new_rate, p_reason, v_uid);

  PERFORM public.rpc_recompute_document_fx(p_document_type, p_document_id);
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_update_document_initial_rate(text, uuid, numeric, text) TO authenticated;

COMMIT;
