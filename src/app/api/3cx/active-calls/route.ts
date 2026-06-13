import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchActiveCalls } from '@/lib/3cx/active-calls'

export const runtime = 'nodejs'
// dynamic = 'force-dynamic' so the *route* always runs per-request — but the
// *underlying 3CX fetch* inside fetchActiveCalls() is cached via Next's fetch
// cache (next: { revalidate: 1 }). This combination gives us per-user filtering
// on every request while collapsing 3CX traffic to 1/sec.
export const dynamic = 'force-dynamic'

interface ActiveCallForAgent {
  callId:          number
  customerPhone:   string
  status:          'ringing' | 'connected'
  myParticipantId: number    // the agent's own participant id on this call
  startedAt:       string
}

export async function GET(_req: Request): Promise<Response> {
  const supabase = await createClient()
  // NOTE: middleware.ts skips /api/3cx/ for inbound webhooks — enforce auth here.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('threecx_extension')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.error('[3cx/active-calls] profile lookup failed:', profileErr.message)
    return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 })
  }

  const extension = profile?.threecx_extension ?? null
  if (!extension) return NextResponse.json({ calls: [] })

  try {
    const all = await fetchActiveCalls()
    // Project to per-agent shape: surface only the calls this agent is on, and
    // expose ONLY their own participantId. Other agents' participant ids stay
    // server-side as a deliberate auth boundary so an agent can't act on a
    // call they're not on by guessing ids.
    const mine: ActiveCallForAgent[] = []
    for (const c of all) {
      const me = c.participants.find((p) => p.extension === extension)
      if (!me) continue
      mine.push({
        callId:          c.callId,
        customerPhone:   c.customerPhone,
        status:          c.status,
        myParticipantId: me.participantId,
        startedAt:       c.startedAt,
      })
    }
    return NextResponse.json({ calls: mine })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('[3cx/active-calls] upstream failed:', msg)
    return NextResponse.json({ error: `Live call lookup failed: ${msg}` }, { status: 502 })
  }
}
