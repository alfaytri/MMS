-- Atomic multi-phone save for a customer.
--
-- Semantics:
--   * p_phones is a JSON array of {phone, is_primary}. Empty array is
--     an error (a customer must have at least one phone).
--   * Exactly one entry must have is_primary=true.
--   * If any phone in the list is currently owned by a DIFFERENT
--     customer, the call fails with 23505 so the UI can surface
--     "already assigned to another customer".
--   * Phones the same customer already owns keep their id + created_at;
--     only their is_primary flag is updated.
--   * Phones on this customer that are NOT in the list are removed.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_customer_phones(
  p_customer_id uuid,
  p_phones      jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phones        text[];
  v_primary_count int;
  v_conflict_row  record;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF p_phones IS NULL OR jsonb_typeof(p_phones) <> 'array' OR jsonb_array_length(p_phones) = 0 THEN
    RAISE EXCEPTION 'At least one phone is required';
  END IF;

  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_phones) elem
  WHERE (elem->>'is_primary')::boolean IS TRUE;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one phone must be marked primary (got %)', v_primary_count;
  END IF;

  SELECT array_agg(elem->>'phone') INTO v_phones
  FROM jsonb_array_elements(p_phones) elem;

  -- Cross-customer collision check.
  SELECT cp.phone, cp.customer_id
    INTO v_conflict_row
    FROM public.customer_phones cp
   WHERE cp.phone = ANY(v_phones)
     AND cp.customer_id <> p_customer_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Phone number % is already assigned to another customer', v_conflict_row.phone
      USING ERRCODE = '23505';
  END IF;

  -- Remove rows on this customer that aren't in the new list.
  DELETE FROM public.customer_phones
   WHERE customer_id = p_customer_id
     AND phone <> ALL(v_phones);

  -- Upsert. ON CONFLICT (phone) is safe here — the collision check above
  -- already established that every phone in the list either doesn't
  -- exist yet or already belongs to this customer.
  INSERT INTO public.customer_phones (customer_id, phone, is_primary)
  SELECT p_customer_id,
         elem->>'phone',
         (elem->>'is_primary')::boolean
    FROM jsonb_array_elements(p_phones) elem
   ON CONFLICT (phone) DO UPDATE
     SET is_primary = EXCLUDED.is_primary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_customer_phones(uuid, jsonb) TO authenticated;

COMMIT;
