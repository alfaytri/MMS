import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFollowUpOrderRows } from '@/lib/follow-ups/createFollowUpOrder'
import type { ConfirmFollowUpBody } from '@/types/follow-ups'

type Body = ConfirmFollowUpBody & {
  parent_order_id: string
  follow_up_request_id?: string | null
}

type AdminClient = ReturnType<typeof createAdminClient>

async function generateOrderId(admin: AdminClient): Promise<string> {
  const { data: last } = await admin
    .from('orders')
    .select('order_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastNum = last?.order_id
    ? parseInt(last.order_id.match(/(\d+)$/)?.[1] ?? '0', 10)
    : 0
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `N/${year}/${month}/${String(lastNum + 1).padStart(4, '0')}`
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as Body
    if (!body.parent_order_id) {
      return NextResponse.json({ error: 'parent_order_id required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: parent, error: pErr } = await admin
      .from('orders')
      .select('division, customer_id')
      .eq('id', body.parent_order_id)
      .single()
    if (pErr || !parent) return NextResponse.json({ error: 'parent_order_not_found' }, { status: 404 })

    const orderIdHuman = await generateOrderId(admin)

    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({
        order_id:       orderIdHuman,
        customer_id:    body.customer_id,
        type:           'follow-up',
        division:       parent.division,
        status:         'scheduled',
        scheduled_date: body.scheduled_date,
        scheduled_time: body.scheduled_time,
        total_amount:   0,
        notes:          body.notes,
        address:        body.address,
        parent_order_id:      body.parent_order_id,
        follow_up_request_id: body.follow_up_request_id ?? null,
      })
      .select('id')
      .single()
    if (oErr) throw oErr

    const rows = buildFollowUpOrderRows({
      orderId: order.id,
      reused_services: body.reused_services,
      new_services: body.new_services,
    })

    if (rows.order_services.length > 0) {
      const { error: sErr } = await admin.from('order_services').insert(rows.order_services)
      if (sErr) throw sErr
    }

    const slot = body.scheduled_time ?? null
    const { error: aErr } = await admin.from('order_team_assignments').insert({
      order_id:       order.id,
      team_id:        body.team_id,
      services:       rows.order_services.map((s) => ({ name: s.name, qty: s.qty })),
      scheduled_date: body.scheduled_date,
      time_slot:      slot,
    })
    if (aErr) throw aErr

    if (rows.total_amount > 0) {
      await admin.from('orders').update({ total_amount: rows.total_amount }).eq('id', order.id)
    }

    await admin.from('order_log').insert({
      order_id: order.id,
      action:   'created',
      user_name: user.email ?? user.id,
      details:  body.follow_up_request_id
        ? `Follow-up created from request ${body.follow_up_request_id}`
        : 'Follow-up created directly from parent order',
    })

    return NextResponse.json({ ok: true, order_id: order.id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
