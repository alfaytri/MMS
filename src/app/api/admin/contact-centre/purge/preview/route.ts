import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildPurgeQuery,
  sumAttachmentBytes,
  type PurgeFilter,
  type PurgeMessageRow,
} from '@/lib/contact-center/purge-filter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  const userSupa = await createClient()
  const {
    data: { user },
  } = await userSupa.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await userSupa
    .from('profiles')
    .select(
      'user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))',
    )
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const perms: string[] = (
    (profile?.user_custom_roles ?? []) as Array<{
      custom_roles: { permissions: string[] } | null
    }>
  ).flatMap((r) => r.custom_roles?.permissions ?? [])

  if (!perms.includes('contact_centre.admin.purge')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate body
  let filter: PurgeFilter
  try {
    filter = (await req.json()) as PurgeFilter
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!filter.date_from || !filter.date_to) {
    return NextResponse.json(
      { error: 'date_from and date_to are required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Resolve conversation IDs when customer_id is present
  let conversationIds: string[] | undefined
  if (filter.customer_id) {
    const { data: convRows, error: convErr } = await admin
      .from('chat_conversations')
      .select('id')
      .eq('customer_id_v2', filter.customer_id)

    if (convErr) {
      return NextResponse.json(
        { error: 'Failed to fetch conversations', detail: convErr.message },
        { status: 500 },
      )
    }

    conversationIds = (convRows ?? []).map((r) => r.id)

    // No conversations for this customer → nothing to purge
    if (conversationIds.length === 0) {
      return NextResponse.json({ message_count: 0, attachment_bytes: 0 })
    }
  }

  const { data, error } = await buildPurgeQuery(admin, filter, conversationIds)
    .limit(100_000)
    .returns<PurgeMessageRow[]>()

  if (error) {
    return NextResponse.json(
      { error: 'Query failed', detail: error.message },
      { status: 500 },
    )
  }

  const rows = data ?? []

  // Post-filter for media_only: keep only rows that have a non-empty attachments array.
  // buildPurgeQuery already excludes null attachments when media_only is set, but the
  // JSONB column may hold an empty array — filter those out here.
  const filtered =
    filter.media_only
      ? rows.filter((r) => Array.isArray(r.attachments) && r.attachments.length > 0)
      : rows

  return NextResponse.json({
    message_count: filtered.length,
    attachment_bytes: sumAttachmentBytes(filtered),
  })
}
