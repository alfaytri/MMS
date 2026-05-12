import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

function normaliseStatus(raw: string | undefined | null): DeliveryStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'READ':      return 'read'
    case 'DELIVERED': return 'delivered'
    case 'SENT':      return 'sent'
    case 'FAILED':    return 'failed'
    default:          return 'sent'
  }
}

function normalisePhone(waId: string): string {
  return `+${waId.replace(/\D/g, '')}`
}

interface Attachment {
  url: string
  type: string
  name: string
}

function extractAttachments(body: any): Attachment[] {
  const msgType: string = String(body.type ?? '')
  const data = body.data ?? {}
  const mediaUrl = data.url ?? body.media?.url ?? null

  if (msgType === 'image') {
    const url = mediaUrl ?? body.image?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? 'image/jpeg', name: data.caption ?? 'image' }]
  }
  if (msgType === 'document') {
    const url = mediaUrl ?? body.document?.url ?? body.document?.link ?? null
    if (!url) return []
    const name = data.fileName ?? data.filename ?? body.document?.filename ?? body.document?.fileName ?? body.media?.fileName ?? 'document'
    const mime = data.mimeType ?? body.document?.mimeType ?? body.media?.mimeType ?? 'application/octet-stream'
    return [{ url, type: mime, name }]
  }
  if (msgType === 'video') {
    const url = mediaUrl ?? body.video?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? 'video/mp4', name: data.caption ?? 'video' }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url = mediaUrl ?? body.audio?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? 'audio/ogg', name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = mediaUrl ?? body.sticker?.url ?? null
    if (!url) return []
    return [{ url, type: 'image/webp', name: 'sticker' }]
  }
  return []
}

// GET — WATI verification ping
export async function GET() {
  return new Response('OK', { status: 200 })
}

// POST — called by WATI for every incoming/outgoing message and status change
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const eventType: string = body.eventType ?? body.type ?? ''

  // ── Delivery status update ──────────────────────────────────────────────────
  if (eventType === 'status_changed' || eventType === 'message_status') {
    const externalId = body.id ?? body.whatsappMessageId
    if (externalId) {
      await (supabase.from('chat_messages') as any)
        .update({ delivery_status: normaliseStatus(body.statusString ?? body.status) })
        .eq('external_id', String(externalId))
    }
    return NextResponse.json({ ok: true })
  }

  // ── Conversation status change (resolved / reopened / assigned) ────────────
  if (
    eventType === 'conversation_resolved' ||
    eventType === 'conversation_resolve' ||
    eventType === 'conversation_reopened' ||
    eventType === 'conversation_reopen' ||
    eventType === 'conversation_assigned'
  ) {
    const rawWaId: string = body.waId ?? body.contactWAId ?? body.from ?? ''
    if (rawWaId) {
      const phone = normalisePhone(rawWaId)
      const isResolved = eventType.includes('resolve')
      const assignedAgent: string | null =
        body.assignedTo?.name ?? body.assignedTo?.fullName ??
        (typeof body.assignedTo === 'string' ? body.assignedTo : null) ??
        body.operatorName ?? null

      await (supabase.from('chat_conversations') as any)
        .update({
          wati_status: isResolved ? 'resolved' : 'open',
          ...(assignedAgent ? { assigned_agent: assignedAgent } : {}),
        })
        .eq('wati_phone', phone)
    }
    return NextResponse.json({ ok: true })
  }

  // ── New message (received from customer or sent via WATI) ───────────────────
  const rawWaId: string = body.waId ?? body.from ?? ''
  if (!rawWaId) return NextResponse.json({ ok: true })

  const phone    = normalisePhone(rawWaId)
  const isAgent  = body.owner === true || eventType === 'message_sent' || eventType === 'sent_message'
  const msgType: string = body.type ?? 'text'
  const attachments = extractAttachments(body)

  // Extract assigned agent from message payload (Wati sometimes includes it)
  const assignedAgentInMsg: string | null =
    body.assignedTo?.name ?? body.assignedTo?.fullName ??
    (typeof body.assignedTo === 'string' ? body.assignedTo : null) ??
    body.operatorName ?? null

  const text = typeof body.text === 'string' && body.text.trim()
    ? body.text.trim()
    : msgType !== 'text'
    ? `[${msgType}]`
    : ''

  const externalId: string | null = body.id ?? body.whatsappMessageId ?? null
  const ts = body.created
    ? new Date(body.created).toISOString()
    : body.timestamp
    ? new Date(Number(body.timestamp) * 1000).toISOString()
    : new Date().toISOString()
  const senderName: string | null = body.senderName ?? null

  // Find or create conversation
  const { data: existing } = await (supabase.from('chat_conversations') as any)
    .select('id, unread_count')
    .eq('wati_phone', phone)
    .maybeSingle()

  let conversationId: string

  if (existing) {
    conversationId = existing.id
    await (supabase.from('chat_conversations') as any)
      .update({
        last_message:    text || `[${msgType}]`,
        last_message_at: ts,
        ...(senderName ? { wati_contact_name: senderName } : {}),
        ...(assignedAgentInMsg ? { assigned_agent: assignedAgentInMsg } : {}),
        ...(!isAgent ? { unread_count: (existing.unread_count ?? 0) + 1 } : {}),
      })
      .eq('id', conversationId)
  } else {
    const { data: created, error } = await (supabase.from('chat_conversations') as any)
      .insert({
        wati_phone:        phone,
        wati_contact_name: senderName,
        last_message:      text || `[${msgType}]`,
        last_message_at:   ts,
        unread_count:      isAgent ? 0 : 1,
        ...(assignedAgentInMsg ? { assigned_agent: assignedAgentInMsg } : {}),
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[webhook] create conversation error', error)
      return NextResponse.json({ error: error?.message }, { status: 500 })
    }
    conversationId = created.id
  }

  // Insert message (skip duplicate external_id)
  if (externalId) {
    const { data: dup } = await (supabase.from('chat_messages') as any)
      .select('id')
      .eq('external_id', externalId)
      .maybeSingle()

    if (!dup) {
      await (supabase.from('chat_messages') as any)
        .insert({
          conversation_id:  conversationId,
          from_type:        isAgent ? 'agent' : 'customer',
          source:           'whatsapp_api',
          text:             text || `[${msgType}]`,
          agent_name:       isAgent ? senderName : null,
          attachments:      attachments.length > 0 ? attachments : null,
          delivery_status:  isAgent ? normaliseStatus(body.statusString) : 'delivered',
          external_id:      externalId,
          created_at:       ts,
        })
    }
  }

  return NextResponse.json({ ok: true })
}
