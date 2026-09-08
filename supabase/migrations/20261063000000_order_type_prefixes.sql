-- Order-number prefixes reflect the order's nature: Emergency E/, Backwork BW/,
-- Follow-up FW/ (was FU/). Two new global sequences + generators mirror
-- next_order_id; next_follow_up_order_id changes only its prefix string.
BEGIN;

-- ── Emergency: own global sequence, seeded from any existing E/ order ─────────
DO $$
DECLARE v_start bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(order_id, '(\d+)$'))[1]::bigint), 0) + 1
    INTO v_start FROM public.orders WHERE order_id ~ '^E/';
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.emergency_order_id_seq START %s', GREATEST(v_start, 1));
END $$;

-- ── Backwork: own global sequence, seeded from any existing BW/ order ─────────
DO $$
DECLARE v_start bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(order_id, '(\d+)$'))[1]::bigint), 0) + 1
    INTO v_start FROM public.orders WHERE order_id ~ '^BW/';
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.backwork_order_id_seq START %s', GREATEST(v_start, 1));
END $$;

CREATE OR REPLACE FUNCTION public.next_emergency_order_id()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr  INT    := EXTRACT(YEAR  FROM now())::INT;
  mo  INT    := EXTRACT(MONTH FROM now())::INT;
  seq BIGINT := nextval('public.emergency_order_id_seq');
BEGIN
  RETURN 'E/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_backwork_order_id()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr  INT    := EXTRACT(YEAR  FROM now())::INT;
  mo  INT    := EXTRACT(MONTH FROM now())::INT;
  seq BIGINT := nextval('public.backwork_order_id_seq');
BEGIN
  RETURN 'BW/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$;

-- ── Follow-up: FU/ → FW/ (keep the existing monthly sequence; numbers continue) ─
CREATE OR REPLACE FUNCTION public.next_follow_up_order_id()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  yr       INT  := EXTRACT(YEAR  FROM now())::INT;
  mo       INT  := EXTRACT(MONTH FROM now())::INT;
  seq      INT;
  seq_name TEXT := 'follow_up_order_seq_' || yr || '_' || LPAD(mo::TEXT, 2, '0');
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FW/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
