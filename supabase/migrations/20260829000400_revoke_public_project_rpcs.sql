-- VWh Projects — final-review nit: lock down the Phase-1 management RPCs.
-- create_project / add_project_discipline / close_project were created (in
-- 20260824001000) with Postgres's default PUBLIC EXECUTE grant still in place
-- (the 2026-08-05 ALTER DEFAULT PRIVILEGES does not cover post-hoc functions),
-- so they were anon-executable. They ARE body-guarded (_auth_user_has_permission
-- raises 42501 for anon → no unauthorized mutation), but this matches the class
-- the money-path review fixed with an explicit REVOKE. Bring them in line with
-- the milestone/report RPCs + the money-path convention.
REVOKE EXECUTE ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_project_discipline(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_project_discipline(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.add_project_discipline(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.close_project(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.close_project(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.close_project(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
