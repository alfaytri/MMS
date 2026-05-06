import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

export async function POST(request: Request) {
  let body: {
    subscription_id: string
    amount: number
    description: string
    redirect_url: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { subscription_id, amount, description, redirect_url } = body

  if (!subscription_id || !amount || !description || !redirect_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/payments/dibsy/webhook`

  let payment
  try {
    payment = await createDibsyPayment({
      amount: { value: amount.toFixed(2), currency: 'QAR' },
      description,
      redirectUrl: redirect_url,
      webhookUrl,
      metadata: { subscription_id },
    })
  } catch (err) {
    console.error('[dibsy/create]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dibsy API error' },
      { status: 502 }
    )
  }

  const supabase = createAdminClient()
  const { error: dbError } = await (supabase as any)
    .from('customer_subscriptions')
    .update({
      dibsy_payment_id: payment.id,
      dibsy_checkout_url: payment.checkoutUrl,
    })
    .eq('id', subscription_id)

  if (dbError) {
    console.error('[dibsy/create] db update failed', dbError)
    // Don't block — payment was already created in Dibsy; log and continue
  }

  return NextResponse.json({ checkoutUrl: payment.checkoutUrl, paymentId: payment.id })
}
