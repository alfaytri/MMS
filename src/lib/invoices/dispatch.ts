/**
 * Dispatch orchestrator for the unified invoice hub (`public.invoices`).
 *
 * `dispatchInvoice(hubId)` is the one generic "send this invoice" step every
 * invoice type flows through once its hub row exists: make sure the PDF exists,
 * make sure the row carries a Dibsy pay link, WhatsApp the customer, then stamp
 * the row `sent`. It generalizes the TL-only
 * `api/payments/dibsy/create-tl-invoice` route (Dibsy create -> store -> send) so
 * it runs off the hub row instead.
 *
 * The WhatsApp is the admin-assigned `order_invoice` template, sent through the
 * shared `sendWatiTemplate` helper exactly like `api/notifications/send-invoice`
 * sends it: the PDF is attached and the live `/pay/{hubId}` link is carried. The
 * helper reads the template from `notification_config` (Services -> Notifications),
 * routes it through the `api-wati` Edge Function and writes the Contact Centre log,
 * so nothing WATI-specific (no template name, no credentials, no chat write) lives
 * here.
 *
 * Server-only, and every hub read/write goes through the service-role client:
 * since migration 20261154 the hub is SELECT-only for `authenticated`.
 *
 * Idempotency - a sent invoice is never sent again, and a row never gets a second
 * pay link:
 *   - `dispatch_status = 'sent'` is terminal for this module. A sent row is a
 *     no-op, and no skip/failure write here ever downgrades it.
 *   - The pay link is created at most once per row. An existing
 *     `dibsy_checkout_url` is reused; a new one is stored BEFORE anything is
 *     sent (so a failed send retries with the same link), first writer wins (so
 *     two overlapping dispatches converge on one link). "A link that is still
 *     here is for the current amount" holds because the sync trigger clears the
 *     link and re-pends the row when the invoice total moves while money is owed.
 *   - Skip rules are evaluated in TS after loading the row (the payment-status
 *     enum is unpaid / partially_paid / paid / overdue / void). `skipped` and
 *     `failed` rows are re-evaluated on the next call; only `sent` is final.
 *
 * Known limits:
 *   - No claim step: the `dispatch_status` CHECK has no in-flight value (adding
 *     one needs a migration). Two *overlapping* calls for the same row can both
 *     pass the `sent` gate and both message the customer - with the same link - so
 *     callers should not dispatch one row concurrently.
 *   - Delivery is at-least-once: if the final `sent` write fails after WATI
 *     accepted the message, the row is recorded as failed and a retry re-sends
 *     (again with the same link).
 *
 * Dev safety net - INVOICE_DISPATCH_TEST_NUMBER: when set, every WhatsApp goes to that
 * number instead of the customer's (and the helper logs it to Contact Centre under that
 * number), so a dev live-send test cannot reach a real customer. It changes where a
 * message goes, never whether one is sent: a row with no customer phone still sends
 * nothing. A value with no digits in it fails the dispatch rather than falling back to
 * the customer. Unset or empty means no redirect. The digits go through the helper's
 * phone normalisation (a number that does not start with 974 gets it prepended), so
 * give a full Qatar number.
 *
 * Failure semantics: any thrown error is caught, recorded on the row as
 * `dispatch_status='failed'` + `dispatch_error`, and returned as
 * `{ status: 'failed' }`; `dispatchInvoice` itself never throws. Unlike
 * create-tl-invoice (where a WATI failure is only logged) a WhatsApp failure here
 * fails the dispatch, so it is retried rather than silently counted as sent. So is a
 * send the helper skips because the `order_invoice` template is not assigned (or its
 * notification is inactive / has no config row): the row is `failed` with an error
 * that says where to fix it, and a retry sends once the admin has.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'
import { pdfRendererFor } from '@/lib/invoices/pdf-registry'
import { kindForDetailTable, type HubInvoice } from '@/lib/invoices/types'
import { sendWatiTemplate } from '@/lib/notifications/sendWatiTemplate'

export interface DispatchResult {
  status: 'sent' | 'skipped' | 'failed'
  checkoutUrl?: string
  error?: string
}

/** The `notification_config` slug whose assigned WATI template carries the invoice (PDF + pay link). */
const WHATSAPP_SLUG = 'order_invoice'
const CURRENCY = 'QAR'

type AdminClient = ReturnType<typeof createAdminClient>

/** The hub columns dispatch reads (amounts are nullable in the table; see `run`). */
type HubRow = Pick<
  HubInvoice,
  | 'id' | 'detail_table' | 'detail_id' | 'invoice_id' | 'customer_name' | 'customer_phone'
  | 'total_amount' | 'paid_amount' | 'payment_status' | 'dispatch_status'
  | 'dibsy_payment_id' | 'dibsy_checkout_url' | 'pdf_url'
>
const HUB_COLUMNS =
  'id, detail_table, detail_id, invoice_id, customer_name, customer_phone, total_amount, paid_amount, ' +
  'payment_status, dispatch_status, dibsy_payment_id, dibsy_checkout_url, pdf_url'

// The hub's newer columns are not in the generated Database types (known drift,
// deliberately not regenerated - see src/lib/invoices/types.ts), so `invoices` is
// reached through a loose handle and rows are cast to HubRow. Tables that are in
// the generated types (so_invoices, chat_*) use the typed client.
type LooseResult = { data: unknown; error: { message: string } | null }
interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery
  update(values: Record<string, unknown>): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  neq(column: string, value: unknown): LooseQuery
  is(column: string, value: null): LooseQuery
  maybeSingle(): PromiseLike<LooseResult>
}
function hubTable(admin: AdminClient): LooseQuery {
  return (admin as unknown as { from(table: string): LooseQuery }).from('invoices')
}

export async function dispatchInvoice(hubId: string): Promise<DispatchResult> {
  try {
    return await run(createAdminClient(), hubId)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[dispatch-invoice] dispatch failed for hub invoice', hubId, '-', error)
    await markFailed(hubId, error)
    return { status: 'failed', error }
  }
}

async function run(admin: AdminClient, hubId: string): Promise<DispatchResult> {
  const row = await loadHubRow(admin, hubId)

  // Already sent: never send again. This is the idempotency gate.
  if (row.dispatch_status === 'sent') {
    return row.dibsy_checkout_url
      ? { status: 'sent', checkoutUrl: row.dibsy_checkout_url }
      : { status: 'sent' }
  }

  // Skip gates. Amounts are nullable columns, and the remainder is rounded to the
  // fils so float noise or a sub-fils balance can never mint a QAR 0.00 payment.
  const total = Number(row.total_amount ?? 0)
  const paid = Number(row.paid_amount ?? 0)
  const remaining = Math.round((total - paid) * 100) / 100
  if (remaining <= 0 || row.payment_status === 'void' || row.payment_status === 'paid') {
    return skip(admin, hubId)
  }

  // Only hub-managed customer invoices are dispatched. Legacy hub rows carry no
  // detail key, and a detail table with no registered renderer is rejected here,
  // before any side effect.
  const { detail_table: detailTable, detail_id: detailId } = row
  if (!detailTable || !detailId) {
    throw new Error(`hub invoice ${hubId} has no detail_table/detail_id - not a dispatchable invoice`)
  }
  const kind = kindForDetailTable(detailTable)

  // Sales invoices are created as drafts and rewritten on every edit: hold them
  // back until they are no longer a draft. tl_/contract_invoices are created final.
  if (detailTable === 'so_invoices' && (await isDraftSalesInvoice(admin, detailId))) {
    return skip(admin, hubId)
  }

  // (a) PDF. Held in a local: `row` was loaded before the render, and the WhatsApp must carry the PDF.
  let pdfUrl = row.pdf_url
  if (!pdfUrl) {
    pdfUrl = await pdfRendererFor(kind)(detailId)
    await updateHub(admin, hubId, { pdf_url: pdfUrl })
  }

  // (b) Pay link
  const checkoutUrl = await ensureCheckoutUrl(admin, row, remaining)

  // (c) WhatsApp. No phone is not a failure: the PDF and link still exist.
  const customerDigits = (row.customer_phone ?? '').replace(/\D/g, '')
  if (customerDigits) {
    // Dev safety net: with INVOICE_DISPATCH_TEST_NUMBER set, the message goes there, not to the customer.
    const phoneDigits = testNumberDigits(hubId) ?? customerDigits
    await sendPaymentMessage({
      hubId,
      phoneDigits,
      invoiceNumber: row.invoice_id,
      customerName: row.customer_name,
      total,
      paid,
      remaining,
      pdfUrl: pdfUrl || null,
    })
  } else {
    console.warn('[dispatch-invoice] no customer_phone - WhatsApp skipped for hub invoice', hubId)
  }

  // (d) Done
  await updateHub(admin, hubId, {
    dispatch_status: 'sent',
    sent_at: new Date().toISOString(),
    dispatch_error: null,
  })
  return { status: 'sent', checkoutUrl }
}

/**
 * The dev redirect target (digits only), or null when the redirect is off (the variable is
 * unset or empty). A value with no digits in it throws: that is a misconfiguration, and
 * falling back to the customer's own number would defeat the point of the redirect. The
 * warning names the hub invoice only - never either phone number.
 */
function testNumberDigits(hubId: string): string | null {
  const configured = process.env.INVOICE_DISPATCH_TEST_NUMBER
  if (!configured) return null
  const digits = configured.replace(/\D/g, '')
  if (!digits) {
    throw new Error(
      "INVOICE_DISPATCH_TEST_NUMBER is set but has no digits - refusing to fall back to the customer's number",
    )
  }
  console.warn(
    "[dispatch-invoice] DEV REDIRECT - INVOICE_DISPATCH_TEST_NUMBER is set, so the customer's real number was overridden for hub invoice",
    hubId,
  )
  return digits
}

// ─── Hub reads / writes ─────────────────────────────────────────────────────────

async function loadHubRow(admin: AdminClient, hubId: string): Promise<HubRow> {
  const { data, error } = await hubTable(admin).select(HUB_COLUMNS).eq('id', hubId).maybeSingle()
  if (error) throw new Error(`could not load hub invoice ${hubId}: ${error.message}`)
  if (!data) throw new Error(`hub invoice ${hubId} not found`)
  return data as HubRow
}

/**
 * Update the hub row, throwing on a failed write (supabase-js returns the error
 * rather than throwing). `unlessSent` guards the write so it can never overwrite
 * a row that an overlapping dispatch has already marked sent.
 */
async function updateHub(
  admin: AdminClient,
  hubId: string,
  patch: Record<string, unknown>,
  opts: { unlessSent?: boolean } = {},
): Promise<void> {
  let query = hubTable(admin).update(patch).eq('id', hubId)
  if (opts.unlessSent) query = query.neq('dispatch_status', 'sent')
  const { error } = await query
  if (error) throw new Error(`could not update hub invoice ${hubId}: ${error.message}`)
}

async function skip(admin: AdminClient, hubId: string): Promise<DispatchResult> {
  await updateHub(admin, hubId, { dispatch_status: 'skipped', dispatch_error: null }, { unlessSent: true })
  return { status: 'skipped' }
}

/** Best-effort: recording a failure must never throw out of `dispatchInvoice`. */
async function markFailed(hubId: string, message: string): Promise<void> {
  try {
    await updateHub(
      createAdminClient(),
      hubId,
      { dispatch_status: 'failed', dispatch_error: message },
      { unlessSent: true },
    )
  } catch (err) {
    console.error('[dispatch-invoice] could not record the failure for hub invoice', hubId, err)
  }
}

async function isDraftSalesInvoice(admin: AdminClient, soInvoiceId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('so_invoices')
    .select('status')
    .eq('id', soInvoiceId)
    .maybeSingle()
  if (error) throw new Error(`could not load sales invoice ${soInvoiceId}: ${error.message}`)
  // The detail row is gone (its hub row is an orphan - detail DELETE is not synced):
  // fail closed rather than send a pay link for an invoice that no longer exists.
  if (!data) throw new Error(`sales invoice ${soInvoiceId} not found`)
  return data.status === 'draft'
}

// ─── Dibsy pay link ─────────────────────────────────────────────────────────────

/**
 * The app's public base url, no trailing slash. The Dibsy redirect and the link in the
 * WhatsApp are both built on it, so the link the customer is sent is the page Dibsy
 * returns them to: `/pay/{hubId}`.
 */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com').replace(/\/$/, '')
}

async function ensureCheckoutUrl(admin: AdminClient, row: HubRow, remaining: number): Promise<string> {
  // Reuse, never duplicate. See the header for why a stored link is still current.
  if (row.dibsy_checkout_url) return row.dibsy_checkout_url

  const baseUrl = appUrl()
  const payment = await createDibsyPayment({
    amount: { value: remaining.toFixed(2), currency: CURRENCY },
    description: `Invoice ${row.invoice_id}`,
    redirectUrl: `${baseUrl}/pay/${row.id}`,
    webhookUrl: `${baseUrl}/api/payments/dibsy/webhook`,
    metadata: { hub_invoice_id: row.id },
  })
  // The client normalizes a missing checkout link to ''. Never store or send that.
  if (!payment.checkoutUrl) throw new Error(`Dibsy payment ${payment.id} has no checkout URL`)

  // Store it before anything is sent, and only while the slot is still empty:
  // if an overlapping dispatch stored a link first, that one wins and we use it
  // (our payment is left unused - unpaid, never shown to the customer).
  const { data, error } = await hubTable(admin)
    .update({ dibsy_payment_id: payment.id, dibsy_checkout_url: payment.checkoutUrl })
    .eq('id', row.id)
    .is('dibsy_checkout_url', null)
    .select('id')
  if (error) throw new Error(`could not store the Dibsy link on hub invoice ${row.id}: ${error.message}`)
  if (Array.isArray(data) && data.length > 0) return payment.checkoutUrl

  const { data: winner, error: readError } = await hubTable(admin)
    .select('dibsy_checkout_url')
    .eq('id', row.id)
    .maybeSingle()
  const winningUrl = (winner as { dibsy_checkout_url: string | null } | null)?.dibsy_checkout_url
  if (readError || !winningUrl) {
    throw new Error(`could not store the Dibsy link on hub invoice ${row.id}: the row changed during dispatch`)
  }
  return winningUrl
}

// ─── WhatsApp (order_invoice template) ──────────────────────────────────────────

interface PaymentMessage {
  hubId: string
  /** Digits only: the customer's, or the dev redirect target. */
  phoneDigits: string
  invoiceNumber: string
  customerName: string | null
  total: number
  paid: number
  remaining: number
  pdfUrl: string | null
}

/** Same money format as `api/notifications/send-invoice`: en-QA, always two decimals (WATI wants English numerals). */
const fmt = (amount: number) =>
  amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Send the invoice WhatsApp: the admin-assigned `order_invoice` template, through the
 * same `sendWatiTemplate` call as `api/notifications/send-invoice` (PDF attached, six
 * named params). The link in it is the live `/pay/{hubId}` portal, which redirects to the
 * Dibsy checkout stored on the row - so that link must be stored BEFORE this runs.
 *
 * The helper looks the template up, sends through the `api-wati` Edge Function and writes
 * the Contact Centre log (inserted before the send, backfilled after); this does none of
 * that. It reports a skipped or failed send as a return value rather than throwing, so
 * its answer is mapped here: sent -> return; skipped or failed -> throw, which
 * `dispatchInvoice` records as `failed` with the message (never a silent `sent`).
 */
async function sendPaymentMessage(m: PaymentMessage): Promise<void> {
  const payLink = `${appUrl()}/pay/${m.hubId}`
  const customerName = (m.customerName ?? '').trim()

  const result = await sendWatiTemplate({
    slug: WHATSAPP_SLUG,
    phone: m.phoneDigits,
    pdfUrl: m.pdfUrl,
    attachmentName: `${m.invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`,
    // The cron has no user session: the helper authenticates to api-wati with the cron secret instead.
    cronSecret: process.env.CRON_SECRET ?? null,
    params: [
      { name: 'invoice_number', value: m.invoiceNumber },
      { name: 'customer_name', value: customerName || '-' },
      { name: 'total', value: fmt(m.total) },
      { name: 'paid', value: fmt(m.paid) },
      { name: 'pending', value: fmt(m.remaining) },
      { name: 'pay_link', value: payLink },
    ],
    // What the Contact Centre thread shows; mirrors the manual invoice send.
    renderedText: [
      `فاتورة رقم ${m.invoiceNumber}`,
      customerName ? `عزيزنا ${customerName}` : '',
      `إجمالي الفاتورة: ${fmt(m.total)} ر.ق`,
      `المدفوع: ${fmt(m.paid)} ر.ق`,
      `المتبقي: ${fmt(m.remaining)} ر.ق`,
      `للدفع إلكترونياً: ${payLink}`,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  if ('skipped' in result) {
    // `run` only gets here with a phone, so this should not happen; if it does, it is the same
    // "no phone" case as the caller's own guard: nothing was sent, and that is not a failure.
    if (result.skipped === 'no-phone') {
      console.warn('[dispatch-invoice] the WhatsApp helper found no usable phone - WhatsApp skipped for hub invoice', m.hubId)
      return
    }
    throw new Error(skippedMessage(result.skipped))
  }
  if (!result.ok) throw new Error(`WATI send failed: ${result.error}`)
}

/** Why a skipped send fails the dispatch, worded for whoever reads `dispatch_error` on the All-Invoices page. */
function skippedMessage(reason: string): string {
  switch (reason) {
    case 'unassigned':
      return `${WHATSAPP_SLUG} WATI template not assigned (Services → Notifications)`
    case 'config-missing':
      return `${WHATSAPP_SLUG} notification is not configured (Services → Notifications)`
    case 'inactive':
      return `${WHATSAPP_SLUG} notification is inactive (Services → Notifications)`
    default:
      return `${WHATSAPP_SLUG} WhatsApp was skipped: ${reason}`
  }
}
