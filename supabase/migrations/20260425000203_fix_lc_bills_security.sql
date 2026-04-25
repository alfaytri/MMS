BEGIN;

-- Replace storage helper with security-hardened version
CREATE OR REPLACE FUNCTION storage_lc_bills_write_allowed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    p.is_active = true
    AND    cr.deleted_at IS NULL
    AND    (
      cr.is_system = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$$;

-- Prevent direct invocation by anon/public; only called by RLS engine
REVOKE ALL ON FUNCTION storage_lc_bills_write_allowed() FROM PUBLIC;

COMMIT;
