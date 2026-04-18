-- Fix replace_user_custom_roles: column is profile_id, not user_id

CREATE OR REPLACE FUNCTION replace_user_custom_roles(
  p_user_id UUID,            -- profiles.id (NOT auth_user_id)
  p_role_ids UUID[]          -- may be NULL or empty array to clear all roles
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;
  IF p_role_ids IS NOT NULL AND array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (profile_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_user_custom_roles(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_user_custom_roles(UUID, UUID[]) TO authenticated;
