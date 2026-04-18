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

  // Fetch profile + permissions via nested select.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, user_custom_roles(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    // No profile row yet — only bootstrap email can proceed (so first admin
    // can still create users before anyone has a profile).
    if (bootstrapEmail && callerEmail === bootstrapEmail) {
      return { ok: true, authUserId: user.id, email: callerEmail, profileId: '' }
    }
    return { ok: false, status: 403, message: 'Forbidden — no profile linked to this user' }
  }

  const perms: string[] = (profile.user_custom_roles ?? [])
    .flatMap((r: { custom_roles: { permissions: string[] } | null }) =>
      r.custom_roles?.permissions ?? []
    )

  if (perms.includes(REQUIRED_PERMISSION)) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  // Bootstrap fallback.
  if (bootstrapEmail && callerEmail === bootstrapEmail) {
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
