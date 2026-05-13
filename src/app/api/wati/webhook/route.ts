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
  const mediaUrl =
    data.url ?? data.link ?? data.mediaUrl ??
    body.media?.url ?? body.mediaUrl ?? body.url ?? null

  if (msgType === 'image') {
    const url = mediaUrl ?? body.image?.url ?? body.image?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'image/jpeg', name: data.caption ?? body.caption ?? 'image' }]
  }
  if (msgType === 'document') {
    const url = mediaUrl ?? body.document?.url ?? body.document?.link ?? null
    if (!url) return []
    const name = data.fileName ?? data.filename ?? body.document?.filename ?? body.document?.fileName ?? body.media?.fileName ?? body.fileName ?? 'document'
    const mime = data.mimeType ?? body.document?.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'application/octet-stream'
    return [{ url, type: mime, name }]
  }
  if (msgType === 'video') {
    const url = mediaUrl ?? body.video?.url ?? body.video?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'video/mp4', name: data.caption ?? body.caption ?? 'video' }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url = mediaUrl ?? body.audio?.url ?? body.audio?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'audio/ogg', name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = mediaUrl ?? body.sticker?.url ?? body.sticker?.link ?? null
    if (!url) return []
    return [{ url, type: 'image/webp', name: 'sticker' }]
  }

  // Template / HSM messages with document or image header
  if (msgType === 'template' || msgType === 'hsm') {
    const components: any[] = data.template?.components ?? data.components ?? []
    const header = components.find((c: any) => (c.type ?? '').toLowerCase() === 'header')

    const headerDoc =
      header?.document ??
      data.template?.header?.document ??
      body.templateHeader?.document ??
      data.templateHeader?.document ?? null

    const headerImg =
      header?.image ??
      data.template?.header?.image ??
      body.templateHeader?.image ??
      data.templateHeader?.image ?? null

    if (headerDoc) {
      const url = headerDoc.url ?? headerDoc.link ?? mediaUrl ?? null
      if (url) return [{ url, type: 'application/octet-stream', name: headerDoc.filename ?? headerDoc.fileName ?? 'document' }]
    }
    if (headerImg) {
      const url = headerImg.url ?? headerImg.link ?? mediaUrl ?? null
      if (url) return [{ url, type: 'image/jpeg', name: 'image' }]
    }
    const headerFormat = (header?.format ?? data.template?.header?.format ?? '').toLowerCase()
    if (headerFormat === 'document' && mediaUrl) return [{ url: mediaUrl, type: 'application/octet-stream', name: data.fileName ?? 'document' }]
    if (headerFormat === 'image' && mediaUrl) return [{ url: mediaUrl, type: 'image/jpeg', name: 'image' }]
  }

  return []
}

// Extract the best available text from any Wati message type
function extractWebhookText(body: any, msgType: string): string {
  // finalText — rendered template body on broadcastMessage webhook events
  const finalText = body.finalText?.trim() ?? ''
  if (finalText) return finalText
  const direct = body.text?.trim() ?? ''
  if (direct) return direct
  const caption = body.caption?.trim() ?? body.data?.caption?.trim() ?? ''
  if (caption) return caption
  const dataBody = body.data?.body?.trim() ?? body.data?.text?.trim() ?? ''
  if (dataBody) return dataBody
  const t = msgType.toLowerCase()
  if (t === 'template' || t === 'hsm') {
    const components: any[] = body.data?.template?.components ?? body.data?.components ?? body.templateComponents ?? []
    const comp = components.find((c: any) => (c.type ?? '').toLowerCase() === 'body')
    if (comp?.text?.trim()) return comp.text.trim()
    const directBody = body.data?.template?.body?.trim() ?? body.templateBody?.trim() ?? ''
    if (directBody) return directBody
    // Fall back to template name so message never shows as blank
    const tplName = body.data?.template?.name ?? body.templateName ?? body.elementName ?? ''
    if (tplName) return `[Template: ${tplName}]`
  }
  if (msgType === 'contacts' && Array.isArray(body.contacts) && body.contacts.length > 0) {
    const name = body.contacts[0]?.name?.formatted_name ?? body.contacts[0]?.name?.first_name ?? null
    return name ? `📇 ${name}` : '📇 Contact card'
  }
  return body.body?.trim() ?? body.note?.trim() ?? ''
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

  // ── Delivery / read status update ──────────────────────────────────────────
  if (
    eventType === 'status_changed' ||
    eventType === 'message_status' ||
    eventType === 'sentMessageDELIVERED_v2' ||
    eventType === 'sentMessageREAD_v2' ||
    eventType === 'templateMessageFailed'
  ) {
    const externalId = body.whatsappMessageId ?? body.id
    if (externalId) {
      const status =
        eventType === 'sentMessageDELIVERED_v2' ? 'delivered'
        : eventType === 'sentMessageREAD_v2'    ? 'read'
        : eventType === 'templateMessageFailed' ? 'failed'
        : normaliseStatus(body.statusString ?? body.status)
      // MMS stores outgoing messages as wati_<id>; check both forms
      await (supabase.from('chat_messages') as any)
        .update({ delivery_status: status })
        .in('external_id', [String(externalId), `wati_${String(externalId)}`])
    }
    return NextResponse.json({ ok: true })
  }

  // ── Customer reaction ────────────────────────────────────────────────────────
  // Accept any payload whose type is 'reaction' regardless of which sub-field
  // carries the data — Wati uses at least three different shapes in the wild.
  if (String(body.type ?? '').toLowerCase() === 'reaction') {
    // Log the full body so Vercel logs reveal the exact field structure
    console.log('[webhook:reaction] full payload:', JSON.stringify(body))

    // Try every known field path for the target message ID and emoji
    const targetExternalId: string | null =
      body.reaction?.messageId ??
      body.reactionMessage?.key?.id ??
      body.referredMessageId ??
      body.targetMessageId ??
      body.messageId ?? null

    const emoji: string | null =
      body.reaction?.emoji ??
      body.reactionMessage?.text ??
      body.emoji ??
      body.reactionEmoji ?? null

    console.log('[webhook:reaction] extracted', { targetExternalId, emoji, waId: body.waId })

    if (targetExternalId) {
      // Check both wamid and wati_-prefixed id (agent-sent messages use prefix)
      const { data: targetRow } = await (supabase.from('chat_messages') as any)
        .select('id, reactions')
        .in('external_id', [targetExternalId, `wati_${targetExternalId}`])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      console.log('[webhook:reaction] db lookup', { found: !!targetRow, targetExternalId })
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
          // Empty emoji = customer removed all reactions
          const updated = existing.filter((r) => r.from_type !== 'customer')
          await (supabase.from('chat_messages') as any)
            .update({ reactions: updated })
            .eq('id', targetRow.id)
        }
      }
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
  const isAgent  = body.owner === true || eventType === 'message_sent' || eventType === 'sent_message' || eventType === 'broadcastMessage'
  const msgType: string = String(body.type ?? 'text').toLowerCase()

  // Detect Wati platform events: ticket events cover all system activity (type 0/1/2)
  const isMsgEvent = eventType === 'ticket' || msgType === 'note' || msgType === 'activity'

  const attachments = isMsgEvent ? [] : extractAttachments(body)

  // Extract assigned agent from message payload (Wati sometimes includes it)
  const assignedAgentInMsg: string | null =
    body.assignedTo?.name ?? body.assignedTo?.fullName ??
    (typeof body.assignedTo === 'string' ? body.assignedTo : null) ??
    body.operatorName ?? null

  const rawText = extractWebhookText(body, msgType)
  const text = rawText || (!isMsgEvent && attachments.length === 0 && msgType !== 'text' && msgType !== '0'
    ? `[${msgType}]`
    : '')

  // Prefer WhatsApp's own message ID (wamid.xxx) over Wati's internal id.
  // This is critical for reaction lookups: body.reaction.messageId is always the wamid.
  const externalId: string | null = body.whatsappMessageId ?? body.id ?? null

  // Prefer body.timestamp (Unix epoch of actual WhatsApp delivery) over body.created.
  // body.created on bot auto-replies is often the customer's trigger-message time,
  // not the bot's reply time, causing auto-replies to appear before earlier agent messages.
  const ts = body.timestamp
    ? new Date(Number(body.timestamp) * 1000).toISOString()
    : body.created
    ? new Date(body.created).toISOString()
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
        ...(!isMsgEvent ? { last_message: text || `[${msgType}]`, last_message_at: ts } : {}),
        ...(senderName ? { wati_contact_name: senderName } : {}),
        ...(assignedAgentInMsg ? { assigned_agent: assignedAgentInMsg } : {}),
        ...(!isAgent && !isMsgEvent ? { unread_count: (existing.unread_count ?? 0) + 1 } : {}),
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

  // Insert message (or update pending optimistic row from the app)
  if (externalId) {
    // Race-condition guard: if the app sent this message, it already inserted a row with
    // delivery_status='sending' and external_id=null. The webhook fires before the app can
    // write wati_<id>, so we "claim" that pending row instead of duplicating.
    if (isAgent && !isMsgEvent) {
      const cutoff = new Date(Date.now() - 60_000).toISOString()
      const { data: pendingRow } = await (supabase.from('chat_messages') as any)
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('from_type', 'agent')
        .eq('delivery_status', 'sending')
        .is('external_id', null)
        .eq('text', text)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingRow) {
        await (supabase.from('chat_messages') as any)
          .update({
            external_id:      externalId,
            delivery_status:  normaliseStatus(body.statusString ?? 'SENT'),
            ...(senderName ? { agent_name: senderName } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          })
          .eq('id', pendingRow.id)
        return NextResponse.json({ ok: true })
      }
    }

    // Normal dup check (covers wati_ prefix written by app, and bare wamid)
    const { data: dup } = await (supabase.from('chat_messages') as any)
      .select('id, external_id')
      .in('external_id', [externalId, `wati_${externalId}`])
      .maybeSingle()

    if (dup) {
      // If the row is stored under wati_<id> prefix, update it to the bare wamid
      // so reactions and future lookups work against the canonical ID.
      if (dup.external_id !== externalId) {
        await (supabase.from('chat_messages') as any)
          .update({ external_id: externalId })
          .eq('id', dup.id)
      }
      return NextResponse.json({ ok: true })
    }

    // Broad text-based dedup for agent messages:
    // The app may have stored the message with wati_<numericId> while the
    // webhook arrives with the wamid — different external_ids, so the check
    // above misses it. A text+conversation+time match catches this case.
    if (isAgent && !isMsgEvent && text) {
      const cutoff2 = new Date(Date.now() - 2 * 60_000).toISOString()
      const { data: textDup } = await (supabase.from('chat_messages') as any)
        .select('id, external_id')
        .eq('conversation_id', conversationId)
        .eq('from_type', 'agent')
        .eq('text', text)
        .gte('created_at', cutoff2)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (textDup) {
        // Claim the existing row with the canonical wamid
        await (supabase.from('chat_messages') as any)
          .update({
            external_id:     externalId,
            delivery_status: normaliseStatus(body.statusString ?? 'SENT'),
          })
          .eq('id', textDup.id)
        return NextResponse.json({ ok: true })
      }
    }

    await (supabase.from('chat_messages') as any)
      .insert({
        conversation_id:  conversationId,
        from_type:        isAgent ? 'agent' : 'customer',
        source:           'whatsapp_api',
        text:             text,
        agent_name:       isAgent ? senderName : null,
        attachments:      attachments.length > 0 ? attachments : null,
        delivery_status:  isAgent ? normaliseStatus(body.statusString) : 'delivered',
        external_id:      externalId,
        created_at:       ts,
        message_kind:     isMsgEvent ? 'event' : 'message',
      })
  }

  return NextResponse.json({ ok: true })
}
