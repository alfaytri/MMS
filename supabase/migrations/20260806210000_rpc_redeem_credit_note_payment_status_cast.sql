-- Second enum cast on rpc_redeem_credit_note: so_invoices.payment_status
-- is an invoice_payment_status enum, not text. Postgres raised 42804 on
-- the UPDATE at the tail of the RPC. Fix: cast the CASE result to the
-- enum type. Rest of the body preserved verbatim from 20260806200000.

CREATE OR REPLACE FUNCTION public.rpc_redeem_credit_note(
  p_invoice_id     uuid,
  p_credit_note_id uuid,
  p_amount         numeric,
  p_method         text,
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_date           date DEFAULT NULL,
  p_source_type    text DEFAULT NULL,
  p_source_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn             credit_notes%ROWTYPE;
  v_inv_customer   uuid;
  v_inv_total      numeric;
  v_paid           numeric;
  v_outstanding    numeric;
  v_prior_redeemed numeric;
  v_cn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount must be > 0 (got %)', p_amount;
  END IF;
  IF p_method NOT IN ('credit_note', 'store_credit') THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: method must be credit_note or store_credit (got %)', p_method;
  END IF;
  IF p_invoice_id IS NULL AND (p_source_type IS NULL OR p_source_id IS NULL) THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: must provide p_invoice_id OR (p_source_type + p_source_id)';
  END IF;
  IF p_source_type IS NOT NULL AND p_source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: p_source_type must be sale_order (got %)', p_source_type;
  END IF;

  SELECT * INTO v_cn
    FROM credit_notes
   WHERE id = p_credit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: credit note % not found', p_credit_note_id;
  END IF;

  IF p_method = 'store_credit'
     AND v_cn.resolution_type IS DISTINCT FROM 'store_credit' THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN % is not resolved as store credit (resolution_type=%)',
      v_cn.credit_note_id, COALESCE(v_cn.resolution_type, 'null');
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT customer_id, total_amount
      INTO v_inv_customer, v_inv_total
      FROM so_invoices
     WHERE id = p_invoice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: invoice % not found', p_invoice_id;
    END IF;
  ELSE
    SELECT customer_id INTO v_inv_customer
      FROM sale_orders
     WHERE id = p_source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: sale order % not found', p_source_id;
    END IF;
  END IF;
  IF v_cn.customer_id IS NULL OR v_cn.customer_id <> v_inv_customer THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN customer_id (%) does not match target customer_id (%)',
      COALESCE(v_cn.customer_id::text, 'null'), v_inv_customer;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_prior_redeemed
    FROM payments
   WHERE credit_note_id = p_credit_note_id
     AND deleted_at IS NULL;
  v_cn_remaining := v_cn.total_amount - v_prior_redeemed;
  IF p_amount > v_cn_remaining THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds CN remaining balance % (total %, prior redemptions %)',
      p_amount, v_cn_remaining, v_cn.total_amount, v_prior_redeemed;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid
      FROM payments
     WHERE invoice_id = p_invoice_id
       AND direction = 'incoming'
       AND deleted_at IS NULL;
    v_outstanding := v_inv_total - v_paid;
    IF p_amount > v_outstanding THEN
      RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds invoice outstanding %', p_amount, v_outstanding;
    END IF;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 6))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'CPAY-%';
  v_payment_id := 'CPAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, source_type, source_id, customer_id, credit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, reference, notes, direction, status
  ) VALUES (
    v_payment_id, p_invoice_id,
    p_source_type::public.payment_source_type,
    p_source_id, v_cn.customer_id, p_credit_note_id,
    p_amount, 'QAR', 1, p_amount,
    p_method, COALESCE(p_date, CURRENT_DATE),
    p_reference, p_notes, 'incoming', 'completed'
  )
  RETURNING id INTO v_payment_uuid;

  IF p_invoice_id IS NOT NULL THEN
    UPDATE so_invoices
       SET payment_status = (CASE
             WHEN (v_paid + p_amount) >= v_inv_total THEN 'paid'
             WHEN (v_paid + p_amount) > 0            THEN 'partially_paid'
             ELSE 'unpaid'
           END)::public.invoice_payment_status
     WHERE id = p_invoice_id;
  END IF;

  RETURN v_payment_uuid;
END;
$$;
