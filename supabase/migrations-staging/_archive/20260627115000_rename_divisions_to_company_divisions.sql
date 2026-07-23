-- ─────────────────────────────────────────────────────────────────────────────
-- Rename divisions → company_divisions to make the name self-explanatory: a
-- division is owned by a company. The legacy `divisions` name is ambiguous
-- enough that newcomers often confuse it with company-wide settings.
--
-- Same staged pattern as the approval-tables rename (20260627112000):
--
--   1. ALTER TABLE RENAME (preserves every FK, index, trigger, RLS policy
--      because they're bound by OID, not table name).
--   2. CREATE VIEW with the old name pointing at the new table, marked
--      security_invoker so RLS on the underlying table still applies.
--      This keeps every PL/pgSQL function that still references the old
--      name compiling and running without an immediate rewrite.
--   3. Same treatment for user_divisions → user_company_divisions so the
--      junction table is consistent with its parent.
--
-- A follow-up migration will rewrite the ~25 dependent functions to use the
-- new names and drop the compat views.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Rename the underlying tables ─────────────────────────────────────────
ALTER TABLE public.divisions       RENAME TO company_divisions;
ALTER TABLE public.user_divisions  RENAME TO user_company_divisions;

-- ── 2. Compatibility views: old name → new table ────────────────────────────
CREATE VIEW public.divisions      WITH (security_invoker = true) AS
  SELECT * FROM public.company_divisions;

CREATE VIEW public.user_divisions WITH (security_invoker = true) AS
  SELECT * FROM public.user_company_divisions;

COMMENT ON VIEW public.divisions IS
  'Compat alias for company_divisions. Retire once every dependent PL/pgSQL function has been rewritten to use the new name.';
COMMENT ON VIEW public.user_divisions IS
  'Compat alias for user_company_divisions. Retire alongside divisions.';

-- ── 3. Grants — views need their own grants ────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.divisions               TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_divisions          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_divisions       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_company_divisions  TO authenticated, service_role;

-- ── 4. Reload PostgREST schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
