// Dispatch of pending hub invoices - Unified Invoice Hub, Task 6.
//
// Picks up the customer-facing rows of the hub (`public.invoices`) that are waiting
// to go out - dispatch_status = 'pending' and detail_table in ('tl_invoices',
// 'contract_invoices') - and runs each through the shared dispatchInvoice
// orchestrator (PDF -> Dibsy pay link -> WATI WhatsApp -> stamp 'sent'). The sales
// type (so_invoices) is deliberately NOT picked up in v1: a separate business rule
// gates it. Rows are dispatched one at a time, oldest first - each dispatch renders
// a PDF and calls Dibsy + WATI. dispatchInvoice never throws; it records a failure
// on the hub row (dispatch_error) and returns { status: 'failed' }.
//
// SAFETY GATES - default OFF (the opposite of reminders). A real dispatch needs BOTH:
//   1. app_settings key `invoice_dispatch_config` -> { enabled?: boolean }, with
//      `enabled === true` exactly. A missing row or any other value keeps it off, and a
//      config that cannot be read fails the run (500) rather than guessing. Writing the
//      row is admin-only (migration 20261156), but an admin is still inside the app.
//   2. env INVOICE_DISPATCH_ENABLED === 'true' exactly. It lives outside the database,
//      so nothing in the app can flip it; only whoever controls the deployment can.
// Any `?dryRun` param, whatever its value, is a dry run: only its ABSENCE dispatches, so
// a mistyped `?dryRun=true` can never become a real send.
//
// NOT registered in vercel.json, on purpose - manual invoke only. The tl_invoices
// write-lockdown has landed (direct writes are denied), but create_tl_invoice still has
// no caller authorization: any authenticated user can mint a TL invoice for any phone,
// and it syncs into the hub, so an enabled cron could be made to message arbitrary
// numbers. The real pre-send protection is therefore the env gate above plus the
// INVOICE_DISPATCH_TEST_NUMBER redirect in dispatchInvoice (dev: every WhatsApp goes to
// that number only). The cron stays unscheduled, and off, until the live-send test has
// passed. Invoke it with the secret:
//   POST /api/cron/dispatch-invoices            (x-cron-secret: <CRON_SECRET>)  -> dispatch
//   POST /api/cron/dispatch-invoices?dryRun=1   -> list what is pending, send nothing
//                                                  (the body shows each gate: config_enabled, env_enabled)
// Only 'pending' rows are picked up: a 'failed' row is deliberately not retried
// here (it needs a manual retry), so a permanently failing row cannot hot-loop.
// Don't run two invocations at once: dispatchInvoice has no claim step, so two
// overlapping runs can message the same customer twice.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchInvoice } from '@/lib/invoices/dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The hub types this cron dispatches in v1 (see the header for why sales is absent).
const DISPATCHABLE_DETAIL_TABLES = ['tl_invoices', 'contract_invoices'] as const

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

interface PendingHubRow {
  id: string
  detail_table: string
  detail_id: string
  invoice_id: string
  customer_name: string | null
}

// The hub's newer columns (detail_table, dispatch_status, ...) are not in the
// generated Database types (known drift, deliberately not regenerated - see
// src/lib/invoices/types.ts), so `invoices` is reached through a loose handle, the
// same way dispatch.ts does it, and the rows are cast to PendingHubRow.
type LooseResult = { data: unknown; error: { message: string } | null }
interface LooseHubQuery extends PromiseLike<LooseResult> {
  select(columns: string): LooseHubQuery
  eq(column: string, value: unknown): LooseHubQuery
  not(column: string, operator: string, value: unknown): LooseHubQuery
  in(column: string, values: readonly string[]): LooseHubQuery
  order(column: string, options: { ascending: boolean }): LooseHubQuery
}
function hubTable(admin: ReturnType<typeof createAdminClient>): LooseHubQuery {
  return (admin as unknown as { from(table: string): LooseHubQuery }).from('invoices')
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  // Any `dryRun` param is a dry run, whatever its value: only its ABSENCE dispatches.
  const dryRun = new URL(req.url).searchParams.has('dryRun')
  const admin = createAdminClient()

  // Safety gates, both OFF unless open: the config row says `enabled: true` (strictly boolean
  // true) AND the env var is exactly 'true' - a second key the app cannot turn from inside.
  const { data: cfgRow, error: cfgError } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'invoice_dispatch_config')
    .maybeSingle()
  if (cfgError) {
    return NextResponse.json(
      { ok: false, error: `could not read invoice_dispatch_config: ${cfgError.message}` },
      { status: 500 },
    )
  }
  const configEnabled = (cfgRow?.value as { enabled?: unknown } | null | undefined)?.enabled === true
  const envEnabled = process.env.INVOICE_DISPATCH_ENABLED === 'true'
  const enabled = configEnabled && envEnabled

  const { data, error } = await hubTable(admin)
    .select('id, detail_table, detail_id, invoice_id, customer_name')
    .eq('dispatch_status', 'pending')
    .not('detail_table', 'is', null)
    .in('detail_table', DISPATCHABLE_DETAIL_TABLES)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const pending = (data ?? []) as PendingHubRow[]

  if (dryRun) {
    return NextResponse.json({
      ok: true, mode: 'dryRun', enabled, config_enabled: configEnabled, env_enabled: envEnabled,
      pending_count: pending.length,
      pending: pending.map((r) => ({
        id: r.id, detail_table: r.detail_table, invoice_id: r.invoice_id, customer_name: r.customer_name,
      })),
    })
  }

  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled', pending_count: pending.length })
  }

  const tally = { sent: 0, skipped: 0, failed: 0 }
  const details: Array<{ id: string; invoice_id: string; detail_table: string; status: string }> = []

  for (const row of pending) {
    const result = await dispatchInvoice(row.id)
    tally[result.status] += 1
    details.push({
      id: row.id, invoice_id: row.invoice_id, detail_table: row.detail_table, status: result.status,
    })
  }

  return NextResponse.json({
    ok: true, ranAt: new Date().toISOString(), enabled, processed: pending.length, ...tally, details,
  })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
