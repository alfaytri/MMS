import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { team_id, lat, lng, accuracy } = await req.json()
    if (!team_id || lat == null || lng == null) {
      return NextResponse.json({ error: 'team_id, lat, lng required' }, { status: 400 })
    }

    // Use admin client — RLS on team_live_locations only allows the team's
    // own leader, but division managers and admins also need to track location
    // when they switch to a different team via the header dropdown.
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from('team_live_locations')
      .upsert(
        { team_id, lat, lng, accuracy: accuracy ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'team_id' }
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
