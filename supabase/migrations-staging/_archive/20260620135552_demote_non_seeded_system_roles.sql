-- Demote any custom_role that's been incorrectly flagged as is_system = true.
--
-- `is_system = true` is treated as "system admin, bypass all permission checks"
-- everywhere in the app:
--   - src/hooks/usePermissions.ts:41 (client UI)
--   - src/lib/auth/require-admin.ts:119 (server routes)
--   - dozens of RLS policies (invoices.manage, contracts.activate,
--     master_data.services.approve, etc.)
--
-- Only the seeded 'Admin' / 'Owner' roles are meant to carry this flag.
-- If any other role acquired it via manual SQL / Supabase Studio editing,
-- anyone assigned to that role silently gets full access regardless of
-- their `permissions` array. This migration fixes that.

BEGIN;

UPDATE custom_roles
SET    is_system = false
WHERE  is_system = true
  AND  name NOT IN ('Admin', 'Owner');

COMMIT;
