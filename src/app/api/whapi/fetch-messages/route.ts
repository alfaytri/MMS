import { type NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-admin'
import { buildAttachmentSkeleton, mirrorWhapiMedia, type StoredAttachment } from '@/lib/whapi/store-media'
import { createAdminClient } from '@/lib/supabase/admin'

const WHAPI_URL   = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

type MediaKey = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'
const MEDIA_KEYS: MediaKey[] = ['image', 'video', 'audio', 'voice', 'document', 'sticker']

interface MirrorJob {
  externalId: string
  phone:      string
  mediaKey:   MediaKey
  media:      Record<string, unknown>
}

function phoneToWhapiId(phone: string): string {
  return `${phone.replace(/\D/g, '')}@s.whatsapp.net`
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  const phone          = req.nextUrl.searchParams.get('phone')
  const count          = Math.min(parseInt(req.nextUrl.searchParams.get('count') ?? '100'), 300)

  if (!conversationId || !phone)
    return NextResponse.json({ error: 'conversationId and phone required' }, { status: 400 })

  if (!WHAPI_TOKEN)
    return NextResponse.json({ error: 'WHAPI not configured' }, { status: 500 })

  const chatId = phoneToWhapiId(phone)
  const res = await fetch(
    `${WHAPI_URL}/messages/list/${encodeURIComponent(chatId)}?count=${count}`,
    { headers: { Authorization: `Bearer ${WHAPI_TOKEN}` } }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `WHAPI ${res.status}: ${text}` }, { status: res.status })
  }

  interface WhapiMessage {
    id: string
    type?: string
    from_me?: boolean
    timestamp?: number
    text?: { body?: string }
    caption?: string
    status?: string
    [key: string]: unknown
  }

  const data    = await res.json()
  const msgs: WhapiMessage[] = (data?.messages ?? []) as WhapiMessage[]
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const mirrorJobs: MirrorJob[] = []

  const toInsert = msgs
    .filter((m: WhapiMessage) => m.type !== 'reaction' && m.id)
    .map((m: WhapiMessage) => {
      const ts      = m.timestamp ? new Date(m.timestamp * 1000).toISOString() : new Date().toISOString()
      const msgType = (m.type ?? 'text').toLowerCase()
      const text    = m.text?.body?.trim() || m.caption?.trim() || null

      const attachments: StoredAttachment[] = []
      for (const key of MEDIA_KEYS) {
        if (msgType !== key) continue
        const media = m[key]
        if (!media) continue
        const skeleton = buildAttachmentSkeleton(media, key)
        if (!skeleton) continue
        attachments.push(skeleton)
        mirrorJobs.push({ externalId: m.id, phone, mediaKey: key, media: media as Record<string, unknown> })
      }

      return {
        conversation_id: conversationId,
        external_id:     m.id,
        from_type:       m.from_me ? 'agent' : 'customer',
        source:          'whatsapp_whapi',
        text:            text || null,
        attachments:     attachments.length > 0 ? attachments : null,
        delivery_status: m.status ?? 'delivered',
        created_at:      ts,
        message_kind:    'message',
      }
    })

  if (toInsert.length > 0) {
    await supabase.from('chat_messages')
      .upsert(toInsert, { onConflict: 'external_id', ignoreDuplicates: false })
  }

  // Mirror media to Supabase Storage after the response goes out. Each file
  // hits WHAPI exactly once; thereafter renders use the public Supabase URL.
  if (mirrorJobs.length > 0) {
    after(async () => {
      const admin = createAdminClient()
      for (const job of mirrorJobs) {
        const stored = await mirrorWhapiMedia(job.media, {
          externalId: job.externalId,
          phone:      job.phone,
          mediaKey:   job.mediaKey,
        })
        if (!stored) continue

        const { data: row } = await admin.from('chat_messages')
          .select('id, attachments')
          .eq('external_id', job.externalId)
          .maybeSingle()
        if (!row) continue

        const current = (row.attachments as StoredAttachment[] | null) ?? []
        const next = current.map((att) => {
          if (att.storage_path) return att
          const isProxy = typeof att.url === 'string' && att.url.startsWith('/api/whapi/media')
          return isProxy ? stored : att
        })
        await admin.from('chat_messages')
          .update({ attachments: next })
          .eq('id', row.id)
      }
    })
  }

  return NextResponse.json({ ok: true, count: toInsert.length })
}
