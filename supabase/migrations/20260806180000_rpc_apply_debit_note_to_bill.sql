-- Closes H6: PO return flow never reduces the supplier bill's outstanding.
--
-- Before: `useResolveDebitNoteSupplierCredit` only flipped a resolution
-- flag on the DN. No payment row ever landed against the bill, so AP
-- aging kept the pre-return balance forever. `debit_notes.bill_id`
-- existed but was always NULL — no writer, no path.
--
-- After: new SECURITY DEFINER RPC that FOR-UPDATE-locks the DN,
-- resolves the bill from DN.purchase_order_id (there's a UNIQUE
-- constraint on bills.purchase_order_id, so at most one bill per PO),
-- enforces DN.remaining_amount + bill.outstanding caps, inserts an
-- offsetting outgoing payment (method='debit_note'), calls
-- allocate_payment_to_bill to bump the bill's paid_amount +
-- payment_status, and decrements DN.remaining_amount.
--
-- Also adds:
--   1. debit_notes.remaining_amount column (backfilled from total_amount)
--   2. 'debit_note' payment_methods slug (symmetric with the 'credit_note'
--      slug added in 20260806132000)

BEGIN;

-- ── 1a. payments.debit_note_id (proper FK, mirrors credit_note_id) ────

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS debit_note_id uuid REFERENCES public.debit_notes(id);

CREATE INDEX IF NOT EXISTS payments_debit_note_id_idx
  ON public.payments(debit_note_id)
  WHERE debit_note_id IS NOT NULL;

COMMENT ON COLUMN public.payments.debit_note_id IS
'FK to debit_notes(id). Populated on the payment row that
rpc_apply_debit_note_to_bill emits when offsetting a bill with a DN.
credit_note_id stays for sale-side redemptions.';

-- ── 1b. debit_notes.remaining_amount ────────────────────────────────────

ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS remaining_amount numeric;

-- Backfill: remaining = total_amount (no prior DN-offset payments exist
-- until this RPC ships — the old client path never wrote them).
UPDATE public.debit_notes dn
   SET remaining_amount = COALESCE(dn.total_amount, 0)
 WHERE dn.remaining_amount IS NULL;

ALTER TABLE public.debit_notes
  ADD CONSTRAINT debit_notes_remaining_amount_non_negative
  CHECK (remaining_amount IS NULL OR remaining_amount >= 0)
  NOT VALID;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.debit_notes VALIDATE CONSTRAINT debit_notes_remaining_amount_non_negative;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'debit_notes_remaining_amount_non_negative: legacy over-applied rows exist. Constraint stays NOT VALID until repaired.';
  END;
END $$;

COMMENT ON COLUMN public.debit_notes.remaining_amount IS
'Unspent balance: total_amount - SUM of payment allocations against this DN.
Maintained by rpc_apply_debit_note_to_bill.';

-- ── 2. debit_note payment method slug ──────────────────────────────────

INSERT INTO public.payment_methods (slug, name, is_active)
VALUES ('debit_note', 'Debit Note', true)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. rpc_apply_debit_note_to_bill ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_apply_debit_note_to_bill(
  p_debit_note_id uuid,
  p_amount        numeric DEFAULT NULL   -- NULL = apply max possible
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dn             debit_notes%ROWTYPE;
  v_bill           bills%ROWTYPE;
  v_bill_paid      numeric;
  v_bill_outstand  numeric;
  v_amount         numeric;
  v_dn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
BEGIN
  IF p_debit_note_id IS NULL THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: p_debit_note_id is required';
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount must be > 0 (got %)', p_amount;
  END IF;

  -- Lock the DN
  SELECT * INTO v_dn
    FROM debit_notes
   WHERE id = p_debit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: debit note % not found', p_debit_note_id;
  END IF;
  IF v_dn.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no purchase_order_id (cannot derive bill)', p_debit_note_id;
  END IF;

  v_dn_remaining := COALESCE(v_dn.remaining_amount, v_dn.total_amount);
  IF v_dn_remaining <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no remaining balance (%)',
      v_dn.debit_note_id, v_dn_remaining;
  END IF;

  -- Resolve bill via PO (UNIQUE per PO enforced by schema)
  SELECT * INTO v_bill
    FROM bills
   WHERE purchase_order_id = v_dn.purchase_order_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: no bill exists for PO % — issue the bill first',
      v_dn.purchase_order_id;
  END IF;
  IF v_bill.total_amount IS NULL OR v_bill.total_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % has an invalid total_amount %',
      v_bill.id, v_bill.total_amount;
  END IF;

  v_bill_paid := COALESCE(v_bill.paid_amount, 0);
  v_bill_outstand := v_bill.total_amount - v_bill_paid;
  IF v_bill_outstand <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % is already fully paid', v_bill.bill_number;
  END IF;

  v_amount := COALESCE(p_amount, LEAST(v_dn_remaining, v_bill_outstand));
  IF v_amount > v_dn_remaining THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds DN remaining %', v_amount, v_dn_remaining;
  END IF;
  IF v_amount > v_bill_outstand THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds bill outstanding %', v_amount, v_bill_outstand;
  END IF;

  -- Generate next PAY-XXXXX under RPC lock (same pattern as
  -- rpc_settle_installment).
  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, bill_id, debit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, direction, status,
    notes
  ) VALUES (
    v_payment_id, v_bill.id, p_debit_note_id,
    v_amount, 'QAR', 1, v_amount,
    'debit_note', CURRENT_DATE, 'outgoing', 'completed',
    'Debit note ' || v_dn.debit_note_id || ' applied to bill ' || v_bill.bill_number
  )
  RETURNING id INTO v_payment_uuid;

  -- Let the existing allocator flip payment_status + paid_amount
  PERFORM public.allocate_payment_to_bill(v_payment_uuid, v_bill.id, v_amount);

  -- Decrement DN remaining
  UPDATE debit_notes
     SET remaining_amount = v_dn_remaining - v_amount,
         bill_id          = v_bill.id,
         updated_at       = now()
   WHERE id = p_debit_note_id;

  RETURN v_payment_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_apply_debit_note_to_bill(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_apply_debit_note_to_bill(uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.rpc_apply_debit_note_to_bill(uuid, numeric) IS
'Apply a debit note to its PO''s supplier bill. Locks the DN + bill,
derives the bill from DN.purchase_order_id (UNIQUE per PO), caps
amount at min(DN.remaining, bill.outstanding), inserts an
outgoing payment (method=debit_note) that reduces bill.paid_amount
via allocate_payment_to_bill, and decrements DN.remaining_amount.
p_amount NULL means apply the maximum possible.';

COMMIT;
