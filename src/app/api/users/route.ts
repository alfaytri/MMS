import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * GET /api/users — returns all profiles with roles + divisions.
 * Uses the service-role admin client so RLS does not filter results.
 * Gated by requireAdmin() so only admins can call this.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('profiles')
    .select('*, user_custom_roles(role_id, custom_roles(name, color)), user_divisions(division_id, divisions(name, short_name, color))')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
