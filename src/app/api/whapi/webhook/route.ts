import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const WEBHOOK_SECRET = process.env.WHAPI_WEBHOOK_SECRET ?? ''

function normalisePhone(raw: string): string {
  return `+${raw.replace(/\D/g, '')}`
}

function normaliseStatus(raw: string): 'sent' | 'delivered' | 'read' | 'failed' {
  switch (raw.toLowerCase()) {
    case 'read':      return 'read'
    case 'delivered': return 'delivered'
    case 'failed':    return 'failed'
    default:          return 'sent'
  }
}

// GET — simple health check
export async function GET() {
  return new Response('OK', { status: 200 })
}

// POST — WHAPI event handler
export async function POST(req: NextRequest) {
  // Verify shared secret if configured
  if (WEBHOOK_SECRET) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let body: any
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  const supabase = createAdminClient()
  const eventType = body?.event?.type

  // ── Status updates ───────────────────────────────────────────────────────────
  if (eventType === 'statuses') {
    for (const s of (body.statuses ?? [])) {
      const externalId: string = s.id
      const status = normaliseStatus(s.status ?? '')
      if (externalId) {
        await (supabase.from('chat_messages') as any)
          .update({ delivery_status: status })
          .eq('external_id', externalId)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // ── Messages ─────────────────────────────────────────────────────────────────
  if (eventType !== 'messages') return NextResponse.json({ ok: true })

  for (const msg of (body.messages ?? [])) {
    const msgType: string = (msg.type ?? 'text').toLowerCase()

    // ── Reaction ───────────────────────────────────────────────────────────────
    if (msgType === 'reaction') {
      const targetId: string | null = msg.reaction?.message_id ?? null
      const emoji: string | null    = msg.reaction?.emoji ?? null

      if (targetId) {
        const { data: targetRow } = await (supabase.from('chat_messages') as any)
          .select('id, reactions')
          .eq('external_id', targetId)
          .maybeSingle()

        if (targetRow) {
          const existing: { emoji: string; from_type: string }[] = targetRow.reactions ?? []
          if (emoji) {
            const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'customer')
            const updated = hasIt
              ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'customer'))
              : [...existing, { emoji, from_type: 'customer' }]
            await (supabase.from('chat_messages') as any)
              .update({ reactions: updated })
              .eq('id', targetRow.id)
          } else {
            const updated = existing.filter((r) => r.from_type !== 'customer')
            await (supabase.from('chat_messages') as any)
              .update({ reactions: updated })
              .eq('id', targetRow.id)
          }
        }
      }
      continue
    }

    // ── Regular message ────────────────────────────────────────────────────────
    const phone = normalisePhone(msg.from ?? '')
    if (!phone || phone === '+') continue

    const externalId: string = msg.id ?? ''
    const ts = msg.timestamp
      ? new Date(Number(msg.timestamp) * 1000).toISOString()
      : new Date().toISOString()

    // Extract text
    let text = ''
    if (msgType === 'text') {
      text = msg.text?.body?.trim() ?? ''
    } else if (msg.caption) {
      text = msg.caption.trim()
    }

    // Extract attachments — WHAPI's `link` field only arrives when Auto Download
    // is enabled in the channel settings. When it's off we only get `id`, so
    // fall back to the /media/{id} endpoint (the /api/whapi/media proxy adds
    // the bearer token at fetch time).
    const attachments: { url: string; type: string; name: string }[] = []
    const mediaSpec: Array<{ key: string; defaultMime: string; defaultName: string }> = [
      { key: 'image',    defaultMime: 'image/jpeg',               defaultName: 'image' },
      { key: 'video',    defaultMime: 'video/mp4',                defaultName: 'video' },
      { key: 'audio',    defaultMime: 'audio/ogg',                defaultName: 'audio' },
      { key: 'voice',    defaultMime: 'audio/ogg; codecs=opus',   defaultName: 'voice' },
      { key: 'document', defaultMime: 'application/octet-stream', defaultName: 'document' },
      { key: 'sticker',  defaultMime: 'image/webp',               defaultName: 'sticker' },
    ]
    for (const { key, defaultMime, defaultName } of mediaSpec) {
      if (msgType !== key) continue
      const media = msg[key]
      if (!media) continue
      const url: string | null = media.link
        ?? (media.id ? `https://gate.whapi.cloud/media/${media.id}` : null)
      if (!url) continue
      attachments.push({
        url,
        type: media.mime_type ?? defaultMime,
        name: media.file_name ?? media.filename ?? defaultName,
      })
      // Caption inside media object is more accurate than root-level for WHAPI
      if (!text && typeof media.caption === 'string') text = media.caption.trim()
    }

    const previewText = text || (msgType !== 'text' ? `[${msgType}]` : '')

    // Dedup check
    if (externalId) {
      const { data: dup } = await (supabase.from('chat_messages') as any)
        .select('id')
        .eq('external_id', externalId)
        .maybeSingle()
      if (dup) continue
    }

    // Find or create conversation (idempotent, out-of-order timestamp guard)
    await (supabase.from('chat_conversations') as any)
      .upsert({ wati_phone: phone, provider: 'whapi' }, { onConflict: 'wati_phone,provider', ignoreDuplicates: true })

    const { data: convo } = await (supabase.from('chat_conversations') as any)
      .update({ last_message: previewText, last_message_at: ts, unread_count: 1 })
      .eq('wati_phone', phone)
      .or(`last_message_at.is.null,last_message_at.lt.${ts}`)
      .select('id')
      .maybeSingle()

    // Fallback: get the existing conversation id if update didn't match (newer msg already there)
    let conversationId: string | null = convo?.id ?? null
    if (!conversationId) {
      const { data: existing } = await (supabase.from('chat_conversations') as any)
        .select('id')
        .eq('wati_phone', phone)
        .single()
      conversationId = existing?.id ?? null
    }

    if (!conversationId || !externalId) continue

    // Insert message
    await (supabase.from('chat_messages') as any)
      .insert({
        conversation_id: conversationId,
        from_type:       'customer',
        source:          'whatsapp_api',
        text:            text || null,
        attachments:     attachments.length > 0 ? attachments : null,
        delivery_status: 'delivered',
        external_id:     externalId,
        created_at:      ts,
        message_kind:    'message',
      })
  }

  return NextResponse.json({ ok: true })
}
