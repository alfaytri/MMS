import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) return `+${digits}`
  }
  const digits = cleaned.replace(/\D/g, '')
  if (digits.startsWith('00974') && digits.length === 13) return `+${digits.slice(2)}`
  if (digits.startsWith('974')   && digits.length === 11) return `+${digits}`
  if (digits.length === 8 && /^[3-9]/.test(digits))       return `+974${digits}`
  if (digits.length >= 7 && digits.length <= 15)           return `+${digits}`
  return null
}

function contactName(c: any): string | null {
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return full || c.fullName || c.name || null
}

// GET /api/wati/lookup-contact?phone=+97412345678
// Fetches a single contact from WATI by phone, upserts into chat_conversations,
// and returns the conversation row.
export async function GET(req: NextRequest) {
  if (!WATI_URL || !WATI_TOKEN)
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })

  const rawPhone = req.nextUrl.searchParams.get('phone') ?? ''
  const phone = normalisePhone(rawPhone)
  if (!phone)
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  // WATI expects the number without the leading +
  const waNumber = phone.replace(/^\+/, '')

  const watiRes = await fetch(`${WATI_URL}/api/v1/getContact/${waNumber}`, {
    headers: { Authorization: `Bearer ${WATI_TOKEN}` },
  })

  if (!watiRes.ok) {
    const text = await watiRes.text()
    // 404 means the contact doesn't exist in WATI
    if (watiRes.status === 404)
      return NextResponse.json({ conversation: null })
    return NextResponse.json({ error: `WATI ${watiRes.status}: ${text}` }, { status: 502 })
  }

  const contact = await watiRes.json()

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // Resolve customer_id via phone lookup
  const { data: phoneLookup } = await (supabase as any)
    .from('service_customer_phones')
    .select('customer_id')
    .eq('phone', phone)
    .maybeSingle()

  const date = contact.lastReceivedMessageDate
    ? new Date(contact.lastReceivedMessageDate).toISOString()
    : null

  const row: Record<string, any> = {
    wati_phone:        phone,
    wati_contact_name: contactName(contact),
    customer_id:       phoneLookup?.customer_id ?? null,
  }
  if (date) {
    row.last_message    = contact.lastMessage ?? null
    row.last_message_at = date
  }

  const { error: upsertErr } = await (supabase.from('chat_conversations') as any)
    .upsert(row, { onConflict: 'wati_phone', ignoreDuplicates: false })

  if (upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Return the full conversation row (with customer name join)
  const { data: convo, error: fetchErr } = await (supabase as any)
    .from('chat_conversations')
    .select(`
      id, customer_id, conversation_type, wati_phone, wati_contact_name,
      last_message, last_message_at, unread_count, created_at,
      service_customers(name)
    `)
    .eq('wati_phone', phone)
    .maybeSingle()

  if (fetchErr || !convo)
    return NextResponse.json({ conversation: null })

  return NextResponse.json({
    conversation: {
      ...convo,
      customer_name: convo.service_customers?.name ?? convo.wati_contact_name ?? null,
    },
  })
}
