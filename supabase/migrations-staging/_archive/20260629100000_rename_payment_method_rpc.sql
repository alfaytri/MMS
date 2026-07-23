-- Atomically rename a payment method (name + slug) and cascade
-- the slug change into every credit_groups.payment_methods[] array.
CREATE OR REPLACE FUNCTION rename_payment_method(
  p_id       UUID,
  p_new_name TEXT,
  p_new_slug TEXT
) RETURNS VOID AS $$
DECLARE
  v_old_slug TEXT;
BEGIN
  SELECT slug INTO v_old_slug FROM payment_methods WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment method % not found', p_id;
  END IF;

  UPDATE payment_methods
     SET name = p_new_name, slug = p_new_slug
   WHERE id = p_id;

  IF v_old_slug IS DISTINCT FROM p_new_slug THEN
    UPDATE credit_groups
       SET payment_methods = array_replace(payment_methods, v_old_slug, p_new_slug)
     WHERE v_old_slug = ANY(payment_methods);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
