-- Fix: parent-document FX aggregate (exchange_gain / exchange_loss / net)
-- never recomputed after a payment. Two type-code mismatches broke the
-- refresh chain end-to-end:
--
--   1. _trg_payments_refresh_document_fx() checked
--        IF v_type IN ('po','so')
--      but payments.source_type is an enum whose values are
--      'purchase_order' / 'sale_order' / 'invoice' / 'bill'.
--      Result: the RPC was never called.
--
--   2. rpc_recompute_document_fx also mixed the two conventions —
--      its WHERE clause used `source_type::text = p_document_type`
--      (expecting the long form) but the final IF/ELSE dispatched to
--      the parent table via `p_document_type = 'po'` (short form).
--
-- This migration normalises everything on the ENUM values
-- ('purchase_order' / 'sale_order') so no translation is needed and the
-- code speaks the same language as the underlying data.
--
-- Backfill at the end recomputes every foreign-currency PO / SO that
-- has payments — so historical rows (like PO-2026-08-003) get correct
-- exchange_gain / exchange_loss values without another manual step.

CREATE OR REPLACE FUNCTION public._trg_payments_refresh_document_fx()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
  IF current_setting('mms.fx_recompute_active', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_type := OLD.source_type::text; v_id := OLD.source_id;
  ELSE
    v_type := NEW.source_type::text; v_id := NEW.source_id;
  END IF;

  IF v_type IN ('purchase_order','sale_order') AND v_id IS NOT NULL THEN
    PERFORM public.rpc_recompute_document_fx(v_type, v_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_recompute_document_fx(
  p_document_type text,
  p_document_id   uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sum_gain numeric;
  v_sum_loss numeric;
BEGIN
  IF p_document_type NOT IN ('purchase_order', 'sale_order') THEN
    RAISE EXCEPTION 'rpc_recompute_document_fx: p_document_type must be purchase_order or sale_order (got %)', p_document_type;
  END IF;

  PERFORM set_config('mms.fx_recompute_active', '1', true);

  -- Re-fire the BEFORE trigger by touching each payment (UPDATE of
  -- exchange_rate to itself). Idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  PERFORM set_config('mms.fx_recompute_active', '', true);

  SELECT COALESCE(SUM(exchange_gain),0), COALESCE(SUM(exchange_loss),0)
    INTO v_sum_gain, v_sum_loss
    FROM public.payments
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  -- exchange_net is a generated column (gain - loss); don't assign.
  IF p_document_type = 'purchase_order' THEN
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

-- Backfill: recompute every foreign-currency PO / SO that has payments.
-- Uses the just-fixed RPC. Small O(N) sweep over affected parents only.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT source_type::text AS t, source_id AS id
      FROM public.payments
     WHERE source_type IN ('purchase_order','sale_order')
       AND source_id IS NOT NULL
       AND deleted_at IS NULL
  LOOP
    PERFORM public.rpc_recompute_document_fx(r.t, r.id);
  END LOOP;
END $$;
