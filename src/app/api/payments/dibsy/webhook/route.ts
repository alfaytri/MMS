import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDibsyPayment, dibsyStatusToSubscriptionStatus, type DibsyPayment } from '@/lib/dibsy'
import { verifyHmacSignature } from '@/lib/webhooks/verify'
import { HUB_DETAIL_TABLES, INVOICE_TYPE_REGISTRY } from '@/lib/invoices/registry'

// Dibsy webhook payload: {"resource":"payment","id":"pt_..."}
// Status and metadata must be fetched from the Dibsy API.

// ─── Unified invoice hub settlement (metadata.hub_invoice_id) ───────────────────────
// lib/invoices/dispatch mints each hub invoice's Dibsy link with metadata { hub_invoice_id: <hub row id> }
// and nothing else, so a paid hub payment reaches this branch and no legacy one.
//
// The hub (public.invoices) mirrors the per-type detail tables, and the DETAIL row is canonical: since
// migration 20261154 every INSERT/UPDATE of a detail row re-mirrors its total_amount, paid_amount and
// payment_status onto the hub row (sync_invoice_hub). Two consequences shape the writes below:
//   - the detail row must be written with paid_amount as well as payment_status. A status-only write would
//     let the trigger copy the detail's stale paid_amount back over the hub's;
//   - the detail row is written FIRST and the hub second, so a failure between the two is retry-safe (see
//     settleHubInvoice).
//
// The hub's newer columns (detail_table, detail_id, ...) are not in the generated Database types (known
// drift, deliberately not regenerated - see src/lib/invoices/types.ts), and the detail table to write is
// only known at runtime, so both are reached through a loose handle, as src/lib/invoices/dispatch.ts does.

type LooseResult = { data: unknown; error: { message: string } | null }
interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery
  update(values: Record<string, unknown>): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  neq(column: string, value: unknown): LooseQuery
  maybeSingle(): PromiseLike<LooseResult>
}
type AdminClient = ReturnType<typeof createAdminClient>
function looseFrom(admin: AdminClient, table: string): LooseQuery {
  return (admin as unknown as { from(table: string): LooseQuery }).from(table)
}

/** The hub columns settlement reads. */
interface HubRow {
  total_amount: number | null
  paid_amount: number | null
  payment_status: string
  detail_table: string | null
  detail_id: string | null
}

// The detail tables a hub row can mirror, and how each is settled (its own spelling of "partially paid", and
// whether it has an updated_at column), come from the invoice-type registry: HUB_DETAIL_TABLES in
// src/lib/invoices/registry.ts. A new invoicing module is one registry entry, not a line here. A route file may
// only export handlers, so the table cannot live in this file - and a second copy kept here would drift the
// moment a type is registered (the hub settled, its detail row not).
//
// Sales invoices (so_invoices) are the one type settled WITHOUT writing the detail row. so_invoices.paid_amount and
// payment_status are DERIVED from the AR payments ledger: every INSERT / UPDATE / DELETE on public.payments
// recomputes them (trg_invoice_recompute_paid, payments_recalc_ar_status), so a paid_amount / payment_status
// written here would be overwritten by the next payment event on that invoice and would never reach the AR
// reports. A paid sales link is therefore recorded as what it is - a card receipt in the ledger
// (recordSalesCardPayment) - and the database moves the invoice, and sync_invoice_hub mirrors it onto the hub row.
// (Sales invoices are not dispatched in v1 - the cron selects only the registry's dispatchable types, which leave
// so_invoices out - so this path is dormant until sales is enabled; it is covered by unit tests only.)

/** Round to the fils, as dispatch does, so float noise (0.1 + 0.2) can never leave an invoice a fil short. */
const round2 = (n: number) => Math.round(n * 100) / 100

// ─── Sales invoices: the AR payments ledger ─────────────────────────────────────────

/** The one detail table settled through the ledger instead of a status write: the registry's sales type (so_invoices). */
const SALES_DETAIL_TABLE: string = INVOICE_TYPE_REGISTRY.sales.detailTable

/**
 * `payments.method` has to be an existing `payment_methods.slug`: the table is admin-managed data and the
 * sync_payment_method_id trigger refuses any other value. 'pos' is the card method every environment has (the
 * fresh-DB bootstrap seeds cash + pos, and the Team Leader invoice's two payment boxes are bound to exactly those
 * two slugs - migration 20261070); there is no 'card' or 'dibsy' method. The AR paid totals ignore the method (the
 * cash report reads it through payment_methods.is_cash_equivalent, false for pos; the customer statement only prints
 * it), so this is a label: the one constant to change if the business adds a dedicated online-card method.
 */
const SALES_CARD_PAYMENT_METHOD = 'pos'

/** Customer receipts are numbered CPAY-00001, CPAY-00002, ... by the app's own writers; there is no sequence. */
const CPAY_PREFIX = 'CPAY-'
/** Attempts at a free CPAY number before giving up (the 500 then makes Dibsy re-deliver). */
const MAX_CPAY_ATTEMPTS = 3

/**
 * The business date a receipt carries: today in Qatar (UTC+3). `toISOString()` would be the previous day between
 * 00:00 and 03:00 local, which puts a night-time card payment in the wrong day of the cash report.
 */
function qatarToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * The next CPAY- id, by max + 1 like useCreateCustomerPayment and rpc_redeem_credit_note. Returns null (already
 * logged) when it cannot be worked out - a failed read, or a highest id with no number after the prefix - so a
 * "CPAY-NaN" can never be written.
 */
async function nextCpayId(admin: AdminClient): Promise<string | null> {
  const { data, error } = await admin
    .from('payments')
    .select('payment_id')
    .ilike('payment_id', `${CPAY_PREFIX}%`)
    .order('payment_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[dibsy/webhook] CPAY numbering read failed', error)
    return null
  }
  const last = data?.payment_id ? parseInt(data.payment_id.slice(CPAY_PREFIX.length), 10) : 0
  if (!Number.isFinite(last)) {
    console.error(`[dibsy/webhook] cannot number the next receipt: the highest payment id ${String(data?.payment_id)} has no number after "${CPAY_PREFIX}"`)
    return null
  }
  return `${CPAY_PREFIX}${String(last + 1).padStart(5, '0')}`
}

/**
 * A delivery that finds its receipt already in the ledger is a re-delivery. The invoice row is canonical and
 * sync_invoice_hub mirrors it onto the hub in the same transaction as the receipt, so normally the hub is level
 * with the invoice and NOTHING is written (and never `hub + amount`: this payment is already in both). Where the
 * mirror did not happen - the sync trigger absent, or a first delivery that failed after recording the receipt - the
 * hub is brought up to the invoice's own paid amount and status here, so the retry converges as it does for the other
 * types. Only UP, and guarded like every hub write: it can neither pull a hub row backwards nor touch one that is
 * already paid / void.
 */
async function catchUpHubToInvoice(
  admin: AdminClient,
  hubId: string,
  hub: HubRow,
  invoice: { paid_amount: number | null; payment_status: string },
): Promise<NextResponse> {
  const invoicePaid = Number(invoice.paid_amount ?? 0)
  if (invoicePaid > Number(hub.paid_amount ?? 0)) {
    const { error } = await looseFrom(admin, 'invoices')
      .update({ paid_amount: invoicePaid, payment_status: invoice.payment_status, updated_at: new Date().toISOString() })
      .eq('id', hubId)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'void')
    if (error) {
      console.error('[dibsy/webhook] hub invoice update failed', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
    console.log(`[dibsy/webhook] hub invoice ${hubId} brought up to its sales invoice (${invoicePaid} QAR paid, ${invoice.payment_status})`)
  }
  return NextResponse.json({ ok: true })
}

/**
 * Record a PAID Dibsy payment against a sales invoice (so_invoices) as a card receipt in the AR payments ledger.
 *
 * Why not write the invoice, as for tl_ / contract_invoices: so_invoices.paid_amount / payment_status are derived
 * from `payments` (see the header), so a direct write is overwritten by the next payment event on that invoice.
 *
 * The row, verified against the live trigger chain on `payments`:
 *   - source_type 'invoice' + source_id <so_invoices.id>: the canonical post-invoice form. The sale-order payment
 *     dialog writes source_type 'sale_order' and a BEFORE INSERT trigger re-points it at the SO's invoice (see
 *     useSOPayments); this is that result, written directly, so it needs neither the SO nor that redirect. The
 *     sync trigger then fills invoice_id, the AFTER INSERT recompute moves the invoice, and sync_invoice_hub mirrors
 *     it onto the hub. attach_payment_to_invoice is NOT used: it refuses a receipt that is already linked, and this
 *     one is linked from the moment it exists.
 *   - invoice_id is deliberately NOT sent: an explicit one arms trg_payments_cap_invoice_paid, which raises on
 *     over-allocation. This money has already been received, so it is recorded in full (the caller warns about an
 *     overpayment, as for the other types) instead of being refused into a 500 / re-delivery loop. (That trigger
 *     fires before trg_payments_sync_invoice_id fills invoice_id, so it does not see this row; should that order
 *     ever change, an overpayment would fail loudly with a 500 rather than be recorded.)
 *   - status 'completed': the gateway has captured the money. It is what the other server-side AR writer
 *     (rpc_redeem_credit_note) writes, and the only status get_payment_summary() counts (the paid-total recompute
 *     counts every status; the other reports count completed / pending / processing).
 *   - amount / amount_qar the QAR amount, currency 'QAR', exchange_rate 1 (any other currency is refused below).
 *   - customer_id the invoice's customer (the cash report joins on it); reference the Dibsy payment id, which is
 *     both the audit trail and the idempotency key; method: see SALES_CARD_PAYMENT_METHOD.
 *
 * Idempotency (Dibsy re-delivers, and a 500 makes it do so on purpose): right before every insert the ledger is
 * searched for a receipt whose `reference` is this Dibsy id - ANY row, a soft-deleted one included, because finance
 * deleted it on purpose and a re-delivery must not bring it back - and if one exists no second receipt is written:
 * the delivery is acked (after catchUpHubToInvoice, which writes only if the hub is behind the invoice). There is no
 * unique key on `reference`, so two truly concurrent deliveries are held apart by UNIQUE (payment_id) instead: both
 * read the same max + 1, the database refuses one insert (23505), and its retry finds the winner by the reference.
 * Known limit: if an unrelated receipt commits between the two deliveries' numbering reads, AND their duplicate
 * checks both precede both inserts, the numbers differ and both insert; closing that for good needs a unique index on
 * payments(reference), i.e. a migration.
 *
 * Returns a NextResponse when the delivery is finished here (acked without applying, or failed with a 500 for Dibsy
 * to retry), or null when the receipt was recorded - or there is no invoice to record it on - and the caller goes on
 * to settle the hub row.
 */
async function recordSalesCardPayment(
  admin: AdminClient,
  soInvoiceId: string,
  hubId: string,
  hub: HubRow,
  payment: DibsyPayment,
  amount: number,
  dibsyPaymentId: string,
): Promise<NextResponse | null> {
  // The receipt is written as QAR / rate 1; recording another currency's amount as QAR would corrupt the ledger.
  const currency = payment.amount?.currency
  if (currency !== 'QAR') {
    console.error(`[dibsy/webhook] paid payment ${dibsyPaymentId} for sales invoice ${soInvoiceId} (hub ${hubId}) is in ${String(currency)}, not QAR - NOT applied, needs a manual reconcile`)
    return NextResponse.json({ ok: true })
  }

  const { data: invoice, error: invoiceErr } = await admin
    .from('so_invoices')
    .select('customer_id, payment_status, paid_amount')
    .eq('id', soInvoiceId)
    .maybeSingle()
  if (invoiceErr) {
    console.error('[dibsy/webhook] so_invoices fetch failed', invoiceErr)
    return NextResponse.json({ error: 'Invoice fetch failed' }, { status: 500 })
  }
  if (!invoice) {
    console.warn(`[dibsy/webhook] so_invoices ${soInvoiceId} not found - no receipt recorded for payment ${dibsyPaymentId}; settling the hub row only (hub invoice ${hubId})`)
    return null
  }
  // The detail row is the authority on 'void', even when the hub row has not caught up: the ledger recompute
  // would turn a void invoice back into paid / partially_paid.
  if (invoice.payment_status === 'void') {
    console.error(`[dibsy/webhook] sales invoice ${soInvoiceId} is void but paid payment ${dibsyPaymentId} arrived - NOT applied, needs a manual refund / reconcile`)
    return NextResponse.json({ ok: true })
  }

  for (let attempt = 1; attempt <= MAX_CPAY_ATTEMPTS; attempt++) {
    const paymentNo = await nextCpayId(admin)
    if (!paymentNo) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // The duplicate check comes AFTER the numbering read and right before the insert, so the window in which a
    // concurrent delivery of this payment can slip in unseen is a single round trip.
    const { data: recorded, error: recordedErr } = await admin
      .from('payments')
      .select('id')
      .eq('reference', dibsyPaymentId)
      .limit(1)
    if (recordedErr) {
      console.error('[dibsy/webhook] ledger lookup failed', recordedErr)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
    if (recorded && recorded.length > 0) {
      console.log(`[dibsy/webhook] payment ${dibsyPaymentId} is already in the AR ledger - not recorded again (a re-delivery, or a concurrent delivery that got there first)`)
      return catchUpHubToInvoice(admin, hubId, hub, invoice)
    }

    const { error: insertErr } = await admin.from('payments').insert({
      payment_id: paymentNo,
      source_type: 'invoice',
      source_id: soInvoiceId,
      customer_id: invoice.customer_id,
      direction: 'incoming',
      amount,
      amount_qar: amount,
      currency: 'QAR',
      exchange_rate: 1,
      method: SALES_CARD_PAYMENT_METHOD,
      status: 'completed',
      date: qatarToday(),
      reference: dibsyPaymentId,
      notes: 'Card payment received through the Dibsy payment link',
    })
    if (!insertErr) {
      console.log(`[dibsy/webhook] sales invoice ${soInvoiceId} ← ${paymentNo}: ${amount} QAR card receipt recorded in the AR ledger (payment ${dibsyPaymentId})`)
      return null
    }
    if (insertErr.code === '23505' && attempt < MAX_CPAY_ATTEMPTS) {
      console.warn(`[dibsy/webhook] ${paymentNo} was taken by a concurrent writer - retrying with a fresh number (attempt ${attempt} of ${MAX_CPAY_ATTEMPTS})`)
      continue
    }
    console.error('[dibsy/webhook] payments insert failed', insertErr)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }
  // Unreachable: the last attempt always returns above.
  return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
}

/**
 * Settle a hub invoice from a PAID Dibsy payment: record the actual amount on the detail row and the hub.
 *
 * Idempotent - Dibsy can re-deliver, and a 500 makes it do so on purpose:
 *   - Gate: a hub row already 'paid' (or 'void') is acked untouched, with no write at all.
 *   - Every write is ABSOLUTE (paid_amount = what the hub row had + this payment's amount, computed once
 *     from the row read above; never `paid_amount += amount` in SQL) and GUARDED to rows that are not yet
 *     paid / void, so of two concurrent deliveries one updates a row and the other matches zero rows.
 *   - Detail first, hub second: a failure before the detail write leaves everything untouched. On a FULL
 *     settle a failure after it is converged by the retry with no double-count (the sync trigger has already
 *     mirrored the hub, or the gate / the guarded writes finish the job). On a PARTIAL settle the retry is
 *     NOT safe: the redundant hub write re-adds this payment's amount (see the Known limit below). Writing
 *     the hub first would let that retry hit the gate and never reach the detail row - and the next detail
 *     write would then revert the hub.
 *
 * The amount comes from the payment, not the invoice: the link was minted for the remaining balance at the
 * time, but a superseded link stays payable, so what was actually received is what is recorded. Anything
 * short of the total is 'partially_paid'.
 *
 * A sales invoice's "detail write" is its ledger receipt (recordSalesCardPayment), in the same order - detail
 * first, hub second - and the receipt carries the Dibsy id, so for sales a re-delivery IS recognised, after a
 * partial settle too: the receipt is found, nothing is added again, and the hub is only caught up to the invoice
 * if the sync trigger had not already mirrored it (catchUpHubToInvoice).
 *
 * Known limit (every other type): a re-delivery after a PARTIAL settle is not recognised (the row is still
 * open, so the amount would be added again). Telling deliveries apart needs a per-payment ledger / unique
 * key, i.e. a schema change; a hub link covers the full remaining balance, so a partial settle is the
 * abnormal path.
 */
async function settleHubInvoice(hubId: string, payment: DibsyPayment, dibsyPaymentId: string): Promise<NextResponse> {
  const admin = createAdminClient()

  const { data, error: fetchErr } = await looseFrom(admin, 'invoices')
    .select('total_amount, paid_amount, payment_status, detail_table, detail_id')
    .eq('id', hubId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[dibsy/webhook] hub invoice fetch failed', fetchErr)
    return NextResponse.json({ error: 'Invoice fetch failed' }, { status: 500 })
  }
  const hub = data as HubRow | null
  if (!hub) {
    // Retrying cannot create the row; ack so Dibsy stops, and shout so the money is not lost track of.
    console.error(`[dibsy/webhook] hub invoice ${hubId} not found - paid payment ${dibsyPaymentId} NOT applied`)
    return NextResponse.json({ ok: true })
  }

  // Idempotency gate.
  if (hub.payment_status === 'paid') {
    console.log(`[dibsy/webhook] hub invoice ${hubId} already paid - payment ${dibsyPaymentId} not applied (a re-delivery, or a duplicate payment to check)`)
    return NextResponse.json({ ok: true })
  }
  if (hub.payment_status === 'void') {
    console.error(`[dibsy/webhook] hub invoice ${hubId} is void but paid payment ${dibsyPaymentId} arrived - NOT applied, needs a manual refund / reconcile`)
    return NextResponse.json({ ok: true })
  }

  const amount = Number(payment.amount?.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`[dibsy/webhook] paid payment ${dibsyPaymentId} for hub invoice ${hubId} has no usable amount (${String(payment.amount?.value)}) - NOT applied`)
    return NextResponse.json({ ok: true })
  }

  // A sales invoice is settled through the AR ledger instead of by writing its row (see recordSalesCardPayment).
  // That call also recognises a re-delivery, so it runs BEFORE the arithmetic below: a re-delivered part payment
  // must neither be added to the hub again nor re-warned about as an overpayment.
  const { detail_table: detailTable, detail_id: detailId } = hub
  const ledgerInvoiceId = detailTable === SALES_DETAIL_TABLE && detailId ? detailId : null
  if (ledgerInvoiceId) {
    const finished = await recordSalesCardPayment(admin, ledgerInvoiceId, hubId, hub, payment, amount, dibsyPaymentId)
    if (finished) return finished
  }

  const total = round2(Number(hub.total_amount ?? 0))
  const newPaid = round2(Number(hub.paid_amount ?? 0) + amount)
  const paidInFull = newPaid >= total
  const now = new Date().toISOString()
  if (newPaid > total) {
    // Recorded as received (paid_amount > total_amount) rather than hidden; finance has to refund or credit it.
    console.warn(`[dibsy/webhook] hub invoice ${hubId} overpaid by ${round2(newPaid - total)} QAR after payment ${dibsyPaymentId} - needs a refund / credit`)
  }

  // 1. The detail row (canonical) - for a sales invoice that is the ledger receipt recorded above, not a row write.
  const detail =
    detailTable && Object.prototype.hasOwnProperty.call(HUB_DETAIL_TABLES, detailTable)
      ? HUB_DETAIL_TABLES[detailTable]
      : undefined
  if (!ledgerInvoiceId && detailTable && detailId && detail) {
    const patch: Record<string, unknown> = {
      payment_status: paidInFull ? 'paid' : detail.partialStatus,
      paid_amount: newPaid, // not just the status - see the note at the top of this section
    }
    if (detail.hasUpdatedAt) patch.updated_at = now

    const { data: synced, error: detailErr } = await looseFrom(admin, detailTable)
      .update(patch)
      .eq('id', detailId)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'void')
      .select('id')

    if (detailErr) {
      console.error(`[dibsy/webhook] ${detailTable} update failed`, detailErr)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }
    if (!Array.isArray(synced) || synced.length === 0) {
      // Already settled (a concurrent delivery got there first) or the detail row is gone (an orphan hub
      // row). Neither stops the hub being brought up to date below.
      console.warn(`[dibsy/webhook] ${detailTable} ${detailId} not updated (already settled or missing) while settling hub invoice ${hubId}`)
    }
  } else if (!ledgerInvoiceId) {
    console.warn(`[dibsy/webhook] hub invoice ${hubId} has no detail sync for ${String(detailTable)} - settling the hub row only`)
  }

  // 2. The hub row. With the sync trigger installed the detail write above has already mirrored it, so this
  //    is usually a zero-row no-op; it is what settles the hub where the trigger is absent or the row has no
  //    detail, and it is guarded so it can never touch a row that is already settled.
  const { error: hubErr } = await looseFrom(admin, 'invoices')
    .update({
      paid_amount: newPaid,
      payment_status: paidInFull ? 'paid' : 'partially_paid',
      updated_at: now,
    })
    .eq('id', hubId)
    .neq('payment_status', 'paid')
    .neq('payment_status', 'void')

  if (hubErr) {
    console.error('[dibsy/webhook] hub invoice update failed', hubErr)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log(`[dibsy/webhook] hub invoice ${hubId} → ${paidInFull ? 'paid' : 'partially_paid'} (+${amount} QAR, payment ${dibsyPaymentId})`)
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Verify Dibsy webhook signature (HMAC-SHA256 on raw body)
  const signature = request.headers.get('dibsy-signature')
  if (!verifyHmacSignature(rawBody, signature, process.env.DIBSY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let dibsyPaymentId: string | undefined
  try {
    const body = JSON.parse(rawBody)
    dibsyPaymentId = body.id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!dibsyPaymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  let payment
  try {
    payment = await getDibsyPayment(dibsyPaymentId)
  } catch (err) {
    console.error('[dibsy/webhook] failed to fetch payment:', err)
    return NextResponse.json({ error: 'Could not fetch payment' }, { status: 502 })
  }

  const hubInvoiceId             = payment.metadata?.hub_invoice_id
  const subscriptionId           = payment.metadata?.subscription_id
  const tlInvoiceId              = payment.metadata?.tl_invoice_id
  const invoiceId                = payment.metadata?.invoice_id
  const batchId                  = payment.metadata?.batch_id
  const customerBatchInvoiceIds  = payment.metadata?.customer_batch_invoice_ids

  // Handle a unified-hub invoice payment (public.invoices; see settleHubInvoice). First in the router: a
  // hub payment carries no other id key, and it must never fall through to a legacy branch.
  if (hubInvoiceId) {
    if (payment.status === 'paid') {
      return settleHubInvoice(hubInvoiceId, payment, dibsyPaymentId)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle batch payment for regular customer invoices (table: invoices, AR)
  if (customerBatchInvoiceIds) {
    if (payment.status === 'paid') {
      let ids: string[] = []
      try {
        const parsed = JSON.parse(customerBatchInvoiceIds)
        if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === 'string')
      } catch {
        console.error('[dibsy/webhook] customer_batch_invoice_ids parse failed')
        return NextResponse.json({ error: 'Invalid customer batch metadata' }, { status: 400 })
      }
      if (ids.length === 0) {
        return NextResponse.json({ ok: true })
      }

      const adminClient = createAdminClient()

      // Fetch each invoice's total to compute paid_amount = total_amount
      // (the batch link bills the FULL remaining for every invoice in the
      // selection, so on success they all become fully paid).
      const { data: invs, error: fetchErr } = await adminClient
        .from('invoices')
        .select('id, total_amount')
        .in('id', ids)

      if (fetchErr || !invs) {
        console.error('[dibsy/webhook] customer batch fetch failed', fetchErr)
        return NextResponse.json({ error: 'Invoice fetch failed' }, { status: 500 })
      }

      const now = new Date().toISOString()
      let markedCount = 0
      for (const inv of invs) {
        const total = Number(inv.total_amount ?? 0)
        const { data: updated, error } = await adminClient
          .from('invoices')
          .update({
            paid_amount: total,
            payment_status: 'paid',
            manually_paid: true,
            updated_at: now,
          })
          .eq('id', inv.id)
          .neq('payment_status', 'paid')
          .select('id')

        if (error) {
          console.error(`[dibsy/webhook] customer-batch invoice ${inv.id} update failed`, error)
        } else if (updated?.length) {
          markedCount++
        }
      }
      console.log(`[dibsy/webhook] customer batch ${ids.length} invoices → paid (${markedCount} updated, payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle batch payment (multiple TL invoices)
  if (batchId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()

      const { data: items, error: fetchErr } = await adminClient
        .from('tl_payment_batch_items')
        .select('tl_invoice_id')
        .eq('batch_id', batchId)

      if (fetchErr || !items?.length) {
        console.error('[dibsy/webhook] batch items fetch failed', fetchErr)
        return NextResponse.json({ error: 'Batch items not found' }, { status: 500 })
      }

      let markedCount = 0
      for (const item of items) {
        const { data: updated } = await adminClient
          .from('tl_invoices')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', item.tl_invoice_id)
          .eq('payment_status', 'unpaid')
          .select('id')

        if (updated?.length) markedCount++
        else console.warn(`[dibsy/webhook] invoice ${item.tl_invoice_id} skipped (already paid or not found)`)
      }

      await adminClient
        .from('tl_payment_batches')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', batchId)

      console.log(`[dibsy/webhook] batch ${batchId} → paid (${markedCount}/${items.length} invoices, payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle single tl_invoice payment (backward compat)
  if (tlInvoiceId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()
      const { error } = await adminClient
        .from('tl_invoices')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', tlInvoiceId)
        .eq('payment_status', 'unpaid')

      if (error) {
        console.error('[dibsy/webhook] tl_invoices update failed', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.log(`[dibsy/webhook] tl_invoice ${tlInvoiceId} → paid (payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  // Handle regular invoice payment
  if (invoiceId) {
    if (payment.status === 'paid') {
      const adminClient = createAdminClient()
      const { data: inv } = await adminClient
        .from('invoices')
        .select('total_amount, paid_amount')
        .eq('id', invoiceId)
        .maybeSingle()

      if (inv) {
        const paidAmount = Number(payment.amount?.value ?? 0)
        const newPaidAmount = (inv.paid_amount ?? 0) + paidAmount
        const fullyPaid = newPaidAmount >= (inv.total_amount ?? 0)

        const { data: updated, error } = await adminClient
          .from('invoices')
          .update({
            paid_amount: newPaidAmount,
            payment_status: fullyPaid ? 'paid' : 'partially_paid',
            manually_paid: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId)
          // The amount is ADDED to paid_amount above, so a re-delivered webhook must not be applied to an
          // invoice that is already paid (same guard as the customer-batch branch). A re-delivery after a
          // PART payment is still not recognised - that needs a per-payment key, see settleHubInvoice.
          .neq('payment_status', 'paid')
          .select('id')

        if (error) {
          console.error('[dibsy/webhook] invoices update failed', error)
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
        }
        if (updated?.length) {
          console.log(`[dibsy/webhook] invoice ${invoiceId} → paid ${paidAmount} QAR (payment ${dibsyPaymentId})`)
        } else {
          console.log(`[dibsy/webhook] invoice ${invoiceId} already paid - payment ${dibsyPaymentId} not applied again`)
        }
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (!subscriptionId) {
    // Unknown payment type — acknowledge and ignore
    return NextResponse.json({ ok: true })
  }

  const newStatus = dibsyStatusToSubscriptionStatus(payment.status)
  if (!newStatus) {
    // Unknown/transitional status (e.g. "open") — acknowledge without update
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()
  const updatePayload: { status: string; start_date?: string; end_date?: string } = { status: newStatus }

  if (newStatus === 'active') {
    const { data: sub } = await supabase
      .from('customer_subscriptions')
      .select('status, package_id')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (sub && sub.status !== 'active') {
      const { data: pkg } = await supabase
        .from('subscription_packages')
        .select('duration_months')
        .eq('id', sub.package_id)
        .maybeSingle()

      const months = pkg?.duration_months ?? 12
      const startDate = new Date()
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + months)
      updatePayload.start_date = startDate.toISOString().split('T')[0]
      updatePayload.end_date = endDate.toISOString().split('T')[0]
    }
  }

  const { error } = await supabase
    .from('customer_subscriptions')
    .update(updatePayload)
    .eq('id', subscriptionId)

  if (error) {
    console.error('[dibsy/webhook] db update failed', error)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log(`[dibsy/webhook] subscription ${subscriptionId} → ${newStatus} (payment ${dibsyPaymentId})`)
  return NextResponse.json({ ok: true })
}
