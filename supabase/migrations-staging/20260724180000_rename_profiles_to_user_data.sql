-- Rename profiles → user_data. "profiles" clashed with the auth.users
-- concept and read as UI cruft; "user_data" says exactly what it holds.
--
-- ALTER TABLE RENAME automatically follows for:
--   * primary key, all indexes
--   * every FK constraint that REFERENCES profiles(id) — the pg_constraint
--     row keeps its name (e.g. user_custom_roles_profile_id_fkey) but now
--     points at user_data
--   * all RLS policies attached to the table
--   * triggers on the table (bootstrap_first_user_trg included)
--
-- Function bodies that reference `profiles` in raw SQL are text and DO NOT
-- auto-follow. We create a backward-compat updatable view named `profiles`
-- so every existing plpgsql function (~30 of them across the migration
-- history) keeps working without a rewrite. New code should read/write
-- user_data directly; the compat view can be dropped once all function
-- bodies are audited.

BEGIN;

ALTER TABLE public.profiles RENAME TO user_data;

CREATE OR REPLACE VIEW public.profiles AS
SELECT * FROM public.user_data;

COMMENT ON VIEW public.profiles IS
  'DEPRECATED — compatibility view for legacy RPCs and older frontend code. Use public.user_data directly for new code.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
