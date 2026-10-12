import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Direct WATI reaction send, bypassing the api-wati Edge Function (403s on user
// JWTs). WATI's reaction endpoint is the dashboard "conversations" API:
//   POST /api/v1/conversations/whatsapp/sendReaction  { emoji, waId, messageId }
// where messageId is WATI's INTERNAL message id (not the WhatsApp wamid).
// NOTE: WATI also requires the API token's operator to have "Team Inbox" access,
// else it returns { result:false, error:"...doesn't have access to Team Inbox..." }.
const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
// WATI's conversations API sits behind Cloudflare, which blocks unknown UAs.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

// sendReaction wants WATI's INTERNAL numeric message id, but our stored
// external_id is usually the WhatsApp wamid. Resolve wamid → numeric id via
// getMessages (mirrors the webhook's resolveWamidViaWati). Returns null when the
// message isn't in the contact's recent history (caller then falls back to the wamid).
async function resolveWamidToNumeric(waId: string, wamid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${WATI_URL}/api/v1/getMessages/${encodeURIComponent(waId)}?pageSize=50`,
      { headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'User-Agent': BROWSER_UA } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const items: { id?: string | number; whatsappMessageId?: string }[] = data?.messages?.items ?? []
    for (const item of items) {
      if (item.whatsappMessageId === wamid && item.id != null) return String(item.id)
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { emoji?: string; waId?: string; messageId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const waId = body.waId?.replace(/^\+/, '')
  const messageId = body.messageId
  if (!waId || !messageId) return NextResponse.json({ error: 'waId and messageId required' }, { status: 400 })
  if (!WATI_URL || !WATI_TOKEN) return NextResponse.json({ error: 'WATI not configured' }, { status: 500 })

  // A purely-numeric messageId is already WATI's internal id; otherwise it's a
  // wamid we must resolve (falling back to the wamid if it's not found).
  const resolvedMessageId = /^\d+$/.test(messageId)
    ? messageId
    : (await resolveWamidToNumeric(waId, messageId)) ?? messageId

  try {
    const res = await fetch(`${WATI_URL}/api/v1/conversations/whatsapp/sendReaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WATI_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
      },
      body: JSON.stringify({ emoji: body.emoji ?? '', waId, messageId: resolvedMessageId }),
    })
    const raw = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try { data = JSON.parse(raw) } catch { data = { raw } }
    if (!res.ok || data?.result === false) {
      return NextResponse.json({ error: data?.error ?? `WATI ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
