import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import type { WatiMessageItem, WatiTemplateComponent, WatiGetMessagesResponse } from '@/types/wati'

// Staging row type — concrete non-null fields matching what messageItems.map builds,
// plus the temporary _isBroadcast marker stripped before DB upsert.
interface ChatMessageRow {
  conversation_id: string
  from_type: string
  source: 'whatsapp_api'
  text: string
  agent_name: string | null
  attachments: Attachment[] | null
  delivery_status: string
  external_id: string
  wamid: string | null
  created_at: string
  message_kind: string
  _isBroadcast?: boolean
}

// Row shape after _isBroadcast is stripped, ready for DB upsert.
// attachments is cast to Json at the upsert callsite.
type ChatMessageUpsert = Omit<ChatMessageRow, '_isBroadcast'>

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

async function watiGet(path: string): Promise<WatiGetMessagesResponse> {
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

const FETCH_MEDIA_TYPES = new Set(['image', 'document', 'video', 'audio', 'voice', 'sticker'])

// Returns a placeholder attachment for broadcast messages that reference a document in their text
// but have no URL (Wati doesn't return document URLs for broadcast history items).
function broadcastDocumentPlaceholder(item: WatiMessageItem): Attachment[] {
  if (item.eventType !== 'broadcastMessage') return []
  const text = String(item.finalText ?? '')
  if (/المستند المرفق|مرفق لكم فاتورة|المرفق|الوثيقة المرفقة/i.test(text)) {
    return [{ url: '', type: 'application/octet-stream', name: 'document' }]
  }
  return []
}

function extractAttachments(item: WatiMessageItem): Attachment[] {
  const msgType: string = String(item.type ?? '')
  const rawData = item.data ?? {}

  // Wati's getMessages API returns item.data as a relative file path string
  // (e.g. "data/images/uuid.jpg", "data/documents/uuid.pdf") instead of an object.
  // WATI requires Bearer auth to fetch these, so route through our proxy which
  // adds the token server-side, allowing <img src> and fetch() to work without credentials.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Wati data is polymorphic (string paths, nested objects, primitives)
  let data = rawData as Record<string, any>
  let dataUrl: string | null = null
  if (typeof rawData === 'string' && rawData) {
    dataUrl = `/api/wati/media?path=${encodeURIComponent(rawData)}`
    data = {}  // reset so .url / .mimeType etc. lookups below still work for object shape
  }

  // Wati stores media URL in several possible locations — try all of them
  const mediaUrl =
    dataUrl ??
    data.url ?? data.link ?? data.mediaUrl ?? data.filePath ?? data.fileUrl ?? data.mediaLink ??
    item.media?.url ?? item.media?.link ?? item.mediaUrl ?? item.url ?? item.filePath ??
    item.mediaHeaderLink ?? null  // broadcast messages use this field (often null)

  // For customer media, item.text holds the original filename (e.g. "invoice.pdf")
  const textFilename = typeof item.text === 'string' && item.text ? item.text : null

  if (msgType === 'image') {
    const url = mediaUrl ?? item.image?.url ?? item.image?.link ?? null
    return [{ url: url ?? '', type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'image/jpeg', name: data.caption ?? item.media?.caption ?? item.caption ?? 'image' }]
  }
  if (msgType === 'document') {
    const url = mediaUrl ?? item.document?.url ?? item.document?.link ?? null
    const name = textFilename ?? data.fileName ?? data.filename ?? item.document?.filename ?? item.document?.fileName ?? item.media?.fileName ?? item.fileName ?? 'document'
    const mime = data.mimeType ?? item.document?.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'application/octet-stream'
    return [{ url: url ?? '', type: mime, name }]
  }
  if (msgType === 'video') {
    const url = mediaUrl ?? item.video?.url ?? item.video?.link ?? null
    return [{ url: url ?? '', type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'video/mp4', name: data.caption ?? item.caption ?? 'video' }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url = mediaUrl ?? item.audio?.url ?? item.audio?.link ?? null
    return [{ url: url ?? '', type: data.mimeType ?? item.media?.mimeType ?? item.mimeType ?? 'audio/ogg', name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = mediaUrl ?? item.sticker?.url ?? item.sticker?.link ?? null
    return [{ url: url ?? '', type: 'image/webp', name: 'sticker' }]
  }

  // Template / HSM messages — header may contain a document or image
  if (msgType === 'template' || msgType === 'hsm') {
    // Components array path: data.template.components[].type === 'header'
    const components: WatiTemplateComponent[] = (data.template as Record<string, unknown>)?.components as WatiTemplateComponent[] ?? data.components as WatiTemplateComponent[] ?? []
    const header = components.find(
      (c: WatiTemplateComponent) => (c.type ?? '').toLowerCase() === 'header'
    )

    // Direct header sub-objects from different Wati API shapes
    type MediaRef = { url?: string; link?: string; filename?: string; fileName?: string } | null
    const headerDoc: MediaRef =
      header?.document ??
      ((data.template as Record<string, unknown>)?.header as Record<string, unknown>)?.document as MediaRef ??
      item.templateHeader?.document ??
      (data.templateHeader as Record<string, unknown>)?.document as MediaRef ?? null

    const headerImg: MediaRef =
      header?.image ??
      ((data.template as Record<string, unknown>)?.header as Record<string, unknown>)?.image as MediaRef ??
      item.templateHeader?.image ??
      (data.templateHeader as Record<string, unknown>)?.image as MediaRef ?? null

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
    const headerFormat = String(header?.format ?? ((data.template as Record<string, unknown>)?.header as Record<string, unknown>)?.format ?? '').toLowerCase()
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
function extractText(item: WatiMessageItem, msgType: string): string {
  // Narrow item.data once — it can be a string path or an object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemData: Record<string, any> | null = typeof item.data === 'object' && item.data ? item.data as Record<string, any> : null

  // finalText — Wati's rendered template body for broadcastMessage items
  const finalText = item.finalText?.trim() ?? ''
  if (finalText) return finalText

  // For media messages item.text contains the filename — use caption only
  if (FETCH_MEDIA_TYPES.has(msgType.toLowerCase())) {
    return item.caption?.trim() ?? itemData?.caption?.trim() ?? ''
  }

  // Direct text field
  const direct = item.text?.trim() ?? ''
  if (direct) return direct

  // Caption (document/image with caption)
  const caption = item.caption?.trim() ?? itemData?.caption?.trim() ?? ''
  if (caption) return caption

  // data.body / data.text
  const dataBody = itemData?.body?.trim() ?? itemData?.text?.trim() ?? ''
  if (dataBody) return dataBody

  // Template / HSM — body from components
  const t = msgType.toLowerCase()
  if (t === 'template' || t === 'hsm') {
    const components: WatiTemplateComponent[] = itemData?.template?.components as WatiTemplateComponent[] ?? itemData?.components as WatiTemplateComponent[] ?? []
    const bodyComp = components.find((c: WatiTemplateComponent) => (c.type ?? '').toLowerCase() === 'body')
    const bodyText = bodyComp?.text?.trim() ?? ''
    if (bodyText) return bodyText
    const directBody = itemData?.template?.body?.trim() ?? ''
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

  const supabase = createClient<Database>(SUPA_URL, SUPA_KEY)
  const cutoff   = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // WATI expects the number without the leading +
  const watiPhone = phone.replace(/^\+/, '')

  let pageNumber = 1
  const pageSize = 100
  const allItems: WatiMessageItem[] = []
  let reachedCutoff = false

  while (!reachedCutoff) {
    let data: WatiGetMessagesResponse
    try {
      data = await watiGet(
        `/api/v1/getMessages/${encodeURIComponent(watiPhone)}?pageSize=${pageSize}&pageNumber=${pageNumber}`
      )
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[fetch-messages] WATI error', errMsg)
      return NextResponse.json({ error: errMsg }, { status: 502 })
    }

    const items: WatiMessageItem[] = data?.messages?.items ?? []
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
  const reactionItems = allItems.filter((item: WatiMessageItem) =>
    String(item.type ?? '').toLowerCase() === 'reaction'
  )
  const messageItems  = allItems.filter((item: WatiMessageItem) => String(item.type ?? '').toLowerCase() !== 'reaction' && item.id)

  // Wati ticket events (eventType='ticket') cover all platform system events:
  //   type 0 = chat initialized, type 1 = assigned, type 2 = closed, type 5 = status change
  function isWatiSystemEvent(item: WatiMessageItem): boolean {
    if (item.eventType === 'ticket') return true
    const t = String(item.type ?? '').toLowerCase()
    return t === 'note' || t === 'activity'
  }

  // Wati's older API returns numeric type codes instead of string names.
  // Map them here so extractAttachments / extractText / isWatiSystemEvent all work correctly.
  const WATI_TYPE_MAP: Record<string, string> = {
    '0': 'text', '1': 'image', '2': 'video', '3': 'audio',
    '4': 'document', '5': 'sticker', '6': 'location', '7': 'contacts',
  }

  // Wati's getMessages API returns the operator/agent direction in several
  // different shapes depending on the message type:
  //   • Session message sent from Wati UI: item.owner === true
  //   • Same but JSON-stringified by some Wati edges: item.owner === 'true'
  //   • Broadcast/template messages: no owner field, eventType = 'broadcastMessage'
  //   • Some Wati event payloads use 'sessionMessageSent' / 'templateMessageSent'
  // Treat any of these as agent-direction so dashboard-sent and template messages
  // don't get mis-classified as customer messages.
  const AGENT_EVENT_TYPES = new Set([
    'message_sent',
    'sent_message',
    'broadcastMessage',
    'sessionMessageSent',
    'templateMessageSent',
    'newSessionMessage',
  ])
  function itemIsAgent(item: WatiMessageItem): boolean {
    if (item.owner === true) return true
    if (typeof item.owner === 'string' && item.owner.toLowerCase() === 'true') return true
    if (item.eventType && AGENT_EVENT_TYPES.has(String(item.eventType))) return true
    return false
  }

  // Build message rows
  let rows: ChatMessageRow[] = messageItems.map((item) => {
    // broadcastMessage = sent from system/agent (no owner field on broadcast items)
    const isAgent = itemIsAgent(item)
    const ts        = item.created
      ? new Date(item.created).toISOString()
      : item.timestamp
      ? new Date(item.timestamp * 1000).toISOString()
      : new Date().toISOString()
    const rawTypeStr = String(item.type ?? 'text')
    const msgType    = WATI_TYPE_MAP[rawTypeStr] ?? rawTypeStr
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

    // Store the WhatsApp wamid separately so the reaction webhook can
    // find messages by wamid even when external_id holds the numeric ID.
    const rowWamid: string | null =
      (typeof item.whatsappMessageId === 'string' && item.whatsappMessageId.startsWith('wamid.') ? item.whatsappMessageId : null)

    return {
      conversation_id: conversationId,
      from_type:       isAgent ? 'agent' : 'customer',
      source:          'whatsapp_api',
      text,
      agent_name:      isAgent ? (item.senderName ?? null) : null,
      attachments:     attachments.length > 0 ? attachments : null,
      delivery_status: isAgent ? normaliseStatus(item.statusString) : 'delivered',
      external_id:     externalId,
      wamid:           rowWamid,
      created_at:      ts,
      message_kind:    isEvent ? 'event' : 'message',
      // marker only — never written to DB; stripped before upsert
      _isBroadcast:    item.eventType === 'broadcastMessage',
    }
  })

  // ── Pre-claim rows stored by MMS with wati_ prefix ─────────────────────────
  // When an agent sends from MMS the row is immediately inserted with
  // external_id = 'wati_<id>'. The Wati API returns the same message with
  // external_id = '<wamid>' (no prefix, and possibly a *different* ID format —
  // e.g. the send API returns a numeric id but getMessages returns a wamid).
  //
  // Strategy 1 — exact prefix match: look for wati_<exactId> in DB and strip prefix.
  // Strategy 2 — text+time fallback: for agent messages not resolved by strategy 1,
  //   find an existing agent row with the same text within ±5 minutes and update its
  //   external_id. This handles the numeric→wamid mismatch that causes duplicate rows.
  //
  // Both strategies update the DB row's external_id BEFORE the upsert so that
  // onConflict:'external_id' hits the existing row instead of inserting a new one.

  const resolvedExternalIds = new Set<string>() // bare ids that were successfully pre-claimed

  // Strategy 1: exact wati_<id> prefix match
  const bareIds = rows.map((r) => r.external_id).filter(Boolean)
  if (bareIds.length > 0) {
    const watiPrefixIds = bareIds.map((id) => `wati_${id}`)
    const { data: prefixedRows } = await supabase.from('chat_messages')
      .select('id, external_id')
      .in('external_id', watiPrefixIds)
      .eq('conversation_id', conversationId)
    if (prefixedRows?.length) {
      for (const pr of prefixedRows as { id: string; external_id: string }[]) {
        const bareId = pr.external_id.replace(/^wati_/, '')
        await supabase.from('chat_messages')
          .update({ external_id: bareId })
          .eq('id', pr.id)
        resolvedExternalIds.add(bareId)
      }
    }
  }

  // Strategy 2: text+time fallback for unresolved agent messages
  // Catches the case where the send API returned a numeric id (stored as wati_12345)
  // but getMessages returns the wamid (wAMID.xxx) — a different string, so strategy 1
  // finds nothing and the upsert would INSERT a duplicate row.
  for (const row of rows) {
    if (resolvedExternalIds.has(row.external_id)) continue
    if (row.from_type !== 'agent' || row.message_kind !== 'message') continue

    const ts      = new Date(row.created_at)
    const tsMinus = new Date(ts.getTime() - 5 * 60_000).toISOString()
    const tsPlus  = new Date(ts.getTime() + 5 * 60_000).toISOString()

    if (row.text?.trim()) {
      // Text match: find an agent row with matching text within ±5 min
      const { data: textMatch } = await supabase.from('chat_messages')
        .select('id, external_id')
        .eq('conversation_id', conversationId)
        .eq('from_type', 'agent')
        .eq('message_kind', 'message')
        .eq('text', row.text.trim())
        .gte('created_at', tsMinus)
        .lte('created_at', tsPlus)
        .maybeSingle()

      if (textMatch) {
        await supabase.from('chat_messages')
          .update({ external_id: row.external_id })
          .eq('id', (textMatch as { id: string }).id)
        resolvedExternalIds.add(row.external_id)
      }
    } else if (row.attachments?.length) {
      // File message with no text: find the optimistic row the app inserted.
      // Try wati_-prefixed first (sendSessionFile returned a numeric id),
      // then fall back to null external_id (sendSessionFileViaUrl returned nothing).
      let fileMatchId: string | null = null

      const { data: pm } = await supabase.from('chat_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('from_type', 'agent')
        .eq('message_kind', 'message')
        .like('external_id', 'wati_%')
        .gte('created_at', tsMinus)
        .lte('created_at', tsPlus)
        .maybeSingle()
      fileMatchId = (pm as { id: string } | null)?.id ?? null

      if (!fileMatchId) {
        const { data: nm } = await supabase.from('chat_messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('from_type', 'agent')
          .eq('message_kind', 'message')
          .is('external_id', null)
          .in('delivery_status', ['sent', 'sending'])
          .gte('created_at', tsMinus)
          .lte('created_at', tsPlus)
          .maybeSingle()
        fileMatchId = (nm as { id: string } | null)?.id ?? null
      }

      if (fileMatchId) {
        await supabase.from('chat_messages')
          .update({ external_id: row.external_id })
          .eq('id', fileMatchId)
        resolvedExternalIds.add(row.external_id)
      }
    }
  }

  // Only allow upsert for agent rows whose external_id already exists in DB.
  // This ensures the upsert fires as ON CONFLICT DO UPDATE — never a fresh INSERT
  // (which would land with attachments=null → the "📎 Attachment" placeholder).
  const agentExternalIds = rows
    .filter((r) => r.from_type === 'agent' && r.external_id)
    .map((r) => r.external_id as string)

  const existingAgentRows = new Set<string>()
  if (agentExternalIds.length > 0) {
    const { data: existing } = await supabase.from('chat_messages')
      .select('external_id')
      .in('external_id', agentExternalIds)
      .eq('conversation_id', conversationId)
      .eq('from_type', 'agent')
    for (const r of (existing ?? []) as { external_id: string }[]) {
      existingAgentRows.add(r.external_id)
    }
  }

  // ── Customer-row dedup by wamid ──────────────────────────────────────────────
  // The Wati webhook may have already inserted the customer message with
  // external_id = wamid. If fetch-messages then runs and the Wati getMessages
  // API returns a different ID (e.g. numeric instead of wamid), the row would
  // get inserted twice with two different external_ids. To prevent this, pre-
  // load every existing customer message in this conversation by wamid and
  // external_id, and skip any incoming row that already exists.
  const customerWamids = rows
    .filter((r) => r.from_type === 'customer' && r.wamid)
    .map((r) => r.wamid as string)
  const customerExternalIds = rows
    .filter((r) => r.from_type === 'customer' && r.external_id)
    .map((r) => r.external_id)

  const existingCustomerKeys = new Set<string>()
  if (customerWamids.length > 0) {
    const { data: byWamid } = await supabase.from('chat_messages')
      .select('wamid')
      .in('wamid', customerWamids)
      .eq('conversation_id', conversationId)
      .eq('from_type', 'customer')
    for (const r of (byWamid ?? []) as { wamid: string }[]) {
      if (r.wamid) existingCustomerKeys.add(`wamid:${r.wamid}`)
    }
  }
  if (customerExternalIds.length > 0) {
    const { data: byExternal } = await supabase.from('chat_messages')
      .select('external_id, wamid')
      .in('external_id', customerExternalIds)
      .eq('conversation_id', conversationId)
      .eq('from_type', 'customer')
    for (const r of (byExternal ?? []) as { external_id: string; wamid: string | null }[]) {
      existingCustomerKeys.add(`ext:${r.external_id}`)
      if (r.wamid) existingCustomerKeys.add(`wamid:${r.wamid}`)
    }
  }

  // Drop any incoming customer row whose wamid OR external_id already exists.
  // This prevents the webhook+fetch race from creating duplicate rows.
  if (existingCustomerKeys.size > 0) {
    rows = rows.filter((r) => {
      if (r.from_type !== 'customer') return true
      if (r.wamid && existingCustomerKeys.has(`wamid:${r.wamid}`)) return false
      if (r.external_id && existingCustomerKeys.has(`ext:${r.external_id}`)) return false
      return true
    })
  }

  // Text-based customer dedup — the wamid/external_id checks above miss the
  // common case where Wati uses DIFFERENT IDs across firings for the same
  // logical WhatsApp message:
  //   • the webhook stored the row with external_id = wamid.HBgL... (wamid=null)
  //   • the Wati getMessages API later returns the same message with
  //     external_id = "9876543210" (numeric Wati id) → ID-based dedup misses
  //     because neither external_id nor wamid matches.
  // Without this guard the user sees the same customer bubble twice in the
  // chat thread. Match on conversation + customer direction + identical text
  // within ±5 minutes — wider window than the webhook because fetch can run
  // long after the original message landed.
  const customerTextCandidates = rows.filter(
    (r) => r.from_type === 'customer' && r.message_kind === 'message' && r.text?.trim(),
  )
  if (customerTextCandidates.length > 0) {
    const minTs = customerTextCandidates.reduce(
      (acc, r) => Math.min(acc, new Date(r.created_at).getTime() - 5 * 60_000),
      Infinity,
    )
    const maxTs = customerTextCandidates.reduce(
      (acc, r) => Math.max(acc, new Date(r.created_at).getTime() + 5 * 60_000),
      -Infinity,
    )
    const { data: nearbyCustomerRows } = await supabase.from('chat_messages')
      .select('text, created_at')
      .eq('conversation_id', conversationId)
      .eq('from_type', 'customer')
      .eq('message_kind', 'message')
      .gte('created_at', new Date(minTs).toISOString())
      .lte('created_at', new Date(maxTs).toISOString())

    const existingCustomerByText = new Map<string, number[]>()
    for (const e of (nearbyCustomerRows ?? []) as { text: string | null; created_at: string }[]) {
      const t = (e.text ?? '').trim()
      if (!t) continue
      const list = existingCustomerByText.get(t) ?? []
      list.push(new Date(e.created_at).getTime())
      existingCustomerByText.set(t, list)
    }

    if (existingCustomerByText.size > 0) {
      rows = rows.filter((r) => {
        if (r.from_type !== 'customer' || !r.text?.trim()) return true
        const matches = existingCustomerByText.get(r.text.trim())
        if (!matches) return true
        const rowTs = new Date(r.created_at).getTime()
        // Drop the incoming row if there's already a customer message with the
        // same exact text within 5 minutes.
        return !matches.some((at) => Math.abs(at - rowTs) <= 5 * 60_000)
      })
    }
  }

  // Safety net against direction-flip duplicates: if an incoming customer row
  // happens to match an existing AGENT row by exact text within ±5 minutes,
  // drop it. This catches the case where Wati's response shape causes our
  // direction classifier to mis-label an outbound message as inbound — without
  // this, the user sees the same message twice (once on the left as customer,
  // once on the right as agent from MMS's own insert).
  const candidateCustomerRows = rows.filter(
    (r) => r.from_type === 'customer' && r.message_kind === 'message' && r.text?.trim(),
  )
  if (candidateCustomerRows.length > 0) {
    const minTs = candidateCustomerRows.reduce(
      (acc, r) => Math.min(acc, new Date(r.created_at).getTime() - 5 * 60_000),
      Infinity,
    )
    const maxTs = candidateCustomerRows.reduce(
      (acc, r) => Math.max(acc, new Date(r.created_at).getTime() + 5 * 60_000),
      -Infinity,
    )
    const { data: nearbyAgentRows } = await supabase.from('chat_messages')
      .select('text, created_at')
      .eq('conversation_id', conversationId)
      .eq('from_type', 'agent')
      .eq('message_kind', 'message')
      .gte('created_at', new Date(minTs).toISOString())
      .lte('created_at', new Date(maxTs).toISOString())

    const agentByText = new Map<string, number[]>()
    for (const a of (nearbyAgentRows ?? []) as { text: string | null; created_at: string }[]) {
      const t = (a.text ?? '').trim()
      if (!t) continue
      const list = agentByText.get(t) ?? []
      list.push(new Date(a.created_at).getTime())
      agentByText.set(t, list)
    }

    if (agentByText.size > 0) {
      rows = rows.filter((r) => {
        if (r.from_type !== 'customer' || !r.text?.trim()) return true
        const matches = agentByText.get(r.text.trim())
        if (!matches) return true
        const rowTs = new Date(r.created_at).getTime()
        return !matches.some((at) => Math.abs(at - rowTs) <= 5 * 60_000)
      })
    }
  }

  // Upsert — now safe: wati_-prefixed rows were renamed to bare ids above,
  // so onConflict:'external_id' will UPDATE them instead of inserting duplicates.
  //
  // Attachment URL preservation: omit the `attachments` column from the upsert
  // payload whenever all URLs in the row are empty strings. WATI's getMessages
  // API often returns media messages without a URL (e.g. it hasn't fetched the
  // media yet). If we blindly upsert `attachments:[{url:''}]` we overwrite the
  // valid Supabase Storage URL we wrote when the agent originally sent the file.
  // Omitting the column leaves the existing DB value untouched on UPDATE while
  // still inserting null for genuinely new rows with no URL.
  // ── Deduplicate rows by external_id ──────────────────────────────────────────
  // Wati's getMessages API can return the same message twice under different
  // pagination windows. Passing duplicates into a single upsert batch causes
  // "ON CONFLICT DO UPDATE command cannot affect row a second time". Keep the
  // last occurrence (most recently fetched = freshest metadata).
  {
    const seen = new Set<string>()
    const unique: typeof rows = []
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!seen.has(rows[i].external_id)) {
        seen.add(rows[i].external_id)
        unique.unshift(rows[i])
      }
    }
    rows = unique
  }

  // PostgREST normalises bulk upsert payloads: if ANY object in the array has
  // the `attachments` key, PostgREST adds `attachments = NULL` to every object
  // that omitted it, and the ON CONFLICT UPDATE then overwrites the existing DB
  // value with NULL. To prevent this we split into two streams:
  //   • withAttachments  — customer rows that have a real URL
  //   • noAttachments    — agent rows + customer rows without a URL
  // Each stream is upserted separately so PostgREST's column normalisation
  // doesn't bleed across them.
  //
  // The `wamid` column is NOT included in the upsert payload — a null wamid in
  // the batch would overwrite an existing non-null wamid on the DB row. Instead,
  // wamid is backfilled in a separate pass after the upsert.
  type UpsertRow = Omit<ChatMessageUpsert, 'wamid'>
  const withAttachments: UpsertRow[] = []
  const noAttachments:   UpsertRow[] = []

  for (const row of rows) {
    const _isBroadcast = row._isBroadcast === true
    if (row.from_type === 'agent') {
      const isNew = !existingAgentRows.has(row.external_id)
      // Existing MMS-sent rows: SKIP ENTIRELY. The row already has the canonical
      // Supabase Storage URL in attachments and the correct delivery_status.
      // Including it in any upsert stream forces PostgREST to write
      // attachments=null on the existing row (because every object in a bulk
      // upsert ends up with the same keys), which would wipe the video URL and
      // make the message render as "[empty message]" — i.e. it would disappear.
      // Delivery-status escalation (sent → delivered → read) is handled by the
      // dedicated delivery-status webhook, not by this batch path.
      if (!isNew) continue

      // NEW agent rows: Wati-native broadcasts OR messages sent from the Wati
      // web/mobile dashboard (which MMS never pre-inserted, and whose webhook
      // may have been dropped). Treat their attachments like customer rows:
      // real URL → withAttachments, no URL → noAttachments.
      const { attachments, _isBroadcast: _mb, wamid: _w, ...rest } = row
      const hasRealUrl = (attachments as Array<{ url?: string }> | null)?.some((a) => a.url)
      if (hasRealUrl) {
        withAttachments.push({ ...rest, attachments })
      } else {
        noAttachments.push({ ...rest, attachments: null })
      }
    } else {
      const { _isBroadcast: _mb, wamid: _w, ...rowClean } = row
      const hasRealUrl = (row.attachments as Array<{ url?: string }> | null)?.some((a) => a.url)
      if (hasRealUrl) {
        withAttachments.push(rowClean)
      } else {
        noAttachments.push({ ...rowClean, attachments: null })
      }
    }
  }

  const CHUNK = 200
  let inserted = 0

  for (const stream of [withAttachments, noAttachments]) {
    for (let i = 0; i < stream.length; i += CHUNK) {
      const chunk = stream.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const { error } = await supabase.from('chat_messages')
        .upsert(
          chunk.map((r) => ({ ...r, attachments: r.attachments as unknown as Json })),
          { onConflict: 'external_id', ignoreDuplicates: false },
        )
      if (error) {
        console.error('[fetch-messages] upsert error', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      inserted += chunk.length
    }
  }

  // ── Backfill wamid column ────────────────────────────────────────────────────
  // The wamid was excluded from the upsert to avoid overwriting existing values
  // with null. Now update only rows that have a wamid from the getMessages API.
  const wamidRows = rows.filter((r) => r.wamid)
  if (wamidRows.length > 0) {
    for (const wr of wamidRows) {
      await supabase.from('chat_messages')
        .update({ wamid: wr.wamid })
        .eq('external_id', wr.external_id)
        .eq('conversation_id', conversationId)
    }
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
    const isAgent = itemIsAgent(item)
    const key = String(targetId)
    const list = reactionsByTarget.get(key) ?? []
    list.push({ emoji, from_type: isAgent ? 'agent' : 'customer' })
    reactionsByTarget.set(key, list)
  }

  // Strategy B — reactions embedded in message objects
  // Wati getMessages sometimes includes a `reactions` array on the message itself
  // rather than returning a separate reaction item.
  for (const item of allItems) {
    const embedded: Array<{ emoji?: string; text?: string; reactionText?: string; owner?: boolean; senderType?: string }> = item.reactions ?? item.reactionDetails ?? []
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
    // Search by external_id, wati_<id> prefix, AND the dedicated wamid column
    let targetRow = (await supabase.from('chat_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .in('external_id', [targetId, `wati_${targetId}`])
      .maybeSingle()).data

    if (!targetRow) {
      targetRow = (await supabase.from('chat_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('wamid', targetId)
        .maybeSingle()).data
    }

    if (targetRow) {
      await supabase.from('chat_messages')
        .update({ reactions })
        .eq('id', targetRow.id)
    }
  }

  // Update conversation last_message / last_message_at from the most recent real message
  if (rows.length > 0) {
    const realMessages = rows.filter((r) => r.message_kind === 'message')
    if (realMessages.length > 0) {
      const newest = realMessages.reduce((a, b) =>
        new Date(a.created_at) > new Date(b.created_at) ? a : b
      )
      const fromType: 'agent' | 'customer' =
        newest.from_type === 'agent' ? 'agent' : 'customer'
      await supabase.from('chat_conversations')
        .update({
          last_message:           newest.text || `[${fromType === 'agent' ? 'sent' : 'received'}]`,
          last_message_at:        newest.created_at,
          last_message_from_type: fromType,
        })
        .eq('id', conversationId)
    }
  }

  return NextResponse.json({ fetched: inserted })
}
