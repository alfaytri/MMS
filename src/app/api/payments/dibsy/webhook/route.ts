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
  const invoiceId      = payment.metadata?.invoice_id
  const batchId        = payment.metadata?.batch_id

  // Handle batch payment (multiple TL invoices)
  if (batchId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()

      const { data: items, error: fetchErr } = await (adminClient as any)
        .from('tl_payment_batch_items')
        .select('tl_invoice_id')
        .eq('batch_id', batchId)

      if (fetchErr || !items?.length) {
        console.error('[dibsy/webhook] batch items fetch failed', fetchErr)
        return NextResponse.json({ error: 'Batch items not found' }, { status: 500 })
      }

      let markedCount = 0
      for (const item of items) {
        const { data: updated } = await adminClient
          .from('tl_invoices')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', item.tl_invoice_id)
          .eq('payment_status', 'unpaid')
          .select('id')

        if (updated?.length) markedCount++
        else console.warn(`[dibsy/webhook] invoice ${item.tl_invoice_id} skipped (already paid or not found)`)
      }

      await (adminClient as any)
        .from('tl_payment_batches')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', batchId)

      console.log(`[dibsy/webhook] batch ${batchId} → paid (${markedCount}/${items.length} invoices, payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle single tl_invoice payment (backward compat)
  if (tlInvoiceId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()
      const { error } = await adminClient
        .from('tl_invoices')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', tlInvoiceId)
        .eq('payment_status', 'unpaid')

      if (error) {
        console.error('[dibsy/webhook] tl_invoices update failed', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.log(`[dibsy/webhook] tl_invoice ${tlInvoiceId} → paid (payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle regular invoice payment
  if (invoiceId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()
      const { data: inv } = await adminClient
        .from('invoices')
        .select('total_amount, paid_amount')
        .eq('id', invoiceId)
        .maybeSingle()

      if (inv) {
        const paidAmount = Number(payment.amount?.value ?? 0)
        const newPaidAmount = (inv.paid_amount ?? 0) + paidAmount
        const fullyPaid = newPaidAmount >= (inv.total_amount ?? 0)

        const { error } = await adminClient
          .from('invoices')
          .update({
            paid_amount: newPaidAmount,
            payment_status: fullyPaid ? 'paid' : 'partial',
            manually_paid: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId)

        if (error) {
          console.error('[dibsy/webhook] invoices update failed', error)
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
        }
        console.log(`[dibsy/webhook] invoice ${invoiceId} → paid ${paidAmount} QAR (payment ${dibsyPaymentId})`)
      }
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
  const updatePayload: { status: string; start_date?: string; end_date?: string } = { status: newStatus }

  if (newStatus === 'active') {
    const { data: sub } = await supabase
      .from('customer_subscriptions')
      .select('status, package_id')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (sub && sub.status !== 'active') {
      const { data: pkg } = await supabase
        .from('subscription_packages')
        .select('duration_months')
        .eq('id', sub.package_id)
        .maybeSingle()

      const months = pkg?.duration_months ?? 12
      const startDate = new Date()
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + months)
      updatePayload.start_date = startDate.toISOString().split('T')[0]
      updatePayload.end_date = endDate.toISOString().split('T')[0]
    }
  }

  const { error } = await supabase
    .from('customer_subscriptions')
    .update(updatePayload)
    .eq('id', subscriptionId)

  if (error) {
    console.error('[dibsy/webhook] db update failed', error)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log(`[dibsy/webhook] subscription ${subscriptionId} → ${newStatus} (payment ${dibsyPaymentId})`)
  return NextResponse.json({ ok: true })
}
