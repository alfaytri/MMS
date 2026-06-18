-- Replace "dead" permission references that effectively gate to admin-only
-- (because the permission keys don't exist in the permissions list/UI).
--
-- 1. service_brands write policy used 'master_data.edit' which never existed.
--    Replace with 'master_data.services.manage' (service_brands belongs to services).
--
-- 2. contract documents storage policies referenced 'contracts.activate'
--    which existed in policies but wasn't in the permissions list.
--    The permission is now added to permissions.ts; sync Admin role to include it.

-- ── service_brands: use master_data.services.manage ─────────────────────────
DROP POLICY IF EXISTS "Admin write service_brands" ON service_brands;

CREATE POLICY "Manage services write service_brands"
  ON service_brands FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = auth.uid()
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = auth.uid()
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  );

-- ── contract documents storage: keep contracts.activate (now in perm list) ──
-- Policies already reference contracts.activate; just ensure they exist.
-- (No change needed here — the permission key is now valid since we added it
--  to permissions.ts, and the Admin sync below grants it to admins.)

-- ── Sync Admin role to include contracts.activate ───────────────────────────
UPDATE custom_roles
SET permissions = (
  CASE
    WHEN 'contracts.activate' = ANY(permissions) THEN permissions
    ELSE array_append(permissions, 'contracts.activate')
  END
)
WHERE name = 'Admin' AND is_system = true;
