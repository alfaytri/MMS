-- Phase 2 prep: extract the invoice-void + refund-credit-note block from
-- rpc_cancel_sale_order into a shared internal helper so the shipped-SO cancel
-- (rpc_finalize_shipped_so_cancel) can reuse the EXACT same money path. Pure
-- refactor of the money block — rpc_cancel_sale_order's observable output is
-- unchanged (regression scenario 7 in the spec).
BEGIN;

-- ── Shared helper: void every non-void invoice for the SO and, for any amount
-- already paid, open a settle-able standalone refund credit note (source_return_id
-- NULL → shows in customer_refunds_payable / "Refunds Due"). Internal only:
-- reachable solely from the two DEFINER cancel RPCs (owner runs it); never
-- granted to clients — a direct grant would let anyone void invoices.
CREATE OR REPLACE FUNCTION public._void_invoice_and_open_refund_cn(p_so_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_so_number      text;
  v_inv            RECORD;
  v_paid           numeric := 0;
  v_cn_id          uuid    := NULL;
  v_cn_display     text    := NULL;
  v_invoice_voided boolean := false;
  v_invoice_no     text    := NULL;
  v_last_cn        int;
BEGIN
  SELECT so_number INTO v_so_number FROM sale_orders WHERE id = p_so_id;

  FOR v_inv IN
    SELECT id, invoice_id, total_amount, COALESCE(paid_amount,0) AS paid_amount, customer_id
      FROM so_invoices WHERE sale_order_id = p_so_id AND status <> 'void'
      FOR UPDATE
  LOOP
    UPDATE so_invoices
       SET status = 'void',
           notes  = TRIM(BOTH ' -' FROM COALESCE(notes,'') || ' - SO ' || v_so_number || ' cancelled')
     WHERE id = v_inv.id;
    v_invoice_voided := true;
    v_invoice_no     := v_inv.invoice_id;

    IF v_inv.paid_amount > 0 THEN
      v_paid := v_paid + v_inv.paid_amount;
      PERFORM pg_advisory_xact_lock(hashtext('cn_serial'));
      SELECT COALESCE(MAX((substring(credit_note_id from 4))::int),0) INTO v_last_cn
        FROM credit_notes WHERE credit_note_id ILIKE 'CN-%';
      v_cn_display := 'CN-' || LPAD((v_last_cn + 1)::text, 5, '0');

      INSERT INTO credit_notes (
        credit_note_id, invoice_id, customer_id, customer_name,
        total_amount, original_total, reason, status, source_return_id
      ) VALUES (
        v_cn_display, v_inv.id, v_inv.customer_id,
        (SELECT name FROM customers WHERE id = v_inv.customer_id),
        v_inv.paid_amount, v_inv.total_amount,
        'SO ' || v_so_number || ' cancelled - refund due', 'open', NULL
      ) RETURNING id INTO v_cn_id;

      INSERT INTO credit_note_lines (credit_note_id, description, qty, unit_price)
      VALUES (v_cn_id, 'Refund for cancelled SO ' || v_so_number, 1, v_inv.paid_amount);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_voided',        v_invoice_voided,
    'invoice_number',        v_invoice_no,
    'refund_credit_note_id', v_cn_id,
    'refund_credit_note',    v_cn_display,
    'refund_amount',         v_paid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._void_invoice_and_open_refund_cn(uuid) FROM public, anon, authenticated;

-- ── rpc_cancel_sale_order: identical behavior, money block now delegated to the
-- helper. Precondition (reject shipped) + guard GUC + SO cancel unchanged.
CREATE OR REPLACE FUNCTION public.rpc_cancel_sale_order(p_so_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_so        sale_orders%ROWTYPE;
  v_money     jsonb;
  v_bad_deliv int;
  v_cogs      int;
  v_moves     int;
BEGIN
  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cancel_sale_order: SO % not found', p_so_id USING ERRCODE = 'P0002';
  END IF;
  IF v_so.status = 'cancelled' THEN
    RETURN jsonb_build_object('action','noop','reason','already_cancelled');
  END IF;

  SELECT count(*) INTO v_bad_deliv
    FROM sale_deliveries WHERE sale_order_id = p_so_id AND status NOT IN ('pending','cancelled');
  SELECT count(*) INTO v_cogs
    FROM cogs_entries
   WHERE sale_order_id = p_so_id
      OR sale_delivery_id IN (SELECT id FROM sale_deliveries WHERE sale_order_id = p_so_id);
  SELECT count(*) INTO v_moves
    FROM inventory_stock_movements
   WHERE reference_type = 'sale_delivery'
     AND reference_id IN (SELECT id FROM sale_deliveries WHERE sale_order_id = p_so_id);
  IF v_bad_deliv > 0 OR v_cogs > 0 OR v_moves > 0 THEN
    RAISE EXCEPTION 'rpc_cancel_sale_order: SO % has shipped stock — reverse it through Returns.', v_so.so_number
      USING ERRCODE = '42501';
  END IF;

  v_money := public._void_invoice_and_open_refund_cn(p_so_id);

  PERFORM set_config('app.allow_so_cancel','on',true);
  UPDATE sale_orders SET status = 'cancelled' WHERE id = p_so_id;

  RETURN jsonb_build_object('action','cancelled')
      || v_money;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cancel_sale_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_sale_order(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
