import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-admin'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission('follow_ups.confirm')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

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
        confirmed_by_user_id: gate.authUserId,
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
