import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const WHAPI_BASE = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''

function formatWhapiPhone(phone: string): string {
  return `${phone.replace(/\D/g, '')}@s.whatsapp.net`
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { to, messageId, emoji } = body
  if (!to || !messageId || !emoji) {
    return NextResponse.json({ error: 'to, messageId, and emoji are required' }, { status: 400 })
  }

  const whapiPhone = formatWhapiPhone(to)

  // 1. Send reaction via WHAPI
  try {
    const res = await fetch(`${WHAPI_BASE}/messages/reaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: whapiPhone, messageId, emoji }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, error: `WHAPI ${res.status}: ${errText}` }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  // 2. Update local reactions JSONB
  const supabase = createAdminClient()
  const { data: targetRow } = await (supabase.from('chat_messages') as any)
    .select('id, reactions')
    .eq('external_id', messageId)
    .maybeSingle()

  if (targetRow) {
    const existing: { emoji: string; from_type: string }[] = targetRow.reactions ?? []
    const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
    const updated = hasIt
      ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
      : [...existing, { emoji, from_type: 'agent' }]
    await (supabase.from('chat_messages') as any).update({ reactions: updated }).eq('id', targetRow.id)
  }

  return NextResponse.json({ ok: true })
}
