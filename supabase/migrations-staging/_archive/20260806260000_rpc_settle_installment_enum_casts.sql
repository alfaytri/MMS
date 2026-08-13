-- Fourth enum-cast miss this session on rpc_settle_installment. The
-- INSERT into payments passed a text CASE result into
-- direction (public.payment_direction enum). Postgres raised 42804 on
-- the first real RPC call — smoke test #3.
--
-- Fix: cast to public.payment_direction. Preemptively cast status too
-- (payment_status enum) so we don't hit a 5th miss on the next line.
-- Rest of body preserved verbatim from 20260806140000.

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
  v_inst        payment_installments%ROWTYPE;
  v_plan        payment_plans%ROWTYPE;
  v_new_paid    numeric;
  v_new_status  text;
  v_payment_id  text;
  v_payment_uuid uuid;
  v_last_num    int;
  v_all_paid    boolean;
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

  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, bill_id,
    amount, method, date, reference,
    direction, status,
    currency, exchange_rate, amount_qar
  ) VALUES (
    v_payment_id,
    v_plan.invoice_id,
    v_plan.bill_id,
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

  RETURN v_payment_uuid;
END;
$$;
