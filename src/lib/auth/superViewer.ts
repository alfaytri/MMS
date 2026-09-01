import type { CustomRole } from '@/hooks/useRoles'

/**
 * "Super-viewer" = an account that sees every division and therefore does NOT
 * need any division assigned. This mirrors the server-side rule in the
 * `custom_access_token_hook` (supabase/migrations/20260801000000_…): a user's
 * JWT `user_type` becomes `owner` / `accountant` only when they hold an
 * **approval-slot** role literally named `Owner` / `Accountant`. Everyone else
 * is division-scoped and is locked out of all data when they have no division.
 *
 * Keep this list in sync with the hook's `bool_or(cr.name = '…')` branches.
 */
export const SUPER_VIEWER_ROLE_NAMES = ['Owner', 'Accountant'] as const

type RoleLike = Pick<CustomRole, 'name'> & { is_approval_slot?: boolean | null }

/** A single role that, on its own, grants super-viewer status. */
export function isSuperViewerRole(role: RoleLike): boolean {
  return (
    (role.name === SUPER_VIEWER_ROLE_NAMES[0] || role.name === SUPER_VIEWER_ROLE_NAMES[1]) &&
    Boolean(role.is_approval_slot)
  )
}

/** True if any role in the set grants super-viewer status. */
export function rolesGrantSuperViewer(roles: RoleLike[]): boolean {
  return roles.some(isSuperViewerRole)
}
