import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function phoneLast8(raw: string): string {
  return raw.replace(/\D/g, '').slice(-8)
}

interface RequestBody {
  invoice_ids: string[]
  customer_phone: string
}

export async function POST(request: Request) {
  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids, customer_phone } = body

  if (
    !Array.isArray(invoice_ids) ||
    invoice_ids.length === 0 ||
    !invoice_ids.every((id) => UUID_RE.test(id))
  ) {
    return NextResponse.json(
      { error: 'invoice_ids must be a non-empty array of valid UUIDs' },
      { status: 400 },
    )
  }

  if (!customer_phone) {
    return NextResponse.json(
      { error: 'customer_phone is required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const requestPhoneNorm = phoneLast8(customer_phone)

  // Fetch and validate all requested invoices
  const { data: invoices, error: fetchErr } = await supabase
    .from('tl_invoices')
    .select('id, total_amount, payment_status, customer_phone, invoice_number, order_id, customer_name, discount_amount')
    .in('id', invoice_ids)

  if (fetchErr) {
    console.error('[create-batch-payment] DB fetch error:', fetchErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!invoices || invoices.length !== invoice_ids.length) {
    return NextResponse.json(
      { error: 'One or more invoices not found' },
      { status: 400 },
    )
  }

  for (const inv of invoices) {
    if (inv.payment_status !== 'unpaid') {
      return NextResponse.json(
        { error: `Invoice ${inv.id} is already paid or not in unpaid status` },
        { status: 400 },
      )
    }
    if (phoneLast8(inv.customer_phone ?? '') !== requestPhoneNorm) {
      return NextResponse.json(
        { error: 'Phone number mismatch — invoices do not belong to this customer' },
        { status: 400 },
      )
    }
  }

  const totalAmount = invoices.reduce(
    (sum, inv) => sum + Number(inv.total_amount ?? 0),
    0,
  )

  if (totalAmount <= 0) {
    return NextResponse.json(
      { error: 'Total amount must be greater than zero' },
      { status: 400 },
    )
  }

  // Insert batch
  const { data: batch, error: batchErr } = await (supabase as any)
    .from('tl_payment_batches')
    .insert({
      customer_phone,
      total_amount: totalAmount,
      payment_status: 'pending',
    })
    .select('id')
    .single()

  if (batchErr || !batch) {
    console.error('[create-batch-payment] Batch insert error:', batchErr)
    return NextResponse.json({ error: 'Failed to create payment batch' }, { status: 500 })
  }

  // Insert batch items
  const batchItems = invoices.map((inv) => ({
    batch_id: batch.id,
    tl_invoice_id: inv.id,
    amount: Number(inv.total_amount ?? 0),
  }))

  const { error: itemsErr } = await (supabase as any)
    .from('tl_payment_batch_items')
    .insert(batchItems)

  if (itemsErr) {
    console.error('[create-batch-payment] Batch items insert error:', itemsErr)
    return NextResponse.json({ error: 'Failed to create batch items' }, { status: 500 })
  }

  // Create Dibsy payment
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com'

  // Build rich metadata for Dibsy dashboard visibility
  const invoiceNumbers = invoices.map((inv) => inv.invoice_number).join(', ')
  const orderIds = [...new Set(invoices.map((inv) => inv.order_id).filter(Boolean))].join(', ')
  const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount ?? 0), 0)
  const firstInvoice = invoices[0]

  let payment: Awaited<ReturnType<typeof createDibsyPayment>>
  try {
    payment = await createDibsyPayment({
      amount:      { value: totalAmount.toFixed(2), currency: 'QAR' },
      description: `Payment for ${invoices.length} invoice(s) — ${invoiceNumbers}`,
      redirectUrl: `${appUrl}/pay/${invoice_ids[0]}?status=success`,
      webhookUrl:  `${appUrl}/api/payments/dibsy/webhook`,
      metadata: {
        batch_id:         batch.id,
        MMS_invoice_id:   invoiceNumbers,
        MMS_order_id:     orderIds,
        customer_phone:   customer_phone,
        customer_name:    firstInvoice.customer_name ?? '',
        discount:         totalDiscount.toFixed(2),
        invoice_count:    String(invoices.length),
      },
    })
  } catch (err) {
    console.error('[create-batch-payment] Dibsy error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dibsy API error' },
      { status: 502 },
    )
  }

  // Update batch with Dibsy details
  const { error: updateErr } = await (supabase as any)
    .from('tl_payment_batches')
    .update({
      dibsy_payment_id: payment.id,
      dibsy_checkout_url: payment.checkoutUrl,
    })
    .eq('id', batch.id)

  if (updateErr) {
    console.error('[create-batch-payment] Batch update error:', updateErr)
  }

  return NextResponse.json({ ok: true, checkoutUrl: payment.checkoutUrl })
}
