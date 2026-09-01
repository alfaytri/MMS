'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, CalendarClock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreatePaymentPlan } from '@/hooks/usePaymentPlans'
import { formatCurrency } from '@/lib/utils/formatters'

export interface PaymentPlanLabels {
  partyLabel:  string
  amountLabel: string
}

const AP_LABELS: PaymentPlanLabels = { partyLabel: 'Vendor',   amountLabel: 'Payable Amount'    }
const AR_LABELS: PaymentPlanLabels = { partyLabel: 'Customer', amountLabel: 'Receivable Amount' }

export { AP_LABELS, AR_LABELS }

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoiceId: string
  outstanding: number
  currency?: string | null
  labels?: PaymentPlanLabels
}

type InstallmentDraft = { due_date: string; amount: string }

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function PaymentPlanDialog({
  open,
  onOpenChange,
  invoiceId,
  outstanding,
  currency,
  labels = AP_LABELS,
}: Props) {
  const cur = currency ?? 'QAR'
  const createPlan = useCreatePaymentPlan()
  const initialAmount = String(outstanding.toFixed(2))
  const [planType, setPlanType]         = useState<'schedule' | 'adhoc'>('schedule')
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    { due_date: '', amount: initialAmount },
  ])
  const [saving, setSaving] = useState(false)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) {
      setPlanType('schedule')
      setInstallments([{ due_date: '', amount: initialAmount }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outstanding])

  const totalDefined = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const balanceOk    = Math.abs(totalDefined - outstanding) < 0.01
  const balanceDelta = totalDefined - outstanding

  const isDirty =
    planType !== 'schedule' ||
    installments.length !== 1 ||
    installments[0]?.due_date !== '' ||
    installments[0]?.amount !== initialAmount

  const update = (idx: number, patch: Partial<InstallmentDraft>) => {
    setInstallments((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  // Split evenly across the current row count with 30-day intervals.
  const splitEvenly = () => {
    const n = Math.max(1, installments.length)
    const per = outstanding / n
    const rows: InstallmentDraft[] = []
    for (let i = 0; i < n; i++) {
      // Rounded to 2dp; last row absorbs the residue so total matches exactly.
      const amount = i === n - 1
        ? outstanding - Number((per.toFixed(2))) * (n - 1)
        : Number(per.toFixed(2))
      rows.push({
        due_date: planType === 'schedule' ? todayPlus(30 * (i + 1)) : '',
        amount:   amount.toFixed(2),
      })
    }
    setInstallments(rows)
  }

  const submit = async () => {
    if (planType === 'schedule' && !balanceOk) {
      toast.error(
        `Installment total (${formatCurrency(totalDefined, cur)}) must equal outstanding (${formatCurrency(outstanding, cur)})`
      )
      return
    }
    if (planType === 'schedule' && installments.some((i) => !i.due_date)) {
      toast.error('Every installment needs a due date. Use "Split evenly" or set them manually.')
      return
    }
    setSaving(true)
    try {
      await createPlan.mutateAsync({
        invoice_id:   invoiceId,
        plan_type:    planType,
        total_amount: outstanding,
        installments: installments.map((i) => ({
          due_date: planType === 'schedule' ? i.due_date : null,
          amount:   Number(i.amount),
        })),
      })
      toast.success('Payment plan created')
      guardRef.current?.closeAfterSubmit()
    } catch (err: unknown) {
      toast.error(humanizeDbError(err))
    } finally {
      setSaving(false)
    }
  }

  const balanceCopy = useMemo(() => {
    if (planType === 'adhoc') return 'Ad-hoc plans have no per-installment total.'
    if (balanceOk) return `Balanced — total matches outstanding.`
    if (balanceDelta > 0) return `Over by ${formatCurrency(balanceDelta, cur)}`
    return `Short by ${formatCurrency(-balanceDelta, cur)}`
  }, [planType, balanceOk, balanceDelta, cur])

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="max-w-xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Set Up Payment Plan
          </DialogTitle>
          <DialogDescription className="pt-1">
            {labels.partyLabel} — {labels.amountLabel} outstanding:{' '}
            <span className="font-semibold text-foreground tabular-nums">{formatCurrency(outstanding, cur)}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body — content grows without changing dialog height */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Plan type toggle */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Plan type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['schedule', 'adhoc'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPlanType(t)}
                  className={
                    'rounded-md border p-3 text-left transition-colors ' +
                    (planType === t
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/60')
                  }
                >
                  <div className="text-sm font-medium">
                    {t === 'schedule' ? 'Scheduled' : 'Ad-hoc'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {t === 'schedule' ? 'Fixed due dates, must sum to outstanding' : 'No due dates, no total required'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Installments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Installments</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={splitEvenly}
                  className="h-7 text-xs"
                >
                  <Sparkles className="w-3 h-3 mr-1" /> Split evenly
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInstallments((prev) => [...prev, { due_date: '', amount: '' }])}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {installments.map((inst, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[auto_1fr_minmax(140px,180px)_auto] items-center gap-2 rounded-md border p-2 bg-card"
                >
                  <span className="text-xs font-mono text-muted-foreground w-6 text-center">
                    #{idx + 1}
                  </span>
                  {planType === 'schedule' ? (
                    <Input
                      type="date"
                      value={inst.due_date}
                      onChange={(e) => update(idx, { due_date: e.target.value })}
                      className="h-9"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No due date</span>
                  )}
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={inst.amount}
                    step="0.01"
                    min={0}
                    onChange={(e) => update(idx, { amount: e.target.value })}
                    className="h-9 tabular-nums text-right"
                  />
                  {installments.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : (
                    <div className="w-9" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer — sticky summary + actions */}
        <div className="border-t px-6 py-3 space-y-2">
          {planType === 'schedule' && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total defined</span>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">{formatCurrency(totalDefined, cur)}</span>
                <span
                  className={
                    'text-xs font-medium ' +
                    (balanceOk ? 'text-success' : balanceDelta > 0 ? 'text-destructive' : 'text-amber-600')
                  }
                >
                  {balanceCopy}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving || (planType === 'schedule' && !balanceOk)}
            >
              {saving ? 'Saving…' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </GuardedDialog>
  )
}
