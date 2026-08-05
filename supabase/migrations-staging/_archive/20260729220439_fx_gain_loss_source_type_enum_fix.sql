-- Hotfix for Task 2 (20260729214428_fx_gain_loss_rpcs_triggers.sql)
--
-- BUG: the payment FX trigger and rollup RPC compared source_type against
-- string literals 'po' and 'so'. But payments.source_type is a Postgres enum
-- (payment_source_type) whose values are 'sale_order', 'purchase_order',
-- 'invoice', 'bill'. The comparison never matched, so exchange_gain and
-- exchange_loss stayed 0 on every real payment.
--
-- FIX: keep the public-facing document_type param as 'po'|'so' (matches
-- exchange_rate_change_log.document_type check + audit RPC) but map to the
-- enum values internally when reading/writing payment rows.

BEGIN;

-- ── Trigger fn: compute payment FX gain/loss BEFORE INSERT/UPDATE ─
CREATE OR REPLACE FUNCTION public._trg_payments_compute_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc_type_short text;
  v_doc_currency   text;
  v_doc_rate       numeric;
  v_direction      text;
  v_booked_qar     numeric;
  v_paid_qar       numeric;
  v_delta          numeric;
BEGIN
  -- Map payment source_type enum → short form used by our document RPCs
  v_doc_type_short := CASE NEW.source_type::text
    WHEN 'purchase_order' THEN 'po'
    WHEN 'sale_order'     THEN 'so'
    ELSE NULL
  END;

  -- Only compute for foreign-currency payments linked to a PO or SO
  IF v_doc_type_short IS NULL OR NEW.source_id IS NULL
     OR COALESCE(NEW.currency,'QAR') = 'QAR' THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  SELECT o_currency, o_rate, o_direction
    INTO v_doc_currency, v_doc_rate, v_direction
    FROM public._fx_document_booking(v_doc_type_short, NEW.source_id);

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

  NEW.amount_qar := v_paid_qar;

  RETURN NEW;
END $$;

-- ── RPC: recompute document rollup ────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_recompute_document_fx(
  p_document_type text,
  p_document_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sum_gain  numeric;
  v_sum_loss  numeric;
  v_enum_val  text;
BEGIN
  -- Map short document_type → payment_source_type enum value
  v_enum_val := CASE p_document_type
    WHEN 'po' THEN 'purchase_order'
    WHEN 'so' THEN 'sale_order'
    ELSE NULL
  END;
  IF v_enum_val IS NULL THEN
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;

  -- Re-run BEFORE trigger by touching each payment (UPDATE of exchange_rate
  -- to itself triggers the recompute path). This is idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = v_enum_val
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  SELECT COALESCE(SUM(exchange_gain),0), COALESCE(SUM(exchange_loss),0)
    INTO v_sum_gain, v_sum_loss
    FROM public.payments
   WHERE source_type::text = v_enum_val
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

-- ── Trigger fn: refresh parent rollup after payment change ────
CREATE OR REPLACE FUNCTION public._trg_payments_refresh_document_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src_enum text;
  v_id       uuid;
  v_short    text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_src_enum := OLD.source_type::text; v_id := OLD.source_id;
  ELSE
    v_src_enum := NEW.source_type::text; v_id := NEW.source_id;
  END IF;

  v_short := CASE v_src_enum
    WHEN 'purchase_order' THEN 'po'
    WHEN 'sale_order'     THEN 'so'
    ELSE NULL
  END;

  IF v_short IS NOT NULL AND v_id IS NOT NULL THEN
    PERFORM public.rpc_recompute_document_fx(v_short, v_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

COMMIT;
