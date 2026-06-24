-- ────────────────────────────────────────────────────────────────────────────
-- Rename the service-quotation domain to "order_quotation" so it's clearly
-- distinct from contract quotations (a different flow that lives under
-- /contracts and has its own tables). Adds an admin-editable validity
-- duration in app_settings; previously hardcoded to 30 days in code.
--
-- Scope (renamed):
--   quotations             → order_quotations
--   quotation_line_items   → order_quotation_line_items
--   quotation_log          → order_quotation_log
--   quotation_status       → order_quotation_status (enum)
--   save_quotation         → save_order_quotation (function)
--   generate_quotation_id  → generate_order_quotation_id (function)
--
-- NOT touched (different flow / shared resources):
--   generate_quotation_number()    — contract-quotation id generator
--   quotation_number_seq           — shared sequence (used by both)
--   contracts.quotation_number     — contract column
--   permission strings 'contracts.quotations.*'
-- ────────────────────────────────────────────────────────────────────────────

-- ── Drop functions first; they reference types/tables we're about to rename ─
DROP FUNCTION IF EXISTS public.save_quotation(
  text, uuid, text, text, numeric, text, date, timestamp with time zone,
  jsonb, text, numeric
);

DROP FUNCTION IF EXISTS public.generate_quotation_id();

-- ── Rename the enum type ────────────────────────────────────────────────────
ALTER TYPE public.quotation_status RENAME TO order_quotation_status;

-- ── Rename the parent table + child tables ─────────────────────────────────
-- ALTER TABLE RENAME preserves all FKs, indexes, and primary keys
-- automatically — the references stay valid.
ALTER TABLE public.quotations           RENAME TO order_quotations;
ALTER TABLE public.quotation_line_items RENAME TO order_quotation_line_items;
ALTER TABLE public.quotation_log        RENAME TO order_quotation_log;

-- ── Rename constraints for clarity (optional but tidies psql output) ───────
ALTER TABLE public.order_quotation_line_items
  RENAME CONSTRAINT quotation_line_items_quotation_id_fkey
                 TO order_quotation_line_items_quotation_id_fkey;

ALTER TABLE public.order_quotation_log
  RENAME CONSTRAINT quotation_log_quotation_id_fkey
                 TO order_quotation_log_quotation_id_fkey;

ALTER TABLE public.order_quotations
  RENAME CONSTRAINT quotations_converted_order_id_fkey
                 TO order_quotations_converted_order_id_fkey;

ALTER TABLE public.order_quotations
  RENAME CONSTRAINT quotations_customer_id_fkey
                 TO order_quotations_customer_id_fkey;

ALTER TABLE public.order_quotations
  RENAME CONSTRAINT quotations_service_customer_id_fkey
                 TO order_quotations_service_customer_id_fkey;

-- ── Rename indexes ─────────────────────────────────────────────────────────
ALTER INDEX IF EXISTS public.idx_quotations_customer RENAME TO idx_order_quotations_customer;
ALTER INDEX IF EXISTS public.idx_quotations_status   RENAME TO idx_order_quotations_status;

-- ── Rename RLS policy ───────────────────────────────────────────────────────
ALTER POLICY "Internal users can manage quotations"
  ON public.order_quotations
  RENAME TO "Internal users can manage order_quotations";

-- ── Recreate functions against the new names ──────────────────────────────
CREATE FUNCTION public.generate_order_quotation_id() RETURNS text
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_num   INT  := nextval('quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;

CREATE FUNCTION public.save_order_quotation(
  p_quotation_id        text,
  p_service_customer_id uuid,
  p_division            text,
  p_status              text,
  p_total_amount        numeric,
  p_notes               text,
  p_expiry_date         date,
  p_sent_date           timestamp with time zone,
  p_line_items          jsonb,
  p_discount_type       text    DEFAULT 'flat',
  p_discount_value      numeric DEFAULT 0
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.order_quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::order_quotation_status,
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
    expiry_date         = COALESCE(EXCLUDED.expiry_date, order_quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  DELETE FROM public.order_quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.order_quotation_line_items (
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

-- ── Seed admin-editable validity (days) ────────────────────────────────────
-- App reads app_settings.value->>'days' at create time to set expiry_date.
INSERT INTO public.app_settings (key, value)
VALUES ('order_quotation_validity_days', '{"days": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;
