-- Fix: rpc_settle_installment was inserting payments without source_type /
-- source_id / customer_id, so the SO list (which queries payments WHERE
-- source_type='sale_order') never saw installment payments → badge stayed
-- "Unpaid". Also wasn't updating so_invoices.payment_status on settlement.
--
-- Changes:
--   1. Resolve sale_order_id + customer_id from so_invoices when the plan
--      is invoice-linked, populate source_type/source_id/customer_id on
--      the payment INSERT.
--   2. After each settlement, recompute so_invoices.payment_status using
--      the same pattern as rpc_redeem_credit_note.

CREATE OR REPLACE FUNCTION public.rpc_settle_installment(
  p_installment_id uuid,
  p_amount_paid    numeric,
  p_method         text,
  p_date           date,
  p_reference      text     DEFAULT NULL,
  p_currency       text     DEFAULT 'QAR',
  p_exchange_rate  numeric  DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst          payment_installments%ROWTYPE;
  v_plan          payment_plans%ROWTYPE;
  v_new_paid      numeric;
  v_new_status    text;
  v_payment_id    text;
  v_payment_uuid  uuid;
  v_last_num      int;
  v_all_paid      boolean;
  v_so_id         uuid;
  v_customer_id   uuid;
  v_inv_total     numeric;
  v_total_paid    numeric;
BEGIN
  IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
    RAISE EXCEPTION 'rpc_settle_installment: amount_paid must be > 0 (got %)', p_amount_paid;
  END IF;
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'rpc_settle_installment: currency is required';
  END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'rpc_settle_installment: exchange_rate must be > 0 (got %)', p_exchange_rate;
  END IF;

  SELECT * INTO v_inst
    FROM payment_installments
   WHERE id = p_installment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_settle_installment: installment % not found', p_installment_id;
  END IF;
  IF v_inst.status = 'paid' THEN
    RAISE EXCEPTION 'rpc_settle_installment: installment % is already fully paid', p_installment_id;
  END IF;

  v_new_paid := COALESCE(v_inst.paid_amount, 0) + p_amount_paid;
  IF v_new_paid > v_inst.amount THEN
    RAISE EXCEPTION 'rpc_settle_installment: paid_amount % would exceed installment total % (prior paid %)',
      v_new_paid, v_inst.amount, v_inst.paid_amount;
  END IF;
  v_new_status := CASE WHEN v_new_paid >= v_inst.amount THEN 'paid' ELSE 'partial' END;

  SELECT * INTO v_plan
    FROM payment_plans
   WHERE id = v_inst.plan_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_settle_installment: plan % not found', v_inst.plan_id;
  END IF;
  IF v_plan.invoice_id IS NULL AND v_plan.bill_id IS NULL THEN
    RAISE EXCEPTION 'rpc_settle_installment: plan % has neither invoice_id nor bill_id', v_plan.id;
  END IF;

  -- Resolve SO id + customer from the invoice for source_type/source_id
  IF v_plan.invoice_id IS NOT NULL THEN
    SELECT sale_order_id, customer_id, COALESCE(total_amount, 0)
      INTO v_so_id, v_customer_id, v_inv_total
      FROM so_invoices
     WHERE id = v_plan.invoice_id;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, bill_id,
    source_type, source_id, customer_id,
    amount, method, date, reference,
    direction, status,
    currency, exchange_rate, amount_qar
  ) VALUES (
    v_payment_id,
    v_plan.invoice_id,
    v_plan.bill_id,
    CASE
      WHEN v_so_id IS NOT NULL THEN 'sale_order'::public.payment_source_type
      WHEN v_plan.bill_id IS NOT NULL THEN 'purchase_order'::public.payment_source_type
      ELSE NULL
    END,
    COALESCE(v_so_id, NULL),
    v_customer_id,
    p_amount_paid,
    p_method,
    p_date,
    p_reference,
    (CASE WHEN v_plan.invoice_id IS NOT NULL THEN 'incoming' ELSE 'outgoing' END)::public.payment_direction,
    'completed'::public.payment_status,
    p_currency, p_exchange_rate, p_amount_paid * p_exchange_rate
  )
  RETURNING id INTO v_payment_uuid;

  UPDATE payment_installments
     SET paid_amount = v_new_paid,
         status      = v_new_status,
         payment_id  = v_payment_uuid,
         updated_at  = now()
   WHERE id = p_installment_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM payment_installments
     WHERE plan_id = v_plan.id
       AND status <> 'paid'
  ) INTO v_all_paid;

  IF v_all_paid AND v_plan.status <> 'completed' THEN
    UPDATE payment_plans
       SET status     = 'completed',
           updated_at = now()
     WHERE id = v_plan.id;
  END IF;

  -- Recompute invoice payment_status (same pattern as rpc_redeem_credit_note)
  IF v_plan.invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM payments
     WHERE invoice_id = v_plan.invoice_id
       AND deleted_at IS NULL;

    UPDATE so_invoices
       SET payment_status = (CASE
             WHEN v_total_paid >= v_inv_total THEN 'paid'
             WHEN v_total_paid > 0            THEN 'partially_paid'
             ELSE 'unpaid'
           END)::public.invoice_payment_status
     WHERE id = v_plan.invoice_id;
  END IF;

  RETURN v_payment_uuid;
END;
$$;
