BEGIN;

-- New variant: takes a JSONB array of {role_id, approval_scopes} objects.
-- Atomically replaces every assignment for the user.
CREATE OR REPLACE FUNCTION replace_user_custom_roles_v2(
  p_user_id     UUID,           -- profiles.id
  p_assignments JSONB           -- e.g. [{"role_id":"<uuid>","approval_scopes":["po"]}, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;

  IF p_assignments IS NOT NULL AND jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO user_custom_roles (profile_id, role_id, approval_scopes)
    SELECT
      p_user_id,
      (a->>'role_id')::uuid,
      CASE
        WHEN a->'approval_scopes' IS NULL OR a->'approval_scopes' = 'null'::jsonb
          THEN NULL
        WHEN jsonb_array_length(a->'approval_scopes') = 0
          THEN NULL
        ELSE ARRAY(SELECT jsonb_array_elements_text(a->'approval_scopes'))
      END
    FROM jsonb_array_elements(p_assignments) AS a;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_user_custom_roles_v2(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_user_custom_roles_v2(UUID, JSONB) TO authenticated;

COMMIT;
