import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'
import { requireAuth } from '@/lib/auth/require-admin'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RequestBody {
  invoice_ids: string[]
}

/**
 * Generate ONE Dibsy checkout link that covers the remaining balance on
 * a batch of regular customer invoices (table: invoices, direction = 'ar').
 *
 * All invoices in the batch must belong to the same customer_id.
 *
 * The webhook (src/app/api/payments/dibsy/webhook) reads
 * metadata.customer_batch_invoice_ids and marks each invoice paid in
 * full when Dibsy reports the payment as paid.
 */
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_ids } = body

  if (
    !Array.isArray(invoice_ids) ||
    invoice_ids.length === 0 ||
    !invoice_ids.every((id) => UUID_RE.test(id))
  ) {
    return NextResponse.json(
      { ok: false, error: 'invoice_ids must be a non-empty array of valid UUIDs' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data: invoices, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, invoice_id, customer_id, total_amount, paid_amount, payment_status, direction, status, dibsy_checkout_url')
    .in('id', invoice_ids)

  if (fetchErr) {
    console.error('[create-customer-batch-payment] DB fetch error:', fetchErr)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  if (!invoices || invoices.length !== invoice_ids.length) {
    return NextResponse.json(
      { ok: false, error: 'One or more invoices not found' },
      { status: 400 },
    )
  }

  // All invoices must be AR + active + same customer + have remaining > 0
  const customerIds = new Set<string>()
  let totalRemaining = 0
  for (const inv of invoices) {
    if (inv.direction !== 'ar') {
      return NextResponse.json(
        { ok: false, error: `Invoice ${inv.invoice_id} is not an AR invoice` },
        { status: 400 },
      )
    }
    if (inv.status === 'void' || inv.status === 'cancelled') {
      return NextResponse.json(
        { ok: false, error: `Invoice ${inv.invoice_id} is ${inv.status}` },
        { status: 400 },
      )
    }
    if (inv.payment_status === 'paid') {
      return NextResponse.json(
        { ok: false, error: `Invoice ${inv.invoice_id} is already paid` },
        { status: 400 },
      )
    }
    if (inv.customer_id) customerIds.add(inv.customer_id)
    const remaining = Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0)
    if (remaining <= 0) {
      return NextResponse.json(
        { ok: false, error: `Invoice ${inv.invoice_id} has no remaining balance` },
        { status: 400 },
      )
    }
    totalRemaining += remaining
  }

  if (customerIds.size !== 1) {
    return NextResponse.json(
      { ok: false, error: 'All invoices must belong to the same customer' },
      { status: 400 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const invoiceNumbers = invoices.map((i) => i.invoice_id).join(', ')

  let payment: Awaited<ReturnType<typeof createDibsyPayment>>
  try {
    payment = await createDibsyPayment({
      amount: { value: totalRemaining.toFixed(2), currency: 'QAR' },
      description: `Payment for ${invoices.length} invoice(s) — ${invoiceNumbers}`,
      redirectUrl: `${appUrl}/pay/${invoices[0].id}?status=success`,
      webhookUrl: `${appUrl}/api/payments/dibsy/webhook`,
      metadata: {
        customer_batch_invoice_ids: JSON.stringify(invoice_ids),
        MMS_invoice_id: invoiceNumbers,
        invoice_count: String(invoices.length),
      },
    })
  } catch (err) {
    console.error('[create-customer-batch-payment] Dibsy error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Dibsy API error' },
      { status: 502 },
    )
  }

  // Stamp the same dibsy_payment_id / checkout_url on every invoice in the
  // batch so a follow-up "Generate Link" on the same selection reuses it
  // instead of creating a duplicate Dibsy payment.
  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      dibsy_payment_id: payment.id,
      dibsy_checkout_url: payment.checkoutUrl,
    })
    .in('id', invoice_ids)

  if (updateErr) {
    console.error('[create-customer-batch-payment] Invoice update error:', updateErr)
    // Non-fatal — the link still works, we just couldn't cache it.
  }

  return NextResponse.json({ ok: true, checkout_url: payment.checkoutUrl })
}
