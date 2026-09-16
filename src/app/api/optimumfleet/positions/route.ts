// src/app/api/optimumfleet/positions/route.ts
//
// Auth-gated proxy for the Optimum Fleet live fleet. Keeps the Access Code server-side
// and returns the fleet already adapted to the map's existing shapes:
//   { vehicles: VehicleMapData[], positions: TraccarPosition[], configured: boolean }
//
// Upstream is cached for 120s inside getLiveData() (Next Data Cache) to respect the
// per-company rate limit, so many concurrent viewers still hit the vendor at most once
// every 2 minutes.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getLiveData,
  optimumFleetConfigured,
  toTraccarPosition,
  toVehicleMapData,
} from '@/lib/optimumfleet'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // No Access Code yet → degrade gracefully (empty fleet, no error) so the map still loads.
  if (!optimumFleetConfigured()) {
    return NextResponse.json({ vehicles: [], positions: [], configured: false })
  }

  try {
    const fleet = await getLiveData()
    return NextResponse.json({
      vehicles: fleet.map(toVehicleMapData),
      positions: fleet.filter((v) => v.hasFix).map(toTraccarPosition),
      configured: true,
    })
  } catch (err) {
    console.error('[optimumfleet/positions]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Optimum Fleet API error' },
      { status: 502 },
    )
  }
}
