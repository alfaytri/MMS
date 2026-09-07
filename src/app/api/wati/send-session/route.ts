import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Direct WATI session-message send, bypassing the api-wati Edge Function (which
// 403s on user JWTs — its authz gate only accepts the server anon+cron path).
// The Contact Centre composer / sync worker call this route; it does NOT touch
// chat_messages (the sync worker already pushed the row) — it only performs the
// WATI API call and returns the wamid.
const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')

export async function POST(req: NextRequest) {
  // Require a logged-in user (this route can send real WhatsApp messages).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { phone?: string; text?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const phone = body.phone?.trim()
  const text  = body.text
  if (!phone || !text) return NextResponse.json({ error: 'phone and text are required' }, { status: 400 })
  if (!WATI_URL || !WATI_TOKEN) return NextResponse.json({ error: 'WATI not configured' }, { status: 500 })

  const watiPhone = phone.replace(/^\+/, '')
  const url = `${WATI_URL}/api/v1/sendSessionMessage/${encodeURIComponent(watiPhone)}?messageText=${encodeURIComponent(text)}`

  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${WATI_TOKEN}` } })
    const raw = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try { data = JSON.parse(raw) } catch { data = { raw } }

    // WATI returns { result: 'success'|true, info: { whatsappMessageId } } on success.
    const ok = res.ok && data?.result !== false && data?.result !== 'error'
    if (!ok) {
      const err = data?.info?.text ?? data?.error ?? `WATI ${res.status}`
      return NextResponse.json({ error: typeof err === 'string' ? err : JSON.stringify(err) }, { status: 502 })
    }

    const whatsappMessageId: string | null =
      data?.info?.whatsappMessageId ?? data?.message?.whatsappMessageId ?? data?.id ?? null
    return NextResponse.json({ ok: true, whatsappMessageId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
