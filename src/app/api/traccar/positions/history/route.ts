// src/app/api/traccar/positions/history/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPositionHistory, knotsToKmh, simplifyPositions } from '@/lib/traccar'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const deviceId = Number(req.nextUrl.searchParams.get('deviceId'))
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  if (!deviceId || Number.isNaN(deviceId) || !from || !to) {
    return NextResponse.json(
      { error: 'deviceId, from, and to are required' },
      { status: 400 }
    )
  }

  try {
    const raw = await getPositionHistory(deviceId, from, to)

    // Convert speed and prepare for simplification
    const withKmh = raw.map(p => ({
      ...p,
      speed: knotsToKmh(p.speed),
      lat: p.latitude,
      lng: p.longitude,
    }))

    // Simplify: ~0.0001 degrees ≈ 10 meters
    const simplified = simplifyPositions(withKmh, 0.0001)

    return NextResponse.json(simplified)
  } catch (err) {
    console.error('[traccar/positions/history]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}
