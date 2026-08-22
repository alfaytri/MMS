import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-admin'

interface Body {
  parent_order_id: string
  follow_up_request_id?: string | null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission('follow_ups.confirm')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const { id: orderId } = await ctx.params
    const body = (await req.json()) as Body
    if (!body.parent_order_id) {
      return NextResponse.json({ error: 'parent_order_id required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // The order is created with a human-readable `order_id` like "N/2026/06/0014",
    // but the linkage columns reference orders.id (UUID). Accept either as input
    // and resolve to the UUID.
    let orderUuid: string | null = null
    {
      // Try treating the param as a UUID first
      const { data: byUuid } = await admin
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .maybeSingle()
      if (byUuid?.id) {
        orderUuid = byUuid.id as string
      } else {
        const { data: byHuman } = await admin
          .from('orders')
          .select('id')
          .eq('order_id', orderId)
          .maybeSingle()
        orderUuid = byHuman?.id as string ?? null
      }
    }
    if (!orderUuid) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    }

    // Set linkage on the new order + flip type to follow-up
    const { error: oErr } = await admin
      .from('orders')
      .update({
        parent_order_id:      body.parent_order_id,
        follow_up_request_id: body.follow_up_request_id ?? null,
        type:                 'follow-up',
      })
      .eq('id', orderUuid)
    if (oErr) throw oErr

    // If from a request, flip status to confirmed + link resulting_order_id
    if (body.follow_up_request_id) {
      const { error: rErr } = await admin
        .from('follow_up_requests')
        .update({
          status:               'confirmed',
          confirmed_by_user_id: gate.authUserId,
          confirmed_at:         new Date().toISOString(),
          resulting_order_id:   orderUuid,
        })
        .eq('id', body.follow_up_request_id)
        .eq('status', 'pending')
      if (rErr) throw rErr
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
