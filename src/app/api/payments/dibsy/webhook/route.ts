import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDibsyPayment, dibsyStatusToSubscriptionStatus } from '@/lib/dibsy'
import { verifyHmacSignature } from '@/lib/webhooks/verify'

// Dibsy webhook payload: {"resource":"payment","id":"pt_..."}
// Status and metadata must be fetched from the Dibsy API.

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Verify Dibsy webhook signature (HMAC-SHA256 on raw body)
  const signature = request.headers.get('dibsy-signature')
  if (!verifyHmacSignature(rawBody, signature, process.env.DIBSY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

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

  const subscriptionId           = payment.metadata?.subscription_id
  const tlInvoiceId              = payment.metadata?.tl_invoice_id
  const invoiceId                = payment.metadata?.invoice_id
  const batchId                  = payment.metadata?.batch_id
  const customerBatchInvoiceIds  = payment.metadata?.customer_batch_invoice_ids

  // Handle batch payment for regular customer invoices (table: invoices, AR)
  if (customerBatchInvoiceIds) {
    if (payment.status === 'paid') {
      let ids: string[] = []
      try {
        const parsed = JSON.parse(customerBatchInvoiceIds)
        if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === 'string')
      } catch {
        console.error('[dibsy/webhook] customer_batch_invoice_ids parse failed')
        return NextResponse.json({ error: 'Invalid customer batch metadata' }, { status: 400 })
      }
      if (ids.length === 0) {
        return NextResponse.json({ ok: true })
      }

      const adminClient = createAdminClient()

      // Fetch each invoice's total to compute paid_amount = total_amount
      // (the batch link bills the FULL remaining for every invoice in the
      // selection, so on success they all become fully paid).
      const { data: invs, error: fetchErr } = await adminClient
        .from('invoices')
        .select('id, total_amount')
        .in('id', ids)

      if (fetchErr || !invs) {
        console.error('[dibsy/webhook] customer batch fetch failed', fetchErr)
        return NextResponse.json({ error: 'Invoice fetch failed' }, { status: 500 })
      }

      const now = new Date().toISOString()
      let markedCount = 0
      for (const inv of invs) {
        const total = Number(inv.total_amount ?? 0)
        const { data: updated, error } = await adminClient
          .from('invoices')
          .update({
            paid_amount: total,
            payment_status: 'paid',
            manually_paid: true,
            updated_at: now,
          })
          .eq('id', inv.id)
          .neq('payment_status', 'paid')
          .select('id')

        if (error) {
          console.error(`[dibsy/webhook] customer-batch invoice ${inv.id} update failed`, error)
        } else if (updated?.length) {
          markedCount++
        }
      }
      console.log(`[dibsy/webhook] customer batch ${ids.length} invoices → paid (${markedCount} updated, payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle batch payment (multiple TL invoices)
  if (batchId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()

      const { data: items, error: fetchErr } = await adminClient
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

      await adminClient
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
