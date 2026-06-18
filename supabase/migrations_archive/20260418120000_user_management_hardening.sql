-- User management hardening (Phase 1 Cleanup)
-- 1. Force-change-password flag (denormalized mirror of JWT user_metadata)
-- 2. Atomic role replace RPC

BEGIN;

-- ─── 1. profiles.must_change_password ──────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'True when an admin-created password or admin-reset password is still in place; '
  'cleared when the user sets their own password via /change-password. '
  'JWT user_metadata is the enforcement source of truth; this column mirrors it '
  'for admin-UI visibility.';

-- ─── 2. replace_user_custom_roles RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION replace_user_custom_roles(
  p_user_id UUID,            -- profiles.id (NOT auth_user_id)
  p_role_ids UUID[]          -- may be NULL or empty array to clear all roles
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE user_id = p_user_id;
  IF p_role_ids IS NOT NULL AND array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (user_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_user_custom_roles(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_user_custom_roles(UUID, UUID[]) TO authenticated;

COMMIT;
