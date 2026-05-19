import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `+${digits}`
}

/**
 * POST /api/wati/send-message
 *
 * Called by the MMS system whenever it sends a WhatsApp message to a customer.
 * Sends via Wati AND saves to chat_messages so the message (with any document)
 * is always visible in the Contact Centre chat history.
 *
 * Body (JSON):
 *   phone          string   — customer WhatsApp number, e.g. "+97455852848"
 *   text           string   — the rendered message body to display and send
 *   templateName?  string   — Wati template name (e.g. "normal_booking_conformation_utility")
 *   parameters?    Array<{name:string; value:string}> — template parameters for Wati
 *   documentUrl?   string   — URL of the document header attachment (PDF, etc.)
 *   documentName?  string   — filename shown in the chat (defaults to "document")
 *   imageUrl?      string   — URL of an image header attachment
 *   senderName?    string   — agent/system name shown in the chat bubble
 *   skipWatiSend?  boolean  — if true, skip the Wati API call and only save to DB
 *                             (use when your system already sent via Wati separately)
 */
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const {
    phone: rawPhone,
    text,
    templateName,
    parameters,
    documentUrl,
    documentName,
    imageUrl,
    senderName,
    skipWatiSend = false,
  } = body

  if (!rawPhone || !text) {
    return NextResponse.json({ error: 'phone and text are required' }, { status: 400 })
  }

  const phone = normalisePhone(rawPhone)
  const watiPhone = phone.replace(/^\+/, '')

  // ── 1. Send via Wati ────────────────────────────────────────────────────────
  let watiMessageId: string | null = null
  let watiSent = skipWatiSend // if skipped, treat as "already sent"
  let watiError: string | null = null

  if (!skipWatiSend && WATI_URL && WATI_TOKEN) {
    if (templateName) {
      const params = parameters ?? []
      const watiBody: any = {
        template_name:  templateName,
        broadcast_name: templateName,
        parameters:     params,
      }
      const res = await fetch(
        `${WATI_URL}/api/v1/sendTemplateMessage/${watiPhone}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(watiBody),
        }
      )
      if (res.ok) {
        const data = await res.json().catch(() => null)
        watiMessageId = data?.id ?? data?.messageId ?? null
        watiSent = true
      } else {
        const errText = await res.text().catch(() => '')
        watiError = `Wati ${res.status}: ${errText}`
        console.warn('[send-message] Wati template send failed:', res.status, errText)
      }
    } else {
      const res = await fetch(
        `${WATI_URL}/api/v1/sendSessionMessage/${watiPhone}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messageText: text }),
        }
      )
      if (res.ok) {
        const data = await res.json().catch(() => null)
        watiMessageId = data?.id ?? data?.messageId ?? null
        watiSent = true
      } else {
        const errText = await res.text().catch(() => '')
        watiError = `Wati ${res.status}: ${errText}`
        console.warn('[send-message] Wati session send failed:', res.status, errText)
      }
    }
  }

  // ── 2. Save to chat_messages ────────────────────────────────────────────────
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const ts = new Date().toISOString()

  // Build attachments array
  const attachments: Array<{ url: string; type: string; name: string }> = []
  if (documentUrl) {
    attachments.push({
      url:  documentUrl,
      type: 'application/pdf',
      name: documentName ?? 'document.pdf',
    })
  }
  if (imageUrl) {
    attachments.push({ url: imageUrl, type: 'image/jpeg', name: 'image' })
  }

  // Find or create conversation
  const { data: existing } = await (supabase.from('chat_conversations') as any)
    .select('id')
    .eq('wati_phone', phone)
    .maybeSingle()

  let conversationId: string

  if (existing) {
    conversationId = existing.id
    await (supabase.from('chat_conversations') as any)
      .update({
        last_message:    text,
        last_message_at: ts,
        ...(senderName ? { assigned_agent: senderName } : {}),
      })
      .eq('id', conversationId)
  } else {
    const { data: created, error } = await (supabase.from('chat_conversations') as any)
      .insert({
        wati_phone:      phone,
        last_message:    text,
        last_message_at: ts,
        unread_count:    0,
        ...(senderName ? { assigned_agent: senderName } : {}),
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[send-message] create conversation error', error)
      return NextResponse.json({ error: error?.message }, { status: 500 })
    }
    conversationId = created.id
  }

  // Insert message row (skip if duplicate external_id)
  const insertPayload: any = {
    conversation_id:  conversationId,
    from_type:        'agent',
    source:           'whatsapp_api',
    text,
    agent_name:       senderName ?? 'System',
    attachments:      attachments.length > 0 ? attachments : null,
    delivery_status:  'sent',
    message_kind:     'message',
    created_at:       ts,
  }
  if (watiMessageId) insertPayload.external_id = watiMessageId

  const { error: insertError } = await (supabase.from('chat_messages') as any)
    .insert(insertPayload)

  if (insertError) {
    console.error('[send-message] insert message error', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, conversationId, watiMessageId, watiSent, watiError })
}
