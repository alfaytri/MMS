import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const WHAPI_BASE  = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''

/**
 * POST /api/whapi/send-reaction
 *
 * Body:
 *   messageId  string  — WHAPI message id of the target (chat_messages.external_id)
 *   emoji      string  — emoji to react with. Pass "" to remove the agent's reaction.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = body?.messageId as string | undefined
  // Emoji is intentionally optional — empty string means "remove reaction".
  const emoji: string = typeof body?.emoji === 'string' ? body.emoji : ''

  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
  }
  if (!WHAPI_TOKEN) {
    return NextResponse.json({ error: 'WHAPI not configured' }, { status: 500 })
  }

  // WHAPI: PUT /messages/{MessageID}/reaction  body: { emoji }
  console.log('[whapi/send-reaction] →', { messageId, emoji: emoji || '(remove)' })
  try {
    const res = await fetch(`${WHAPI_BASE}/messages/${encodeURIComponent(messageId)}/reaction`, {
      method:  'PUT',
      headers: {
        Authorization:  `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emoji }),
    })
    const responseText = await res.text().catch(() => '')
    if (!res.ok) {
      console.warn('[whapi/send-reaction] ← WHAPI rejected:', res.status, responseText.slice(0, 500))
      return NextResponse.json({ ok: false, error: `WHAPI ${res.status}: ${responseText.slice(0, 300)}` }, { status: res.status })
    }
    console.log('[whapi/send-reaction] ← ok:', responseText.slice(0, 200))
  } catch (err: unknown) {
    console.error('[whapi/send-reaction] threw:', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  // Mirror the change locally so the chat UI stays in sync even if the realtime
  // webhook arrives a few seconds later (or never, for outbound reactions).
  const supabase = createAdminClient()
  const { data: targetRow } = await supabase.from('chat_messages')
    .select('id, reactions')
    .eq('external_id', messageId)
    .maybeSingle()

  if (targetRow) {
    const existing: { emoji: string; from_type: string }[] =
      (targetRow.reactions as unknown as Array<{ emoji: string; from_type: string }> | null) ?? []
    let updated: { emoji: string; from_type: string }[]

    if (!emoji) {
      // Remove ALL agent reactions on this message (WhatsApp only allows one per sender).
      updated = existing.filter((r) => r.from_type !== 'agent')
    } else {
      // Replace any existing agent reaction with the new one.
      const withoutAgent = existing.filter((r) => r.from_type !== 'agent')
      updated = [...withoutAgent, { emoji, from_type: 'agent' }]
    }

    await supabase.from('chat_messages').update({ reactions: updated }).eq('id', targetRow.id)
  }

  return NextResponse.json({ ok: true })
}
