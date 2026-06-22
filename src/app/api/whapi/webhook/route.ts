import { type NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySharedSecret } from '@/lib/webhooks/verify'
import { buildAttachmentSkeleton, mirrorWhapiMedia, type StoredAttachment } from '@/lib/whapi/store-media'

const WEBHOOK_SECRET = process.env.WHAPI_WEBHOOK_SECRET ?? ''

type MediaKey = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'
const MEDIA_KEYS: MediaKey[] = ['image', 'video', 'audio', 'voice', 'document', 'sticker']

// Pending mirror jobs collected during webhook processing. After the response
// goes out we download each file from WHAPI once, upload to Supabase Storage,
// and UPDATE chat_messages.attachments. The realtime UPDATE event swaps the
// URL in the open chat without the user noticing.
interface MirrorJob {
  messageRowId: string
  externalId:   string
  phone:        string
  mediaKey:     MediaKey
  media:        Record<string, unknown>
}

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
  // Verify shared secret via header (timing-safe comparison)
  // NOTE: After deploying, update the WHAPI webhook URL configuration
  // to send the secret as an 'x-webhook-secret' header instead of a query parameter.
  if (!verifySharedSecret(req.headers.get('x-webhook-secret'), WEBHOOK_SECRET || undefined)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  const supabase = createAdminClient()
  const eventType = body?.event?.type
  const mirrorJobs: MirrorJob[] = []

  // ── Status updates ───────────────────────────────────────────────────────────
  if (eventType === 'statuses') {
    for (const s of (body.statuses ?? [])) {
      const externalId: string = s.id
      if (!externalId) continue

      const rawStatus = (s.status ?? '').toString().toLowerCase()
      if (rawStatus === 'deleted') {
        // WhatsApp "delete for everyone": clear the message body but keep the
        // row so the UI can render a "deleted" placeholder. Reactions stay.
        await supabase.from('chat_messages')
          .update({
            revoked_at:  new Date().toISOString(),
            text:        null,
            attachments: null,
          })
          .eq('external_id', externalId)
        continue
      }

      await supabase.from('chat_messages')
        .update({ delivery_status: normaliseStatus(s.status ?? '') })
        .eq('external_id', externalId)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Messages ─────────────────────────────────────────────────────────────────
  if (eventType !== 'messages') return NextResponse.json({ ok: true })

  for (const msg of (body.messages ?? [])) {
    const msgType: string = (msg.type ?? 'text').toLowerCase()

    // ── Reaction ───────────────────────────────────────────────────────────────
    // WHAPI sends reactions as type='action' with action.type='reaction'.
    // Older WHAPI builds used type='reaction' — accept both for safety.
    const isReaction =
      msgType === 'reaction' ||
      (msgType === 'action' && (msg.action?.type ?? '').toLowerCase() === 'reaction')

    if (isReaction) {
      const targetId: string | null = msg.action?.target ?? msg.reaction?.message_id ?? null
      const emoji:    string | null = msg.action?.emoji  ?? msg.reaction?.emoji      ?? null
      // WHAPI echoes the agent's own reactions back with from_me:true. Without
      // this attribution check we'd overwrite the agent's Dexie reaction with
      // a 'customer' one and the emoji would visually disappear from their side.
      const reactionFromType: 'agent' | 'customer' = msg.from_me === true ? 'agent' : 'customer'

      if (targetId) {
        const { data: targetRow } = await supabase.from('chat_messages')
          .select('id, reactions')
          .eq('external_id', targetId)
          .maybeSingle()

        if (targetRow) {
          const existing: { emoji: string; from_type: string }[] = (targetRow.reactions as unknown as Array<{ emoji: string; from_type: string }> | null) ?? []
          // Webhook semantics: emoji = current state, empty = cleared.
          // Idempotent — duplicate webhooks don't toggle.
          const currentEmojiForSender = existing.find((r) => r.from_type === reactionFromType)?.emoji ?? null

          let updated = existing
          if (emoji) {
            if (currentEmojiForSender !== emoji) {
              updated = [
                ...existing.filter((r) => r.from_type !== reactionFromType),
                { emoji, from_type: reactionFromType },
              ]
            }
          } else if (currentEmojiForSender !== null) {
            updated = existing.filter((r) => r.from_type !== reactionFromType)
          }

          if (updated !== existing) {
            await supabase.from('chat_messages')
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

    // chat_name = name saved in WHAPI phonebook; from_name = WhatsApp push name
    const contactName: string | null = msg.chat_name ?? msg.from_name ?? null

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

    // Build attachment skeletons with the /api/whapi/media proxy URL — instant,
    // no network. After the webhook responds, mirrorWhapiMedia() downloads each
    // file once and UPDATEs the row to point at Supabase Storage, after which
    // WHAPI is never hit again for that message.
    const attachments: StoredAttachment[] = []
    const pendingMedia: { key: MediaKey; media: Record<string, unknown> }[] = []
    for (const key of MEDIA_KEYS) {
      if (msgType !== key) continue
      const media = msg[key]
      if (!media) continue
      const skeleton = buildAttachmentSkeleton(media, key)
      if (!skeleton) continue
      attachments.push(skeleton)
      pendingMedia.push({ key, media })
      if (!text && typeof media.caption === 'string') text = media.caption.trim()
    }

    const previewText = text || (msgType !== 'text' ? `[${msgType}]` : '')

    // Dedup check
    if (externalId) {
      const { data: dup } = await supabase.from('chat_messages')
        .select('id')
        .eq('external_id', externalId)
        .maybeSingle()
      if (dup) continue
    }

    // Find or create conversation (idempotent, out-of-order timestamp guard).
    // ignoreDuplicates: false so wati_contact_name is kept fresh on every message.
    await supabase.from('chat_conversations')
      .upsert(
        { wati_phone: phone, provider: 'whapi', ...(contactName ? { wati_contact_name: contactName } : {}) },
        { onConflict: 'wati_phone,provider', ignoreDuplicates: false }
      )

    const { data: convo } = await supabase.from('chat_conversations')
      .update({
        last_message:           previewText,
        last_message_at:        ts,
        last_message_from_type: 'customer',
        unread_count:           1,
        ...(contactName ? { wati_contact_name: contactName } : {}),
      })
      .eq('wati_phone', phone)
      .eq('provider', 'whapi')
      .or(`last_message_at.is.null,last_message_at.lt.${ts}`)
      .select('id')
      .maybeSingle()

    // Fallback: get the existing conversation id if update didn't match (newer msg already there)
    let conversationId: string | null = convo?.id ?? null
    if (!conversationId) {
      const { data: existing } = await supabase.from('chat_conversations')
        .select('id')
        .eq('wati_phone', phone)
        .eq('provider', 'whapi')
        .maybeSingle()
      conversationId = existing?.id ?? null
    }

    if (!conversationId || !externalId) continue

    // Insert message
    const { data: inserted, error: insertErr } = await supabase.from('chat_messages')
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
      .select('id')
      .single()

    if (insertErr) {
      console.error('[whapi/webhook] insert message error', insertErr)
      continue
    }

    if (inserted && pendingMedia.length > 0) {
      for (const { key, media } of pendingMedia) {
        mirrorJobs.push({
          messageRowId: inserted.id,
          externalId,
          phone,
          mediaKey:     key,
          media:        media as Record<string, unknown>,
        })
      }
    }
  }

  // Schedule background mirroring so the webhook returns immediately. The chat
  // already has the message via realtime (using the proxy URL); the UPDATE
  // below swaps the URL to a permanent Supabase Storage URL that costs zero
  // WHAPI requests on future renders.
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
          .select('attachments')
          .eq('id', job.messageRowId)
          .maybeSingle()
        if (!row) continue

        const current = (row.attachments as StoredAttachment[] | null) ?? []
        // Replace the matching skeleton (same kind) with the mirrored copy.
        // We can identify it by the original proxy URL containing the WHAPI media id.
        const next = current.map((att) => {
          if (att.storage_path) return att                 // already mirrored
          const isProxy = typeof att.url === 'string' && att.url.startsWith('/api/whapi/media')
          if (!isProxy) return att
          return stored
        })
        await admin.from('chat_messages')
          .update({ attachments: next })
          .eq('id', job.messageRowId)
      }
    })
  }

  return NextResponse.json({ ok: true })
}
