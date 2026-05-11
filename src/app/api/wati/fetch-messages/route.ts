import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function watiGet(path: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${WATI_URL}${path}`, {
      headers: { Authorization: `Bearer ${WATI_TOKEN}` },
    })
    if (res.status === 429) {
      await sleep(parseInt(res.headers.get('Retry-After') ?? '10', 10) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`WATI ${res.status}: ${await res.text()}`)
    return res.json()
  }
  throw new Error('WATI rate limit retries exhausted')
}

// GET /api/wati/fetch-messages?conversationId=...&phone=...&days=10
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const conversationId = searchParams.get('conversationId')
  const phone          = searchParams.get('phone')
  const days           = parseInt(searchParams.get('days') ?? '10', 10)

  if (!conversationId || !phone) {
    return NextResponse.json({ error: 'conversationId and phone required' }, { status: 400 })
  }
  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const cutoff   = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Paginate WATI getMessages until we reach the cutoff date
  let pageNumber = 1
  const pageSize = 100
  const allItems: any[] = []
  let reachedCutoff = false

  while (!reachedCutoff) {
    const data = await watiGet(
      `/api/v1/getMessages/${encodeURIComponent(phone)}?pageSize=${pageSize}&pageNumber=${pageNumber}`
    )

    const items: any[] = data?.messages?.items ?? []
    if (items.length === 0) break

    for (const item of items) {
      // WATI timestamps can be Unix seconds or ISO string
      const ts = item.created
        ? new Date(item.created)
        : item.timestamp
        ? new Date(item.timestamp * 1000)
        : null

      if (ts && ts < cutoff) { reachedCutoff = true; break }
      allItems.push(item)
    }

    if (items.length < pageSize) break
    pageNumber++
    await sleep(200)
  }

  if (allItems.length === 0) {
    return NextResponse.json({ fetched: 0 })
  }

  // Transform WATI items → chat_messages rows
  const rows = allItems
    .filter((item) => item.id) // must have an ID for dedup
    .map((item) => {
      const isAgent = item.owner === true || item.eventType === 'message_sent'
      const ts = item.created
        ? new Date(item.created).toISOString()
        : item.timestamp
        ? new Date(item.timestamp * 1000).toISOString()
        : new Date().toISOString()

      return {
        conversation_id:  conversationId,
        from_type:        isAgent ? 'agent' : 'customer',
        source:           'whatsapp_api',
        text:             item.text ?? null,
        agent_name:       isAgent ? (item.senderName ?? null) : null,
        delivery_status:  isAgent ? (item.statusString?.toLowerCase() ?? 'sent') : 'delivered',
        external_id:      item.id,
        created_at:       ts,
      }
    })

  // Upsert on external_id to avoid duplicates
  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await (supabase.from('chat_messages') as any)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'external_id', ignoreDuplicates: true })
    if (error) {
      console.error('[fetch-messages] upsert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    inserted += Math.min(CHUNK, rows.length - i)
  }

  return NextResponse.json({ fetched: inserted })
}
