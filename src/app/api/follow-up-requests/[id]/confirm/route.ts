import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ConfirmFollowUpBody } from '@/types/follow-ups'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: requestId } = await ctx.params
    const body = (await req.json()) as ConfirmFollowUpBody

    const admin = createAdminClient()

    const { data: reqRow, error: rErr } = await admin
      .from('follow_up_requests')
      .select('id, status, parent_order_id')
      .eq('id', requestId)
      .single()
    if (rErr || !reqRow) return NextResponse.json({ error: 'request_not_found' }, { status: 404 })
    if (reqRow.status !== 'pending') return NextResponse.json({ error: 'request_not_pending' }, { status: 409 })

    const orderRes = await fetch(new URL('/api/orders/follow-up', req.url).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        ...body,
        parent_order_id: reqRow.parent_order_id,
        follow_up_request_id: requestId,
      }),
    })
    if (!orderRes.ok) {
      const err = await orderRes.text()
      return NextResponse.json({ error: 'order_create_failed', details: err }, { status: 500 })
    }
    const { order_id } = (await orderRes.json()) as { order_id: string }

    const { error: uErr } = await admin
      .from('follow_up_requests')
      .update({
        status:               'confirmed',
        confirmed_by_user_id: user.id,
        confirmed_at:         new Date().toISOString(),
        resulting_order_id:   order_id,
      })
      .eq('id', requestId)
    if (uErr) throw uErr

    return NextResponse.json({ ok: true, order_id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
