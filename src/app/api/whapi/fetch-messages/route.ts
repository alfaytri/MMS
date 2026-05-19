import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-admin'

const WHAPI_URL   = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

  const data    = await res.json()
  const msgs: any[] = data?.messages ?? []
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const mediaSpec = [
    { key: 'image',    defaultMime: 'image/jpeg',               defaultName: 'image'    },
    { key: 'video',    defaultMime: 'video/mp4',                defaultName: 'video'    },
    { key: 'audio',    defaultMime: 'audio/ogg',                defaultName: 'audio'    },
    { key: 'voice',    defaultMime: 'audio/ogg; codecs=opus',   defaultName: 'voice'    },
    { key: 'document', defaultMime: 'application/octet-stream', defaultName: 'document' },
    { key: 'sticker',  defaultMime: 'image/webp',               defaultName: 'sticker'  },
  ]

  const toInsert = msgs
    .filter((m: any) => m.type !== 'reaction' && m.id)
    .map((m: any) => {
      const ts      = m.timestamp ? new Date(m.timestamp * 1000).toISOString() : new Date().toISOString()
      const msgType = (m.type ?? 'text').toLowerCase()
      const text    = m.text?.body?.trim() || m.caption?.trim() || null

      const attachments: { url: string; type: string; name: string }[] = []
      for (const { key, defaultMime, defaultName } of mediaSpec) {
        if (msgType !== key) continue
        const media = m[key]
        if (!media) continue
        const rawUrl: string | null = media.link
          ?? (media.id ? `${WHAPI_URL}/media/${media.id}` : null)
        if (!rawUrl) continue
        // Proxy through our server — browser can't supply the Bearer token on <img>/<video> src.
        // Guard against double-wrapping if rawUrl is already a proxy path.
        const url = rawUrl.startsWith('/api/whapi/media')
          ? rawUrl
          : `/api/whapi/media?url=${encodeURIComponent(rawUrl)}`
        attachments.push({
          url,
          type: media.mime_type ?? defaultMime,
          name: media.file_name ?? media.filename ?? defaultName,
        })
      }

      return {
        conversation_id: conversationId,
        external_id:     m.id,
        from_type:       m.from_me ? 'agent' : 'customer',
        source:          'whatsapp_api',
        text:            text || null,
        attachments:     attachments.length > 0 ? attachments : null,
        delivery_status: m.status ?? 'delivered',
        created_at:      ts,
        message_kind:    'message',
      }
    })

  if (toInsert.length > 0) {
    await (supabase.from('chat_messages') as any)
      .upsert(toInsert, { onConflict: 'external_id', ignoreDuplicates: false })
  }

  return NextResponse.json({ ok: true, count: toInsert.length })
}
