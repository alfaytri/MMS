// src/components/sales/CustomerPaymentDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateCustomerPayment } from '@/hooks/useCustomerPayments'
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
  const outstanding = (invoice.total_amount ?? 0) - alreadyPaid

  const [amount, setAmount] = useState(String(outstanding > 0 ? outstanding.toFixed(2) : ''))
  const [method, setMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'online_transfer' | 'pos'>('bank_transfer')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const canPay = amountNum > 0 && amountNum <= outstanding && !!date

  const submit = async () => {
    setSaving(true)
    try {
      await createPayment.mutateAsync({
        invoice_id:  invoice.id,
        customer_id: invoice.customer_id,
        amount:      amountNum,
        method,
        date,
        reference: reference || null,
        notes:     null,
      })
      toast.success('Payment recorded')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment — {invoice.invoice_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span></div>
            <div><span className="text-muted-foreground">Paid:</span> <span className="font-medium text-green-700">{formatCurrency(alreadyPaid, 'QAR')}</span></div>
            <div className="col-span-2 font-semibold">Outstanding: {formatCurrency(outstanding, 'QAR')}</div>
          </div>

          {plans.length > 0 && (
            <div className="text-xs bg-blue-50 rounded p-2 text-blue-700">
              Active payment plan — recording a direct payment will reduce the outstanding balance independently of the plan installments.
            </div>
          )}

          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min={0.01} max={outstanding} />
          </div>
          <div className="space-y-1">
            <Label>Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_transfer">Online Transfer</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref #" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canPay}>
            {saving ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
