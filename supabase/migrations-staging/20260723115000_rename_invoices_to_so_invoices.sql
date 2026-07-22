-- Rename public.invoices → public.so_invoices for clear separation from
-- Telelink service invoices (tl_invoices). Sales-order invoices only.
--
-- Postgres binds VIEWS, FK CONSTRAINTS, RLS POLICIES, and TRIGGERS to the
-- table by OID, so the rename cascades automatically for those. FUNCTIONS
-- store their body as text and DON'T auto-update — this migration
-- explicitly rewrites every function whose body contains a whole-word
-- reference to `invoices` (skipping tl_invoices / customer_invoices /
-- so_invoices / any *_invoices identifier via the \m \M word boundaries).
--
-- customer_invoices was rebuilt in 20260723105000 as a text-defined view;
-- Postgres also auto-updates its parse tree on the rename, so no separate
-- rebuild here.

BEGIN;

-- 1. Rename the table itself.
ALTER TABLE public.invoices RENAME TO so_invoices;

-- 2. Rewrite every function/RPC whose body contains the whole word
--    "invoices" (not tl_invoices, customer_invoices, so_invoices, etc.).
--    Uses pg_get_functiondef to snapshot the current CREATE OR REPLACE
--    statement, regexp_replace to swap `\minvoices\M` for `so_invoices`,
--    and EXECUTE to redefine.
--
--    Word boundaries: \m matches start-of-word, \M matches end-of-word.
--    Underscore is a word character in Postgres regex, so `_invoices`
--    (customer_invoices, tl_invoices, so_invoices) is NOT matched by
--    `\minvoices\M` — safe.
DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prokind = 'f'
      AND  pg_get_functiondef(p.oid) ~ '\minvoices\M'
  LOOP
    new_def := regexp_replace(r.def, '\minvoices\M', 'so_invoices', 'g');
    IF new_def <> r.def THEN
      EXECUTE new_def;
      RAISE NOTICE 'Rewrote function: %', r.proname;
    END IF;
  END LOOP;
END $$;

-- 3. Sanity: no function should still reference the bare `\minvoices\M` word.
DO $$
DECLARE
  v_stragglers INT;
BEGIN
  SELECT COUNT(*) INTO v_stragglers
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prokind = 'f'
    AND  pg_get_functiondef(p.oid) ~ '\minvoices\M';

  IF v_stragglers > 0 THEN
    RAISE EXCEPTION 'Rename left % function(s) still referencing bare `invoices`', v_stragglers;
  END IF;
END $$;

COMMIT;
