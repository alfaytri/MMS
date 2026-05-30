// src/app/api/payments/dibsy/create-tl-invoice/route.ts
//
// Creates a Dibsy payment link for a TL invoice, saves the checkout URL to
// tl_invoices, and fires a Wati WhatsApp notification to the customer.
//
// Blocking:  Dibsy API failure → 502
// Non-blocking: DB update failure → log + continue
// Non-blocking: Wati send failure → log + continue

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const WATI_URL    = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN  = process.env.WATI_API_TOKEN ?? ''

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RequestBody {
  invoice_id: string
  amount: number
  order_id: string
  customer_phone: string
}

export async function POST(request: Request) {
  // ── Auth guard ───────────────────────────────────────────────────────────────
  // Middleware refreshes cookies but does NOT enforce auth on /api/* routes.
  // Each route must validate the session independently.
  const supabaseAuth = await createServerClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_id, amount, order_id, customer_phone } = body

  if (!invoice_id || typeof amount !== 'number' || amount <= 0 || !order_id) {
    return NextResponse.json(
      {
        error:
          'Missing or invalid fields: invoice_id, amount (must be > 0), order_id',
      },
      { status: 400 },
    )
  }

  if (!UUID_RE.test(invoice_id)) {
    return NextResponse.json(
      { error: 'Invalid invoice_id format' },
      { status: 400 },
    )
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com'

  // ── 0. Fetch invoice details for Dibsy metadata ────────────────────────────
  const supabasePre = createAdminClient()
  const { data: invDetail } = await (supabasePre as any)
    .from('tl_invoices')
    .select('invoice_number, customer_name, discount_amount')
    .eq('id', invoice_id)
    .maybeSingle()

  // ── 1. Create Dibsy payment link (blocking) ──────────────────────────────────
  let payment: Awaited<ReturnType<typeof createDibsyPayment>>
  try {
    payment = await createDibsyPayment({
      amount:      { value: amount.toFixed(2), currency: 'QAR' },
      description: `Invoice ${invDetail?.invoice_number ?? order_id}`,
      redirectUrl: `${appUrl}/pay/${invoice_id}`,
      webhookUrl:  `${appUrl}/api/payments/dibsy/webhook`,
      metadata: {
        tl_invoice_id:    invoice_id,
        MMS_invoice_id:   invDetail?.invoice_number ?? '',
        MMS_order_id:     order_id,
        customer_phone:   customer_phone ?? '',
        customer_name:    invDetail?.customer_name ?? '',
        discount:         String(invDetail?.discount_amount ?? '0.00'),
      },
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
  const { error: dbErr } = await (supabase as any)
    .from('tl_invoices')
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
  // Same pattern as send-booking-confirmations: call the api-wati Edge Function
  // directly and save to chat_messages for Contact Centre visibility.
  if (customer_phone) {
    const formattedAmount = `${amount.toFixed(2)} QAR`
    const templateName = 'mms_tl_invoice_payment'

    const watiPhone = customer_phone.replace(/\D/g, '')

    try {
      const broadcastName = `${templateName}_${order_id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`
      const parameters = [
        { name: 'bookingnumber', value: order_id },
        { name: 'total_amount',  value: formattedAmount },
        { name: 'due_amount',    value: formattedAmount },
        { name: 'url',           value: invoice_id },
      ]

      // Call WATI v2 directly (same pattern as send-booking-confirmations)
      const watiRes = await fetch(
        `${WATI_URL}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(watiPhone)}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_name:  templateName,
            broadcast_name: broadcastName,
            parameters,
          }),
        },
      )

      const rawText = await watiRes.text()
      let watiData: Record<string, unknown> | null = null
      try { watiData = JSON.parse(rawText) } catch { watiData = { raw: rawText } }

      const watiOk = watiRes.ok && !watiData?.error && watiData?.result !== false
      const watiMsgId: string | null = (
        (watiData as any)?.message?.whatsappMessageId ??
        (watiData as any)?.info?.whatsAppMessageId ??
        (watiData as any)?.id ??
        (watiData as any)?.messageId ??
        null
      ) as string | null

      if (!watiOk) {
        console.warn('[create-tl-invoice] Wati send failed:', rawText.slice(0, 500))
      }

      // Save to chat_messages for Contact Centre visibility
      const msgText = `Payment link for order ${order_id}\n\nAmount: ${formattedAmount}\n\n${payment.checkoutUrl}`
      const phone = `+${watiPhone}`

      const { data: existing } = await (supabase as any)
        .from('chat_conversations')
        .select('id')
        .eq('wati_phone', phone)
        .maybeSingle()

      let conversationId: string | null = existing?.id ?? null

      if (!conversationId) {
        const { data: created } = await (supabase as any)
          .from('chat_conversations')
          .insert({ wati_phone: phone, last_message: msgText, last_message_at: new Date().toISOString(), unread_count: 0 })
          .select('id')
          .single()
        conversationId = created?.id ?? null
      } else {
        await (supabase as any)
          .from('chat_conversations')
          .update({ last_message: msgText, last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      }

      if (conversationId) {
        await (supabase as any)
          .from('chat_messages')
          .insert({
            conversation_id: conversationId,
            from_type:       'agent',
            source:          'whatsapp_api',
            text:            msgText,
            agent_name:      'System',
            external_id:     watiMsgId ? `wati_${watiMsgId}` : `tl_invoice_${invoice_id}_${Date.now()}`,
            delivery_status: watiOk ? 'sent' : 'failed',
            message_kind:    'message',
            created_at:      new Date().toISOString(),
          })
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
