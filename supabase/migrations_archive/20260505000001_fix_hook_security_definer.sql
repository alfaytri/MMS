-- Fix custom_access_token_hook: add SECURITY DEFINER so supabase_auth_admin
-- can query public schema tables (profiles, approval_role_assignments, user_divisions).
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
      WHEN bool_or(ara.role = 'owner')            THEN 'owner'
      WHEN bool_or(ara.role = 'accountant')        THEN 'accountant'
      WHEN bool_or(ara.role = 'purchase_manager') THEN 'purchase_manager'
      WHEN bool_or(ara.role = 'employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN approval_role_assignments ara
         ON ara.profile_id = p.id AND ara.deleted_at IS NULL
  LEFT JOIN user_divisions ud ON ud.profile_id = p.id
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
