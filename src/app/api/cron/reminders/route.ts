// Month-based service reminders (WhatsApp) — QC/Messaging Part B, B3.
//
// Finds customers whose last completed service + the reminder template's interval
// (in months) has passed and who have not been reminded within that interval
// (get_due_reminders RPC), and sends each the assigned WATI template via the
// shared sendWatiTemplate helper (which logs to chat_messages). Every send is
// also recorded in reminder_sends (dedup + audit).
//
// DEV SAFETY: reminder_config.test_number LOCKS every send to the test number so
// a real customer is never messaged from dev. Clear test_number to go live.
//
// NOT registered in vercel.json (dev-only). Trigger manually with the secret:
//   POST /api/cron/reminders            (x-cron-secret: <CRON_SECRET>)  → send
//   POST /api/cron/reminders?dryRun=1   → compute due list only, no send
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWatiTemplate, type WatiParam } from '@/lib/notifications/sendWatiTemplate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

interface DueRow {
  service_id: string
  service_name: string | null
  service_customer_id: string
  customer_name: string | null
  phone: string | null
  reminder_template_id: string
  wati_template_name: string | null
  param_names: unknown
  interval_months: number
  last_service_date: string | null
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  const admin = createAdminClient()

  // Config: enable flag + the DEV test-number lock.
  const { data: cfgRow } = await admin.from('app_settings').select('value').eq('key', 'reminder_config').maybeSingle()
  const cfg = ((cfgRow?.value ?? {}) as { enabled?: boolean; test_number?: string | null })
  const enabled = cfg.enabled !== false
  const testNumber = (cfg.test_number ?? '').trim() || null

  // get_due_reminders + reminder_sends aren't in the generated types yet (migration
  // 20261087) — cast until types are regenerated.
  const { data: dueData, error } = await admin.rpc('get_due_reminders' as never)
  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 })
  const due = (dueData ?? []) as unknown as DueRow[]

  if (dryRun) {
    return NextResponse.json({
      ok: true, mode: 'dryRun', enabled, testNumber, due_count: due.length,
      due: due.map((d) => ({ service: d.service_name, customer: d.customer_name,
        real_phone: d.phone, would_send_to: testNumber ?? d.phone,
        interval_months: d.interval_months, last_service_date: d.last_service_date })),
    })
  }

  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled', due_count: due.length })
  }

  const cronSecret = process.env.CRON_SECRET ?? null
  let sent = 0, failed = 0, skipped = 0
  const details: Array<Record<string, unknown>> = []

  for (const d of due) {
    // DEV lock: always send to the test number when one is configured.
    const toPhone = testNumber ?? d.phone
    if (!toPhone) { skipped++; continue }

    const ctx: Record<string, string> = {
      customer_name: d.customer_name ?? 'Customer',
      service_name: d.service_name ?? 'your service',
      interval_months: String(d.interval_months),
      months: String(d.interval_months),
      last_service_date: d.last_service_date ?? '',
    }
    const names: string[] = Array.isArray(d.param_names)
      ? (d.param_names as string[])
      : ['customer_name', 'service_name']
    const params: WatiParam[] = names.map((n) => ({ name: n, value: ctx[n] ?? '-' }))
    const renderedText = `Reminder: ${ctx.service_name} is due (every ${d.interval_months} months). — ${ctx.customer_name}`

    const res = await sendWatiTemplate({
      slug: 'service_reminder',
      templateOverride: { watiTemplateName: d.wati_template_name ?? '', mediaType: 'none' },
      phone: toPhone,
      params,
      renderedText,
      cronSecret,
    })

    const ok = 'ok' in res && res.ok === true
    const status = ok ? 'sent' : ('skipped' in res ? 'skipped' : 'failed')
    if (ok) sent++; else if (status === 'skipped') skipped++; else failed++

    await admin.from('reminder_sends' as never).insert({
      reminder_template_id: d.reminder_template_id,
      service_id: d.service_id,
      service_customer_id: d.service_customer_id,
      to_number: toPhone,
      wati_msg_id: ok ? (res as { watiMsgId: string | null }).watiMsgId : null,
      status,
      detail: ok ? null : JSON.stringify(res),
    } as never)
    details.push({ service: d.service_name, customer: d.customer_name, to: toPhone, status })
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), enabled, testNumber, due_count: due.length, sent, failed, skipped, details })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
