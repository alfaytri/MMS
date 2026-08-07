-- Wide audit follow-up fixes (docs/handover-2026-08-07-po-so-inventory-audit.md).
--
-- 1. HIGH — generate_invoice_from_so remaps payments from source_type
--    'sale_order' → 'invoice' but never zeros out the SO's FX aggregate.
--    Since _trg_payments_refresh_document_fx only recomputes when
--    NEW.source_type ∈ ('purchase_order','sale_order'), the SO row keeps
--    stale exchange_gain / exchange_loss values forever.
--
--    Fix: explicitly call rpc_recompute_document_fx('sale_order', p_so_id)
--    after the payment remap. Also call it for the newly-created invoice's
--    parent SO so any later analytics see 0. (Invoices themselves are not
--    FX aggregate documents, so no invoice-side recompute is needed.)
--
-- 2. LOW — exchange_rate_change_log.document_type CHECK still uses the
--    old short form ('po','so'). Everything else in the FX chain was
--    normalised to the enum values ('purchase_order','sale_order') in mig
--    20260807003000. Any future writer that logs with the long form (as
--    it should, matching the enum) would fail with 23514. Currently a
--    latent gap since the UI is read-only against this table, but easy
--    to close now.

-- ── 1. generate_invoice_from_so — recompute SO FX after payment remap ─────

CREATE OR REPLACE FUNCTION public.generate_invoice_from_so(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (
    SELECT 1 FROM so_invoices
    WHERE  sale_order_id = p_so_id
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.division_id,
    so.subtotal,
    so.total                            AS total_amount,
    CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('confirmed', 'partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_invoiceable';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  direction   = 'incoming'
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  v_invoice_id_str := v_so.so_number || '-I';

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO so_invoices (
    invoice_id, customer_id, sale_order_id,
    division_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', v_payment_status::public.invoice_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_paid_amount,
    v_issued_date, v_due_date,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  -- Explicit FX recompute — the AFTER trigger only fires for source_type
  -- IN ('purchase_order','sale_order'). Post-remap the payments are
  -- 'invoice', so the trigger skips them and the SO would keep stale
  -- exchange_gain / exchange_loss values. Force one more recompute here.
  PERFORM public.rpc_recompute_document_fx('sale_order', p_so_id);

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$$;

-- ── 2. exchange_rate_change_log CHECK — accept enum-valued strings ────────

-- Order matters: the old CHECK only allowed ('po','so'), so an UPDATE
-- that rewrites a row to 'purchase_order' would fail. Drop the old
-- CHECK first, backfill any short-form rows to long form, then re-add
-- the new CHECK.
ALTER TABLE public.exchange_rate_change_log
  DROP CONSTRAINT IF EXISTS exchange_rate_change_log_document_type_check;

UPDATE public.exchange_rate_change_log
   SET document_type = CASE document_type
                         WHEN 'po' THEN 'purchase_order'
                         WHEN 'so' THEN 'sale_order'
                         ELSE document_type
                       END
 WHERE document_type IN ('po','so');

ALTER TABLE public.exchange_rate_change_log
  ADD  CONSTRAINT exchange_rate_change_log_document_type_check
  CHECK (document_type IN ('purchase_order','sale_order'));
