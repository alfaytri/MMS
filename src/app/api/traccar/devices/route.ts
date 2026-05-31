// src/app/api/traccar/devices/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDevices } from '@/lib/traccar'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const devices = await getDevices()
    return NextResponse.json(devices)
  } catch (err) {
    console.error('[traccar/devices]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Traccar API error' },
      { status: 502 }
    )
  }
}
