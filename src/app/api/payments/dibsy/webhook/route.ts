import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dibsyStatusToSubscriptionStatus, type DibsyWebhookPayload } from '@/lib/dibsy'

export async function POST(request: Request) {
  const rawBody = await request.text()

  let payload: DibsyWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id: dibsyPaymentId, status, metadata } = payload

  if (!dibsyPaymentId || !status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
  }

  const subscriptionId = metadata?.subscription_id
  if (!subscriptionId) {
    // Not a subscription payment — acknowledge and ignore
    return NextResponse.json({ ok: true })
  }

  const newStatus = dibsyStatusToSubscriptionStatus(status)
  if (!newStatus) {
    // Unknown/transitional status — acknowledge without update
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()

  const updateData: Record<string, unknown> = { status: newStatus }

  // Activate subscription: set start/end dates on first successful payment
  if (newStatus === 'active') {
    const { data: sub } = await (supabase as any)
      .from('customer_subscriptions')
      .select('start_date, end_date, duration_months')
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
    // Return 500 so Dibsy retries
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log(`[dibsy/webhook] subscription ${subscriptionId} → ${newStatus} (payment ${dibsyPaymentId})`)
  return NextResponse.json({ ok: true })
}
