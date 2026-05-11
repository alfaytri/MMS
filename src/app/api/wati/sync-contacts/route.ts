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

// SSE helper
function encode(data: object) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function watiGet(path: string, retries = 3): Promise<{ ok: true; data: any } | { ok: false; status: number; text: string }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${WATI_URL}${path}`, {
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
    })
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') ?? '10', 10) * 1000
      await sleep(wait)
      continue
    }
    if (!res.ok) return { ok: false, status: res.status, text: await res.text() }
    return { ok: true, data: await res.json() }
  }
  return { ok: false, status: 429, text: 'Rate limit — retries exhausted' }
}

export async function GET() {
  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Run sync in background, stream progress
  ;(async () => {
    try {
      // Step 1: Fetch all contacts from WATI
      let pageNumber = 1
      const pageSize = 100
      const allContacts: any[] = []

      while (true) {
        await writer.write(encode({ stage: 'fetching', page: pageNumber, total: allContacts.length }))

        const result = await watiGet(`/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`)
        if (!result.ok) {
          await writer.write(encode({ error: `WATI ${result.status}: ${result.text}` }))
          await writer.close()
          return
        }

        const contacts: any[] = result.data?.contact_list ?? []
        allContacts.push(...contacts)

        if (contacts.length < pageSize) break
        pageNumber++
        // small pause between pages to stay under rate limit
        if (contacts.length === pageSize) await sleep(300)
      }

      await writer.write(encode({ stage: 'resolving', fetched: allContacts.length }))

      // Step 2: Normalise phones, deduplicate
      const phoneMap = new Map<string, any>() // phone → contact
      for (const contact of allContacts) {
        const raw: string = contact.phone ?? contact.wAid ?? ''
        if (!raw) continue
        const phone = normalisePhone(raw)
        if (!phone) continue
        phoneMap.set(phone, contact)
      }

      const phones = Array.from(phoneMap.keys())
      if (phones.length === 0) {
        await writer.write(encode({ done: true, synced: 0 }))
        await writer.close()
        return
      }

      // Step 3: Bulk-resolve customer IDs in one query
      const { data: phoneLookups } = await supabase
        .from('service_customer_phones')
        .select('phone, customer_id')
        .in('phone', phones)

      const customerByPhone = new Map<string, string>()
      for (const row of phoneLookups ?? []) {
        customerByPhone.set(row.phone, row.customer_id)
      }

      // Step 4: Build upsert rows
      const rows = phones.map((phone) => {
        const contact = phoneMap.get(phone)!
        return {
          wati_phone:      phone,
          customer_id:     customerByPhone.get(phone) ?? null,
          last_message:    contact.lastMessage ?? null,
          last_message_at: contact.lastReceivedMessageDate
            ? new Date(contact.lastReceivedMessageDate).toISOString()
            : new Date().toISOString(),
        }
      })

      // Step 5: Batch upsert in chunks of 500
      const CHUNK = 500
      let synced = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { error } = await supabase
          .from('chat_conversations')
          .upsert(chunk, { onConflict: 'wati_phone', ignoreDuplicates: false })

        if (error) {
          console.error('[sync-contacts] upsert error', error)
          await writer.write(encode({ error: error.message }))
          await writer.close()
          return
        }

        synced += chunk.length
        await writer.write(encode({ stage: 'upserting', synced, total: rows.length }))
      }

      await writer.write(encode({ done: true, synced }))
    } catch (err: any) {
      console.error('[sync-contacts] unexpected error', err)
      await writer.write(encode({ error: err.message ?? 'Unknown error' }))
    } finally {
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// Keep POST for non-streaming callers (returns when done)
export async function POST() {
  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  let pageNumber = 1
  const pageSize = 100
  const allContacts: any[] = []

  while (true) {
    const result = await watiGet(`/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`)
    if (!result.ok) {
      return NextResponse.json({ error: `WATI ${result.status}`, detail: result.text }, { status: 502 })
    }
    const contacts: any[] = result.data?.contact_list ?? []
    allContacts.push(...contacts)
    if (contacts.length < pageSize) break
    pageNumber++
    if (contacts.length === pageSize) await sleep(300)
  }

  const phoneMap = new Map<string, any>()
  for (const contact of allContacts) {
    const raw: string = contact.phone ?? contact.wAid ?? ''
    if (!raw) continue
    const phone = normalisePhone(raw)
    if (!phone) continue
    phoneMap.set(phone, contact)
  }

  const phones = Array.from(phoneMap.keys())
  if (phones.length === 0) return NextResponse.json({ synced: 0 })

  const { data: phoneLookups } = await supabase
    .from('service_customer_phones')
    .select('phone, customer_id')
    .in('phone', phones)

  const customerByPhone = new Map<string, string>()
  for (const row of phoneLookups ?? []) customerByPhone.set(row.phone, row.customer_id)

  const rows = phones.map((phone) => {
    const contact = phoneMap.get(phone)!
    return {
      wati_phone:      phone,
      customer_id:     customerByPhone.get(phone) ?? null,
      last_message:    contact.lastMessage ?? null,
      last_message_at: contact.lastReceivedMessageDate
        ? new Date(contact.lastReceivedMessageDate).toISOString()
        : new Date().toISOString(),
    }
  })

  const CHUNK = 500
  let synced = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('chat_conversations')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'wati_phone', ignoreDuplicates: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    synced += Math.min(CHUNK, rows.length - i)
  }

  return NextResponse.json({ synced })
}
