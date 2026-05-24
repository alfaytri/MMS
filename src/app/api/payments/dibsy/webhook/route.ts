import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDibsyPayment, dibsyStatusToSubscriptionStatus } from '@/lib/dibsy'

// Dibsy webhook payload: {"resource":"payment","id":"pt_..."}
// Status and metadata must be fetched from the Dibsy API.

export async function POST(request: Request) {
  const rawBody = await request.text()

  let dibsyPaymentId: string | undefined
  try {
    const body = JSON.parse(rawBody)
    dibsyPaymentId = body.id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!dibsyPaymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  let payment
  try {
    payment = await getDibsyPayment(dibsyPaymentId)
  } catch (err) {
    console.error('[dibsy/webhook] failed to fetch payment:', err)
    return NextResponse.json({ error: 'Could not fetch payment' }, { status: 502 })
  }

  const subscriptionId = payment.metadata?.subscription_id
  const tlInvoiceId    = payment.metadata?.tl_invoice_id

  // Handle tl_invoice payment
  if (tlInvoiceId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()
      const { error } = await (adminClient as any)
        .from('tl_invoices')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', tlInvoiceId)

      if (error) {
        console.error('[dibsy/webhook] tl_invoices update failed', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.log(`[dibsy/webhook] tl_invoice ${tlInvoiceId} → paid (payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  if (!subscriptionId) {
    // Unknown payment type — acknowledge and ignore
    return NextResponse.json({ ok: true })
  }

  const newStatus = dibsyStatusToSubscriptionStatus(payment.status)
  if (!newStatus) {
    // Unknown/transitional status (e.g. "open") — acknowledge without update
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()
  const updateData: Record<string, unknown> = { status: newStatus }

  if (newStatus === 'active') {
    const { data: sub } = await (supabase as any)
      .from('customer_subscriptions')
      .select('status, duration_months')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (sub && sub.status !== 'active') {
      const startDate = new Date()
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + (sub.duration_months ?? 12))
      updateData.start_date = startDate.toISOString().split('T')[0]
      updateData.end_date = endDate.toISOString().split('T')[0]
    }
  }

  const { error } = await (supabase as any)
    .from('customer_subscriptions')
    .update(updateData)
    .eq('id', subscriptionId)

  if (error) {
    console.error('[dibsy/webhook] db update failed', error)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log(`[dibsy/webhook] subscription ${subscriptionId} → ${newStatus} (payment ${dibsyPaymentId})`)
  return NextResponse.json({ ok: true })
}
