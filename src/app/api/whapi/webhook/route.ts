import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
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

  const supabase = createClient(SUPA_URL, SUPA_KEY)
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

    // Extract attachments
    const attachments: { url: string; type: string; name: string }[] = []
    if (msgType === 'image' && msg.image?.link) {
      attachments.push({ url: msg.image.link, type: msg.image.mime_type ?? 'image/jpeg', name: 'image' })
    } else if (msgType === 'document' && msg.document?.link) {
      attachments.push({ url: msg.document.link, type: msg.document.mime_type ?? 'application/octet-stream', name: msg.document.filename ?? 'document' })
    } else if (msgType === 'audio' && msg.audio?.link) {
      attachments.push({ url: msg.audio.link, type: msg.audio.mime_type ?? 'audio/ogg', name: 'audio' })
    } else if (msgType === 'video' && msg.video?.link) {
      attachments.push({ url: msg.video.link, type: msg.video.mime_type ?? 'video/mp4', name: 'video' })
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
      .upsert({ wati_phone: phone }, { onConflict: 'wati_phone', ignoreDuplicates: true })

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
