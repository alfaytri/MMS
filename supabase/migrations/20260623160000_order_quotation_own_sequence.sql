-- Give order quotations their own counter so the Q-number sequence is
-- independent of the contract-quotation flow (which uses the legacy shared
-- `quotation_number_seq` for CTR-Q-… ids).
--
-- Order quotations now start fresh from 0001 — they are NOT a continuation
-- of the order id sequence (orders use N/YYYY/MM/NNNN, quotations use
-- Q/YYYY/MM/NNNN with separate counters).

CREATE SEQUENCE IF NOT EXISTS public.order_quotation_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Replace generate_order_quotation_id to pull from the new sequence.
CREATE OR REPLACE FUNCTION public.generate_order_quotation_id() RETURNS text
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_num   INT  := nextval('order_quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;
