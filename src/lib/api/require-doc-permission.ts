import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

type Ok = { ok: true; profileId: string }
type Err = { ok: false; status: number; error: string }

/**
 * Authorize a service_role document / PDF API route.
 *
 * These routes build a `SUPABASE_SERVICE_ROLE_KEY` client (which bypasses RLS)
 * so they can render a document for any division's data. Previously they only
 * validated the caller's Bearer JWT — so ANY authenticated employee, including
 * one with no sales/purchase permission at all, could fetch any invoice /
 * statement / PO PDF by iterating the id in the URL. This helper closes that:
 * it resolves the caller's `user_data` profile and asserts they hold at least
 * ONE of the given permissions (any-of), mirroring `requireReportsPermission`.
 *
 * Division-level scoping (a division-A user pulling a division-B document) is a
 * separate, finer layer enforced on top of this — tracked as the B3 follow-up
 * in docs/go-live-readiness-2026-08-21.md.
 */
export async function requireDocPermission(
  req: NextRequest,
  permission: string | string[],
): Promise<Ok | Err> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }

  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' }

  const admin = createClient<Database>(SUPA_URL, SUPA_KEY)
  const { data: profile } = await admin
    .from('user_data')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return { ok: false, status: 403, error: 'No profile — cannot resolve permissions' }

  const perms = Array.isArray(permission) ? permission : [permission]
  for (const p of perms) {
    const { data: hasPerm, error: permErr } = await admin.rpc('_user_has_permission', {
      p_profile_id: profile.id,
      p_permission: p,
    })
    if (permErr) return { ok: false, status: 500, error: permErr.message }
    if (hasPerm) return { ok: true, profileId: profile.id }
  }
  return { ok: false, status: 403, error: `Missing permission: ${perms.join(' or ')}` }
}
