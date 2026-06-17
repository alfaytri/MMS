import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const reason = (body?.reason ?? '').toString().trim()
    if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('follow_up_requests')
      .update({
        status: 'rejected',
        cancelled_reason: reason,
        confirmed_by_user_id: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .single()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'request_not_pending' }, { status: 409 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
