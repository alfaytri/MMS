import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { stopTracking } from '@/lib/tracking/client17track'

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const { tracking_number } = await request.json()
  if (!tracking_number) {
    return NextResponse.json({ error: 'tracking_number required' }, { status: 400 })
  }

  try {
    await stopTracking(tracking_number)
  } catch (err) {
    // Non-fatal — log but don't surface to user
    console.error('[deregister-tracking]', err)
  }

  return NextResponse.json({ ok: true })
}
