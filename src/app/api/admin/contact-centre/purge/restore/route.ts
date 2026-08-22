import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userSupa = await createClient()
  const { data: { user } } = await userSupa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupa
    .from('user_data')
    .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const perms: string[] = ((profile?.user_custom_roles ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
    .flatMap((r) => r.custom_roles?.permissions ?? [])

  if (!perms.includes('contact_centre.admin.purge')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { batch_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.batch_id) {
    return NextResponse.json({ error: 'batch_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: batch, error: fetchError } = await admin
    .from('purge_batches')
    .select('id, hard_deleted_at, restored_at')
    .eq('id', body.batch_id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  if (batch.hard_deleted_at) {
    return NextResponse.json(
      { error: 'batch already hard-deleted; rows are gone' },
      { status: 410 }
    )
  }

  if (batch.restored_at) {
    return NextResponse.json({ error: 'batch already restored' }, { status: 409 })
  }

  const { error: restoreError, count } = await admin
    .from('chat_messages')
    .update({ deleted_at: null, deleted_by: null, purge_batch_id: null }, { count: 'exact' })
    .eq('purge_batch_id', body.batch_id)
    .not('deleted_at', 'is', null)

  if (restoreError) {
    return NextResponse.json({ error: restoreError.message }, { status: 500 })
  }

  const { error: batchError } = await admin
    .from('purge_batches')
    .update({ restored_at: new Date().toISOString() })
    .eq('id', body.batch_id)

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, restored: count ?? 0 })
}
