// Daily scheduled notifications (2026-08-26 expansion).
// Called by an external scheduler (Vercel Cron / cron-job.org) with the shared
// secret header `x-cron-secret: <CRON_SECRET>`. Runs the time-based checks that
// have no natural event to hang off (overdue invoices now; installment/bill due
// and tool checks in later phases). Uses the service-role client (bypasses RLS);
// each check is independent and best-effort, and inserts a notification only
// when no OPEN one of the same type already exists for that record (no dupes on
// repeat runs).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NOTIFICATION_RECIPIENTS } from '@/lib/notification-routes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Admin = ReturnType<typeof createAdminClient>

/** Union of the type's permission-holders and its notify.* key-holders. */
async function resolveRecipients(supabase: Admin, type: string): Promise<string[]> {
  const meta = NOTIFICATION_RECIPIENTS[type]
  if (!meta) return []
  const ids = new Set<string>()
  for (const perm of [meta.permission, meta.notifyKey].filter(Boolean) as string[]) {
    const { data } = await supabase.rpc('recipients_for_permission', { p_perm: perm })
    for (const id of (data ?? []) as string[]) ids.add(id)
  }
  return [...ids]
}

/** Records to notify about, filtered to those without an already-open notification. */
async function freshTargets(
  supabase: Admin,
  type: string,
  candidateIds: string[],
): Promise<Set<string>> {
  const fresh = new Set(candidateIds)
  if (candidateIds.length === 0) return fresh
  const { data } = await supabase
    .from('notifications')
    .select('related_id')
    .eq('type', type)
    .is('actioned_at', null)
    .in('related_id', candidateIds)
  for (const row of (data ?? []) as { related_id: string | null }[]) {
    if (row.related_id) fresh.delete(row.related_id)
  }
  return fresh
}

/** Customer invoices past their due date and not fully paid. → finance. */
async function runInvoiceOverdue(supabase: Admin): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: invoices } = await supabase
    .from('so_invoices')
    .select('id, invoice_id, due_date, total_amount, paid_amount')
    .lt('due_date', today)
    .neq('payment_status', 'paid')
    .not('status', 'in', '(cancelled,void)')
    .limit(500)
  if (!invoices?.length) return 0

  const fresh = await freshTargets(supabase, 'invoice_overdue', invoices.map((i) => i.id))
  const targets = invoices.filter((i) => fresh.has(i.id))
  if (!targets.length) return 0

  const recipients = await resolveRecipients(supabase, 'invoice_overdue')
  if (!recipients.length) return 0

  const rows = targets.flatMap((inv) => {
    const outstanding = Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0)
    return recipients.map((profile_id) => ({
      profile_id,
      type: 'invoice_overdue',
      title: `Invoice ${inv.invoice_id} is overdue`,
      body: `Was due ${inv.due_date}. Outstanding: ${outstanding.toLocaleString()}.`,
      related_id: inv.id,
      related_type: 'invoice',
    }))
  })
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw new Error(error.message)
  return targets.length
}

/** Payment-plan installments due within 3 days and not fully paid. → finance. */
async function runInstallmentDue(supabase: Admin): Promise<number> {
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('payment_installments')
    .select('id, due_date, amount, paid_amount')
    .lte('due_date', soon)
    .limit(1000)
  const due = (data ?? []).filter((i) => Number(i.paid_amount ?? 0) < Number(i.amount ?? 0))
  if (!due.length) return 0

  const fresh = await freshTargets(supabase, 'installment_due', due.map((i) => i.id))
  const targets = due.filter((i) => fresh.has(i.id))
  if (!targets.length) return 0

  const recipients = await resolveRecipients(supabase, 'installment_due')
  if (!recipients.length) return 0

  const rows = targets.flatMap((inst) =>
    recipients.map((profile_id) => ({
      profile_id,
      type: 'installment_due',
      title: 'A payment installment is due',
      body: `Due ${inst.due_date}. Amount: ${Number(inst.amount ?? 0).toLocaleString()}.`,
      related_id: inst.id,
      related_type: 'installment',
    })),
  )
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw new Error(error.message)
  return targets.length
}

/** Supplier bills due within 3 days and not fully paid. → finance (AP). */
async function runSupplierBillDue(supabase: Admin): Promise<number> {
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, due_date, total_amount, paid_amount')
    .lte('due_date', soon)
    .neq('payment_status', 'paid')
    .limit(500)
  if (!bills?.length) return 0

  const fresh = await freshTargets(supabase, 'supplier_bill_due', bills.map((b) => b.id))
  const targets = bills.filter((b) => fresh.has(b.id))
  if (!targets.length) return 0

  const recipients = await resolveRecipients(supabase, 'supplier_bill_due')
  if (!recipients.length) return 0

  const rows = targets.flatMap((bill) => {
    const outstanding = Number(bill.total_amount ?? 0) - Number(bill.paid_amount ?? 0)
    return recipients.map((profile_id) => ({
      profile_id,
      type: 'supplier_bill_due',
      title: `Supplier bill ${bill.bill_number} is due`,
      body: `Due ${bill.due_date}. Outstanding: ${outstanding.toLocaleString()}.`,
      related_id: bill.id,
      related_type: 'bill',
    }))
  })
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw new Error(error.message)
  return targets.length
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results: Record<string, number | string> = {}

  // Each check is isolated so one failure never blocks the others.
  try {
    results.invoice_overdue = await runInvoiceOverdue(supabase)
  } catch (e) {
    results.invoice_overdue = `error: ${(e as Error).message}`
  }
  try {
    results.installment_due = await runInstallmentDue(supabase)
  } catch (e) {
    results.installment_due = `error: ${(e as Error).message}`
  }
  try {
    results.supplier_bill_due = await runSupplierBillDue(supabase)
  } catch (e) {
    results.supplier_bill_due = `error: ${(e as Error).message}`
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results })
}
