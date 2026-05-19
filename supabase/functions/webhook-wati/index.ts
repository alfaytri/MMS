// supabase/functions/webhook-wati/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPA_URL     = Deno.env.get('SUPABASE_URL')!
const SUPA_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WATI_SECRET  = Deno.env.get('WATI_WEBHOOK_SECRET') ?? ''

const supabase = createClient(SUPA_URL, SUPA_SERVICE)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('+')) {
    const d = cleaned.slice(1)
    if (d.length >= 7 && d.length <= 15 && /^\d+$/.test(d)) return cleaned
    throw new Error(`unnormalisable: ${raw}`)
  }
  const digits = cleaned.replace(/\D/g, '')
  if (digits.startsWith('00974') && digits.length === 13) return `+${digits.slice(2)}`
  if (digits.startsWith('974')   && digits.length === 11) return `+${digits}`
  if (digits.length === 8 && /^[3-9]/.test(digits))       return `+974${digits}`
  throw new Error(`unnormalisable: ${raw}`)
}

type EventClass = 'inbound' | 'outbound' | 'status'

function classifyEvent(payload: Record<string, unknown>): EventClass {
  const type = String(payload.type ?? payload.eventType ?? '')
  if (type === 'status_update' || 'statusUpdateType' in payload) return 'status'
  if (payload.senderType === 'agent' || payload.isFromMe === true) return 'outbound'
  return 'inbound'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 })

  if (WATI_SECRET) {
    const sig = req.headers.get('x-wati-signature') ?? ''
    if (sig) {
      const body = await req.clone().text()
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey('raw', encoder.encode(WATI_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
      if (sig !== expected) return json({ error: 'Invalid signature' }, 401)
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Bad JSON' }, 400)
  }

  const eventClass = classifyEvent(payload)

  if (eventClass === 'status') {
    const messageId = String(payload.id ?? payload.messageId ?? '')
    const rawStatus = String(payload.status ?? payload.statusUpdateType ?? 'sent').toLowerCase()
    const statusMap: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }
    const deliveryStatus = statusMap[rawStatus] ?? 'sent'
    if (messageId) {
      await supabase
        .from('chat_messages')
        .update({ delivery_status: deliveryStatus })
        .eq('external_id', `wati_${messageId}`)
    }
    return json({ ok: true })
  }

  const rawPhone = String(payload.waId ?? payload.phone ?? payload.from ?? '')
  let phone: string
  try {
    phone = normalisePhone(rawPhone)
  } catch {
    return json({ error: 'unnormalisable phone', raw: rawPhone }, 422)
  }

  const messageId = String(payload.id ?? payload.messageId ?? '')
  const externalId = messageId ? `wati_${messageId}` : null
  const text       = String(payload.text ?? payload.body ?? payload.message ?? '')
  const timestamp  = payload.timestamp ? new Date(Number(payload.timestamp) * 1000).toISOString() : new Date().toISOString()

  const attachmentUrl  = payload.media ? String((payload.media as Record<string,unknown>).url ?? '') || null : null
  const attachmentType = payload.media ? String((payload.media as Record<string,unknown>).type ?? '') || null : null
  const attachmentName = payload.media ? String((payload.media as Record<string,unknown>).fileName ?? '') || null : null

  const { data: phoneLookup } = await supabase
    .from('service_customer_phones')
    .select('customer_id')
    .eq('phone', phone)
    .maybeSingle()

  const customerId = phoneLookup?.customer_id ?? null

  const { data: convoData, error: convoErr } = await supabase
    .from('chat_conversations')
    .upsert(
      {
        wati_phone:      phone,
        customer_id:     customerId,
        last_message:    text || (attachmentName ?? '[attachment]'),
        last_message_at: timestamp,
      },
      { onConflict: 'wati_phone', ignoreDuplicates: false }
    )
    .select('id, unread_count')
    .single()

  if (convoErr || !convoData) {
    console.error('convo upsert error', convoErr)
    return json({ error: 'conversation upsert failed' }, 500)
  }

  const conversationId = convoData.id

  if (eventClass === 'inbound') {
    await supabase
      .from('chat_conversations')
      .update({ unread_count: (convoData.unread_count ?? 0) + 1 })
      .eq('id', conversationId)
  }

  if (externalId) {
    const { error: msgErr } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id:  conversationId,
        from_type:        eventClass === 'inbound' ? 'customer' : 'agent',
        source:           'whatsapp_api',
        text:             text || null,
        attachment_url:   attachmentUrl,
        attachment_type:  attachmentType,
        attachment_name:  attachmentName,
        delivery_status:  eventClass === 'inbound' ? 'delivered' : 'sent',
        external_id:      externalId,
        created_at:       timestamp,
      })

    if (msgErr && msgErr.code !== '23505') {
      console.error('msg insert error', msgErr)
    }
  }

  return json({ ok: true })
})
