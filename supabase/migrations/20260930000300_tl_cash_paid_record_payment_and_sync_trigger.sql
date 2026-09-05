-- Team-Leader cash-paid fix.
--
-- Two problems this repairs:
--   1. The tl_invoice_payments_sync TRIGGER is missing on the whole-app DB (the
--      sync_tl_invoice_paid_amount function exists but nothing fires it), so
--      inserting a payment never updates tl_invoices.paid_amount / payment_status.
--      This silently breaks the office "record payment" flow too.
--   2. create_tl_invoice with p_mark_paid=true set payment_status='paid' but
--      recorded NO payment (no paid_amount, no tl_invoice_payments row) — a cash
--      invoice showed the PAID badge yet Paid 0 / Remaining = total, empty history.
--
-- Fix: (re)create the trigger, and have create_tl_invoice insert the cash payment
-- when marking paid — the trigger then syncs paid_amount + status.
BEGIN;

-- ── 1. Restore the sync trigger (function already exists; recreate both idempotently)
CREATE OR REPLACE FUNCTION public.sync_tl_invoice_paid_amount() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.tl_invoice_id, OLD.tl_invoice_id);
  v_paid       numeric;
  v_total      numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.tl_invoice_payments WHERE tl_invoice_id = v_invoice_id;
  SELECT total_amount INTO v_total
    FROM public.tl_invoices WHERE id = v_invoice_id;
  UPDATE public.tl_invoices
     SET paid_amount    = v_paid,
         payment_status = CASE
                            WHEN v_paid <= 0       THEN 'unpaid'
                            WHEN v_paid >= v_total THEN 'paid'
                            ELSE 'partial'
                          END,
         updated_at     = now()
   WHERE id = v_invoice_id;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS tl_invoice_payments_sync ON public.tl_invoice_payments;
CREATE TRIGGER tl_invoice_payments_sync
AFTER INSERT OR UPDATE OR DELETE ON public.tl_invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_tl_invoice_paid_amount();

-- ── 2. create_tl_invoice: record the cash payment on mark-paid.
CREATE OR REPLACE FUNCTION public.create_tl_invoice(p_visit_id uuid, p_order_id text, p_customer_name text, p_customer_phone text, p_lines jsonb, p_discount numeric DEFAULT 0, p_payment_method_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_mark_paid boolean DEFAULT false)
 RETURNS TABLE(id uuid, invoice_number text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_subtotal numeric := 0; v_discount numeric; v_total numeric; v_id uuid;
  v_line jsonb; v_qty numeric; v_unit numeric;
begin
  if p_visit_id is null then raise exception 'visit_id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line required';
  end if;
  if exists (select 1 from public.tl_invoices where visit_id = p_visit_id) then
    raise exception 'invoice_exists';
  end if;

  -- Recompute the money on the server; never trust a client total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unit_price')::numeric, 0);
    if v_qty  <= 0 then raise exception 'line qty must be > 0'; end if;
    if v_unit <  0 then raise exception 'line unit_price must be >= 0'; end if;
    v_subtotal := v_subtotal + (v_qty * v_unit);
  end loop;

  v_discount := least(greatest(coalesce(p_discount,0), 0), v_subtotal);
  v_total    := v_subtotal - v_discount;

  insert into public.tl_invoices (
    visit_id, order_id, customer_name, customer_phone,
    subtotal, discount_amount, total_amount, payment_method_id,
    payment_status, notes, created_by
  ) values (
    p_visit_id, p_order_id, p_customer_name, p_customer_phone,
    v_subtotal, v_discount, v_total, p_payment_method_id,
    case when p_mark_paid or v_total = 0 then 'paid' else 'unpaid' end,
    p_notes, p_created_by
  ) returning tl_invoices.id into v_id;

  insert into public.tl_invoice_lines (tl_invoice_id, name, qty, unit_price, total)
  select v_id, (l->>'name'),
         (l->>'qty')::numeric, (l->>'unit_price')::numeric,
         (l->>'qty')::numeric * (l->>'unit_price')::numeric
  from jsonb_array_elements(p_lines) l;

  -- NEW: when marked paid (cash / non-link), record the actual payment so
  -- paid_amount + the payment history are correct. The sync trigger sets
  -- tl_invoices.paid_amount + payment_status from this row. (Zero-total invoices
  -- carry no payment row; their 'paid' status is set on the insert above.)
  if p_mark_paid and v_total > 0 then
    insert into public.tl_invoice_payments (
      tl_invoice_id, amount, payment_method_id, method_slug,
      registered_by, registered_by_name, notes
    ) values (
      v_id, v_total, p_payment_method_id,
      (select pm.slug from public.payment_methods pm where pm.id = p_payment_method_id),
      p_created_by,
      (select ud.full_name from public.user_data ud where ud.id = p_created_by),
      p_notes
    );
  end if;

  return query select v_id, ti.invoice_number from public.tl_invoices ti where ti.id = v_id;
end;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
