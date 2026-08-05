-- Phase 1 of drop-compat-views: drop 6 dead functions belonging to disabled
-- modules (Services, Contracts). They still reference the compat view
-- `profiles` but have no callers under src/ — safe to remove wholesale.
BEGIN;

DROP FUNCTION IF EXISTS public.approve_service_change(uuid)                    CASCADE;
DROP FUNCTION IF EXISTS public.reject_service_change(uuid, text)               CASCADE;
DROP FUNCTION IF EXISTS public.submit_service_change(jsonb)                    CASCADE;
DROP FUNCTION IF EXISTS public.update_pending_service_change(uuid, jsonb)      CASCADE;
DROP FUNCTION IF EXISTS public.withdraw_service_change(uuid)                   CASCADE;
DROP FUNCTION IF EXISTS public.is_contract_visible(uuid)                       CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
