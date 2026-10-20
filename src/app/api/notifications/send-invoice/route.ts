// src/app/api/notifications/send-invoice/route.ts
//
// POST /api/notifications/send-invoice
//   Authorization: Bearer <supabase user JWT>
//   Body: { invoiceId }   (tl_invoices.id)
//
// Fires the order-invoice WhatsApp on invoice creation: ensures the invoice PDF,
// creates a Dibsy pay link for any pending balance, and sends the `order_invoice`
// template via the central sendWatiTemplate helper (which reads the ASSIGNED WATI
// template from notification_config — nothing hardcoded here). Best-effort: it
// never blocks invoice creation. Returns { ok } | { skipped } | { error }.
//
// Hub hand-off: the unified-invoice-hub dispatch cron (api/cron/dispatch-invoices) sends this
// same template for every hub row (public.invoices) still `pending`. So after a SUCCESSFUL send
// this route marks the invoice's hub row `sent` and the cron skips it - the customer gets one
// invoice message, not two. A skipped or failed send leaves the row `pending`, so the cron can
// still deliver it (e.g. once the template is assigned).
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generateTlInvoicePdf } from '@/lib/orders/generate-tl-invoice-pdf'
import { createDibsyPayment } from '@/lib/dibsy'
import { sendWatiTemplate } from '@/lib/notifications/sendWatiTemplate'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const fmt = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The hub's newer columns (detail_table, dispatch_status, sent_at, ...) are not in the generated
// Database types (known drift - see src/lib/invoices/types.ts), so `invoices` is reached through a
// loose handle, the same way src/lib/invoices/dispatch.ts and the dispatch cron do.
interface LooseHubQuery extends PromiseLike<{ error: { message: string } | null }> {
  update(values: Record<string, unknown>): LooseHubQuery
  eq(column: string, value: unknown): LooseHubQuery
  neq(column: string, value: unknown): LooseHubQuery
}

/**
 * Tell the invoice hub this TL invoice has already been WhatsApp'd, so the dispatch cron (which only
 * picks up `dispatch_status = 'pending'` rows) does not send it a second time.
 *
 * Guarded with `dispatch_status <> 'sent'`: a row that is already sent (the cron got there first, or
 * this route ran twice) is left alone, so `sent_at` stays the time of the first send. Any other state
 * (pending / failed / skipped) becomes `sent` - the customer has now been messaged.
 *
 * Best-effort: the invoice message has already gone out, so a failure here is logged and swallowed;
 * it must never turn a delivered invoice into an error response.
 */
async function markHubInvoiceSent(supabase: SupabaseClient, tlInvoiceId: string): Promise<void> {
  try {
    const hub = (supabase as unknown as { from(table: string): LooseHubQuery }).from('invoices')
    const { error } = await hub
      .update({ dispatch_status: 'sent', sent_at: new Date().toISOString() })
      .eq('detail_table', 'tl_invoices')
      .eq('detail_id', tlInvoiceId)
      .neq('dispatch_status', 'sent')
    if (error) console.warn('[send-invoice] could not mark the hub invoice sent', tlInvoiceId, error.message)
  } catch (e) {
    console.warn('[send-invoice] could not mark the hub invoice sent', tlInvoiceId, e)
  }
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { invoiceId?: string } = {}
  try { body = await req.json() } catch { /* no body */ }
  const invoiceId = body.invoiceId
  if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const { data: inv } = await supabase
    .from('tl_invoices')
    .select('id, invoice_number, order_id, customer_name, customer_phone, total_amount, paid_amount, pdf_url, dibsy_checkout_url')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'invoice not found' }, { status: 404 })

  const total   = Number(inv.total_amount ?? 0)
  const paid    = Number(inv.paid_amount ?? 0)
  const pending = Math.max(0, total - paid)
  const phone   = inv.customer_phone ?? ''
  if (!phone) return NextResponse.json({ skipped: 'no-phone' })

  // 1. Ensure the invoice PDF (usually already warmed at create time).
  let pdfUrl = inv.pdf_url ?? ''
  if (!pdfUrl) {
    try { pdfUrl = (await generateTlInvoicePdf(inv.id, supabase)).url }
    catch (e) { console.warn('[send-invoice] pdf generation failed', invoiceId, e) }
  }

  // 2. Ensure a Dibsy checkout exists on the invoice (the live pay portal uses it
  //    to actually collect payment), then hand the customer the LIVE portal link
  //    — `/pay/[invoiceId]` reads the invoice's CURRENT balance and updates as
  //    payments are made, unlike a fixed-amount Dibsy checkout snapshot.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com'
  if (pending > 0 && !inv.dibsy_checkout_url) {
    try {
      const payment = await createDibsyPayment({
        amount:      { value: pending.toFixed(2), currency: 'QAR' },
        description: `Invoice ${inv.invoice_number}`,
        redirectUrl: `${appUrl}/pay/${inv.id}`,
        webhookUrl:  `${appUrl}/api/payments/dibsy/webhook`,
        metadata: {
          tl_invoice_id:  inv.id,
          MMS_invoice_id: inv.invoice_number ?? '',
          MMS_order_id:   inv.order_id ?? '',
          customer_phone: phone,
          customer_name:  inv.customer_name ?? '',
        },
      })
      await supabase.from('tl_invoices')
        .update({ dibsy_payment_id: payment.id, dibsy_checkout_url: payment.checkoutUrl })
        .eq('id', inv.id)
    } catch (e) { console.warn('[send-invoice] dibsy link failed', invoiceId, e) }
  }
  // Live, self-updating payment page (not the fixed Dibsy checkout URL).
  const payLink = pending > 0 ? `${appUrl}/pay/${inv.id}` : ''

  // 3. Send via the central helper (reads the assigned template from config).
  const renderedText = [
    `فاتورة الخدمة رقم ${inv.invoice_number}`,
    inv.customer_name ? `عزيزنا ${inv.customer_name}` : '',
    '',
    `إجمالي الفاتورة: ${fmt(total)} ر.ق`,
    `المدفوع: ${fmt(paid)} ر.ق`,
    `المتبقي: ${fmt(pending)} ر.ق`,
    payLink ? `للدفع إلكترونياً: ${payLink}` : '',
  ].filter(Boolean).join('\n')

  const result = await sendWatiTemplate({
    slug:           'order_invoice',
    phone,
    pdfUrl:         pdfUrl || null,
    renderedText,
    attachmentName: `${(inv.invoice_number ?? 'invoice').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`,
    userToken:      token,
    params: [
      { name: 'invoice_number', value: inv.invoice_number ?? '-' },
      { name: 'customer_name',  value: inv.customer_name ?? '-' },
      { name: 'total',          value: fmt(total) },
      { name: 'paid',           value: fmt(paid) },
      { name: 'pending',        value: fmt(pending) },
      { name: 'pay_link',       value: payLink || '-' },
    ],
  })

  // 4. Hand-off to the hub - ONLY after a real, successful send. A skip (e.g. template not assigned) or
  //    a failure leaves the hub row `pending`, so the dispatch cron can still deliver it later.
  if ('ok' in result && result.ok === true) await markHubInvoiceSent(supabase, inv.id)

  return NextResponse.json(result)
}
