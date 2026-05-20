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
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WATI_URL    = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
const WATI_TOKEN  = (process.env.WATI_API_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const PDF_URL     = process.env.BOOKING_CONFIRMATION_PDF_URL ?? ''

const TEMPLATE_NAME = 'normal_booking_conformation_utility'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function formatDateAr(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return `${d.getUTCDate()} ${ARABIC_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function formatTimeAr(slot: string): string {
  const [hStr, mStr] = slot.split(':')
  const h = parseInt(hStr)
  const m = mStr?.padStart(2, '0') ?? '00'
  if (h === 0)  return `12:${m} ص`
  if (h < 12)   return `${h}:${m} ص`
  if (h === 12) return `12:${m} م`
  return `${h - 12}:${m} م`
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
  if (isImmediateMode) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authClient = createClient(SUPA_URL, SUPA_KEY)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } else {
    const secret = req.headers.get('x-cron-secret') ?? ''
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json({ error: 'WATI credentials not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // ── Build query ──────────────────────────────────────────────────────────────
  let targetDate: string | undefined

  let query = (supabase as any)
    .from('orders')
    .select(`
      id,
      order_id,
      scheduled_date,
      address,
      address_id,
      service_customer_id,
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
      // ── 1. Primary phone ──────────────────────────────────────────────────
      const { data: phoneRow } = await (supabase as any)
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
        addressLabel = order.service_customer_addresses.label ?? order.address ?? ''
        wazeLink     = order.service_customer_addresses.waze_link ?? ''
      } else if (order.address_id) {
        const { data: addr } = await (supabase as any)
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

      // ── 4. Build template parameters ─────────────────────────────────────
      const parameters: Array<{ name: string; value: string }> = [
        { name: 'booking_number', value: orderId },
        { name: 'date',           value: formatDateAr(order.scheduled_date) },
        { name: 'time',           value: timeSlot ? formatTimeAr(timeSlot) : '' },
        { name: 'address_label',  value: addressLabel },
        { name: 'address_link',   value: wazeLink },
      ]

      if (PDF_URL) {
        parameters.unshift({ name: 'header', value: PDF_URL })
      }

      // ── 5. Send Wati template ─────────────────────────────────────────────
      const watiRes = await fetch(
        `${WATI_URL}/api/v1/sendTemplateMessage/${watiPhone}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ template_name: TEMPLATE_NAME, broadcast_name: TEMPLATE_NAME, parameters }),
        },
      )

      const watiOk       = watiRes.ok
      const rawText      = await watiRes.text()
      let   watiData: Record<string, unknown> | null = null
      try { watiData = JSON.parse(rawText) } catch { /* non-JSON response */ }
      const watiMsgId: string | null = (watiData?.id ?? watiData?.messageId ?? null) as string | null

      if (!watiOk) {
        console.warn('[booking-confirm] wati send failed', orderId, watiRes.status, rawText.slice(0, 300))
      }

      // ── 6. Save to chat_messages for Contact Centre visibility ────────────
      const msgText = [
        `تم تأكيد موعد الخدمة رقم ${orderId}`,
        '',
        `بتاريخ ${formatDateAr(order.scheduled_date)}`,
        timeSlot ? `في الساعة ${formatTimeAr(timeSlot)}` : '',
        '',
        `العنوان: ${addressLabel}`,
        wazeLink,
        '',
        'يرجى مراجعة تفاصيل الخدمات في المستند المرفق.',
      ].filter(Boolean).join('\n').trim()

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
        const attachments = PDF_URL
          ? [{ url: PDF_URL, type: 'application/pdf', name: 'booking-confirmation.pdf' }]
          : []

        await (supabase as any)
          .from('chat_messages')
          .insert({
            conversation_id: conversationId,
            from_type:       'agent',
            source:          'whatsapp_api',
            text:            msgText,
            agent_name:      'System',
            attachments:     attachments.length > 0 ? attachments : null,
            external_id:     watiMsgId ? `wati_${watiMsgId}` : `booking_${orderId}_${Date.now()}`,
            delivery_status: watiOk ? 'sent' : 'failed',
          })
      }

      // ── 7. Mark order confirmation sent ───────────────────────────────────
      await (supabase as any)
        .from('orders')
        .update({ confirmation_status: 'sent', confirmation_sent_at: new Date().toISOString() })
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
