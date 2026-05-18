import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WHAPI_URL   = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

const PAGE_SIZE   = 100
const MSG_LIMIT   = 20   // messages to fetch per chat for preview

function normalisePhone(raw: string): string | null {
  // WHAPI chat IDs are like "97412345678@s.whatsapp.net"
  const digits = raw.replace(/@.*/, '').replace(/\D/g, '')
  if (!digits || digits.length < 7) return null
  return `+${digits}`
}

function encode(data: object) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

async function safeWrite(writer: WritableStreamDefaultWriter, data: Uint8Array) {
  try { await writer.write(data) } catch { /* client disconnected */ }
}

async function whapiGet(path: string): Promise<{ ok: true; data: any } | { ok: false; status: number; text: string }> {
  const res = await fetch(`${WHAPI_URL}${path}`, {
    headers: { Authorization: `Bearer ${WHAPI_TOKEN}` },
  })
  if (!res.ok) return { ok: false, status: res.status, text: await res.text() }
  return { ok: true, data: await res.json() }
}

export async function GET(req: NextRequest) {
  if (!WHAPI_TOKEN)
    return NextResponse.json({ error: 'WHAPI_TOKEN not configured' }, { status: 500 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const stream   = new TransformStream()
  const writer   = stream.writable.getWriter()

  ;(async () => {
    try {
      // ── 1. Fetch all chats (paginated) ───────────────────────────────────────
      let offset = 0
      const allChats: any[] = []

      while (true) {
        if (req.signal.aborted) break
        await safeWrite(writer, encode({ stage: 'fetching', fetched: allChats.length }))

        const result = await whapiGet(`/chats?count=${PAGE_SIZE}&offset=${offset}`)
        if (!result.ok) {
          await safeWrite(writer, encode({ error: `WHAPI ${result.status}: ${result.text}` }))
          return
        }

        const chats: any[] = result.data?.chats ?? []
        // Filter to individual (non-group) chats only
        const individual = chats.filter((c: any) => c.id?.endsWith('@s.whatsapp.net'))
        allChats.push(...individual)

        if (chats.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      await safeWrite(writer, encode({ stage: 'resolving', fetched: allChats.length }))

      // ── 2. Resolve phone → customer_id ──────────────────────────────────────
      const phones = allChats
        .map((c: any) => normalisePhone(c.id))
        .filter((p): p is string => p !== null)

      const { data: phoneLookups } = await supabase
        .from('service_customer_phones')
        .select('phone, customer_id')
        .in('phone', phones)

      const customerByPhone = new Map<string, string>()
      for (const row of (phoneLookups ?? []) as { phone: string; customer_id: string }[]) {
        customerByPhone.set(row.phone, row.customer_id)
      }

      // ── 3. Upsert conversations + messages ───────────────────────────────────
      await safeWrite(writer, encode({ stage: 'upserting', synced: 0, total: allChats.length }))

      let synced = 0

      for (const chat of allChats) {
        if (req.signal.aborted) break

        const phone = normalisePhone(chat.id)
        if (!phone) continue

        const lastMsgAt = chat.last_message?.timestamp
          ? new Date(chat.last_message.timestamp * 1000).toISOString()
          : null
        const lastMsgText: string = chat.last_message?.text?.body?.trim()
          || (chat.last_message?.type ? `[${chat.last_message.type}]` : null)
          || null

        // Upsert conversation — conflict on wati_phone (shared column for all providers)
        const { data: convo } = await (supabase.from('chat_conversations') as any)
          .upsert({
            wati_phone:        phone,
            provider:          'whapi',
            wati_contact_name: chat.name ?? null,
            customer_id:       customerByPhone.get(phone) ?? null,
            last_message:      lastMsgText,
            last_message_at:   lastMsgAt,
          }, { onConflict: 'wati_phone', ignoreDuplicates: false })
          .select('id')
          .maybeSingle()

        // Fallback: fetch existing conversation id if upsert returned nothing
        let conversationId: string | null = convo?.id ?? null
        if (!conversationId) {
          const { data: existing } = await (supabase.from('chat_conversations') as any)
            .select('id')
            .eq('wati_phone', phone)
            .single()
          conversationId = existing?.id ?? null
        }

        // ── Fetch recent messages for this chat ────────────────────────────────
        if (conversationId) {
          const msgResult = await whapiGet(`/messages/list/${encodeURIComponent(chat.id)}?count=${MSG_LIMIT}`)
          if (msgResult.ok) {
            const msgs: any[] = msgResult.data?.messages ?? []
            const toInsert = msgs
              .filter((m: any) => m.type !== 'reaction' && m.id)
              .map((m: any) => {
                const ts = m.timestamp
                  ? new Date(m.timestamp * 1000).toISOString()
                  : new Date().toISOString()
                const text: string = m.text?.body?.trim() || null
                const fromType = m.from_me ? 'agent' : 'customer'
                return {
                  conversation_id: conversationId,
                  external_id:     m.id,
                  from_type:       fromType,
                  source:          'whatsapp_api',
                  text:            text || null,
                  delivery_status: m.status ?? 'delivered',
                  created_at:      ts,
                  message_kind:    'message',
                }
              })

            if (toInsert.length > 0) {
              await (supabase.from('chat_messages') as any)
                .upsert(toInsert, { onConflict: 'external_id', ignoreDuplicates: true })
            }
          }
        }

        synced++
        if (synced % 10 === 0) {
          await safeWrite(writer, encode({ stage: 'upserting', synced, total: allChats.length }))
        }
      }

      await safeWrite(writer, encode({ done: true, synced }))
    } catch (err: any) {
      console.error('[whapi/sync-chats] error', err)
      await safeWrite(writer, encode({ error: err.message ?? 'Unknown error' }))
    } finally {
      try { await writer.close() } catch { /* already closed */ }
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
    },
  })
}
