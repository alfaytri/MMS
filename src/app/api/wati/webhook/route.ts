import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { verifySharedSecret } from '@/lib/webhooks/verify'

const SUPA_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WATI_TOKEN      = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const WEBHOOK_SECRET  = process.env.WATI_WEBHOOK_SECRET ?? ''

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

const WATI_URL_WEBHOOK = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')

/**
 * Resolve a wamid to the Wati numeric ID by querying Wati's getMessages API.
 * Returns the numeric id if found, null otherwise.
 */
async function resolveWamidViaWati(phone: string, targetWamid: string): Promise<string | null> {
  if (!WATI_URL_WEBHOOK || !WATI_TOKEN) return null
  try {
    const watiPhone = phone.replace(/^\+/, '').replace(/\D/g, '')
    const res = await fetch(
      `${WATI_URL_WEBHOOK}/api/v1/getMessages/${encodeURIComponent(watiPhone)}?pageSize=50`,
      { headers: { Authorization: `Bearer ${WATI_TOKEN}` } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const items: any[] = data?.messages?.items ?? []
    for (const item of items) {
      // getMessages returns the wamid in whatsappMessageId
      if (item.whatsappMessageId === targetWamid) {
        return String(item.id) // the Wati numeric ID
      }
    }
    return null
  } catch {
    return null
  }
}

// Inbound WATI media URLs require a Bearer token — the browser can't supply that in
// <img src> or <video src>. Convert any URL that lives on the WATI server to our proxy
// endpoint /api/wati/media?path=... so the browser can fetch the media without credentials.
const WATI_MEDIA_PATH_RE = /^data\/(images|documents|videos|audios?|voice|stickers)\/[a-zA-Z0-9_\-.]+$/

function toProxyUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/')) return url  // already a local/proxy URL
  if (WATI_MEDIA_PATH_RE.test(url)) return `/api/wati/media?path=${encodeURIComponent(url)}`
  if (WATI_URL_WEBHOOK && url.startsWith(WATI_URL_WEBHOOK + '/')) {
    const rel = url.slice(WATI_URL_WEBHOOK.length + 1)
    if (WATI_MEDIA_PATH_RE.test(rel)) return `/api/wati/media?path=${encodeURIComponent(rel)}`
  }
  return url  // external/CDN/Supabase URL — use as-is
}

function extractAttachments(body: any, mappedMsgType?: string): Attachment[] {
  const WEBHOOK_TYPE_MAP: Record<string, string> = {
    '0': 'text', '1': 'image', '2': 'video', '3': 'audio',
    '4': 'document', '5': 'sticker', '6': 'location', '7': 'contacts',
  }
  const rawType = String(body.type ?? '')
  const msgType: string = mappedMsgType ?? WEBHOOK_TYPE_MAP[rawType] ?? rawType
  const rawData = body.data ?? {}

  // body.data can be a relative file path string (e.g. "data/images/uuid.jpg")
  let data: any = rawData
  let dataUrl: string | null = null
  if (typeof rawData === 'string' && rawData) {
    dataUrl = `${WATI_URL_WEBHOOK}/${rawData}`
    data = {}
  }

  const mediaUrl =
    dataUrl ??
    data.url ?? data.link ?? data.mediaUrl ?? data.filePath ?? data.fileUrl ?? data.mediaLink ??
    body.media?.url ?? body.media?.link ?? body.mediaUrl ?? body.url ?? body.filePath ?? null

  if (msgType === 'image') {
    const url  = toProxyUrl(mediaUrl ?? body.image?.url ?? body.image?.link ?? null) ?? ''
    const type = data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'image/jpeg'
    const name = data.caption ?? body.caption ?? 'image'
    return [{ url, type, name }]
  }
  if (msgType === 'document') {
    const url  = toProxyUrl(mediaUrl ?? body.document?.url ?? body.document?.link ?? null) ?? ''
    const textFilename = typeof body.text === 'string' && body.text ? body.text : null
    const name = textFilename ?? data.fileName ?? data.filename ?? body.document?.filename ?? body.document?.fileName ?? body.media?.fileName ?? body.fileName ?? 'document'
    const type = data.mimeType ?? body.document?.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'application/octet-stream'
    return [{ url, type, name }]
  }
  if (msgType === 'video') {
    const url  = toProxyUrl(mediaUrl ?? body.video?.url ?? body.video?.link ?? null) ?? ''
    const type = data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'video/mp4'
    const name = data.caption ?? body.caption ?? 'video'
    return [{ url, type, name }]
  }
  if (msgType === 'audio' || msgType === 'voice') {
    const url  = toProxyUrl(mediaUrl ?? body.audio?.url ?? body.audio?.link ?? null) ?? ''
    const type = data.mimeType ?? body.media?.mimeType ?? body.mimeType ?? 'audio/ogg'
    return [{ url, type, name: 'audio' }]
  }
  if (msgType === 'sticker') {
    const url = toProxyUrl(mediaUrl ?? body.sticker?.url ?? body.sticker?.link ?? null) ?? ''
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
      const url = toProxyUrl(headerDoc.url ?? headerDoc.link ?? mediaUrl ?? null)
      if (url) return [{ url, type: 'application/octet-stream', name: headerDoc.filename ?? headerDoc.fileName ?? 'document' }]
    }
    if (headerImg) {
      const url = toProxyUrl(headerImg.url ?? headerImg.link ?? mediaUrl ?? null)
      if (url) return [{ url, type: 'image/jpeg', name: 'image' }]
    }
    const headerFormat = (header?.format ?? data.template?.header?.format ?? '').toLowerCase()
    if (headerFormat === 'document' && mediaUrl) return [{ url: toProxyUrl(mediaUrl) ?? mediaUrl, type: 'application/octet-stream', name: data.fileName ?? 'document' }]
    if (headerFormat === 'image' && mediaUrl) return [{ url: toProxyUrl(mediaUrl) ?? mediaUrl, type: 'image/jpeg', name: 'image' }]
  }

  return []
}

// Media message types where body.text is the filename, not a user caption
const MEDIA_TYPES = new Set(['image', 'document', 'video', 'audio', 'voice', 'sticker'])

// Extract the best available text from any Wati message type
function extractWebhookText(body: any, msgType: string): string {
  const t = msgType.toLowerCase()

  // For media messages WATI puts the filename in body.text — skip it and only
  // use the actual user caption so we don't render filenames as chat text.
  if (MEDIA_TYPES.has(t)) {
    return body.caption?.trim() ?? body.data?.caption?.trim() ?? ''
  }

  // finalText — rendered template body on broadcastMessage webhook events
  const finalText = body.finalText?.trim() ?? ''
  if (finalText) return finalText
  const direct = body.text?.trim() ?? ''
  if (direct) return direct
  const caption = body.caption?.trim() ?? body.data?.caption?.trim() ?? ''
  if (caption) return caption
  const dataBody = body.data?.body?.trim() ?? body.data?.text?.trim() ?? ''
  if (dataBody) return dataBody
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
  // Shared-secret gate (timing-safe). Wati's webhook edit dialog has no custom-header
  // field — only URL / Status / Events — so we accept the secret as a query string
  // on the URL itself, matching the 3CX pattern. Configure WATI_WEBHOOK_SECRET in env
  // and set the webhook URL in the Wati dashboard to:
  //   https://<host>/api/wati/webhook?secret=<WATI_WEBHOOK_SECRET>
  // If WATI_WEBHOOK_SECRET is empty the helper fails open (dev / unconfigured) —
  // set it in production to actually gate inbound calls.
  const providedSecret = req.nextUrl.searchParams.get('secret')
  if (!verifySharedSecret(providedSecret, WEBHOOK_SECRET || undefined)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  const supabase = createClient<Database>(SUPA_URL, SUPA_KEY)
  const eventType: string = body.eventType ?? body.type ?? ''

  // ── No "Delete for Everyone" on WATI ──────────────────────────────────────
  // WhatsApp Business API recipients (which is what WATI uses on the agent
  // side) are treated by Meta as customer-service systems of record. The
  // "Delete for Everyone" button is hidden in both directions:
  //   • customer → business: only "Delete for me" appears in the customer's app
  //   • business → customer: same restriction in WATI / WhatsApp Business
  // So WATI never fires a deletion webhook in practice. If Meta ever relaxes
  // this for Business accounts, add a handler here that mirrors the WHAPI
  // statuses=deleted branch in src/app/api/whapi/webhook/route.ts and sets
  // chat_messages.revoked_at + clears text/attachments.

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
      // If the delivery status ID is a wamid, backfill the wamid column
      const statusWamid = String(externalId).startsWith('wamid.') ? String(externalId) : null

      // Try matching by external_id first (covers wati_ prefix + bare ID)
      const { data: updatedRows } = await supabase.from('chat_messages')
        .update({ delivery_status: status, ...(statusWamid ? { wamid: statusWamid } : {}) })
        .in('external_id', [String(externalId), `wati_${String(externalId)}`])
        .select('id')

      // Fallback: also try matching by wamid column (covers backfilled wamids)
      if ((!updatedRows || updatedRows.length === 0) && statusWamid) {
        const { data: updatedByWamid } = await supabase.from('chat_messages')
          .update({ delivery_status: status })
          .eq('wamid', statusWamid)
          .select('id')

        // Last resort: time-based fallback. Find the OLDEST agent message in the
        // conversation that's still in 'sent' status with no wamid. Delivery
        // events typically arrive in send order, so claiming the oldest unclaimed
        // 'sent' message is the safest match. We only escalate from 'sent';
        // never downgrade an already 'delivered' or 'read' message.
        if ((!updatedByWamid || updatedByWamid.length === 0) && body.waId && (status === 'delivered' || status === 'read')) {
          const phone = `+${body.waId.replace(/\D/g, '')}`
          const { data: conv } = await supabase.from('chat_conversations')
            .select('id')
            .eq('wati_phone', phone)
            .maybeSingle()
          if (conv?.id) {
            const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
            // For 'delivered': claim oldest message still in 'sent' (no later state)
            // For 'read':      claim oldest message in 'sent' or 'delivered'
            const claimableStates = status === 'read' ? ['sent', 'delivered'] : ['sent']
            const { data: oldest } = await supabase.from('chat_messages')
              .select('id')
              .eq('conversation_id', conv.id)
              .eq('from_type', 'agent')
              .eq('message_kind', 'message')
              .in('delivery_status', claimableStates)
              .is('wamid', null)
              .gte('created_at', cutoff)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle()
            if (oldest) {
              await supabase.from('chat_messages')
                .update({
                  delivery_status: status,
                  ...(statusWamid ? { wamid: statusWamid } : {}),
                })
                .eq('id', oldest.id)
              console.log('[webhook:status] strategy-4 claim', { rowId: oldest.id, status, statusWamid })
            }
          }
        }
      }
    }
    return NextResponse.json({ ok: true })
  }

  // ── Customer reaction ────────────────────────────────────────────────────────
  // Accept any payload whose type is 'reaction' regardless of which sub-field
  // carries the data — Wati uses at least three different shapes in the wild.
  if (String(body.type ?? '').toLowerCase() === 'reaction') {
    // Log the full body so Vercel logs reveal the exact field structure
    console.log('[webhook:reaction] full payload:', JSON.stringify(body))

    // Wati sends reactions with the target wamid in replyContextId
    // and the emoji in body.text (not in body.reaction / body.reactionMessage).
    // Also support the Cloud API shapes as fallback.
    const targetExternalId: string | null =
      body.replyContextId ??           // Wati actual shape: replyContextId = target wamid
      body.reaction?.messageId ??      // Cloud API style
      body.reactionMessage?.key?.id ?? // older Wati style
      body.referredMessageId ??
      body.targetMessageId ??
      body.messageId ?? null

    const emoji: string | null =
      body.text ??                      // Wati actual shape: text = emoji character
      body.reaction?.emoji ??           // Cloud API style
      body.reactionMessage?.text ??     // older Wati style
      body.emoji ??
      body.reactionEmoji ?? null

    // Wati echoes the agent's OWN reactions back to us as webhooks with
    // owner:true (or eventType=sessionMessageSent with type=reaction). If we
    // treat those as customer reactions, Supabase ends up with from_type:
    // 'customer' and Realtime overwrites the agent's local Dexie row — so
    // the reaction visually "disappears" from the agent's side and reappears
    // as the customer's. Always check owner here.
    const reactionOwnerIsTrue =
      body.owner === true ||
      (typeof body.owner === 'string' && body.owner.toLowerCase() === 'true')
    const reactionFromType: 'agent' | 'customer' = reactionOwnerIsTrue ? 'agent' : 'customer'

    console.log('[webhook:reaction] extracted', { targetExternalId, emoji, waId: body.waId, fromType: reactionFromType })

    if (targetExternalId) {
      // Strategy 1: Look up by external_id (covers bare wamid + wati_ prefix)
      let targetRow = (await supabase.from('chat_messages')
        .select('id, reactions')
        .in('external_id', [targetExternalId, `wati_${targetExternalId}`])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data

      // Strategy 2: Look up by the dedicated wamid column
      if (!targetRow) {
        targetRow = (await supabase.from('chat_messages')
          .select('id, reactions')
          .eq('wamid', targetExternalId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()).data
      }

      // Strategy 3: Resolve wamid → Wati numeric ID via Wati API, then look up
      // by that numeric ID. This handles the case where external_id is the Wati
      // numeric ID and the wamid column hasn't been populated yet.
      if (!targetRow && body.waId) {
        const phone = body.waId.replace(/\D/g, '')
        const numericId = await resolveWamidViaWati(phone, targetExternalId)
        console.log('[webhook:reaction] wamid resolve fallback', { numericId, targetExternalId })
        if (numericId) {
          targetRow = (await supabase.from('chat_messages')
            .select('id, reactions')
            .in('external_id', [numericId, `wati_${numericId}`])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()).data

          // Also backfill the wamid column so future reactions don't need the API call
          if (targetRow) {
            await supabase.from('chat_messages')
              .update({ wamid: targetExternalId })
              .eq('id', targetRow.id)
          }
        }
      }

      // Strategy 4: Time-based fallback. If all ID lookups failed, find the most
      // recent agent message in the conversation that does NOT yet have a wamid
      // and claim it. Reactions almost always target a recent message, so this
      // catches the common case where MMS sent a message and Wati never linked
      // its wamid to the row (either because the send response returned only the
      // numeric ID, or because Wati doesn't fire a sent_message webhook for
      // outbound API-sent messages).
      if (!targetRow && body.waId) {
        const phone = `+${body.waId.replace(/\D/g, '')}`
        const { data: conv } = await supabase.from('chat_conversations')
          .select('id')
          .eq('wati_phone', phone)
          .maybeSingle()
        if (conv?.id) {
          const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
          const { data: recent } = await supabase.from('chat_messages')
            .select('id, reactions')
            .eq('conversation_id', conv.id)
            .eq('from_type', 'agent')
            .eq('message_kind', 'message')
            .is('wamid', null)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (recent) {
            targetRow = recent
            // Backfill the wamid so subsequent reaction edits (toggle/remove)
            // can find this exact row without falling through to strategy 4 again
            await supabase.from('chat_messages')
              .update({ wamid: targetExternalId })
              .eq('id', recent.id)
            console.log('[webhook:reaction] strategy-4 claim', { rowId: recent.id, targetExternalId })
          }
        }
      }

      console.log('[webhook:reaction] db lookup', { found: !!targetRow, targetExternalId })

      if (targetRow) {
        const existing: { emoji: string; from_type: string }[] = (targetRow.reactions as unknown as Array<{ emoji: string; from_type: string }> | null) ?? []
        // Webhook semantics: emoji = "sender's current reaction is this".
        // Empty/null = "sender has no reaction". This is idempotent — the
        // same emoji arriving twice (WATI fires sessionMessageSent and
        // sessionMessageSent_v2 for the same reaction) leaves state unchanged
        // instead of toggling it off.
        const currentEmojiForSender = existing.find((r) => r.from_type === reactionFromType)?.emoji ?? null

        let updated = existing
        let isNewReaction = false
        if (emoji) {
          if (currentEmojiForSender !== emoji) {
            updated = [
              ...existing.filter((r) => r.from_type !== reactionFromType),
              { emoji, from_type: reactionFromType },
            ]
            // Surface "Reacted ..." preview only for genuine new customer reactions.
            isNewReaction = reactionFromType === 'customer'
          }
        } else if (currentEmojiForSender !== null) {
          updated = existing.filter((r) => r.from_type !== reactionFromType)
        }

        if (updated !== existing) {
          await supabase.from('chat_messages')
            .update({ reactions: updated })
            .eq('id', targetRow.id)
        }

        // Bump the conversation so the chat list resorts and shows recent activity.
        // For a NEW customer reaction, surface it in last_message so the user sees
        // "Reacted 👍 to your message" in the conversation list — and the existing
        // global sound subscription will fire because a chat_messages UPDATE event
        // includes the now-modified reactions array.
        if (body.waId) {
          const phone = `+${String(body.waId).replace(/\D/g, '')}`
          await supabase.from('chat_conversations')
            .update({
              last_message_at: new Date().toISOString(),
              ...(isNewReaction && emoji
                ? { last_message: `Reacted ${emoji} to your message` }
                : {}),
            })
            .eq('wati_phone', phone)
            .eq('provider', 'wati')
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

      await supabase.from('chat_conversations')
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
  // Wati uses several different shapes to mark agent-direction depending on the
  // message type and event source. Accept any of them so dashboard-sent and
  // template messages aren't mis-classified as customer messages.
  const AGENT_EVENT_TYPES = new Set([
    'message_sent',
    'sent_message',
    'broadcastMessage',
    'sessionMessageSent',
    'templateMessageSent',
    'newSessionMessage',
  ])
  const ownerIsTrue =
    body.owner === true ||
    (typeof body.owner === 'string' && body.owner.toLowerCase() === 'true')
  const isAgent = ownerIsTrue || AGENT_EVENT_TYPES.has(eventType)

  // Wati's older API returns numeric type codes — map them to string names so
  // extractAttachments and extractWebhookText work correctly.
  const WATI_TYPE_MAP: Record<string, string> = {
    '0': 'text', '1': 'image', '2': 'video', '3': 'audio',
    '4': 'document', '5': 'sticker', '6': 'location', '7': 'contacts',
  }
  const rawTypeStr = String(body.type ?? 'text')
  const msgType: string = (WATI_TYPE_MAP[rawTypeStr] ?? rawTypeStr).toLowerCase()

  // Detect Wati platform events: ticket events cover all system activity (type 0/1/2)
  const isMsgEvent = eventType === 'ticket' || msgType === 'note' || msgType === 'activity'

  const attachments = isMsgEvent ? [] : extractAttachments(body, msgType)

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

  // Extract the WhatsApp wamid if available in the payload.
  // Wati inconsistently places this in different fields depending on API version.
  // The send API returns a numeric ID in whatsappMessageId, while the webhook for
  // customer messages may include the real wamid in key.id or whatsappMessageId itself.
  const wamid: string | null =
    (typeof externalId === 'string' && externalId.startsWith('wamid.') ? externalId : null) ??
    (typeof body.key?.id === 'string' && String(body.key.id).startsWith('wamid.') ? String(body.key.id) : null) ??
    (typeof body.messageKey?.id === 'string' && String(body.messageKey.id).startsWith('wamid.') ? String(body.messageKey.id) : null) ??
    null

  // WATI's internal MongoDB ObjectID — needed by their sendReaction endpoint.
  // body.id is the ObjectID when it's a 24-char hex string (not a wamid).
  const watiId: string | null =
    (typeof body.id === 'string' && /^[a-f0-9]{24}$/i.test(body.id)) ? body.id : null

  // Prefer body.timestamp (Unix epoch of actual WhatsApp delivery) over body.created.
  // body.created on bot auto-replies is often the customer's trigger-message time,
  // not the bot's reply time, causing auto-replies to appear before earlier agent messages.
  const ts = body.timestamp
    ? new Date(Number(body.timestamp) * 1000).toISOString()
    : body.created
    ? new Date(body.created).toISOString()
    : new Date().toISOString()
  const senderName: string | null = body.senderName ?? null
  // For agent messages, Wati sends the operator identity separately
  const operatorName: string | null =
    body.operatorName ?? body.operator?.name ?? body.operatorEmail ?? null

  // Find or create conversation (wati provider only — whapi has its own row)
  const { data: existing } = await supabase.from('chat_conversations')
    .select('id, unread_count')
    .eq('wati_phone', phone)
    .eq('provider', 'wati')
    .maybeSingle()

  let conversationId: string

  if (existing) {
    conversationId = existing.id
    await supabase.from('chat_conversations')
      .update({
        ...(!isMsgEvent ? { last_message: text || `[${msgType}]`, last_message_at: ts, last_message_from_type: isAgent ? 'agent' : 'customer' } : {}),
        ...(senderName ? { wati_contact_name: senderName } : {}),
        ...(assignedAgentInMsg ? { assigned_agent: assignedAgentInMsg } : {}),
        ...(!isAgent && !isMsgEvent ? { unread_count: (existing.unread_count ?? 0) + 1 } : {}),
      })
      .eq('id', conversationId)
  } else {
    const { data: created, error } = await supabase.from('chat_conversations')
      .insert({
        wati_phone:             phone,
        wati_contact_name:      senderName,
        last_message:           text || `[${msgType}]`,
        last_message_at:        ts,
        last_message_from_type: isAgent ? 'agent' : 'customer',
        unread_count:           isAgent ? 0 : 1,
        ...(assignedAgentInMsg ? { assigned_agent: assignedAgentInMsg } : {}),
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Race condition: a concurrent webhook created the conversation first.
        // Re-fetch the winning row and continue processing the message normally.
        // MUST filter by provider — otherwise multiple rows exist (wati + whapi)
        // and maybeSingle() returns null, dropping the message.
        const { data: raced } = await supabase.from('chat_conversations')
          .select('id, unread_count')
          .eq('wati_phone', phone)
          .eq('provider', 'wati')
          .maybeSingle()
        if (!raced) {
          console.error('[webhook] create conversation error (race recovery failed)', error)
          return NextResponse.json({ error: error?.message }, { status: 500 })
        }
        conversationId = raced.id
        if (!isAgent && !isMsgEvent) {
          await supabase.from('chat_conversations')
            .update({ unread_count: (raced.unread_count ?? 0) + 1 })
            .eq('id', conversationId)
        }
      } else {
        console.error('[webhook] create conversation error', error)
        return NextResponse.json({ error: error?.message }, { status: 500 })
      }
    } else {
      conversationId = created.id
    }
  }

  // Dedup + insert via Postgres RPC. All historical dedup branches (exact
  // external_id, agent optimistic-row match, broad text-based dedup, wamid
  // dedup) now live inside `cc_dedup_insert_message`, guarded by an advisory
  // lock keyed on (conversation_id, from_type, text). This serialises the
  // parallel WATI webhook firings that previously each missed each other's
  // SELECT and inserted side-by-side duplicate rows. See migration
  // 20260622103234_chat_messages_dedup_rpc.sql.
  if (externalId) {
    // Guard against creating empty agent ghost rows. The app's local-first
    // sync worker already inserted the canonical row via pushFullMessage;
    // a stray webhook with no content would otherwise show as "[empty message]".
    if (isAgent && !isMsgEvent && !text && attachments.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'empty agent message' })
    }

    // Agent messages never carry WATI's own attachment URLs to the insert —
    // the canonical Supabase Storage URL was written by the send flow. For
    // dedup-and-backfill on an existing agent row the RPC also leaves the
    // attachments column untouched.
    const insertAttachments = isAgent ? null : (attachments.length > 0 ? attachments : null)

    // The RPC signature was declared without DEFAULT NULL on the nullable
    // params (p_text, p_agent_name, p_external_id, p_wamid, p_wati_id), so
    // Supabase typegen marks them all as required `string`. The function body
    // explicitly handles NULL for each of these (IS NULL / COALESCE branches),
    // so passing null at runtime is correct — we cast through `unknown` only
    // to silence the typegen mismatch without rewriting the migration.
    const rpcArgs = {
      p_conversation_id: conversationId,
      p_from_type:       isAgent ? 'agent' : 'customer',
      p_source:          'whatsapp_api',
      p_text:            text || null,
      p_agent_name:      isAgent ? (operatorName ?? senderName) : null,
      p_attachments:     insertAttachments as unknown as import('@/types/database.types').Json,
      p_delivery_status: isAgent ? normaliseStatus(body.statusString) : 'delivered',
      p_external_id:     externalId,
      p_wamid:           wamid,
      p_wati_id:         watiId,
      p_created_at:      ts,
      p_message_kind:    isMsgEvent ? 'event' : 'message',
    }
    const { error: rpcErr } = await supabase.rpc(
      'cc_dedup_insert_message',
      rpcArgs as unknown as Database['public']['Functions']['cc_dedup_insert_message']['Args'],
    )

    if (rpcErr) {
      console.error('[webhook] cc_dedup_insert_message failed', rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
