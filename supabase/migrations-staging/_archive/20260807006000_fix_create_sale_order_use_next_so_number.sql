-- SO numbers were shipping as 'SO-00022' (5-digit sequential) instead of
-- the intended 'SO-YYYY-MM-NNN' pattern that POs use. Two problems:
--
--   1. create_sale_order (17-arg overload) inlines its own numbering
--        SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
--        v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');
--      instead of calling the existing next_so_number() helper.
--      COUNT(*)+1 is also race-prone under concurrent SO creates.
--
--   2. create_sale_order (18-arg overload) calls generate_so_id() — a
--      function that does NOT exist in the DB (dropped in some earlier
--      cleanup and never re-added). Any caller hitting this overload
--      fails with 42883.
--
-- Fix: rewrite the numbering block in both overloads to
--   v_so_number := public.next_so_number();
-- which already does the year-month prefix, advisory-locked, and is
-- consistent with next_po_number(). Uses dynamic SQL (pg_get_functiondef
-- + REPLACE + EXECUTE) so we don't have to re-paste the 11KB function
-- bodies verbatim.

DO $migrate$
DECLARE
  v_body text;
  v_oid  oid;
  v_args text;
BEGIN
  FOR v_oid, v_args IN
    SELECT p.oid, pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_sale_order'
  LOOP
    v_body := pg_get_functiondef(v_oid);

    -- Overload #1 — inline COUNT-based numbering
    v_body := REPLACE(
      v_body,
      E'SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;\n  v_so_number := ''SO-'' || LPAD(v_count::text, 5, ''0'');',
      'v_so_number := public.next_so_number();'
    );

    -- Overload #2 — calls a non-existent helper
    v_body := REPLACE(
      v_body,
      'v_so_number := generate_so_id();',
      'v_so_number := public.next_so_number();'
    );

    EXECUTE v_body;
  END LOOP;
END $migrate$;

-- Verify both overloads now call next_so_number() (fails migration if not).
DO $verify$
DECLARE
  v_bad_count int;
BEGIN
  SELECT COUNT(*) INTO v_bad_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_sale_order'
     AND (
       pg_get_functiondef(p.oid) LIKE '%SELECT COUNT(*) + 1 INTO v_count FROM sale_orders%'
       OR pg_get_functiondef(p.oid) LIKE '%generate_so_id()%'
     );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'create_sale_order still has % old numbering block(s) — migration text substitution missed', v_bad_count;
  END IF;
END $verify$;
