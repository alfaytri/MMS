-- Closes H2: useCreateBill was non-atomic and allowed discount > subtotal
-- to produce a negative total_amount. allocate_payment_to_bill compared
-- paid ≥ total, so any positive payment flipped a negative-total bill to
-- 'paid'. Also bills + lines were three separate INSERTs — line failure
-- left a header with no lines.
--
-- Fix bundle:
--   1. rpc_create_purchase_bill(p_payload jsonb) — validates
--      0 ≤ discount ≤ subtotal, subtotal computed server-side, inserts
--      bill + lines atomically. Returns the new bill row.
--   2. bills.total_amount_non_negative CHECK — belt-and-braces so no other
--      writer can produce a negative total. Added NOT VALID first so
--      legacy rows are ignored, then VALIDATED so future writes enforce.
--   3. allocate_payment_to_bill short-circuits if bill.total_amount < 0
--      (defense-in-depth against any pre-fix rows still in the DB).

BEGIN;

-- ── 1. rpc_create_purchase_bill ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_bill(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id     uuid;
  v_po_row      purchase_orders%ROWTYPE;
  v_bill_row    bills%ROWTYPE;
  v_bill_number text;
  v_subtotal    numeric := 0;
  v_discount    numeric := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_total       numeric;
  v_line        jsonb;
  v_lines       jsonb := COALESCE(p_payload->'line_items', '[]'::jsonb);
BEGIN
  IF (p_payload->>'purchase_order_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: purchase_order_id is required';
  END IF;
  IF (p_payload->>'supplier_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: supplier_id is required';
  END IF;
  IF (p_payload->>'due_date') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: due_date is required';
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount_amount cannot be negative (got %)', v_discount;
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: at least one line item is required';
  END IF;

  -- Subtotal is computed server-side from lines — client is not trusted.
  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    IF COALESCE((v_line->>'total')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'rpc_create_purchase_bill: line total cannot be negative (got %)', v_line->>'total';
    END IF;
    v_subtotal := v_subtotal + COALESCE((v_line->>'total')::numeric, 0);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount % exceeds subtotal % — bill total would be negative',
      v_discount, v_subtotal;
  END IF;
  v_total := v_subtotal - v_discount;

  -- Fetch PO details (bill_number pattern + division inheritance)
  SELECT * INTO v_po_row FROM purchase_orders WHERE id = (p_payload->>'purchase_order_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: PO % not found', p_payload->>'purchase_order_id';
  END IF;
  v_bill_number := v_po_row.po_number || '-B';

  INSERT INTO bills (
    bill_number, source_id, source, supplier_id, purchase_order_id,
    receival_id, division_id, payment_status, needs_refresh,
    source_label, subtotal, discount_amount, discount_label,
    total_amount, issued_date, due_date, notes
  ) VALUES (
    v_bill_number,
    v_po_row.po_number,   -- source_id is TEXT — mirrors legacy hook behavior
    'order',
    (p_payload->>'supplier_id')::uuid,
    v_po_row.id,
    NULLIF(p_payload->>'receival_id', '')::uuid,
    v_po_row.division_id,
    'unpaid',
    false,
    p_payload->>'source_label',
    v_subtotal, v_discount, p_payload->>'discount_label',
    v_total,
    CURRENT_DATE,
    (p_payload->>'due_date')::date,
    NULLIF(p_payload->>'notes', '')
  )
  RETURNING id INTO v_bill_id;

  -- Lines
  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    INSERT INTO bill_line_items (
      bill_id, description, qty, unit_price, total,
      match_status, match_note
    ) VALUES (
      v_bill_id,
      v_line->>'description',
      COALESCE((v_line->>'qty')::int, 1),
      COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE((v_line->>'total')::numeric, 0),
      NULLIF(v_line->>'match_status', ''),
      NULLIF(v_line->>'match_note', '')
    );
  END LOOP;

  SELECT * INTO v_bill_row FROM bills WHERE id = v_bill_id;
  RETURN to_jsonb(v_bill_row);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_purchase_bill(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_purchase_bill(jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_purchase_bill(jsonb) IS
'Create a supplier bill atomically. Server-side subtotal from lines,
enforces 0 ≤ discount ≤ subtotal. Bill number is {po_number}-B (UNIQUE
in DB enforces one bill per PO). Inserts bill + lines in one transaction.';

-- ── 2. CHECK bills.total_amount >= 0 ────────────────────────────────────

-- NOT VALID first so any pre-fix negative-total legacy rows do not block
-- the migration; then VALIDATE, which will fail loudly if bad data exists
-- and force a manual cleanup. Skip the VALIDATE if legacy data present
-- (comment lists the alternative repair path).
ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_total_amount_non_negative;
ALTER TABLE public.bills
  ADD  CONSTRAINT bills_total_amount_non_negative
  CHECK (total_amount IS NULL OR total_amount >= 0)
  NOT VALID;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.bills VALIDATE CONSTRAINT bills_total_amount_non_negative;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'bills_total_amount_non_negative: legacy rows with negative totals exist. '
      'Constraint remains NOT VALID; run the repair query in ops docs and VALIDATE later.';
  END;
END $$;

-- ── 3. allocate_payment_to_bill — short-circuit on negative totals ─────

CREATE OR REPLACE FUNCTION public.allocate_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid,
  p_amount     numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_manually_paid   BOOLEAN;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount, manually_paid INTO v_bill_total, v_manually_paid
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF v_bill_total IS NULL OR v_bill_total < 0 THEN
    RAISE EXCEPTION 'Bill % has an invalid total_amount (%) — refuse allocation. Fix the bill first.',
      p_bill_id, v_bill_total;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = CASE WHEN v_manually_paid THEN payment_status ELSE v_new_status END
   WHERE id = p_bill_id;
END;
$$;

COMMIT;
