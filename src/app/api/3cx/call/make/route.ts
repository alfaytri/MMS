import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeCall } from '@/lib/3cx/make-call'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE164(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s)
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  // NOTE: middleware.ts lists /api/3cx/ in WEBHOOK_PREFIXES (skips auth for inbound
  // webhooks). This route enforces the session itself — do not assume the middleware
  // gate is doing it. Future routes under /api/3cx/call/* must do the same.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { destination?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  // Accept human-formatted input ("+974 5512 3456", "+974-5512-3456") — strip
  // spaces, dashes, parens before validation so a caller can hand us pasted input.
  const raw         = typeof body.destination === 'string' ? body.destination : ''
  const destination = raw.replace(/[\s\-()]/g, '')
  if (!destination || !isE164(destination)) {
    return NextResponse.json({ error: 'destination must be E.164 (e.g. +97455123456)' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('threecx_extension')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.threecx_extension) {
    return NextResponse.json(
      { error: 'No 3CX extension assigned to your account. Ask an admin to assign one.' },
      { status: 409 },
    )
  }

  try {
    await makeCall({ extension: profile.threecx_extension, destination })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('[3cx/call/make] upstream failed:', msg)
    return NextResponse.json({ error: `Call initiation failed: ${msg}` }, { status: 502 })
  }
}
