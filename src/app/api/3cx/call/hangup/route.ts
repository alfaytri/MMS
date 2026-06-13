import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchActiveCalls } from '@/lib/3cx/active-calls'
import { dropCall } from '@/lib/3cx/call-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  return handleDrop(req, 'hangup')
}

// Decline and Hangup both drop the agent's own participant on a given callId.
// They live as separate routes for observability (distinct log prefixes) and
// to leave room for future divergence — but the implementation is identical,
// so the shared handler is duplicated inline in both files rather than
// extracted to a helper module.
async function handleDrop(req: Request, verb: 'decline' | 'hangup'): Promise<Response> {
  const supabase = await createClient()
  // NOTE: middleware.ts skips /api/3cx/ for inbound webhooks — enforce auth here.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { callId?: number } | null
  if (!body || !Number.isInteger(body.callId)) {
    return NextResponse.json({ error: 'callId is required and must be an integer' }, { status: 400 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('threecx_extension')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profileErr) {
    console.error(`[3cx/call/${verb}] profile lookup failed:`, profileErr.message)
    return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 })
  }
  const ext = profile?.threecx_extension ?? null
  if (!ext) return NextResponse.json({ error: 'No extension assigned' }, { status: 403 })

  try {
    const calls = await fetchActiveCalls()
    const call  = calls.find((c) => c.callId === body.callId)
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    // Auth boundary: only act on a call the caller is actually a participant in.
    const me = call.participants.find((p) => p.extension === ext)
    if (!me) return NextResponse.json({ error: 'Not your call' }, { status: 403 })

    await dropCall(me.extension, me.participantId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    // Race-safe idempotency: if the call is now gone from active-calls, the drop
    // either succeeded racily or the call ended naturally during our request.
    // Either way the user's intent is satisfied — return 200 instead of an
    // unhelpful 502 toast. Detailed error stays in the server log.
    try {
      const stillActive = await fetchActiveCalls()
      if (!stillActive.some((c) => c.callId === body.callId)) {
        console.info(`[3cx/call/${verb}] call already gone (callId=${body.callId}); reporting success`)
        return NextResponse.json({ ok: true })
      }
    } catch { /* re-fetch failed — fall through to the 502 below */ }

    console.error(`[3cx/call/${verb}] failed:`, msg)
    return NextResponse.json({ error: `Call could not be ${verb === 'decline' ? 'declined' : 'hung up'}` }, { status: 502 })
  }
}
