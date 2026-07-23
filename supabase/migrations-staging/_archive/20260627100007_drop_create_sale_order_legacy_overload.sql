-- Drop the 16-arg create_sale_order overload that pre-existed in the baseline.
--
-- 20260627100001_create_sale_order_approval_gates.sql replaced the 17-arg
-- variant (the one with p_division_id) but left the 16-arg variant from the
-- baseline (20240101000000_baseline_schema.sql) intact. The client calls
-- create_sale_order with 17 named args (p_division_id always passed, NULL
-- when not chosen), and PostgREST cannot pick between the two overloads,
-- so order confirmation fails with:
--
--   PGRST203 "Could not choose the best candidate function between:
--   public.create_sale_order(...16 args...),
--   public.create_sale_order(...17 args...)"
--
-- Drop the legacy 16-arg overload. The 17-arg overload remains and is the
-- only signature the client ever wants.
BEGIN;

DROP FUNCTION IF EXISTS public.create_sale_order(
  uuid, text, text, numeric, date, text, text, jsonb,
  text, text, text, integer, numeric, text, text, jsonb
);

COMMIT;
