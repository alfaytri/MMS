/**
 * Dispatch orchestrator for the unified invoice hub (`public.invoices`).
 *
 * `dispatchInvoice(hubId)` is the one generic "send this invoice" step every
 * invoice type flows through once its hub row exists: make sure the PDF exists,
 * make sure the row carries a Dibsy pay link, WhatsApp the customer (WATI), then
 * stamp the row `sent`. It generalizes the TL-only
 * `api/payments/dibsy/create-tl-invoice` route (Dibsy create -> store -> WATI
 * template -> chat_messages log) so it runs off the hub row instead.
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
 * number instead of the customer's (and is logged to Contact Centre under that number),
 * so a dev live-send test cannot reach a real customer. It changes where a message goes,
 * never whether one is sent: a row with no customer phone still sends nothing. A value
 * with no digits in it fails the dispatch rather than falling back to the customer.
 * Unset or empty means no redirect.
 *
 * Failure semantics: any thrown error is caught, recorded on the row as
 * `dispatch_status='failed'` + `dispatch_error`, and returned as
 * `{ status: 'failed' }`; `dispatchInvoice` itself never throws. Unlike
 * create-tl-invoice (where a WATI failure is only logged) a WATI failure here
 * fails the dispatch, so it is retried rather than silently counted as sent.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'
import { pdfRendererFor } from '@/lib/invoices/pdf-registry'
import { kindForDetailTable, type HubInvoice } from '@/lib/invoices/types'

export interface DispatchResult {
  status: 'sent' | 'skipped' | 'failed'
  checkoutUrl?: string
  error?: string
}

const WATI_TEMPLATE = 'mms_tl_invoice_payment'
const CURRENCY = 'QAR'

type AdminClient = ReturnType<typeof createAdminClient>

/** The hub columns dispatch reads (amounts are nullable in the table; see `run`). */
type HubRow = Pick<
  HubInvoice,
  | 'id' | 'detail_table' | 'detail_id' | 'invoice_id' | 'customer_phone'
  | 'total_amount' | 'paid_amount' | 'payment_status' | 'dispatch_status'
  | 'dibsy_payment_id' | 'dibsy_checkout_url' | 'pdf_url'
>
const HUB_COLUMNS =
  'id, detail_table, detail_id, invoice_id, customer_phone, total_amount, paid_amount, ' +
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

  // (a) PDF
  if (!row.pdf_url) {
    const pdfUrl = await pdfRendererFor(kind)(detailId)
    await updateHub(admin, hubId, { pdf_url: pdfUrl })
  }

  // (b) Pay link
  const checkoutUrl = await ensureCheckoutUrl(admin, row, remaining)

  // (c) WhatsApp. No phone is not a failure: the PDF and link still exist.
  const customerDigits = (row.customer_phone ?? '').replace(/\D/g, '')
  if (customerDigits) {
    // Dev safety net: with INVOICE_DISPATCH_TEST_NUMBER set, the message goes there, not to the customer.
    const phoneDigits = testNumberDigits(hubId) ?? customerDigits
    await sendPaymentMessage(admin, {
      hubId,
      phoneDigits,
      invoiceNumber: row.invoice_id,
      total,
      remaining,
      checkoutUrl,
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

async function ensureCheckoutUrl(admin: AdminClient, row: HubRow, remaining: number): Promise<string> {
  // Reuse, never duplicate. See the header for why a stored link is still current.
  if (row.dibsy_checkout_url) return row.dibsy_checkout_url

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com').replace(/\/$/, '')
  const payment = await createDibsyPayment({
    amount: { value: remaining.toFixed(2), currency: CURRENCY },
    description: `Invoice ${row.invoice_id}`,
    redirectUrl: `${appUrl}/pay/${row.id}`,
    webhookUrl: `${appUrl}/api/payments/dibsy/webhook`,
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

// ─── WhatsApp (WATI) ────────────────────────────────────────────────────────────

interface PaymentMessage {
  hubId: string
  phoneDigits: string
  invoiceNumber: string
  total: number
  remaining: number
  checkoutUrl: string
}

const money = (amount: number) => `${amount.toFixed(2)} ${CURRENCY}`

/**
 * Same WATI v2 template send as create-tl-invoice, driven off the hub row. The
 * template's `url` parameter is the `/pay/{id}` suffix, i.e. the hub id.
 * Throws if WATI rejects the message; the chat-log write after it is best-effort.
 */
async function sendPaymentMessage(admin: AdminClient, m: PaymentMessage): Promise<void> {
  const watiUrl = (process.env.WATI_API_URL ?? '').replace(/\/$/, '')
  const watiToken = process.env.WATI_API_TOKEN ?? ''
  if (!watiUrl || !watiToken) throw new Error('WATI_API_URL / WATI_API_TOKEN are not configured')

  const broadcastName = `${WATI_TEMPLATE}_${m.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`
  const res = await fetch(
    `${watiUrl}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(m.phoneDigits)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_name: WATI_TEMPLATE,
        broadcast_name: broadcastName,
        parameters: [
          { name: 'bookingnumber', value: m.invoiceNumber },
          { name: 'total_amount', value: money(m.total) },
          { name: 'due_amount', value: money(m.remaining) },
          { name: 'url', value: m.hubId },
        ],
      }),
    },
  )

  const rawText = await res.text()
  let data: Record<string, unknown> | null
  try {
    data = JSON.parse(rawText) as Record<string, unknown> | null
  } catch {
    data = { raw: rawText }
  }
  if (!res.ok || data?.error || data?.result === false) {
    throw new Error(`WATI send failed (HTTP ${res.status}): ${rawText.slice(0, 300)}`)
  }

  await logChatMessage(admin, m, watiMessageId(data))
}

function watiMessageId(data: Record<string, unknown> | null): string | null {
  const message = data?.message as Record<string, unknown> | undefined
  const info = data?.info as Record<string, unknown> | undefined
  return (
    (message?.whatsappMessageId as string | undefined) ??
    (info?.whatsAppMessageId as string | undefined) ??
    (data?.id as string | undefined) ??
    (data?.messageId as string | undefined) ??
    null
  )
}

/**
 * Mirror the message into Contact Centre (chat_conversations / chat_messages).
 * Best-effort: the customer already has the message, so a logging failure must not
 * turn the dispatch into a failure that would be retried (a duplicate send).
 */
async function logChatMessage(admin: AdminClient, m: PaymentMessage, watiMsgId: string | null): Promise<void> {
  try {
    const text = `Payment link for invoice ${m.invoiceNumber}\n\nAmount: ${money(m.remaining)}\n\n${m.checkoutUrl}`
    const phone = `+${m.phoneDigits}`
    const now = new Date().toISOString()

    const { data: existing } = await admin
      .from('chat_conversations')
      .select('id')
      .eq('wati_phone', phone)
      .maybeSingle()

    let conversationId: string | null = existing?.id ?? null
    if (!conversationId) {
      const { data: created } = await admin
        .from('chat_conversations')
        .insert({ wati_phone: phone, last_message: text, last_message_at: now, unread_count: 0 })
        .select('id')
        .single()
      conversationId = created?.id ?? null
    } else {
      await admin
        .from('chat_conversations')
        .update({ last_message: text, last_message_at: now })
        .eq('id', conversationId)
    }

    if (conversationId) {
      await admin.from('chat_messages').insert({
        conversation_id: conversationId,
        from_type: 'agent',
        source: 'whatsapp_api',
        text,
        agent_name: 'System',
        external_id: watiMsgId ? `wati_${watiMsgId}` : `hub_invoice_${m.hubId}_${Date.now()}`,
        delivery_status: 'sent',
        message_kind: 'message',
        created_at: now,
      })
    }
  } catch (err) {
    console.warn('[dispatch-invoice] could not log the message to chat for hub invoice', m.hubId, err)
  }
}
