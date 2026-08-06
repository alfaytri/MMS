// src/components/sales/CustomerPaymentDialog.tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaymentConfirmationDialog } from '@/components/shared/PaymentConfirmationDialog'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateCustomerPayment, useApplyStoreCredit } from '@/hooks/useCustomerPayments'
import { useOpenCreditNotesForCustomer } from '@/hooks/useOpenCreditNotes'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatCurrency } from '@/lib/utils/formatters'
import type { ArInvoice, PaymentPlan } from '@/types/invoice'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: ArInvoice
  alreadyPaid: number
  plans: PaymentPlan[]
}

export function CustomerPaymentDialog({ open, onOpenChange, invoice, alreadyPaid, plans }: Props) {
  const createPayment = useCreateCustomerPayment()
  const applyStoreCredit = useApplyStoreCredit()
  const { data: dbMethods = [] } = usePaymentMethods()
  const outstanding = (invoice.total_amount ?? 0) - alreadyPaid
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const invoiceCurrency = invoice.currency ?? 'QAR'
  const { data: openCNs = [] } = useOpenCreditNotesForCustomer(open ? invoice.customer_id : null)
  const availableCredit = useMemo(
    () => openCNs.filter((n) => n.currency === invoiceCurrency).reduce((s, n) => s + n.amount, 0),
    [openCNs, invoiceCurrency],
  )
  const availableCreditForThisInvoice = Math.min(availableCredit, outstanding)

  const [useCredit, setUseCredit] = useState(false)
  const [creditAmount, setCreditAmount] = useState('0')

  const initialAmount = String(outstanding > 0 ? outstanding.toFixed(2) : '')
  const [amount, setAmount] = useState(initialAmount)
  const [method, setMethod] = useState<string>('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)

  const creditPortion = useCredit ? Math.max(0, Math.min(Number(creditAmount) || 0, availableCreditForThisInvoice)) : 0
  const cashPortion   = Math.max(0, Number(amount) || 0)
  const total         = creditPortion + cashPortion
  const canPay        = total > 0 && total <= outstanding && !!date && (cashPortion === 0 || (cashPortion > 0 && !!method))

  // Dirty when the operator actively picked something. Amount is pre-filled
  // to the outstanding balance, so a match to initialAmount is NOT dirty.
  const isDirty =
    useCredit ||
    method !== '' ||
    reference.trim() !== '' ||
    amount !== initialAmount

  const methodLabel = (slug: string) =>
    dbMethods.find((m) => m.slug === slug)?.name ?? slug

  function toggleCredit(next: boolean) {
    setUseCredit(next)
    if (next) {
      setCreditAmount(availableCreditForThisInvoice.toFixed(2))
      setAmount(Math.max(0, outstanding - availableCreditForThisInvoice).toFixed(2))
    } else {
      setCreditAmount('0')
      setAmount(outstanding.toFixed(2))
    }
  }

  function onCreditAmountChange(v: string) {
    setCreditAmount(v)
    const cn = Math.min(Math.max(0, Number(v) || 0), availableCreditForThisInvoice)
    setAmount(Math.max(0, outstanding - cn).toFixed(2))
  }

  const handleRecordClick = () => {
    if (!canPay) return
    setConfirmOpen(true)
  }

  const submit = async () => {
    setSaving(true)
    try {
      if (creditPortion > 0) {
        const eligible = openCNs.filter((n) => n.currency === invoiceCurrency)
        const redemptions: { credit_note_id: string; amount: number }[] = []
        let remaining = creditPortion
        for (const cn of eligible) {
          if (remaining <= 0) break
          const take = Math.min(cn.amount, remaining)
          redemptions.push({ credit_note_id: cn.id, amount: take })
          remaining -= take
        }
        await applyStoreCredit.mutateAsync({
          invoice_id:  invoice.id,
          customer_id: invoice.customer_id,
          redemptions,
          date,
          reference: reference || null,
          notes: 'Store-credit redemption',
        })
      }

      if (cashPortion > 0) {
        await createPayment.mutateAsync({
          invoice_id:  invoice.id,
          customer_id: invoice.customer_id,
          amount:      cashPortion,
          method,
          date,
          reference: reference || null,
          notes:     null,
        })
      }

      toast.success(
        creditPortion > 0 && cashPortion > 0
          ? `Applied ${formatCurrency(creditPortion, invoiceCurrency)} store credit + ${formatCurrency(cashPortion, invoiceCurrency)} ${methodLabel(method)}`
          : creditPortion > 0
            ? `Redeemed ${formatCurrency(creditPortion, invoiceCurrency)} in store credit`
            : 'Payment recorded'
      )
      setConfirmOpen(false)
      guardRef.current?.closeAfterSubmit()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment — {invoice.invoice_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{formatCurrency(invoice.total_amount ?? 0, invoiceCurrency)}</span></div>
            <div><span className="text-muted-foreground">Paid:</span> <span className="font-medium text-green-700">{formatCurrency(alreadyPaid, invoiceCurrency)}</span></div>
            <div className="col-span-2 font-semibold">Outstanding: {formatCurrency(outstanding, invoiceCurrency)}</div>
          </div>

          {plans.length > 0 && (
            <div className="text-xs bg-blue-50 rounded p-2 text-blue-700">
              Active payment plan — recording a direct payment will reduce the outstanding balance independently of the plan installments.
            </div>
          )}

          {availableCredit > 0 && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={useCredit}
                  onChange={(e) => toggleCredit(e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <Wallet className="h-3.5 w-3.5" />
                    Apply store credit — {formatCurrency(availableCredit, invoiceCurrency)} available
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {availableCredit > outstanding
                      ? `Only ${formatCurrency(outstanding, invoiceCurrency)} needed for this invoice — the rest stays on the customer's balance.`
                      : `Covers ${formatCurrency(availableCredit, invoiceCurrency)} of this invoice; the remainder needs a real payment method.`}
                  </p>
                </div>
              </label>
              {useCredit && (
                <div className="pl-6">
                  <Label htmlFor="cust-pay-credit" className="text-[11px] text-emerald-700 dark:text-emerald-400">Credit to apply</Label>
                  <Input
                    id="cust-pay-credit"
                    type="number"
                    value={creditAmount}
                    onChange={(e) => onCreditAmountChange(e.target.value)}
                    step="0.01"
                    min={0}
                    max={availableCreditForThisInvoice}
                    className="h-9 mt-1"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="cust-pay-amount">
              {creditPortion > 0 ? 'Remaining amount (other method)' : 'Amount *'}
            </Label>
            <Input id="cust-pay-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min={0} max={outstanding} />
          </div>
          {cashPortion > 0 && (
            <div className="space-y-1">
              <Label htmlFor="cust-pay-method">Method *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? '')}>
                <SelectTrigger id="cust-pay-method"><SelectValue placeholder="Select method…" /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {dbMethods
                    .filter((m) => m.slug !== 'credit_note' && m.slug !== 'debit_note')
                    .map((m) => (
                      <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cust-pay-date">Date *</Label>
              <Input id="cust-pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cust-pay-reference">Reference</Label>
              <Input id="cust-pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref #" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button onClick={handleRecordClick} disabled={saving || !canPay}>
            Record Payment
          </Button>
        </DialogFooter>

        <PaymentConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={submit}
          isPending={saving}
          title={`Confirm Payment — ${invoice.invoice_id}`}
          details={[
            ...(creditPortion > 0
              ? [{ label: 'Store Credit', value: formatCurrency(creditPortion, invoiceCurrency) }]
              : []),
            ...(cashPortion > 0
              ? [
                  { label: 'Payment', value: `${formatCurrency(cashPortion, invoiceCurrency)} — ${methodLabel(method)}` },
                ]
              : []),
            { label: 'Total', value: formatCurrency(total, invoiceCurrency) },
            { label: 'Date',  value: date },
            ...(reference ? [{ label: 'Reference', value: reference }] : []),
          ]}
        />
      </DialogContent>
    </GuardedDialog>
  )
}
