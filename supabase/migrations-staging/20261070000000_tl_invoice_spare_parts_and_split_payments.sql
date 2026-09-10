-- Order-invoice enhancement (Part A): spare parts + split cash/POS payments.
--
-- The team leader enters Spare Parts / Discount / Paid Cash / Paid POS; the
-- server authors the money (never trusts a client total):
--   services_subtotal = Σ(line qty × unit_price)
--   gross             = services_subtotal + spare_parts
--   discount          = clamp(p_discount, 0, gross)
--   NET (total_amount)= gross − discount
--   paid              = paid_cash + paid_pos            (must be ≤ NET)
--   pending           = NET − paid                       (derived; = tl_invoices balance)
-- Paid Cash / Paid POS are written as tl_invoice_payments rows against the
-- fixed 'cash' / 'pos' payment_methods; the existing tl_invoice_payments_sync
-- trigger derives tl_invoices.paid_amount + payment_status (unpaid/partial/paid).
-- The old single p_payment_method_id / p_mark_paid params are removed.
BEGIN;

-- 1. Spare-parts column: a lump external purchase passed through to the customer
--    (parts bought for the job that aren't in inventory). Not a stock movement.
ALTER TABLE public.tl_invoices
  ADD COLUMN IF NOT EXISTS spare_parts_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tl_invoices.spare_parts_amount IS
  'Lump pass-through cost of spare parts bought externally for this job (added on top of the service subtotal). Not linked to inventory.';

-- 2. Ensure the POS method exists (some environments seeded only Cash). The
--    two invoice payment boxes attach to these two fixed slugs.
INSERT INTO public.payment_methods (name, slug, is_active, sort_order)
VALUES ('POS', 'pos', true, 2)
ON CONFLICT (slug) DO NOTHING;

-- 3. Drop every existing overload of create_tl_invoice by name (the new arg
--    list differs from the old one, so CREATE OR REPLACE would leave a stale
--    second overload → ambiguous PostgREST calls). Robust against schema drift.
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'create_tl_invoice' AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $drop$;

-- 4. New create_tl_invoice.
CREATE FUNCTION public.create_tl_invoice(
  p_visit_id       uuid,
  p_order_id       text,
  p_customer_name  text,
  p_customer_phone text,
  p_lines          jsonb,
  p_spare_parts    numeric DEFAULT 0,
  p_discount       numeric DEFAULT 0,
  p_paid_cash      numeric DEFAULT 0,
  p_paid_pos       numeric DEFAULT 0,
  p_notes          text    DEFAULT NULL,
  p_created_by     uuid    DEFAULT NULL
)
 RETURNS TABLE(id uuid, invoice_number text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_services    numeric := 0;
  v_spare       numeric;
  v_gross       numeric;
  v_discount    numeric;
  v_net         numeric;
  v_cash        numeric;
  v_pos         numeric;
  v_paid        numeric;
  v_id          uuid;
  v_line        jsonb;
  v_qty         numeric;
  v_unit        numeric;
  v_cash_method uuid;
  v_pos_method  uuid;
  v_actor_name  text;
begin
  if p_visit_id is null then raise exception 'visit_id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line required';
  end if;
  if exists (select 1 from public.tl_invoices where visit_id = p_visit_id) then
    raise exception 'invoice_exists';
  end if;

  -- Recompute the service money on the server; never trust a client total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unit_price')::numeric, 0);
    if v_qty  <= 0 then raise exception 'line qty must be > 0'; end if;
    if v_unit <  0 then raise exception 'line unit_price must be >= 0'; end if;
    v_services := v_services + (v_qty * v_unit);
  end loop;

  v_spare    := greatest(coalesce(p_spare_parts, 0), 0);
  v_gross    := v_services + v_spare;
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net      := v_gross - v_discount;

  v_cash := greatest(coalesce(p_paid_cash, 0), 0);
  v_pos  := greatest(coalesce(p_paid_pos, 0), 0);
  v_paid := v_cash + v_pos;
  if v_paid - v_net > 0.005 then
    raise exception 'paid_exceeds_net';   -- cash + POS cannot exceed the net total
  end if;

  -- Resolve the two fixed methods (attach to what already exists).
  select pm.id into v_cash_method from public.payment_methods pm where pm.slug = 'cash' limit 1;
  select pm.id into v_pos_method  from public.payment_methods pm where pm.slug = 'pos'  limit 1;
  if v_cash > 0 and v_cash_method is null then raise exception 'cash payment method missing'; end if;
  if v_pos  > 0 and v_pos_method  is null then raise exception 'pos payment method missing';  end if;

  select ud.full_name into v_actor_name from public.user_data ud where ud.id = p_created_by;

  insert into public.tl_invoices (
    visit_id, order_id, customer_name, customer_phone,
    subtotal, spare_parts_amount, discount_amount, total_amount, payment_method_id,
    payment_status, notes, created_by
  ) values (
    p_visit_id, p_order_id, p_customer_name, p_customer_phone,
    v_services, v_spare, v_discount, v_net,
    case
      when v_cash > 0 and v_pos = 0 then v_cash_method   -- single method → record it
      when v_pos  > 0 and v_cash = 0 then v_pos_method
      else null                                          -- split or unpaid → payments log is the record
    end,
    case
      when v_net = 0 or v_paid >= v_net then 'paid'
      when v_paid > 0                    then 'partial'
      else 'unpaid'
    end,
    p_notes, p_created_by
  ) returning tl_invoices.id into v_id;

  insert into public.tl_invoice_lines (tl_invoice_id, name, qty, unit_price, total)
  select v_id, (l->>'name'),
         (l->>'qty')::numeric, (l->>'unit_price')::numeric,
         (l->>'qty')::numeric * (l->>'unit_price')::numeric
  from jsonb_array_elements(p_lines) l;

  -- Record the split payments; the sync trigger sets paid_amount + status.
  if v_cash > 0 then
    insert into public.tl_invoice_payments (
      tl_invoice_id, amount, payment_method_id, method_slug,
      registered_by, registered_by_name, notes
    ) values (v_id, v_cash, v_cash_method, 'cash', p_created_by, v_actor_name, p_notes);
  end if;
  if v_pos > 0 then
    insert into public.tl_invoice_payments (
      tl_invoice_id, amount, payment_method_id, method_slug,
      registered_by, registered_by_name, notes
    ) values (v_id, v_pos, v_pos_method, 'pos', p_created_by, v_actor_name, p_notes);
  end if;

  return query select v_id, ti.invoice_number from public.tl_invoices ti where ti.id = v_id;
end;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
