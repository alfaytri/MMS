// src/app/api/traccar/positions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPositions, knotsToKmh } from '@/lib/traccar'

// NOTE: No module-level cache variable here. Caching is handled by the
// Next.js Data Cache via `next: { revalidate: 5 }` in the traccarFetch
// call inside getPositions(). This works correctly across serverless
// instances (Vercel / Lambda) — all instances share the same Data Cache.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const deviceIdsParam = req.nextUrl.searchParams.get('deviceIds')
  const deviceIds = deviceIdsParam
    ? deviceIdsParam.split(',').map(Number).filter(n => !Number.isNaN(n))
    : undefined

  try {
    const raw = await getPositions(deviceIds)
    const positions = raw.map(p => ({
      ...p,
      speed: knotsToKmh(p.speed),
    }))

    return NextResponse.json(positions)
  } catch (err) {
    console.error('[traccar/positions]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}
