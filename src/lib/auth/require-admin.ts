import { createClient as createServerClient } from '@/lib/supabase/server'

export type AdminGateSuccess = {
  ok: true
  authUserId: string
  email: string | null
  profileId: string // profiles.id
}
export type AdminGateFailure = {
  ok: false
  status: 401 | 403
  message: string
}

const REQUIRED_PERMISSION = 'master_data.users.manage'

/**
 * Server-side admin gate. Call at the top of every admin API route.
 * - 401 if not authenticated.
 * - 403 unless caller has the `master_data.users.manage` permission
 *   via any assigned custom role.
 * - Bootstrap: if caller's email === ADMIN_BOOTSTRAP_EMAIL, pass through
 *   even without the permission (first-run enablement).
 */
export async function requireAdmin(): Promise<AdminGateSuccess | AdminGateFailure> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }

  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const callerEmail = user.email?.trim().toLowerCase() ?? null

  // Bootstrap shortcut: check email FIRST, before any DB round-trip.
  // This lets the first admin use all routes even with no profile row yet,
  // and survives any RLS / relationship query failures.
  if (bootstrapEmail && callerEmail === bootstrapEmail) {
    // Still try to fetch profile.id for audit purposes, but don't block on failure.
      const { data: bp } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: bp?.id ?? '' }
  }

  // Non-bootstrap: require profile + master_data.users.manage permission.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    return { ok: false, status: 403, message: 'Forbidden — no profile linked to this user' }
  }

  const perms: string[] = (profile.user_custom_roles ?? [])
    .flatMap((r: { custom_roles: { permissions: string[] } | null }) =>
      r.custom_roles?.permissions ?? []
    )

  if (perms.includes(REQUIRED_PERMISSION)) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  return { ok: false, status: 403, message: 'Forbidden — admin permission required' }
}

/** Lighter gate for routes that any authenticated user can hit. */
export async function requireAuth(): Promise<
  | { ok: true; authUserId: string; email: string | null }
  | { ok: false; status: 401; message: string }
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }
  return { ok: true, authUserId: user.id, email: user.email ?? null }
}

/**
 * Generic permission gate. Requires the caller to have ANY of the listed
 * permissions via their assigned custom roles. System admins (is_system_admin=true)
 * always pass. Use this instead of requireAdmin() when a route is gated by a
 * permission OTHER than master_data.users.manage.
 */
export async function requirePermission(
  permission: string | string[],
): Promise<AdminGateSuccess | AdminGateFailure> {
  const required = Array.isArray(permission) ? permission : [permission]

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }

  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const callerEmail = user.email?.trim().toLowerCase() ?? null
  if (bootstrapEmail && callerEmail === bootstrapEmail) {
      const { data: bp } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: bp?.id ?? '' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(is_system_admin, permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    return { ok: false, status: 403, message: 'Forbidden — no profile linked to this user' }
  }

  const roles: Array<{ custom_roles: { is_system_admin: boolean | null; permissions: string[] } | null }> =
    profile.user_custom_roles ?? []

  const perms: string[] = roles.flatMap((r) => r.custom_roles?.permissions ?? [])
  // System admin = is_system_admin=true seeded role OR system.admin permission grant.
  const isSystemAdmin =
    roles.some((r) => r.custom_roles?.is_system_admin === true) ||
    perms.includes('system.admin')
  if (isSystemAdmin) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  if (required.some((p) => perms.includes(p))) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  return {
    ok: false,
    status: 403,
    message: `Forbidden — required permission: ${required.join(' or ')}`,
  }
}
