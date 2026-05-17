import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Default (recent) mode: scan ALL pages but keep only contacts active in the last
// RECENT_DAYS days. Wati sorts by name, not date, so a page cap would miss contacts
// whose names fall later in the alphabet.
const RECENT_DAYS = 2
const PAGE_SIZE   = 100

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

  // Split into contacts with/without a known last-message date.
  // Wati's /getContacts API stopped returning lastReceivedMessageDate and lastMessage
  // for most contacts. Fall back to lastUpdated (which Wati sets whenever a message
  // is sent to or received from the contact) so that recently-active contacts still
  // appear in the conversation list after a sync.
  //
  // Split into THREE streams so PostgREST column-normalisation doesn't accidentally
  // null out last_message when Wati omits it:
  //   rowsWithDateAndMsg  — have a date AND a lastMessage → write both fields
  //   rowsWithDateNoMsg   — have a date but no lastMessage → write only last_message_at
  //   rowsNoDate          — no date at all → insert-only (ignoreDuplicates:true)
  const rowsWithDateAndMsg: any[] = []
  const rowsWithDateNoMsg:  any[] = []
  const rowsNoDate:         any[] = []

  for (const phone of phones) {
    const c    = phoneMap.get(phone)!
    // Prefer lastReceivedMessageDate; fall back to lastUpdated as a proxy for activity
    const date = c.lastReceivedMessageDate
      ? new Date(c.lastReceivedMessageDate).toISOString()
      : c.lastUpdated
      ? new Date(c.lastUpdated).toISOString()
      : null

    // Wati returns the assigned operator as assignedTo.name or assignedTo (string)
    const assignedAgent: string | null =
      c.assignedTo?.name ?? c.assignedTo?.fullName ?? (typeof c.assignedTo === 'string' ? c.assignedTo : null) ??
      c.operatorName ?? c.agentName ?? null

    const base = {
      wati_phone:        phone,
      wati_contact_name: contactName(c),
      customer_id:       customerByPhone.get(phone) ?? null,
      assigned_agent:    assignedAgent,
    }

    if (date) {
      if (c.lastMessage) {
        rowsWithDateAndMsg.push({ ...base, last_message: c.lastMessage, last_message_at: date })
      } else {
        // Wati didn't return lastMessage — update last_message_at only, preserve existing last_message
        rowsWithDateNoMsg.push({ ...base, last_message_at: date })
      }
    } else {
      rowsNoDate.push(base)
    }
  }

  const CHUNK = 500
  let synced = 0

  // Contacts with a date AND a lastMessage: write both fields
  for (let i = 0; i < rowsWithDateAndMsg.length; i += CHUNK) {
    const chunk = rowsWithDateAndMsg.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_conversations') as any)
      .upsert(chunk, { onConflict: 'wati_phone', ignoreDuplicates: false })
    if (error) throw new Error((error as any).message)
    synced += chunk.length
  }

  // Contacts with a date but no lastMessage: update last_message_at only (don't touch last_message)
  for (let i = 0; i < rowsWithDateNoMsg.length; i += CHUNK) {
    const chunk = rowsWithDateNoMsg.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_conversations') as any)
      .upsert(chunk, { onConflict: 'wati_phone', ignoreDuplicates: false })
    if (error) throw new Error((error as any).message)
    synced += chunk.length
  }

  // Contacts without a date: insert new only — never overwrite last_message_at on existing rows
  for (let i = 0; i < rowsNoDate.length; i += CHUNK) {
    const chunk = rowsNoDate.slice(i, i + CHUNK)
    const { error } = await (supabase.from('chat_conversations') as any)
      .upsert(chunk, { onConflict: 'wati_phone', ignoreDuplicates: true })
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
  // full mode → no cutoff; default mode → start-of-day 2 days ago
  const cutoff = full ? null : (() => {
    const d = new Date()
    d.setDate(d.getDate() - RECENT_DAYS)
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      let pageNumber = 1
      const allContacts: any[] = []

      while (true) {
        await writer.write(encode({ stage: 'fetching', page: pageNumber, total: allContacts.length }))

        const result = await watiGet(`/api/v1/getContacts?pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`)
        if (!result.ok) {
          await writer.write(encode({ error: `WATI ${result.status}: ${result.text}` }))
          return
        }

        const contacts: any[] = result.data?.contact_list ?? []
        if (contacts.length === 0) break

        if (cutoff) {
          for (const c of contacts) {
            // Use lastReceivedMessageDate first; fall back to lastUpdated as a proxy
            // for activity (Wati sets lastUpdated when messages are sent/received)
            const rawDate = c.lastReceivedMessageDate ?? c.lastUpdated ?? null
            const lastActive = rawDate ? new Date(rawDate) : null
            if (!lastActive || lastActive < cutoff) continue
            allContacts.push(c)
          }
        } else {
          allContacts.push(...contacts)
        }

        if (contacts.length < PAGE_SIZE) break
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
