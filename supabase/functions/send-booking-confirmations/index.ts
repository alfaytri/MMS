/**
 * Supabase Edge Function — send-booking-confirmations
 *
 * Scheduled daily at 08:00 GST (05:00 UTC) via Deno.cron.
 * Queries orders whose scheduled_date = today + 2 days and sends the
 * `normal_booking_conformation_utility` WhatsApp template to each customer.
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   WATI_API_URL                  — e.g. https://live-mt-server.wati.io/6273
 *   WATI_API_TOKEN                — Bearer token for Wati
 *   BOOKING_CONFIRMATION_PDF_URL  — public PDF URL (dummy for now)
 *
 * Auto-provided by Supabase runtime:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function run() {
  const WATI_URL   = (Deno.env.get('WATI_API_URL') ?? '').replace(/\/$/, '')
  const WATI_TOKEN = (Deno.env.get('WATI_API_TOKEN') ?? '').replace(/^Bearer\s+/i, '')
  const PDF_URL    = Deno.env.get('BOOKING_CONFIRMATION_PDF_URL') ?? ''
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!
  const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!WATI_URL || !WATI_TOKEN) {
    console.error('[booking-confirm] WATI credentials not configured')
    return
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // Target: 2 days from now
  const target = new Date()
  target.setUTCDate(target.getUTCDate() + 2)
  const targetDate = target.toISOString().split('T')[0]

  console.log(`[booking-confirm] processing orders for ${targetDate}`)

  const { data: orders, error: fetchErr } = await (supabase as any)
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
    .eq('scheduled_date', targetDate)
    .is('confirmation_sent_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .not('service_customer_id', 'is', null)

  if (fetchErr) {
    console.error('[booking-confirm] fetch error', fetchErr.message)
    return
  }

  console.log(`[booking-confirm] found ${orders?.length ?? 0} orders`)

  for (const order of (orders ?? [])) {
    const orderId: string = order.order_id

    try {
      // 1. Primary phone
      const { data: phoneRow } = await (supabase as any)
        .from('service_customer_phones')
        .select('phone')
        .eq('customer_id', order.service_customer_id)
        .eq('is_primary', true)
        .maybeSingle()

      if (!phoneRow?.phone) {
        console.warn(`[booking-confirm] no primary phone for order ${orderId}`)
        continue
      }

      const watiPhone = normalisePhone(phoneRow.phone)

      // 2. Address label + waze link
      let addressLabel: string = order.address ?? ''
      let wazeLink    = ''

      if (order.service_customer_addresses) {
        addressLabel = order.service_customer_addresses.label ?? order.address ?? ''
        wazeLink     = order.service_customer_addresses.waze_link ?? ''
      }

      // 3. Earliest time slot on the scheduled date
      const assignments: Array<{ time_slot: string; scheduled_date: string }> =
        order.order_team_assignments ?? []
      const sorted = [...assignments]
        .filter((a) => a.time_slot && /^\d{2}:\d{2}/.test(a.time_slot))
        .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
      const timeSlot = sorted[0]?.time_slot ?? null

      // 4. Template parameters
      const parameters: Array<{ name: string; value: string }> = []
      if (PDF_URL) parameters.push({ name: 'header', value: PDF_URL })
      parameters.push(
        { name: 'booking_number', value: orderId },
        { name: 'date',           value: formatDateAr(order.scheduled_date) },
        { name: 'time',           value: timeSlot ? formatTimeAr(timeSlot) : '' },
        { name: 'address_label',  value: addressLabel },
        { name: 'address_link',   value: wazeLink },
      )

      // 5. Send template
      const watiRes = await fetch(
        `${WATI_URL}/api/v1/sendTemplateMessage/${watiPhone}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ template_name: TEMPLATE_NAME, broadcast_name: TEMPLATE_NAME, parameters }),
        },
      )

      const watiOk   = watiRes.ok
      const watiData = await watiRes.json().catch(() => null)
      const watiMsgId: string | null = watiData?.id ?? watiData?.messageId ?? null

      if (!watiOk) {
        console.warn(`[booking-confirm] wati send failed for ${orderId}`, watiRes.status)
      }

      // 6. Save to chat_messages
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

      let convId: string | null = existing?.id ?? null
      if (!convId) {
        const { data: created } = await (supabase as any)
          .from('chat_conversations')
          .insert({ wati_phone: phone, last_message: msgText, last_message_at: new Date().toISOString(), unread_count: 0 })
          .select('id')
          .single()
        convId = created?.id ?? null
      } else {
        await (supabase as any)
          .from('chat_conversations')
          .update({ last_message: msgText, last_message_at: new Date().toISOString() })
          .eq('id', convId)
      }

      if (convId) {
        const attachments = PDF_URL
          ? [{ url: PDF_URL, type: 'application/pdf', name: 'booking-confirmation.pdf' }]
          : []
        await (supabase as any)
          .from('chat_messages')
          .insert({
            conversation_id: convId,
            from_type:       'agent',
            source:          'whatsapp_api',
            text:            msgText,
            agent_name:      'System',
            attachments:     attachments.length > 0 ? attachments : null,
            external_id:     watiMsgId ? `wati_${watiMsgId}` : `booking_${orderId}_${Date.now()}`,
            delivery_status: watiOk ? 'sent' : 'failed',
          })
      }

      // 7. Mark sent
      await (supabase as any)
        .from('orders')
        .update({ confirmation_status: 'sent', confirmation_sent_at: new Date().toISOString() })
        .eq('id', order.id)

      console.log(`[booking-confirm] ${watiOk ? '✓' : '✗'} ${orderId}`)
    } catch (err) {
      console.error(`[booking-confirm] error for ${orderId}:`, err)
    }
  }
}

// ── Scheduled trigger: daily at 08:00 GST = 05:00 UTC ───────────────────────
Deno.cron('send-booking-confirmations', '0 5 * * *', run)

// ── Manual HTTP trigger (POST with service role header) ──────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  await run()
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
