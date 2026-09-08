import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-admin'

interface Body {
  parent_order_id: string
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission('backwork.create')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

    const { id: orderId } = await ctx.params
    const body = (await req.json()) as Body
    if (!body.parent_order_id) {
      return NextResponse.json({ error: 'parent_order_id required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // The route param may be the human order_id ("BW/2026/09/0001") or the UUID.
    let orderUuid: string | null = null
    {
      const { data: byUuid } = await admin.from('orders').select('id').eq('id', orderId).maybeSingle()
      if (byUuid?.id) {
        orderUuid = byUuid.id as string
      } else {
        const { data: byHuman } = await admin.from('orders').select('id').eq('order_id', orderId).maybeSingle()
        orderUuid = (byHuman?.id as string) ?? null
      }
    }
    if (!orderUuid) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    }

    const { error: oErr } = await admin
      .from('orders')
      .update({ parent_order_id: body.parent_order_id, type: 'backwork' })
      .eq('id', orderUuid)
    if (oErr) throw oErr

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
