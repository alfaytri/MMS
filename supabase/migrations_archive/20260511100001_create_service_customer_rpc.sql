-- supabase/migrations/20260511100001_create_service_customer_rpc.sql
-- RPC for creating/finding a service customer by phone number.
-- Returns existing customer if phone already registered.

CREATE OR REPLACE FUNCTION public.create_service_customer(
  p_name       TEXT,
  p_phone      TEXT,
  p_link_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_phone_id    UUID;
BEGIN
  -- Check if phone already exists in service_customer_phones
  SELECT scp.customer_id, scp.id
    INTO v_customer_id, v_phone_id
    FROM public.service_customer_phones scp
   WHERE scp.phone = p_phone
   LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'customer_id',   v_customer_id,
      'phone_id',      v_phone_id,
      'customer_name', (SELECT name FROM public.service_customers WHERE id = v_customer_id)
    );
  END IF;

  -- Create new service_customer row
  INSERT INTO public.service_customers (name)
  VALUES (p_name)
  RETURNING id INTO v_customer_id;

  -- Insert primary phone
  INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
  VALUES (v_customer_id, p_phone, 'mobile', true)
  RETURNING id INTO v_phone_id;

  -- Insert optional second phone (not primary — partial index allows only one primary)
  IF p_link_phone IS NOT NULL AND p_link_phone <> '' AND p_link_phone <> p_phone THEN
    INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
    VALUES (v_customer_id, p_link_phone, 'mobile', false);
  END IF;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_service_customer TO authenticated;
