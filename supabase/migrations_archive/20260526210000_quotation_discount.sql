-- Add discount columns to quotations table
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS discount_type  TEXT NOT NULL DEFAULT 'flat'
    CHECK (discount_type IN ('flat', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Drop and recreate save_quotation with discount parameters
DROP FUNCTION IF EXISTS public.save_quotation(text, uuid, text, text, numeric, text, date, timestamptz, jsonb);

CREATE FUNCTION public.save_quotation(
  p_quotation_id        text,
  p_service_customer_id uuid,
  p_division            text,
  p_status              text,
  p_total_amount        numeric,
  p_notes               text,
  p_expiry_date         date,
  p_sent_date           timestamptz,
  p_line_items          jsonb,
  p_discount_type       text DEFAULT 'flat',
  p_discount_value      numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::quotation_status,
    p_total_amount,
    NULLIF(p_notes, ''),
    CURRENT_DATE,
    p_expiry_date,
    p_sent_date,
    COALESCE(p_discount_type, 'flat'),
    COALESCE(p_discount_value, 0)
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    service_customer_id = EXCLUDED.service_customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  DELETE FROM public.quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.quotation_line_items (
      quotation_id, service_id, name, path, qty, price, duration
    ) VALUES (
      v_uuid,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      NULLIF(v_item->>'duration', '')::int
    );
  END LOOP;

  RETURN v_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_quotation(text, uuid, text, text, numeric, text, date, timestamptz, jsonb, text, numeric) TO authenticated;
