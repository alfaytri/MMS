import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normaliseEvent } from '@/lib/3cx/normalise-event'
import { resolveConversation } from '@/lib/3cx/resolve-customer'
import { resolveAgentByExtension } from '@/lib/3cx/extension-map'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WHOOK_SECRET = process.env['3CX_WEBHOOK_SECRET'] ?? ''

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret') ?? ''
  if (!WHOOK_SECRET || secret !== WHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const event = normaliseEvent(body)
  if (!event) return NextResponse.json({ ok: true, ignored: 'unknown event' })

  const supabase = createClient<Database>(SUPA_URL, SUPA_KEY)

  const { conversation_id, phone_id } = await resolveConversation(supabase, event.caller_phone)
  const agent = await resolveAgentByExtension(supabase, event.extension)

  const externalId = `3cx_${event.call_id1 || event.call_id2}`

  if (event.kind === 'ringing' || event.kind === 'dialing' || event.kind === 'answered') {
    const text =
      event.kind === 'ringing'  ? `Inbound call from ${event.caller_phone}` :
      event.kind === 'dialing'  ? `Outbound call to ${event.caller_phone}` :
                                  `Call answered by ${agent?.name ?? `ext ${event.extension}`}`

    const { data: existing } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('external_id', externalId)
      .maybeSingle()

    if (existing) {
      await supabase.from('chat_messages').update({
        text,
        delivery_status: 'sending',
        agent_name:      agent?.name ?? null,
      }).eq('id', existing.id)
    } else {
      await supabase.from('chat_messages').insert({
        conversation_id,
        from_type:          event.kind === 'dialing' ? 'agent' : 'customer',
        source:             '3cx_call',
        message_kind:       'event',
        text,
        agent_name:         agent?.name ?? null,
        sent_by_profile_id: agent?.profile_id ?? null,
        external_id:        externalId,
        delivery_status:    'sending',
        phone_id,
      })
    }

    await supabase.from('chat_conversations')
      .update({ last_message: text, last_message_at: new Date().toISOString() })
      .eq('id', conversation_id)

    return NextResponse.json({ ok: true, kind: event.kind })
  }

  // event.kind === 'hangup'
  const finishLabel = event.finish === 'Missed'
    ? 'Missed'
    : `${event.direction === 'inbound' ? 'Inbound' : 'Outbound'} answered`
  const text = event.title || `${finishLabel} call — ${event.caller_phone}`

  const { data: existing } = await supabase
    .from('chat_messages')
    .select('id, attachments')
    .eq('external_id', externalId)
    .maybeSingle()

  let messageId: string
  if (existing) {
    messageId = existing.id
    await supabase.from('chat_messages').update({
      text,
      delivery_status: event.finish === 'Missed' ? 'failed' : 'delivered',
      agent_name:      agent?.name ?? null,
    }).eq('id', messageId)
  } else {
    const { data: inserted, error } = await supabase.from('chat_messages').insert({
      conversation_id,
      from_type:          event.direction === 'inbound' ? 'customer' : 'agent',
      source:             '3cx_call',
      message_kind:       'event',
      text,
      agent_name:         agent?.name ?? null,
      sent_by_profile_id: agent?.profile_id ?? null,
      external_id:        externalId,
      delivery_status:    event.finish === 'Missed' ? 'failed' : 'delivered',
      phone_id,
    }).select('id').single()
    if (error || !inserted) {
      console.error('[3cx/webhook] insert message failed', error)
      return NextResponse.json({ error: error?.message }, { status: 500 })
    }
    messageId = inserted.id
  }

  await supabase.from('call_records').upsert({
    message_id:       messageId,
    call_id:          event.call_id1 || event.call_id2,
    agent_extension:  event.extension,
    agent_name:       agent?.name ?? null,
    customer_phone:   event.caller_phone,
    direction:        event.direction,
    status:           event.finish === 'Missed' ? 'missed' : 'answered',
    started_at:       new Date(Date.now() - 30_000).toISOString(),
    ended_at:         new Date().toISOString(),
    duration_seconds: null,
    recording_url:    event.recording_urls[0] ?? null,
  }, { onConflict: 'call_id' })

  if (event.recording_urls.length > 0) {
    const attachments = event.recording_urls.map((u, i) => ({
      url:  u,
      type: 'audio/mpeg',
      name: `call-recording-${i + 1}.mp3`,
    }))

    await supabase.from('chat_messages')
      .update({ attachments: attachments as unknown as Database['public']['Tables']['chat_messages']['Row']['attachments'] })
      .eq('id', messageId)

    const jobs = attachments.map((_, i) => ({
      message_id:       messageId,
      attachment_index: i,
    }))
    const { error: jobErr } = await supabase.from('media_download_jobs').insert(jobs)
    if (jobErr) console.error('[3cx/webhook] enqueue jobs failed', jobErr)
  }

  await supabase.from('chat_conversations')
    .update({ last_message: text, last_message_at: new Date().toISOString() })
    .eq('id', conversation_id)

  return NextResponse.json({ ok: true, kind: 'hangup', messageId, recordings: event.recording_urls.length })
}

export async function GET() {
  return new Response('OK', { status: 200 })
}
