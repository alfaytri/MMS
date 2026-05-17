import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const WHAPI_BASE_URL = 'https://gate.whapi.cloud'
const WHAPI_TOKEN    = process.env.WHAPI_TOKEN ?? ''

/**
 * Format a raw phone number for the WHAPI `to` field.
 * Strips all non-digit characters, then appends `@s.whatsapp.net`.
 * e.g. "+97412345678" → "97412345678@s.whatsapp.net"
 */
function formatWhapiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `${digits}@s.whatsapp.net`
}

/**
 * Normalise a raw phone number to E.164-style with leading `+`.
 * Used as the canonical key for `chat_conversations.wati_phone`.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `+${digits}`
}

/**
 * POST /api/whapi/send-message
 *
 * Sends a WhatsApp message via WHAPI and saves it to the Contact Centre
 * chat history (chat_conversations + chat_messages).
 *
 * Body (JSON):
 *   phone          string   — customer WhatsApp number, e.g. "+97412345678"
 *   text           string   — message body text
 *   documentUrl?   string   — URL of a document attachment (PDF, etc.)
 *   documentName?  string   — filename shown to the recipient (defaults to "document")
 *   imageUrl?      string   — URL of an image attachment
 *   senderName?    string   — agent/system name shown in the chat bubble
 */
export async function POST(req: NextRequest) {
  // ── 1. Require authenticated session ────────────────────────────────────────
  const gate = await requireAuth()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  // ── 2. Parse and validate request body ──────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    phone: rawPhone,
    text,
    documentUrl,
    documentName,
    imageUrl,
    senderName,
    skipDbInsert,
  } = body as {
    phone?: string
    text?: string
    documentUrl?: string
    documentName?: string
    imageUrl?: string
    senderName?: string
    skipDbInsert?: boolean
  }

  if (!rawPhone || !text) {
    return NextResponse.json({ error: 'phone and text are required' }, { status: 400 })
  }

  const phone      = normalisePhone(rawPhone)
  const whapiPhone = formatWhapiPhone(rawPhone)

  // ── 3. Send via WHAPI ────────────────────────────────────────────────────────
  let messageId: string | null = null
  let whapiOk = false
  let whapiError: string | null = null

  try {
    let endpoint: string
    let whapiBody: Record<string, string>

    if (documentUrl) {
      endpoint  = `${WHAPI_BASE_URL}/messages/document`
      whapiBody = {
        to:       whapiPhone,
        filename: documentName ?? 'document',
        media:    documentUrl,
      }
    } else if (imageUrl) {
      endpoint  = `${WHAPI_BASE_URL}/messages/image`
      whapiBody = {
        to:      whapiPhone,
        caption: text,
        media:   imageUrl,
      }
    } else {
      endpoint  = `${WHAPI_BASE_URL}/messages/text`
      whapiBody = {
        to:   whapiPhone,
        body: text,
      }
    }

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(whapiBody),
    })

    if (res.ok) {
      const data = await res.json().catch(() => null)
      messageId = data?.message?.id ?? data?.id ?? null
      whapiOk   = true
    } else {
      const errText = await res.text().catch(() => '')
      whapiError = `WHAPI ${res.status}: ${errText}`
      console.warn('[whapi/send-message] WHAPI send failed:', res.status, errText)
    }
  } catch (err) {
    whapiError = err instanceof Error ? err.message : String(err)
    console.error('[whapi/send-message] WHAPI fetch threw:', whapiError)
  }

  // ── 4. Save to Supabase (skipped when caller manages its own optimistic row) ──
  if (!skipDbInsert) {
    const supabase = createAdminClient()
    const ts       = new Date().toISOString()

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

    // Find or create conversation row keyed by phone
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
      const { data: created, error: createErr } = await (supabase.from('chat_conversations') as any)
        .insert({
          wati_phone:      phone,
          last_message:    text,
          last_message_at: ts,
          unread_count:    0,
          ...(senderName ? { assigned_agent: senderName } : {}),
        })
        .select('id')
        .single()

      if (createErr || !created) {
        console.error('[whapi/send-message] create conversation error', createErr)
        return NextResponse.json({ error: createErr?.message ?? 'Failed to create conversation' }, { status: 500 })
      }
      conversationId = created.id
    }

    // Insert the outbound message row
    const insertPayload: Record<string, unknown> = {
      conversation_id: conversationId,
      from_type:       'agent',
      source:          'whatsapp_api',
      text,
      agent_name:      senderName ?? 'Agent',
      attachments:     attachments.length > 0 ? attachments : null,
      delivery_status: whapiOk ? 'sending' : 'failed',
      message_kind:    'message',
      created_at:      ts,
    }
    if (messageId) insertPayload.external_id = messageId

    const { error: insertErr } = await (supabase.from('chat_messages') as any)
      .insert(insertPayload)

    if (insertErr) {
      console.error('[whapi/send-message] insert message error', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
  }

  // ── 5. Return result ─────────────────────────────────────────────────────────
  if (!whapiOk) {
    return NextResponse.json({ ok: false, error: whapiError }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messageId })
}
