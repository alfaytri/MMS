import { NextResponse } from 'next/server'
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

export async function POST() {
  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  let pageNumber = 1
  const pageSize = 100
  let totalSynced = 0

  while (true) {
    const res = await fetch(
      `${WATI_URL}/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`,
      { headers: { Authorization: `Bearer ${WATI_TOKEN}` } }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error('[sync-contacts] WATI error', res.status, text)
      return NextResponse.json({ error: `WATI ${res.status}`, detail: text }, { status: 502 })
    }

    const data = await res.json()
    const contacts: any[] = data?.contact_list ?? []
    if (contacts.length === 0) break

    for (const contact of contacts) {
      const rawPhone: string = contact.phone ?? contact.wAid ?? ''
      if (!rawPhone) continue

      const phone = normalisePhone(rawPhone)
      if (!phone) continue

      const { data: phoneLookup } = await supabase
        .from('service_customer_phones')
        .select('customer_id')
        .eq('phone', phone)
        .maybeSingle()

      const lastMsgAt = contact.lastReceivedMessageDate
        ? new Date(contact.lastReceivedMessageDate).toISOString()
        : new Date().toISOString()

      await supabase
        .from('chat_conversations')
        .upsert(
          {
            wati_phone:      phone,
            customer_id:     phoneLookup?.customer_id ?? null,
            last_message:    contact.lastMessage ?? null,
            last_message_at: lastMsgAt,
          },
          { onConflict: 'wati_phone', ignoreDuplicates: false }
        )

      totalSynced++
    }

    if (contacts.length < pageSize) break
    pageNumber++
  }

  return NextResponse.json({ synced: totalSynced })
}
