import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function watiGet(path: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${WATI_URL}${path}`, {
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
    })
    if (res.status === 429) {
      await sleep(parseInt(res.headers.get('Retry-After') ?? '10', 10) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`WATI ${res.status}: ${await res.text()}`)
    return res.json()
  }
  throw new Error('WATI rate limit retries exhausted')
}

interface Attachment {
  url: string
  type: string
  name: string
}

// Returns a placeholder attachment for broadcast messages that reference a document in their text
// but have no URL (Wati doesn't return document URLs for broadcast history items).
function broadcastDocumentPlaceholder(item: any): Attachment[] {
  if (item.eventType !== 'broadcastMessage') return []
  const text = String(item.finalText ?? '')
  if (/المستند المرفق|مرفق لكم فاتورة|المرفق|الوثيقة المرفقة/i.test(text)) {
    return [{ url: '', type: 'application/octet-stream', name: 'document' }]
  }
  return []
}

function extractAttachments(item: any): Attachment[] {
  const msgType: string = String(item.type ?? '')
  const data = item.data ?? {}
  // Wati stores media URL in several possible locations — try all of them
  const mediaUrl =
    data.url ?? data.link ?? data.mediaUrl ??
    item.media?.url ?? item.mediaUrl ?? item.url ??
    item.mediaHeaderLink ?? null  // broadcast messages use this field (often null)

  if (msgType === 'image') {
    const url = mediaUrl ?? item.image?.url ?? item.image?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'image/jpeg', name: data.caption ?? item.media?.caption ?? item.caption ?? 'image' }]
  }
  if (msgType === 'document') {
    const url = mediaUrl ?? item.document?.url ?? item.document?.link ?? null
    if (!url) return []
    const name = data.fileName ?? data.filename ?? item.document?.filename ?? item.document?.fileName ?? item.media?.fileName ?? item.fileName ?? 'document'
    const mime = data.mimeType ?? item.document?.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'application/octet-stream'
    return [{ url, type: mime, name }]
  }
  if (msgType === 'video') {
    const url = mediaUrl ?? item.video?.url ?? item.video?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'video/mp4', name: data.caption ?? item.caption ?? 'video' }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url = mediaUrl ?? item.audio?.url ?? item.audio?.link ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'audio/ogg', name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = mediaUrl ?? item.sticker?.url ?? item.sticker?.link ?? null
    if (!url) return []
    return [{ url, type: 'image/webp', name: 'sticker' }]
  }

  // Template / HSM messages — header may contain a document or image
  if (msgType === 'template' || msgType === 'hsm') {
    // Components array path: data.template.components[].type === 'header'
    const components: any[] = data.template?.components ?? data.components ?? []
    const header = components.find(
      (c: any) => (c.type ?? '').toLowerCase() === 'header'
    )

    // Direct header sub-objects from different Wati API shapes
    const headerDoc =
      header?.document ??
      data.template?.header?.document ??
      item.templateHeader?.document ??
      data.templateHeader?.document ?? null

    const headerImg =
      header?.image ??
      data.template?.header?.image ??
      item.templateHeader?.image ??
      data.templateHeader?.image ?? null

    if (headerDoc) {
      const url = headerDoc.url ?? headerDoc.link ?? mediaUrl ?? null
      if (url) {
        const name = headerDoc.filename ?? headerDoc.fileName ?? data.fileName ?? 'document'
        return [{ url, type: 'application/octet-stream', name }]
      }
    }
    if (headerImg) {
      const url = headerImg.url ?? headerImg.link ?? mediaUrl ?? null
      if (url) return [{ url, type: 'image/jpeg', name: 'image' }]
    }
    // Fallback: if the header format field tells us the type but url is elsewhere
    const headerFormat = (header?.format ?? data.template?.header?.format ?? '').toLowerCase()
    if (headerFormat === 'document' && mediaUrl) {
      const name = data.fileName ?? data.filename ?? item.media?.fileName ?? 'document'
      return [{ url: mediaUrl, type: 'application/octet-stream', name }]
    }
    if (headerFormat === 'image' && mediaUrl) {
      return [{ url: mediaUrl, type: 'image/jpeg', name: 'image' }]
    }
  }

  return []
}

// Extract the actual message content.
// item.finalText holds the rendered body for broadcastMessage events.
// item.eventDescription is always Wati platform metadata — never message content.
function extractText(item: any, msgType: string): string {
  // finalText — Wati's rendered template body for broadcastMessage items
  const finalText = item.finalText?.trim() ?? ''
  if (finalText) return finalText

  // Direct text field
  const direct = item.text?.trim() ?? ''
  if (direct) return direct

  // Caption (document/image with caption)
  const caption = item.caption?.trim() ?? item.data?.caption?.trim() ?? ''
  if (caption) return caption

  // data.body / data.text
  const dataBody = item.data?.body?.trim() ?? item.data?.text?.trim() ?? ''
  if (dataBody) return dataBody

  // Template / HSM — body from components
  const t = msgType.toLowerCase()
  if (t === 'template' || t === 'hsm') {
    const components: any[] = item.data?.template?.components ?? item.data?.components ?? []
    const bodyComp = components.find((c: any) => (c.type ?? '').toLowerCase() === 'body')
    const bodyText = bodyComp?.text?.trim() ?? ''
    if (bodyText) return bodyText
    const directBody = item.data?.template?.body?.trim() ?? ''
    if (directBody) return directBody
  }

  // contacts message — show formatted name of first contact
  if (msgType === 'contacts' && Array.isArray(item.contacts) && item.contacts.length > 0) {
    const name = item.contacts[0]?.name?.formatted_name ?? item.contacts[0]?.name?.first_name ?? null
    return name ? `📇 ${name}` : '📇 Contact card'
  }

  return item.body?.trim() ?? item.note?.trim() ?? ''
}

// GET /api/wati/fetch-messages?conversationId=...&phone=...&days=10
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const conversationId = searchParams.get('conversationId')
  const phone          = searchParams.get('phone')
  const days           = parseInt(searchParams.get('days') ?? '10', 10)

  if (!conversationId || !phone) {
    return NextResponse.json({ error: 'conversationId and phone required' }, { status: 400 })
  }
  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const cutoff   = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // WATI expects the number without the leading +
  const watiPhone = phone.replace(/^\+/, '')

  let pageNumber = 1
  const pageSize = 100
  const allItems: any[] = []
  let reachedCutoff = false

  while (!reachedCutoff) {
    let data: any
    try {
      data = await watiGet(
        `/api/v1/getMessages/${encodeURIComponent(watiPhone)}?pageSize=${pageSize}&pageNumber=${pageNumber}`
      )
    } catch (err: any) {
      console.error('[fetch-messages] WATI error', err.message)
      return NextResponse.json({ error: err.message }, { status: 502 })
    }

    const items: any[] = data?.messages?.items ?? []
    if (items.length === 0) break

    for (const item of items) {
      const ts = item.created
        ? new Date(item.created)
        : item.timestamp
        ? new Date(item.timestamp * 1000)
        : null

      if (ts && ts < cutoff) { reachedCutoff = true; break }
      allItems.push(item)
    }

    if (items.length < pageSize) break
    pageNumber++
    await sleep(200)
  }

  if (allItems.length === 0) {
    return NextResponse.json({ fetched: 0 })
  }

  // Separate reaction items from regular messages.
  // Wati's getMessages API does not return reactions as separate items —
  // they only arrive via the Wati webhook (push). The filter and Strategy B
  // (embedded reactions) below are kept as a safety net in case Wati changes
  // their API to include them.
  const reactionItems = allItems.filter((item: any) =>
    String(item.type ?? '').toLowerCase() === 'reaction'
  )
  const messageItems  = allItems.filter((item: any) => String(item.type ?? '').toLowerCase() !== 'reaction' && item.id)

  // Wati ticket events (eventType='ticket') cover all platform system events:
  //   type 0 = chat initialized, type 1 = assigned, type 2 = closed, type 5 = status change
  function isWatiSystemEvent(item: any): boolean {
    if (item.eventType === 'ticket') return true
    const t = String(item.type ?? '').toLowerCase()
    return t === 'note' || t === 'activity'
  }

  // Build message rows
  const rows = messageItems.map((item) => {
    // broadcastMessage = sent from system/agent (no owner field on broadcast items)
    const isAgent = item.owner === true || item.eventType === 'message_sent' || item.eventType === 'broadcastMessage'
    const ts        = item.created
      ? new Date(item.created).toISOString()
      : item.timestamp
      ? new Date(item.timestamp * 1000).toISOString()
      : new Date().toISOString()
    // Wati sometimes returns numeric type codes (0, 1, …) — normalise to string
    const msgType   = String(item.type ?? 'text')
    const isEvent   = isWatiSystemEvent(item)
    const attachments = isEvent ? [] : (extractAttachments(item).length > 0 ? extractAttachments(item) : broadcastDocumentPlaceholder(item))
    // For ticket events, use eventDescription as the display text (it's the correct system message)
    const rawText = isEvent
      ? (item.eventDescription?.trim() ?? '')
      : extractText(item, msgType)

    // Only use a [type] label when we have no text AND no attachment AND it's not a system event
    const text = rawText || (!isEvent && attachments.length === 0 && msgType !== 'text' && msgType !== '0'
      ? `[${msgType}]`
      : '')

    // Prefer whatsappMessageId (wamid) over Wati's internal id.
    // Reactions reference the wamid, so storing it here lets reaction
    // lookups find the right row. Fall back to the numeric Wati id if
    // the API response doesn't include whatsappMessageId.
    const externalId = item.whatsappMessageId ?? String(item.id)

    return {
      conversation_id: conversationId,
      from_type:       isAgent ? 'agent' : 'customer',
      source:          'whatsapp_api',
      text,
      agent_name:      isAgent ? (item.senderName ?? null) : null,
      attachments:     attachments.length > 0 ? attachments : null,
      delivery_status: isAgent ? normaliseStatus(item.statusString) : 'delivered',
      external_id:     externalId,
      created_at:      ts,
      message_kind:    isEvent ? 'event' : 'message',
    }
  })

  // ── Pre-claim rows stored by MMS with wati_ prefix ─────────────────────────
  // When an agent sends from MMS the row is immediately inserted with
  // external_id = 'wati_<wamid>'. The Wati API returns the same message with
  // external_id = '<wamid>' (no prefix). The upsert below uses onConflict:
  // 'external_id', so it would INSERT a second row (different key). We avoid
  // duplicates by first resolving those wati_-prefixed rows: update their
  // external_id to the bare form so the subsequent upsert hits the same row.
  const bareIds = rows.map((r) => r.external_id).filter(Boolean)
  if (bareIds.length > 0) {
    const watiPrefixIds = bareIds.map((id) => `wati_${id}`)
    const { data: prefixedRows } = await (supabase.from('chat_messages') as any)
      .select('id, external_id')
      .in('external_id', watiPrefixIds)
      .eq('conversation_id', conversationId)
    if (prefixedRows?.length) {
      for (const pr of prefixedRows as { id: string; external_id: string }[]) {
        const bareId = pr.external_id.replace(/^wati_/, '')
        await (supabase.from('chat_messages') as any)
          .update({ external_id: bareId })
          .eq('id', pr.id)
      }
    }
  }

  // Upsert — now safe: wati_-prefixed rows were renamed to bare ids above,
  // so onConflict:'external_id' will UPDATE them instead of inserting duplicates.
  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_messages') as any)
      .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false })
    if (error) {
      console.error('[fetch-messages] upsert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    inserted += chunk.length
  }

  // Apply reactions to target messages.
  // Strategy A: separate reaction items in the message list
  // Strategy B: reactions embedded in the message object itself (item.reactions[])
  //
  // We collect everything into a single map keyed by target message external_id,
  // then write it in one pass.
  const reactionsByTarget = new Map<string, { emoji: string; from_type: string }[]>()

  // Strategy A — dedicated reaction items (type === 'reaction')
  for (const item of reactionItems) {
    // Wati uses several different shapes for the target ID and emoji:
    //   • newer Cloud API:  item.reaction.messageId / item.reaction.emoji
    //   • older Wati style: item.reactionMessage.key.id / item.reactionMessage.text
    //   • flat fields:      item.referredMessageId / item.emoji or item.reactionEmoji
    const targetId =
      item.reactionMessage?.key?.id ??
      item.reaction?.messageId ??
      item.referredMessageId ??
      item.targetMessageId ??
      item.messageId ?? null

    const emoji =
      item.reactionMessage?.text ??
      item.reaction?.emoji ??
      item.emoji ??
      item.reactionEmoji ?? null

    if (!targetId || !emoji) continue
    const isAgent = item.owner === true || item.eventType === 'message_sent'
    const key = String(targetId)
    const list = reactionsByTarget.get(key) ?? []
    list.push({ emoji, from_type: isAgent ? 'agent' : 'customer' })
    reactionsByTarget.set(key, list)
  }

  // Strategy B — reactions embedded in message objects
  // Wati getMessages sometimes includes a `reactions` array on the message itself
  // rather than returning a separate reaction item.
  for (const item of allItems) {
    const embedded: any[] = item.reactions ?? item.reactionDetails ?? []
    if (!Array.isArray(embedded) || embedded.length === 0) continue
    const messageExternalId = item.whatsappMessageId ?? String(item.id)
    const list = reactionsByTarget.get(messageExternalId) ?? []
    for (const r of embedded) {
      const emoji = r.emoji ?? r.text ?? r.reactionText ?? null
      if (!emoji) continue
      const isAgent = r.owner === true || (r.senderType ?? '').toLowerCase() === 'agent'
      // Avoid duplicates if both strategy A and B fire for the same message
      if (!list.some((x) => x.emoji === emoji)) {
        list.push({ emoji, from_type: isAgent ? 'agent' : 'customer' })
      }
    }
    if (list.length > 0) reactionsByTarget.set(messageExternalId, list)
  }

  // Write reactions to DB
  for (const [targetId, reactions] of reactionsByTarget) {
    // Search by wamid AND legacy wati_<id> prefix used by the chat send flow
    const { data: targetRow } = await (supabase.from('chat_messages') as any)
      .select('id')
      .eq('conversation_id', conversationId)
      .in('external_id', [targetId, `wati_${targetId}`])
      .maybeSingle()

    if (targetRow) {
      await (supabase.from('chat_messages') as any)
        .update({ reactions })
        .eq('id', targetRow.id)
    }
  }

  // Update conversation last_message / last_message_at from the most recent message
  if (rows.length > 0) {
    const newest = rows.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    )
    await (supabase.from('chat_conversations') as any)
      .update({
        last_message:    newest.text || `[${newest.from_type === 'agent' ? 'sent' : 'received'}]`,
        last_message_at: newest.created_at,
      })
      .eq('id', conversationId)
  }

  return NextResponse.json({ fetched: inserted })
}
