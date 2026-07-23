-- Credit Note Resolution + Payment Redesign schema changes

-- 1. Add delivery type and return link to sale_deliveries
ALTER TABLE sale_deliveries
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS return_id uuid REFERENCES returns(id) ON DELETE SET NULL;

ALTER TABLE sale_deliveries
  ADD CONSTRAINT sale_deliveries_type_check CHECK (type IN ('standard', 'replacement'));

-- 2. Add resolution tracking to credit_notes
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS resolution_type text;

ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_resolution_type_check
    CHECK (resolution_type IN ('refund', 'replacement', 'store_credit'));

-- 3. Create the missing increment_credit_balance RPC
CREATE OR REPLACE FUNCTION increment_credit_balance(p_customer_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE customers
  SET credit_balance = COALESCE(credit_balance, 0) + p_amount,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;
