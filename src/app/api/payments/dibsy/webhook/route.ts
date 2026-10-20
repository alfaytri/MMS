import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDibsyPayment, dibsyStatusToSubscriptionStatus, type DibsyPayment } from '@/lib/dibsy'
import { verifyHmacSignature } from '@/lib/webhooks/verify'
import { HUB_DETAIL_TABLES } from '@/lib/invoices/registry'

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
function looseFrom(admin: ReturnType<typeof createAdminClient>, table: string): LooseQuery {
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
// TODO (so_invoices): full AR-ledger reconciliation when so_invoices hub-dispatch is enabled. so_invoices.paid_amount
// is DERIVED from the payments ledger (invoice_recompute_paid_fn), and this direct write is not a payments row,
// so the next payment event on that invoice recomputes it without this card payment. The ledger path - a
// payments row (CPAY- id, method / method_id, customer) attached via attach_payment_to_invoice - needs
// values this webhook has no source for, so it is not guessed at here. Sales invoices are not dispatched
// in v1 (the cron selects only the registry's dispatchable types, which leave so_invoices out), so the
// so_invoices settle entry is defensive.

/** Round to the fils, as dispatch does, so float noise (0.1 + 0.2) can never leave an invoice a fil short. */
const round2 = (n: number) => Math.round(n * 100) / 100

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
 * Known limit: a re-delivery after a PARTIAL settle is not recognised (the row is still open, so the
 * amount would be added again). Telling deliveries apart needs a per-payment ledger / unique key, i.e. a
 * schema change; a hub link covers the full remaining balance, so a partial settle is the abnormal path.
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

  const total = round2(Number(hub.total_amount ?? 0))
  const newPaid = round2(Number(hub.paid_amount ?? 0) + amount)
  const paidInFull = newPaid >= total
  const now = new Date().toISOString()
  if (newPaid > total) {
    // Recorded as received (paid_amount > total_amount) rather than hidden; finance has to refund or credit it.
    console.warn(`[dibsy/webhook] hub invoice ${hubId} overpaid by ${round2(newPaid - total)} QAR after payment ${dibsyPaymentId} - needs a refund / credit`)
  }

  // 1. The detail row (canonical).
  const { detail_table: detailTable, detail_id: detailId } = hub
  const detail =
    detailTable && Object.prototype.hasOwnProperty.call(HUB_DETAIL_TABLES, detailTable)
      ? HUB_DETAIL_TABLES[detailTable]
      : undefined
  if (detailTable && detailId && detail) {
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
  } else {
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
