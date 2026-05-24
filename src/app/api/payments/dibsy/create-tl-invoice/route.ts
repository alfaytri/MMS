// src/app/api/payments/dibsy/create-tl-invoice/route.ts
//
// Creates a Dibsy payment link for a TL invoice, saves the checkout URL to
// tl_invoices, and fires a Wati WhatsApp notification to the customer.
//
// Blocking:  Dibsy API failure → 502
// Non-blocking: DB update failure → log + continue
// Non-blocking: Wati send failure → log + continue

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

interface RequestBody {
  invoice_id: string
  amount: number
  order_id: string
  customer_phone: string
}

export async function POST(request: Request) {
  let body: RequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_id, amount, order_id, customer_phone } = body

  if (!invoice_id || !amount || !order_id) {
    return NextResponse.json(
      { error: 'Missing required fields: invoice_id, amount, order_id' },
      { status: 400 },
    )
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com'

  // ── 1. Create Dibsy payment link (blocking) ──────────────────────────────────
  let payment: Awaited<ReturnType<typeof createDibsyPayment>>
  try {
    payment = await createDibsyPayment({
      amount:      { value: amount.toFixed(2), currency: 'QAR' },
      description: `Invoice ${order_id}`,
      redirectUrl: `${appUrl}/pay/${invoice_id}`,
      webhookUrl:  `${appUrl}/api/payments/dibsy/webhook`,
      metadata:    { tl_invoice_id: invoice_id },
    })
  } catch (err) {
    console.error('[create-tl-invoice] Dibsy error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dibsy API error' },
      { status: 502 },
    )
  }

  // ── 2. Store Dibsy IDs on the invoice (non-blocking) ────────────────────────
  const supabase = createAdminClient()
  const { error: dbErr } = await supabase
    .from('tl_invoices' as any)
    .update({
      dibsy_payment_id:   payment.id,
      dibsy_checkout_url: payment.checkoutUrl,
    })
    .eq('id', invoice_id)

  if (dbErr) {
    console.error('[create-tl-invoice] DB update failed:', dbErr)
    // Non-blocking — the Dibsy link is already created; proceed.
  }

  // ── 3. Send Wati WhatsApp notification (non-blocking) ───────────────────────
  if (customer_phone) {
    const formattedAmount = `${amount.toFixed(2)} QAR`
    const templateName =
      process.env.WATI_INVOICE_TEMPLATE ?? 'mms_tl_invoice_payment'

    try {
      const watiBody = {
        phone:        customer_phone,
        // `text` is required by /api/wati/send-message — used as the
        // chat-history preview; the actual content delivered to the customer
        // comes from the Wati template.
        text:         `Payment link for order ${order_id}: ${payment.checkoutUrl}`,
        templateName,
        parameters: [
          { name: 'bookingnumber', value: order_id },
          { name: 'total_amount',  value: formattedAmount },
          { name: 'due_amount',    value: formattedAmount },
          // `url` = invoice UUID only; the template button base URL is
          // hardcoded in the Wati template as /pay/{{url}}
          { name: 'url',           value: invoice_id },
        ],
        senderName: 'System',
      }

      const watiRes = await fetch(`${appUrl}/api/wati/send-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(watiBody),
      })

      if (!watiRes.ok) {
        const txt = await watiRes.text()
        console.warn('[create-tl-invoice] Wati send failed:', txt)
      }
    } catch (err) {
      console.warn('[create-tl-invoice] Wati call threw:', err)
    }
  } else {
    console.warn(
      '[create-tl-invoice] No customer_phone — Wati notification skipped for invoice',
      invoice_id,
    )
  }

  return NextResponse.json({ ok: true, checkoutUrl: payment.checkoutUrl })
}
