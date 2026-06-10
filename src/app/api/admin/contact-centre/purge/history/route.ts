import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const userSupa = await createClient()
  const { data: { user } } = await userSupa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupa
    .from('profiles')
    .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const perms: string[] = ((profile?.user_custom_roles ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
    .flatMap((r) => r.custom_roles?.permissions ?? [])

  if (!perms.includes('contact_centre.admin.purge')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('purge_batches')
    .select('id, performed_by, filter_payload, message_count, attachment_bytes, soft_deleted_at, hard_deleted_at, restored_at')
    .order('soft_deleted_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ batches: data ?? [] })
}
