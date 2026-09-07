import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Direct WATI template send, bypassing the api-wati Edge Function (403s on user
// JWTs). Accepts WATI-shaped named parameters ([{name,value}]); tolerates a bare
// string[] of values as a positional fallback.
const WATI_URL   = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const phone = String(body.phone ?? '').trim()
  const templateName = body.template_name as string | undefined
  const broadcastName = (body.broadcast_name as string | undefined) ?? `${templateName}_${Date.now()}`
  if (!phone || !templateName) return NextResponse.json({ error: 'phone and template_name required' }, { status: 400 })
  if (!WATI_URL || !WATI_TOKEN) return NextResponse.json({ error: 'WATI not configured' }, { status: 500 })

  // Normalise params to WATI's [{name, value}] shape.
  const rawParams = body.parameters ?? []
  const parameters = Array.isArray(rawParams)
    ? rawParams.map((p: unknown, i: number) =>
        typeof p === 'string' ? { name: `${i + 1}`, value: p } : p)
    : []

  const watiPhone = phone.replace(/^\+/, '')
  try {
    const res = await fetch(`${WATI_URL}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(watiPhone)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_name: templateName, broadcast_name: broadcastName, parameters }),
    })
    const raw = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try { data = JSON.parse(raw) } catch { data = { raw } }
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
