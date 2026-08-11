import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Gate a reports API route on the `reports.view` permission (the same one the
 * /reports pages enforce). Reads the caller's Bearer token, resolves their
 * user_data profile, and checks the permission — so a route using the
 * SERVICE_ROLE key can't be hit by an unauthorized user. Shared by the
 * warehouse-report and generic-report PDF routes.
 */
export async function requireReportsPermission(
  req: NextRequest,
): Promise<{ ok: true; profileId: string } | { ok: false; status: number; error: string }> {
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

  const { data: hasPerm, error: permErr } = await admin.rpc('_user_has_permission', {
    p_profile_id: profile.id,
    p_permission: 'reports.view',
  })
  if (permErr) return { ok: false, status: 500, error: permErr.message }
  if (!hasPerm) return { ok: false, status: 403, error: 'Missing reports.view permission' }
  return { ok: true, profileId: profile.id }
}
