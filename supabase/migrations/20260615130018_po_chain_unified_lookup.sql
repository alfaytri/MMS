BEGIN;

-- Temporary helper to map an approval_role[] array -> text[] of custom_roles.name.
CREATE OR REPLACE FUNCTION pg_temp_map_approval_roles(arr approval_role[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY_AGG(
    CASE r::text
      WHEN 'purchase_manager'  THEN 'Purchase Manager'
      WHEN 'accountant'        THEN 'Accountant'
      WHEN 'owner'             THEN 'Owner'
      WHEN 'employee'          THEN 'Employee'
      WHEN 'warehouse_manager' THEN 'Warehouse Manager'
      WHEN 'brand_manager'     THEN 'Brand Manager'
      ELSE r::text
    END
  )
  FROM unnest(arr) AS r
$$;

-- Change required_roles from approval_role[] to TEXT[] (role names).
ALTER TABLE approval_chain_tiers
  ALTER COLUMN required_roles TYPE TEXT[]
  USING pg_temp_map_approval_roles(required_roles);

DROP FUNCTION pg_temp_map_approval_roles(approval_role[]);

-- Helper: does the caller hold an approval-slot role with the right scope?
CREATE OR REPLACE FUNCTION user_has_approval_role_in_scope(
  p_profile_id UUID,
  p_role_names TEXT[],
  p_scope      TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.name = ANY(p_role_names)
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at IS NULL
      AND  (ucr.approval_scopes IS NULL OR p_scope = ANY(ucr.approval_scopes))
  )
$$;

GRANT EXECUTE ON FUNCTION user_has_approval_role_in_scope TO authenticated;

COMMIT;
