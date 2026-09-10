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
 * The WATI template is READ from notification_config (slug 'booking_confirmation')
 * via the central sendWatiTemplate helper — assigned in the Services →
 * Notifications admin, never hardcoded here. The helper also handles the
 * api-wati Edge Function call and the chat_messages row (dedup timing included).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateOrderConfirmationPdf } from '@/lib/orders/generate-confirmation-pdf'
import { sendWatiTemplate } from '@/lib/notifications/sendWatiTemplate'

// React-PDF (called via generateOrderConfirmationPdf) needs Node APIs (fs).
export const runtime = 'nodejs'

const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Fallback if per-order PDF generation fails — keeps the WhatsApp send going
// with the static legacy PDF rather than aborting. Optional.
const FALLBACK_PDF_URL = process.env.BOOKING_CONFIRMATION_PDF_URL ?? ''

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

      // ── 4. Ensure per-order PDF exists (non-blocking on failure) ─────────
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

      // ── 5. Build NAMED param values + the rendered Arabic message, then send
      //    via the central helper (reads the assigned template from config,
      //    invokes api-wati, and writes chat_messages with the right dedup
      //    timing). Values are English-formatted per the WATI rule. ─────────
      const bodyParams = [
        { name: 'booking_number', value: orderId },
        { name: 'date',           value: formatDate(order.scheduled_date) },
        { name: 'time',           value: timeSlot ? formatTime(timeSlot) : '' },
        { name: 'address_label',  value: addressLabel },
        { name: 'address_link',   value: wazeLink },
      ]

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

      const sendResult = await sendWatiTemplate({
        slug:           'booking_confirmation',
        phone:          watiPhone,
        params:         bodyParams,
        pdfUrl:         pdfUrl || null,
        renderedText:   msgText,
        attachmentName: `${orderId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`,
        userToken:      isImmediateMode ? userToken : null,
        cronSecret:     isImmediateMode ? null : CRON_SECRET,
      })
      const watiOk = 'ok' in sendResult && sendResult.ok === true

      if (!watiOk) {
        console.warn('[booking-confirm] send not ok', orderId, JSON.stringify(sendResult))
      }

      // ── 6. Mark order confirmation sent + auto-confirm if WATI succeeded ───
      const now = new Date().toISOString()
      await supabase
        .from('orders')
        .update({
          // 'failed' is NOT a member of the confirmation_status enum
          // (not_sent | sent | confirmed | no_response | manually_confirmed), so
          // writing it silently 400s the whole update. On a WATI send failure the
          // order simply stays unsent + retryable → 'not_sent'.
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
