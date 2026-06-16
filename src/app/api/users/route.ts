import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * GET /api/users — returns all profiles with roles + divisions.
 * Uses the service-role admin client so RLS does not filter results.
 * Gated by requireAdmin() so only admins can call this.
 */
export async function GET() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      // user_custom_roles now carries BOTH the general role info AND the approval-slot info
      // (approval_scopes + custom_roles.is_approval_slot). Downstream code that previously read
      // profile.approval_role_assignments should now filter user_custom_roles by
      // custom_roles.is_approval_slot === true (and custom_roles.deleted_at === null).
      .select('*, user_custom_roles!user_custom_roles_profile_id_fkey(role_id, approval_scopes, custom_roles(name, color, is_approval_slot, deleted_at)), user_divisions!user_divisions_profile_id_fkey(division_id, divisions(name, short_name, color))')
      .order('full_name')

    if (error) {
      console.error('[GET /api/users] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('[GET /api/users] Unhandled exception:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
