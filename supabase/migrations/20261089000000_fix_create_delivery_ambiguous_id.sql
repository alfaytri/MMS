-- 20261089000000_fix_create_delivery_ambiguous_id.sql
--
-- Fix Postgres error 42702 "column reference \"id\" is ambiguous" raised on every
-- delivery creation (Create Delivery on a sale order).
--
-- 20261042000000_stamp_delivery_creator.sql injected this creator subquery into
-- BOTH create_and_confirm_delivery overloads:
--     (SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id())
-- Both overloads are RETURNS TABLE(id uuid, delivery_number text), so the OUT
-- column `id` is an in-scope PL/pgSQL variable. The unqualified `id` in that
-- WHERE clause is therefore ambiguous between the OUT variable and user_data.id.
-- PL/pgSQL only plans the subquery at call time, so CREATE succeeded but every
-- real delivery raised 42702.
--
-- Fix: alias the subquery's table (user_data AS ud) so the column reference is
-- unambiguous. Drift-proof in-place replace over the live body (handles both the
-- 5-arg and 6-arg overloads). Idempotent; asserts or aborts.
--
-- Applied live to warehouse prod (optishfnnctrhffpoywg) + staging
-- (mwvblpgbgxipvrevkeff) 2026-09-17 (dry-run + runtime-proven: OLD pattern raises
-- 42702, aliased pattern executes). Not auto-applied by git push — run manually
-- on any other environment.

DO $do$
DECLARE
  r record; v_def text; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_and_confirm_delivery'
  LOOP
    v_def := pg_get_functiondef(r.oid);

    IF position('FROM public.user_data ud WHERE ud.id = public._current_user_data_id()' in v_def) > 0 THEN
      RAISE NOTICE 'create_and_confirm_delivery oid % already fixed - skip', r.oid;
      CONTINUE;
    END IF;

    IF position('SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id()' in v_def) = 0 THEN
      RAISE NOTICE 'create_and_confirm_delivery oid % has no ambiguous creator subquery - skip', r.oid;
      CONTINUE;
    END IF;

    v_new := replace(
      v_def,
      'SELECT full_name FROM public.user_data WHERE id = public._current_user_data_id()',
      'SELECT ud.full_name FROM public.user_data ud WHERE ud.id = public._current_user_data_id()');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'ambiguous-id fix did not apply to oid %', r.oid;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'create_and_confirm_delivery oid %: ambiguous id fixed', r.oid;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
