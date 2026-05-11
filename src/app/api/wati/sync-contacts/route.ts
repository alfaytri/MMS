import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Recent mode: last 500 contacts (~10 s). Full mode: all 13k+ (~5 min).
const RECENT_PAGE_LIMIT = 5
const PAGE_SIZE         = 100

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

function encode(data: object) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
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

async function upsertContacts(allContacts: any[], supabase: ReturnType<typeof createClient<any>>) {
  const phoneMap = new Map<string, any>()
  for (const contact of allContacts) {
    const raw: string = contact.phone ?? contact.wAid ?? ''
    if (!raw) continue
    const phone = normalisePhone(raw)
    if (phone) phoneMap.set(phone, contact)
  }

  const phones = Array.from(phoneMap.keys())
  if (phones.length === 0) return 0

  const { data: phoneLookups } = await supabase
    .from('service_customer_phones')
    .select('phone, customer_id')
    .in('phone', phones)

  const customerByPhone = new Map<string, string>()
  for (const row of (phoneLookups ?? []) as { phone: string; customer_id: string }[]) {
    customerByPhone.set(row.phone, row.customer_id)
  }

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
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_conversations') as any)
      .upsert(chunk, { onConflict: 'wati_phone', ignoreDuplicates: false })
    if (error) throw new Error((error as any).message)
    synced += chunk.length
  }
  return synced
}

// GET — SSE streaming with progress. ?mode=full syncs all pages.
export async function GET(req: NextRequest) {
  if (!WATI_URL || !WATI_TOKEN)
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })

  const full = req.nextUrl.searchParams.get('mode') === 'full'
  const maxPages = full ? Infinity : RECENT_PAGE_LIMIT
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      let pageNumber = 1
      const allContacts: any[] = []

      while (pageNumber <= maxPages) {
        await writer.write(encode({ stage: 'fetching', page: pageNumber, total: allContacts.length }))

        const result = await watiGet(`/api/v1/getContacts?pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`)
        if (!result.ok) {
          await writer.write(encode({ error: `WATI ${result.status}: ${result.text}` }))
          return
        }

        const contacts: any[] = result.data?.contact_list ?? []
        allContacts.push(...contacts)

        const reachedEnd = contacts.length < PAGE_SIZE
        const reachedLimit = !full && pageNumber >= RECENT_PAGE_LIMIT

        if (reachedEnd || reachedLimit) break
        pageNumber++
        await sleep(300)
      }

      await writer.write(encode({ stage: 'resolving', fetched: allContacts.length }))

      const synced = await upsertContacts(allContacts, supabase)
      await writer.write(encode({ stage: 'upserting', synced, total: synced }))
      await writer.write(encode({ done: true, synced, full }))
    } catch (err: any) {
      console.error('[sync-contacts] error', err)
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
