-- Fix custom_access_token_hook after the unified-roles migration.
--
-- The old hook read approval_role_assignments (now dropped) and compared the
-- role column to lowercase enum values. The unified system stores approval
-- roles as user_custom_roles rows joined to custom_roles where
-- is_approval_slot = true, and the role names are human-readable
-- (e.g. 'Owner', 'Accountant').
--
-- This migration rewrites the hook to use the new join, restoring auth
-- token issuance. The output user_type values are kept lowercase for
-- backward compatibility with any downstream consumer reading the JWT
-- claim.

BEGIN;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN user_custom_roles ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles      cr  ON cr.id          = ucr.role_id
                                  AND cr.is_approval_slot = true
                                  AND cr.deleted_at IS NULL
  LEFT JOIN user_divisions    ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

COMMIT;
