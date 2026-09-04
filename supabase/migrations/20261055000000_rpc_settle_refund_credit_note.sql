-- Settle a standalone refund credit note: record the outgoing cash refund and
-- close the note once fully paid back. Refund payments link via credit_note_id
-- + customer_id only (no source_type/invoice_id) so the invoice paid-amount
-- recompute never counts them.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_settle_refund_credit_note(
  p_credit_note_id uuid,
  p_amount         numeric,
  p_method         text,
  p_reference      text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cn        credit_notes%ROWTYPE;
  v_paid_back numeric;
  v_remaining numeric;
  v_currency  text;
BEGIN
  SELECT * INTO v_cn FROM credit_notes WHERE id = p_credit_note_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_settle_refund_credit_note: credit note % not found', p_credit_note_id USING ERRCODE = 'P0002';
  END IF;
  IF v_cn.source_return_id IS NOT NULL THEN
    RAISE EXCEPTION 'rpc_settle_refund_credit_note: % is a return credit note — resolve it through Returns', v_cn.credit_note_id USING ERRCODE = '42501';
  END IF;
  IF v_cn.status = 'void' THEN
    RAISE EXCEPTION 'rpc_settle_refund_credit_note: % is void', v_cn.credit_note_id USING ERRCODE = '42501';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_settle_refund_credit_note: amount must be > 0';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid_back
    FROM payments WHERE credit_note_id = p_credit_note_id AND direction = 'outgoing' AND deleted_at IS NULL;
  v_remaining := v_cn.total_amount - v_paid_back;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'rpc_settle_refund_credit_note: amount % exceeds remaining %', p_amount, v_remaining;
  END IF;

  SELECT COALESCE(so.currency,'QAR') INTO v_currency
    FROM so_invoices i LEFT JOIN sale_orders so ON so.id = i.sale_order_id
   WHERE i.id = v_cn.invoice_id;
  v_currency := COALESCE(v_currency,'QAR');

  INSERT INTO payments (
    amount, method, date, direction, currency, exchange_rate, exchange_gain, exchange_loss,
    customer_id, credit_note_id, reference, status
  ) VALUES (
    p_amount, p_method, CURRENT_DATE, 'outgoing', v_currency, 1, 0, 0,
    v_cn.customer_id, p_credit_note_id, p_reference, 'completed'
  );

  IF (v_paid_back + p_amount) >= v_cn.total_amount THEN
    UPDATE credit_notes SET status = 'resolved', resolution_type = 'refund',
           refund_method = COALESCE(p_method, refund_method), refund_reference = COALESCE(p_reference, refund_reference)
     WHERE id = p_credit_note_id;
  END IF;

  RETURN jsonb_build_object(
    'settled_amount', p_amount,
    'remaining',      v_remaining - p_amount,
    'status',         (SELECT status::text FROM credit_notes WHERE id = p_credit_note_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_settle_refund_credit_note(uuid,numeric,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_settle_refund_credit_note(uuid,numeric,text,text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
