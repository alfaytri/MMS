import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

export async function POST(req: NextRequest) {
  try {
    const { invoice_ids } = (await req.json()) as {
      invoice_ids: string[]
    }

    if (!invoice_ids?.length) {
      return NextResponse.json({ ok: false, error: 'invoice_ids required' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const supabaseAdmin = createAdminClient()
    const results: { invoice_id: string; checkout_url: string }[] = []

    for (const invoiceId of invoice_ids) {
      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_id, total_amount, paid_amount, payment_status, dibsy_checkout_url, customer_id')
        .eq('id', invoiceId)
        .single()

      if (!inv) continue

      const remaining = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
      if (remaining <= 0) continue

      if (inv.dibsy_checkout_url) {
        results.push({ invoice_id: inv.id, checkout_url: inv.dibsy_checkout_url })
        continue
      }

      const payment = await createDibsyPayment({
        amount: { value: remaining.toFixed(2), currency: 'QAR' },
        description: `Invoice ${inv.invoice_id}`,
        redirectUrl: `${appUrl}/pay/${inv.id}`,
        webhookUrl: `${appUrl}/api/payments/dibsy/webhook`,
        metadata: { invoice_id: inv.id },
      })

      await supabaseAdmin
        .from('invoices')
        .update({
          dibsy_payment_id: payment.id,
          dibsy_checkout_url: payment.checkoutUrl,
        })
        .eq('id', inv.id)

      results.push({ invoice_id: inv.id, checkout_url: payment.checkoutUrl })
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[create-invoice-link]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
