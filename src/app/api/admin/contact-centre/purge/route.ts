import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPurgeQuery, sumAttachmentBytes, type PurgeFilter } from '@/lib/contact-center/purge-filter'
import { confirmPhrase, phraseMatches } from '@/lib/contact-center/confirm-phrase'
import type { Database } from '@/types/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userSupa = await createClient()
  const { data: { user } } = await userSupa.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await userSupa
    .from('user_data')
    .select('id, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const perms: string[] = (profile?.user_custom_roles ?? []).flatMap((ucr: { custom_roles: { permissions: string[] } | null }) =>
    ucr.custom_roles?.permissions ?? []
  )

  if (!perms.includes('contact_centre.admin.purge')) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const performerProfileId = profile?.id as string

  let body: { filter: PurgeFilter; confirmation: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { filter, confirmation } = body

  if (!filter?.date_from || !filter?.date_to) {
    return NextResponse.json({ ok: false, error: 'filter.date_from and filter.date_to are required' }, { status: 400 })
  }

  const expected = confirmPhrase(filter)
  if (!phraseMatches(confirmation, expected)) {
    return NextResponse.json({ ok: false, error: 'Confirmation phrase does not match' }, { status: 400 })
  }

  const admin = createAdminClient()

  let conversationIds: string[] | undefined
  if (filter.customer_id) {
    const { data: convRows, error: convErr } = await admin
      .from('chat_conversations')
      .select('id')
      .eq('customer_id_v2', filter.customer_id)

    if (convErr) {
      return NextResponse.json({ ok: false, error: convErr.message }, { status: 500 })
    }

    conversationIds = (convRows ?? []).map((r) => r.id)

    if (conversationIds.length === 0) {
      return NextResponse.json({ ok: true, batch_id: null, message_count: 0, attachment_bytes: 0 })
    }
  }

  const { data: rows, error: queryErr } = await buildPurgeQuery(admin, filter, conversationIds)
    .limit(100_000)

  if (queryErr) {
    return NextResponse.json({ ok: false, error: queryErr.message }, { status: 500 })
  }

  let targetRows = rows ?? []

  if (filter.media_only) {
    targetRows = targetRows.filter(
      (r) => Array.isArray(r.attachments) && r.attachments.length > 0
    )
  }

  if (targetRows.length === 0) {
    return NextResponse.json({ ok: true, batch_id: null, message_count: 0, attachment_bytes: 0 })
  }

  const attachmentBytes = sumAttachmentBytes(targetRows)
  const messageCount = targetRows.length

  const { data: batch, error: batchErr } = await admin
    .from('purge_batches')
    .insert({
      performed_by: performerProfileId,
      filter_payload: filter as unknown as Database['public']['Tables']['purge_batches']['Row']['filter_payload'],
      message_count: messageCount,
      attachment_bytes: attachmentBytes,
    })
    .select('id')
    .single()

  if (batchErr || !batch) {
    return NextResponse.json({ ok: false, error: batchErr?.message ?? 'Failed to create purge batch' }, { status: 500 })
  }

  const ids = targetRows.map((r) => r.id)
  const now = new Date().toISOString()
  let i = 0

  try {
    for (; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500)
      const { error: updateErr } = await admin
        .from('chat_messages')
        .update({ deleted_at: now, deleted_by: performerProfileId, purge_batch_id: batch.id })
        .in('id', slice)

      if (updateErr) {
        return NextResponse.json(
          { ok: false, error: updateErr.message, batch_id: batch.id, completed_ids: i },
          { status: 500 }
        )
      }
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error', batch_id: batch.id, completed_ids: i },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, batch_id: batch.id, message_count: messageCount, attachment_bytes: attachmentBytes })
}
