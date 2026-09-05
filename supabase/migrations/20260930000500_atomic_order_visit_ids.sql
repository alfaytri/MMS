-- G③ — Atomic order/site-visit human IDs (kill the client-side read-max+1 race).
--
-- useCreateOrder generated `N/YYYY/MM/NNNN` (orders) and `V/YYYY/MM/NNNN`
-- (site_visits) on the CLIENT by reading the latest row and incrementing. Two
-- agents booking at the same instant read the same last row → same next number →
-- a duplicate that the UNIQUE index (orders_order_id_key / site_visits_visit_id_key)
-- rejects, losing one booking. NNNN is a GLOBAL running counter (not monthly
-- reset), with the prefix showing the creation year/month.
--
-- Fix: mirror the existing next_follow_up_order_id() pattern — a server-side
-- SECURITY DEFINER generator backed by a real sequence, so every call gets a
-- distinct number atomically. One global sequence each, seeded from the current
-- max so numbering continues without collision or going backwards.
BEGIN;

-- Seed each sequence from the highest existing trailing number for its prefix.
DO $$
DECLARE v_start bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(order_id, '(\d+)$'))[1]::bigint), 0) + 1
    INTO v_start
    FROM public.orders WHERE order_id ~ '^N/';
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.order_id_seq START %s', GREATEST(v_start, 1));
END $$;

DO $$
DECLARE v_start bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(visit_id, '(\d+)$'))[1]::bigint), 0) + 1
    INTO v_start
    FROM public.site_visits WHERE visit_id ~ '^V/';
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.visit_id_seq START %s', GREATEST(v_start, 1));
END $$;

CREATE OR REPLACE FUNCTION public.next_order_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr  INT    := EXTRACT(YEAR  FROM now())::INT;
  mo  INT    := EXTRACT(MONTH FROM now())::INT;
  seq BIGINT := nextval('public.order_id_seq');
BEGIN
  RETURN 'N/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_visit_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr  INT    := EXTRACT(YEAR  FROM now())::INT;
  mo  INT    := EXTRACT(MONTH FROM now())::INT;
  seq BIGINT := nextval('public.visit_id_seq');
BEGIN
  RETURN 'V/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
