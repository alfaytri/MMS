-- Money-path SO cancellation: void the invoice, open a refund credit note for
-- the amount paid, cancel the SO. Precondition: nothing physically shipped.
BEGIN;

-- Guard: honor a txn-local GUC set by rpc_cancel_sale_order (which validates the
-- money-path precondition itself). Body otherwise identical to the live def.
CREATE OR REPLACE FUNCTION public._sale_orders_block_cancel_with_deliveries()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_bad_deliveries int;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF current_setting('app.allow_so_cancel', true) = 'on' THEN
      RETURN NEW;
    END IF;
    IF OLD.status IN ('partial_delivery','delivered','invoiced') THEN
      RAISE EXCEPTION 'sale_orders: cannot cancel an SO in "%" status. Reverse the deliveries and invoices first.', OLD.status
        USING ERRCODE = '42501';
    END IF;
    SELECT COUNT(*) INTO v_bad_deliveries
      FROM public.sale_deliveries WHERE sale_order_id = NEW.id AND status <> 'pending';
    IF v_bad_deliveries > 0 THEN
      RAISE EXCEPTION 'sale_orders: cannot cancel — % non-pending delivery record(s) exist. Reverse them first.', v_bad_deliveries
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_sale_order(p_so_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_so             sale_orders%ROWTYPE;
  v_inv            RECORD;
  v_paid           numeric := 0;
  v_cn_id          uuid    := NULL;
  v_cn_display     text    := NULL;
  v_invoice_voided boolean := false;
  v_invoice_no     text    := NULL;
  v_last_cn        int;
  v_bad_deliv      int;
  v_cogs           int;
  v_moves          int;
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

  FOR v_inv IN
    SELECT id, invoice_id, total_amount, COALESCE(paid_amount,0) AS paid_amount, customer_id
      FROM so_invoices WHERE sale_order_id = p_so_id AND status <> 'void'
      FOR UPDATE
  LOOP
    UPDATE so_invoices
       SET status = 'void',
           notes  = TRIM(BOTH ' -' FROM COALESCE(notes,'') || ' - SO ' || v_so.so_number || ' cancelled')
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
        'SO ' || v_so.so_number || ' cancelled - refund due', 'open', NULL
      ) RETURNING id INTO v_cn_id;

      INSERT INTO credit_note_lines (credit_note_id, description, qty, unit_price)
      VALUES (v_cn_id, 'Refund for cancelled SO ' || v_so.so_number, 1, v_inv.paid_amount);
    END IF;
  END LOOP;

  PERFORM set_config('app.allow_so_cancel','on',true);
  UPDATE sale_orders SET status = 'cancelled' WHERE id = p_so_id;

  RETURN jsonb_build_object(
    'action',                'cancelled',
    'invoice_voided',        v_invoice_voided,
    'invoice_number',        v_invoice_no,
    'refund_credit_note_id', v_cn_id,
    'refund_credit_note',    v_cn_display,
    'refund_amount',         v_paid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cancel_sale_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_sale_order(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
