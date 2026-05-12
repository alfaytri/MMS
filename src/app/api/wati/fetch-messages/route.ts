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

function extractAttachments(item: any): Attachment[] {
  const msgType: string = String(item.type ?? '')
  const data = item.data ?? {}
  // Wati uses data.url OR media.url OR a type-specific sub-object
  const mediaUrl = data.url ?? item.media?.url ?? null

  if (msgType === 'image') {
    const url = mediaUrl ?? item.image?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? 'image/jpeg', name: data.caption ?? item.media?.caption ?? 'image' }]
  }
  if (msgType === 'document') {
    const url = mediaUrl ?? item.document?.url ?? item.document?.link ?? null
    if (!url) return []
    const name = data.fileName ?? data.filename ?? item.document?.filename ?? item.document?.fileName ?? item.media?.fileName ?? 'document'
    const mime = data.mimeType ?? item.document?.mimeType ?? item.media?.mimeType ?? 'application/octet-stream'
    return [{ url, type: mime, name }]
  }
  if (msgType === 'video') {
    const url = mediaUrl ?? item.video?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? 'video/mp4', name: data.caption ?? 'video' }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url = mediaUrl ?? item.audio?.url ?? null
    if (!url) return []
    return [{ url, type: data.mimeType ?? item.media?.mimeType ?? 'audio/ogg', name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = mediaUrl ?? item.sticker?.url ?? null
    if (!url) return []
    return [{ url, type: 'image/webp', name: 'sticker' }]
  }
  return []
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

  // Separate reaction items from regular messages
  const reactionItems = allItems.filter((item) => item.type === 'reaction' && item.reactionMessage)
  const messageItems  = allItems.filter((item) => item.type !== 'reaction' && item.id)

  // Build message rows
  const rows = messageItems.map((item) => {
    const isAgent   = item.owner === true || item.eventType === 'message_sent'
    const ts        = item.created
      ? new Date(item.created).toISOString()
      : item.timestamp
      ? new Date(item.timestamp * 1000).toISOString()
      : new Date().toISOString()
    // Wati sometimes returns numeric type codes (0, 1, …) — normalise to string
    const msgType   = String(item.type ?? 'text')
    const attachments = extractAttachments(item)

    // text is NOT NULL in DB — use label for media-only messages
    const text = typeof item.text === 'string' && item.text.trim()
      ? item.text.trim()
      : msgType !== 'text' && msgType !== '0'   // '0' is Wati's numeric code for plain text
      ? `[${msgType}]`
      : ''

    return {
      conversation_id: conversationId,
      from_type:       isAgent ? 'agent' : 'customer',
      source:          'whatsapp_api',
      text,
      agent_name:      isAgent ? (item.senderName ?? null) : null,
      attachments:     attachments.length > 0 ? attachments : null,
      delivery_status: isAgent ? normaliseStatus(item.statusString) : 'delivered',
      external_id:     String(item.id),
      created_at:      ts,
    }
  })

  // Upsert with conflict on external_id (skip duplicates thanks to unique index)
  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_messages') as any)
      .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: true })
    if (error) {
      console.error('[fetch-messages] upsert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    inserted += chunk.length
  }

  // Apply reactions to target messages
  if (reactionItems.length > 0) {
    const reactionsByTarget = new Map<string, { emoji: string; from_type: string }[]>()
    for (const item of reactionItems) {
      const targetId = item.reactionMessage?.key?.id
      const emoji    = item.reactionMessage?.text
      if (!targetId || !emoji) continue
      const isAgent  = item.owner === true || item.eventType === 'message_sent'
      const list = reactionsByTarget.get(String(targetId)) ?? []
      list.push({ emoji, from_type: isAgent ? 'agent' : 'customer' })
      reactionsByTarget.set(String(targetId), list)
    }
    for (const [targetExternalId, reactions] of reactionsByTarget) {
      await (supabase.from('chat_messages') as any)
        .update({ reactions })
        .eq('external_id', targetExternalId)
        .eq('conversation_id', conversationId)
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
