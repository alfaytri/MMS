'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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

  // Reset dialog state on open so a stale prior session doesn't linger.
  useEffect(() => {
    if (open) {
      setPlanType('schedule')
      setInstallments([{ due_date: '', amount: initialAmount }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outstanding])

  const totalDefined = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const balanceOk    = Math.abs(totalDefined - outstanding) < 0.01

  // Dirty when the operator switches plan type, adds/removes rows, or
  // edits any due date / amount away from the initial single-row default.
  const isDirty =
    planType !== 'schedule' ||
    installments.length !== 1 ||
    installments[0]?.due_date !== '' ||
    installments[0]?.amount !== initialAmount

  const update = (idx: number, patch: Partial<InstallmentDraft>) => {
    setInstallments((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const submit = async () => {
    if (planType === 'schedule' && !balanceOk) {
      toast.error(
        `Installment total (${formatCurrency(totalDefined, cur)}) must equal outstanding (${formatCurrency(outstanding, cur)})`
      )
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
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up Payment Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {labels.partyLabel} — {labels.amountLabel} outstanding:{' '}
            <span className="font-semibold text-foreground">{formatCurrency(outstanding, cur)}</span>
          </p>
          <div className="flex gap-2">
            {(['schedule', 'adhoc'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPlanType(t)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  planType === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {t === 'schedule' ? 'Schedule (with due dates)' : 'Ad-hoc (no due dates)'}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Installments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setInstallments((prev) => [...prev, { due_date: '', amount: '' }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {installments.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                {planType === 'schedule' && (
                  <Input
                    type="date"
                    className="flex-1"
                    value={inst.due_date}
                    onChange={(e) => update(idx, { due_date: e.target.value })}
                  />
                )}
                <Input
                  type="number"
                  className="flex-1"
                  placeholder="Amount"
                  value={inst.amount}
                  step="0.01"
                  min={0}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                />
                {installments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {planType === 'schedule' && (
              <p className={`text-xs ${balanceOk ? 'text-success' : 'text-amber-600'}`}>
                Total defined: {formatCurrency(totalDefined, cur)} /{' '}
                {formatCurrency(outstanding, cur)} outstanding
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || (planType === 'schedule' && !balanceOk)}
          >
            {saving ? 'Saving…' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
