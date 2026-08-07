'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, AlertCircle, CheckCircle2, Circle, CircleDashed } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import type { PaymentPlan, PaymentInstallment } from '@/types/invoice'

interface Props {
  plans:    PaymentPlan[]
  currency: string
  canSettle?: boolean
  soId?:    string | null
}

function StatusIcon({ status }: { status: PaymentInstallment['status'] }) {
  const cn = 'h-4 w-4 shrink-0'
  if (status === 'paid')    return <CheckCircle2 className={cn + ' text-success'} />
  if (status === 'partial') return <CircleDashed className={cn + ' text-amber-500'} />
  if (status === 'overdue') return <AlertCircle  className={cn + ' text-destructive'} />
  return <Circle className={cn + ' text-muted-foreground'} />
}

function statusLabel(status: PaymentInstallment['status'], dueDate: string | null): string {
  if (status === 'paid')    return 'Paid'
  if (status === 'partial') return 'Partial'
  if (status === 'overdue') return 'Overdue'
  if (dueDate) {
    const days = Math.floor((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
    if (days < 0)   return 'Overdue'
    if (days === 0) return 'Due today'
    if (days <= 7)  return `Due in ${days}d`
  }
  return 'Pending'
}

export function PaymentPlanSection({ plans, currency, canSettle = true, soId }: Props) {
  const activePlans = plans.filter((p) => p.status === 'active')
  const [settleTarget, setSettleTarget] = useState<PaymentInstallment | null>(null)

  if (activePlans.length === 0 && plans.length === 0) return null

  return (
    <div className="space-y-4">
      {activePlans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          currency={currency}
          canSettle={canSettle}
          onSettle={setSettleTarget}
        />
      ))}
      {plans.filter((p) => p.status !== 'active').map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          currency={currency}
          canSettle={false}
          onSettle={setSettleTarget}
        />
      ))}

      <SettleInstallmentDialog
        installment={settleTarget}
        currency={currency}
        soId={soId}
        onClose={() => setSettleTarget(null)}
      />
    </div>
  )
}

function PlanCard({
  plan, currency, canSettle, onSettle,
}: {
  plan: PaymentPlan
  currency: string
  canSettle: boolean
  onSettle: (inst: PaymentInstallment) => void
}) {
  const installments = useMemo(
    () => (plan.payment_installments ?? [])
      .slice()
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [plan.payment_installments],
  )

  const paidTotal = installments.reduce((s, i) => s + Number(i.paid_amount ?? 0), 0)
  const nextDue = installments.find((i) => i.status !== 'paid')
  const paidCount = installments.filter((i) => i.status === 'paid').length

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">
            Payment Plan
            <span className="text-muted-foreground font-normal ml-2 text-xs uppercase tracking-wide">
              {plan.plan_type === 'schedule' ? 'Scheduled' : 'Ad-hoc'}
            </span>
          </span>
          <span className={
            'text-[10px] px-2 py-0.5 rounded font-medium uppercase ' +
            (plan.status === 'completed' ? 'bg-success/10 text-success'
              : plan.status === 'cancelled' ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary')
          }>
            {plan.status}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {paidCount}/{installments.length} paid
        </div>
      </div>

      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Paid <span className="font-mono tabular-nums text-foreground">{formatCurrency(paidTotal, currency)}</span>
          {' / '}
          <span className="font-mono tabular-nums">{formatCurrency(plan.total_amount, currency)}</span>
        </span>
        {nextDue && (
          <span className="text-muted-foreground">
            Next:{' '}
            <span className="text-foreground">
              {nextDue.due_date ? formatDate(nextDue.due_date) : 'no date'}
              {' · '}
              {formatCurrency(nextDue.amount - Number(nextDue.paid_amount ?? 0), currency)}
            </span>
          </span>
        )}
      </div>

      <ul className="divide-y">
        {installments.map((inst, idx) => {
          const remaining = Number(inst.amount) - Number(inst.paid_amount ?? 0)
          const label = statusLabel(inst.status, inst.due_date)
          return (
            <li key={inst.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
              <StatusIcon status={inst.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="tabular-nums">
                    {inst.due_date ? formatDate(inst.due_date) : <span className="text-muted-foreground italic">No due date</span>}
                  </span>
                  <span className={
                    'text-[10px] px-1.5 py-0.5 rounded font-medium ' +
                    (inst.status === 'paid'    ? 'bg-success/10 text-success'
                      : inst.status === 'partial' ? 'bg-amber-100 text-amber-700'
                      : inst.status === 'overdue' ? 'bg-destructive/10 text-destructive'
                      : label === 'Due today' || label.startsWith('Due in') ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground')
                  }>
                    {label}
                  </span>
                </div>
                {Number(inst.paid_amount ?? 0) > 0 && inst.status !== 'paid' && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Paid {formatCurrency(inst.paid_amount, currency)} of {formatCurrency(inst.amount, currency)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono tabular-nums text-sm">
                  {formatCurrency(inst.amount, currency)}
                </div>
                {inst.status !== 'paid' && remaining > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {formatCurrency(remaining, currency)} left
                  </div>
                )}
              </div>
              {canSettle && inst.status !== 'paid' && plan.status === 'active' && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSettle(inst)}>
                  Settle
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SettleInstallmentDialog({
  installment, currency, soId, onClose,
}: {
  installment: PaymentInstallment | null
  currency:    string
  soId?:       string | null
  onClose:     () => void
}) {
  const qc = useQueryClient()
  const { data: dbMethods = [] } = usePaymentMethods()
  const cashMethods = dbMethods.filter((m) => m.slug !== 'credit_note' && m.slug !== 'debit_note')
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod]       = useState('cash')
  const [dateStr, setDateStr]     = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const remaining = installment ? Number(installment.amount) - Number(installment.paid_amount ?? 0) : 0

  // Reset when a new installment is picked
  useMemo(() => {
    if (installment) {
      setAmountStr(String(remaining.toFixed(2)))
      setMethod('cash')
      setDateStr(new Date().toISOString().split('T')[0])
      setReference('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installment?.id])

  const parsedAmount = Number(amountStr)
  const overCap = Number.isFinite(parsedAmount) && parsedAmount > remaining
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && !overCap

  async function handleSubmit() {
    if (!installment || !validAmount) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: rpcErr } = await supabase.rpc('rpc_settle_installment', {
        p_installment_id: installment.id,
        p_amount_paid:    parsedAmount,
        p_method:         method,
        p_date:           dateStr,
        p_reference:      reference || undefined,
        p_currency:       currency,
      })
      if (rpcErr) {
        throw new Error(
          `Settle failed: ${rpcErr.code} ${rpcErr.message}` +
          `${rpcErr.details ? ' — ' + rpcErr.details : ''}`,
        )
      }
      toast.success(`Installment settled — ${formatCurrency(parsedAmount, currency)}`)
      if (soId) {
        void logActivity({
          action:    'Installment Settled',
          module:    'sale_orders',
          entity_id: soId,
          details:   `${formatCurrency(parsedAmount, currency)} via ${method}`,
        })
      }
      qc.invalidateQueries({ queryKey: queryKeys.payments.all })
      qc.invalidateQueries({ queryKey: ['so-payments'] })
      qc.invalidateQueries({ queryKey: ['payment-plans'] })
      qc.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      qc.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to settle installment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!installment} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settle Installment</DialogTitle>
          <DialogDescription>
            {installment?.due_date && <>Due {formatDate(installment.due_date)}. </>}
            Remaining: <span className="font-mono tabular-nums font-semibold text-foreground">{formatCurrency(remaining, currency)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount</label>
            <Input
              type="number" min={0.01} max={remaining} step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className={overCap ? 'border-destructive focus-visible:ring-destructive' : undefined}
            />
            {overCap && (
              <p className="text-xs text-destructive">
                Exceeds remaining {formatCurrency(remaining, currency)}. Lower the amount.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Method</label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashMethods.map((m) => (
                    <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Reference <span className="text-muted-foreground text-xs">(optional)</span></label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / cheque #" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!validAmount || submitting}>
            {submitting ? 'Settling…' : 'Settle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
