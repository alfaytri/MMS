/**
 * POST /api/notifications/send-booking-confirmations
 *
 * Two modes:
 *
 * CRON MODE (no body):
 *   Header:  x-cron-secret: <CRON_SECRET>
 *   Action:  Finds all orders whose scheduled_date = today + 2 days and
 *            sends the confirmation template to each customer.
 *
 * IMMEDIATE MODE (body: { orderId }):
 *   Header:  Authorization: Bearer <supabase-access-token>
 *   Action:  Sends the confirmation for a single order right now.
 *            Used when an order is created with a visit ≤ 2 days away.
 *
 * Template: normal_booking_conformation_utility
 * Parameters: booking_number, date (Arabic), time (Arabic), address_label, address_link
 *
 * Chat-thread order: the chat_messages row (with the PDF attachment) is INSERTED
 * BEFORE the WATI call so the inbound `templateMessageSent` webhook — which
 * fires ~50ms later — finds the row via cc_dedup_insert_message's text-based
 * Strategy-2 dedup and updates external_id in place instead of inserting a
 * second row that lacks attachments.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateOrderConfirmationPdf } from '@/lib/orders/generate-confirmation-pdf'

// React-PDF (called via generateOrderConfirmationPdf) needs Node APIs (fs).
export const runtime = 'nodejs'

// This route forwards the actual WATI call to the api-wati Edge Function,
// because direct WATI calls from Node.js are silently filtered. WATI creds
// are configured as Supabase secrets, not in this route's env.
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SUPA_ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Fallback if per-order PDF generation fails — keeps the WhatsApp send going
// with the static legacy PDF rather than aborting. Optional.
const FALLBACK_PDF_URL = process.env.BOOKING_CONFIRMATION_PDF_URL ?? ''

const TEMPLATE_NAME = 'normal_booking_conformation_utility'

// Use English formatting (matches template's approved sample structure)
// to avoid WATI's "Check your template, it cannot have typos or blank text"
// rejection of Arabic-formatted values.
const MONTHS_EN = [
  'January', 'February', 'March',     'April',   'May',      'June',
  'July',    'August',   'September', 'October', 'November', 'December',
]

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()}/${MONTHS_EN[d.getUTCMonth()].slice(0, 3)}/${d.getUTCFullYear()}`
}

function formatTime(slot: string): string {
  const [hStr, mStr] = slot.split(':')
  const h = parseInt(hStr)
  const m = mStr?.padStart(2, '0') ?? '00'
  if (h === 0)  return `12:${m} AM`
  if (h < 12)   return `${String(h).padStart(2, '0')}:${m} AM`
  if (h === 12) return `12:${m} PM`
  return `${String(h - 12).padStart(2, '0')}:${m} PM`
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('974') ? digits : `974${digits}`
}

export async function POST(req: NextRequest) {
  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { orderId?: string } = {}
  try { body = await req.json() } catch { /* cron mode sends no body */ }

  const isImmediateMode = !!body.orderId

  // ── Auth ────────────────────────────────────────────────────────────────────
  let userToken = ''
  if (isImmediateMode) {
    userToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authClient = createClient(SUPA_URL, SUPA_KEY)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(userToken)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } else {
    const secret = req.headers.get('x-cron-secret') ?? ''
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // User-scoped client for invoking the api-wati Edge Function — matches
  // exactly how the contact centre invokes it from the browser, so WATI
  // sees an identical request signature.
  const userSupabase = isImmediateMode
    ? createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: `Bearer ${userToken}` } } })
    : null

  // ── Build query ──────────────────────────────────────────────────────────────
  let targetDate: string | undefined

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_id,
      status,
      scheduled_date,
      address,
      address_id,
      service_customer_id,
      confirmation_pdf_url,
      order_team_assignments ( time_slot, scheduled_date ),
      service_customer_addresses ( label, waze_link )
    `)
    .is('confirmation_sent_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .not('service_customer_id', 'is', null)

  if (isImmediateMode) {
    query = query.eq('order_id', body.orderId)
  } else {
    const target = new Date()
    target.setUTCDate(target.getUTCDate() + 2)
    targetDate = target.toISOString().split('T')[0]
    query = query.eq('scheduled_date', targetDate)
  }

  const { data: orders, error: fetchErr } = await query

  if (fetchErr) {
    console.error('[booking-confirm] fetch error', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const results: Array<{ orderId: string; ok: boolean; error?: string }> = []

  for (const order of (orders ?? [])) {
    const orderId: string = order.order_id

    try {
      // ── 1. Primary phone + customer name ──────────────────────────────────
      const { data: phoneRow } = await supabase
        .from('service_customer_phones')
        .select('phone')
        .eq('customer_id', order.service_customer_id)
        .eq('is_primary', true)
        .maybeSingle()

      if (!phoneRow?.phone) {
        results.push({ orderId, ok: false, error: 'no primary phone' })
        continue
      }

      const { data: customerRow } = await supabase
        .from('service_customers')
        .select('name')
        .eq('id', order.service_customer_id)
        .maybeSingle()
      const _customerName: string = customerRow?.name ?? ''

      const watiPhone = normalisePhone(phoneRow.phone)

      // ── 2. Address ───────────────────────────────────────────────────────
      let addressLabel: string = order.address ?? ''
      let wazeLink: string = ''

      if (order.service_customer_addresses) {
        const addrJoin = order.service_customer_addresses as unknown as { label: string | null; waze_link: string | null } | null
        addressLabel = addrJoin?.label ?? order.address ?? ''
        wazeLink     = addrJoin?.waze_link ?? ''
      } else if (order.address_id) {
        const { data: addr } = await supabase
          .from('service_customer_addresses')
          .select('label, waze_link')
          .eq('id', order.address_id)
          .maybeSingle()
        addressLabel = addr?.label ?? order.address ?? ''
        wazeLink     = addr?.waze_link ?? ''
      }

      // ── 3. Earliest time slot ────────────────────────────────────────────
      const assignments: Array<{ time_slot: string; scheduled_date: string }> =
        order.order_team_assignments ?? []
      const sorted = [...assignments]
        .filter((a) => a.time_slot && /^\d{2}:\d{2}/.test(a.time_slot))
        .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
      const timeSlot = sorted[0]?.time_slot ?? null

      // ── 4. Ensure per-order PDF exists ───────────────────────────────────
      // Either reuse the cached URL on the order row, or render-and-upload
      // now. We never block the WhatsApp send entirely on PDF failure — if the
      // generator throws, fall back to the legacy static URL so the customer
      // still receives the confirmation message (the PDF is non-blocking).
      let pdfUrl: string = order.confirmation_pdf_url ?? ''
      if (!pdfUrl) {
        try {
          const pdfResult = await generateOrderConfirmationPdf(order.id, supabase)
          pdfUrl = pdfResult.url
        } catch (pdfErr) {
          const msg   = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
          const stack = pdfErr instanceof Error ? pdfErr.stack   : ''
          console.warn('[booking-confirm] PDF generation failed for', orderId, msg, '\n', stack)
          pdfUrl = FALLBACK_PDF_URL
        }
      }

      // ── 5. Build template parameters ─────────────────────────────────────
      // Use NAMED params matching the template's variable names — this is
      // the format the contact centre uses successfully via the same Edge
      // Function. English-formatted values match the approved sample structure.
      const safe = (v: string | null | undefined) => (v && v.trim()) || '-'
      const bodyParams: Array<{ name: string; value: string }> = [
        { name: 'booking_number', value: safe(orderId) },
        { name: 'date',           value: safe(formatDate(order.scheduled_date)) },
        { name: 'time',           value: safe(timeSlot ? formatTime(timeSlot) : '') },
        { name: 'address_label',  value: safe(addressLabel) },
        { name: 'address_link',   value: safe(wazeLink) },
      ]
      const parameters = pdfUrl
        ? [{ name: 'pdflink', value: pdfUrl }, ...bodyParams]
        : bodyParams

      // ── 6. Build the Arabic message + insert chat_messages BEFORE calling WATI ──
      // The WATI webhook fires `templateMessageSent` ~50ms after the send and
      // dedups by text via `cc_dedup_insert_message`. If we insert AFTER the
      // WATI call, the webhook arrives first and inserts a row WITHOUT our
      // PDF attachment (the webhook never carries our Storage URL). Pushing
      // first matches the local sync worker's pattern in
      // src/lib/contact-center/local/sync-worker.ts → sendTemplate.
      const msgText = [
        `تم تأكيد موعد الخدمة رقم ${orderId}`,
        '',
        `بتاريخ ${formatDate(order.scheduled_date)}`,
        timeSlot ? `في الساعة ${formatTime(timeSlot)}` : '',
        '',
        `العنوان: ${addressLabel}`,
        wazeLink,
        '',
        'يرجى مراجعة تفاصيل الخدمات في المستند المرفق.',
      ].filter(Boolean).join('\n').trim()

      const phone = `+${watiPhone}`

      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('wati_phone', phone)
        .maybeSingle()

      let conversationId: string | null = existing?.id ?? null

      if (!conversationId) {
        const { data: created } = await supabase
          .from('chat_conversations')
          .insert({ wati_phone: phone, last_message: msgText, last_message_at: new Date().toISOString(), unread_count: 0 })
          .select('id')
          .single()
        conversationId = created?.id ?? null
      } else {
        await supabase
          .from('chat_conversations')
          .update({ last_message: msgText, last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      }

      // Insert chat row with the PDF attachment + 'sending' status. After WATI
      // returns we'll update external_id + delivery_status. The dedup RPC's
      // Strategy-2 branch (agent + delivery_status IN ('sending','sent') +
      // text match) lets the inbound webhook update this same row without
      // touching attachments.
      const attachmentName = `${orderId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
      const attachmentsForChat = pdfUrl
        ? [{ url: pdfUrl, type: 'application/pdf', name: attachmentName }]
        : []
      const placeholderExternalId = `booking_${orderId.replace(/[^A-Za-z0-9._-]/g, '_')}_${Date.now()}`

      let insertedMessageId: string | null = null
      if (conversationId) {
        const { data: insertedRow } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: conversationId,
            from_type:       'agent',
            source:          'whatsapp_api',
            text:            msgText,
            agent_name:      'System',
            attachments:     attachmentsForChat.length > 0 ? attachmentsForChat : null,
            external_id:     placeholderExternalId,
            delivery_status: 'sending',
          })
          .select('id')
          .maybeSingle()
        insertedMessageId = insertedRow?.id ?? null
      }

      // ── 7. Send via the api-wati Edge Function ───────────────────────────
      // Match the contact centre's exact invocation: same client, same
      // headers, same payload shape, same phone format (with + prefix).
      let watiData: Record<string, unknown> | null = null
      let fnError: string | null = null

      const invokeBody = {
        action:         'send_template',
        phone:          watiPhone,
        template_name:  TEMPLATE_NAME,
        broadcast_name: `${TEMPLATE_NAME}_${orderId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        parameters,
      }

      if (userSupabase) {
        // Immediate mode — invoke via Supabase client with the user's JWT,
        // identical to the contact centre flow.
        const { data: fnData, error: fnErr } = await userSupabase.functions.invoke('api-wati', {
          body: invokeBody,
        })
        if (fnErr) fnError = fnErr.message ?? String(fnErr)
        watiData = (fnData ?? null) as Record<string, unknown> | null
      } else {
        // Cron mode — direct fetch with x-cron-secret (no user JWT available).
        const watiRes = await fetch(`${SUPA_URL}/functions/v1/api-wati`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}`, 'x-cron-secret': CRON_SECRET },
          body:    JSON.stringify(invokeBody),
        })
        const rawText = await watiRes.text()
        try { watiData = JSON.parse(rawText) } catch { watiData = { raw: rawText } }
        if (!watiRes.ok) fnError = `HTTP ${watiRes.status}: ${rawText.slice(0, 200)}`
      }

      // v2 response shape: { result: true, info: "...", message: { whatsappMessageId } }
      const _watiMsg  = watiData?.message  as Record<string, unknown> | undefined
      const _watiInfo = watiData?.info     as Record<string, unknown> | undefined
      const watiMsgId: string | null =
        (_watiMsg?.whatsappMessageId  as string | undefined) ??
        (_watiInfo?.whatsAppMessageId as string | undefined) ??
        (watiData?.id                 as string | undefined) ??
        (watiData?.messageId          as string | undefined) ??
        null

      const watiOk = !fnError && !watiData?.error && watiData?.result !== false

      if (!watiOk) {
        console.warn(
          '[booking-confirm] wati send failed',
          orderId,
          'result:', watiData?.result,
          'fn_error:', fnError ?? watiData?.error,
          'detail:', watiData?.detail,
          'body:', JSON.stringify(watiData).slice(0, 500),
        )
      } else {
        console.log('[booking-confirm] wati send ok', orderId, 'msgId:', watiMsgId, 'body:', JSON.stringify(watiData).slice(0, 300))
      }

      // ── 8. Backfill chat row with WATI id + final delivery status ─────────
      // The webhook may have already arrived between the INSERT above and now,
      // matched our row via Strategy 2 text dedup, and stamped its own
      // external_id/wamid onto it. Only overwrite the external_id while it
      // still equals our placeholder so we never clobber a real wamid.
      if (insertedMessageId) {
        const finalExternalId = watiMsgId ? `wati_${watiMsgId}` : null
        await supabase
          .from('chat_messages')
          .update({
            delivery_status: watiOk ? 'sent' : 'failed',
            ...(finalExternalId ? { external_id: finalExternalId } : {}),
          })
          .eq('id', insertedMessageId)
          .eq('external_id', placeholderExternalId)
      }

      // ── 9. Mark order confirmation sent + auto-confirm if WATI succeeded ───
      const now = new Date().toISOString()
      await supabase
        .from('orders')
        .update({
          // 'failed' is NOT a member of the confirmation_status enum
          // (not_sent | sent | confirmed | no_response | manually_confirmed), so
          // writing it silently 400s the whole update. On a WATI send failure the
          // order simply stays unsent + retryable → 'not_sent'. (The chat row's
          // delivery_status above legitimately records 'failed'.)
          confirmation_status:  watiOk ? 'sent' : 'not_sent',
          confirmation_sent_at: watiOk ? now   : null,
          ...(watiOk && order.status === 'scheduled' ? { status: 'confirmed' } : {}),
        })
        .eq('id', order.id)

      results.push({ orderId, ok: watiOk })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[booking-confirm] error for order', orderId, msg)
      results.push({ orderId, ok: false, error: msg })
    }
  }

  const sent   = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  return NextResponse.json({ date: targetDate ?? body.orderId, sent, failed, results })
}
