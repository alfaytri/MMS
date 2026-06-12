import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchRingingCalls } from '@/lib/3cx/active-calls'

export const runtime = 'nodejs'
// dynamic = 'force-dynamic' so the *route* always runs per-request — but the
// *underlying 3CX fetch* inside fetchRingingCalls() is cached via Next's fetch
// cache (next: { revalidate: 1 }). This combination gives us per-user filtering
// on every request while collapsing 3CX traffic to 1/sec.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request): Promise<Response> {
  const supabase = await createClient()
  // NOTE: middleware.ts skips /api/3cx/ for inbound webhooks — enforce auth here.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('threecx_extension')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const extension = profile?.threecx_extension ?? null
  if (!extension) return NextResponse.json({ calls: [] })

  try {
    const all  = await fetchRingingCalls()
    const mine = all.filter((c) => c.ringingExtensions.includes(extension))
    return NextResponse.json({ calls: mine })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('[3cx/active-calls] upstream failed:', msg)
    return NextResponse.json({ error: `Live call lookup failed: ${msg}` }, { status: 502 })
  }
}
