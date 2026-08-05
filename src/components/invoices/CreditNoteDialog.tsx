'use client'

import { useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import {
  AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { GuardedAlertDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useReasonLists } from '@/hooks/useReasonLists'
import { useIssueCreditNote } from '@/hooks/useInvoices'
import type { FinanceInvoice } from '@/hooks/useInvoices'
import { formatCurrency } from '@/lib/utils/formatters'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: FinanceInvoice | null
}

export function CreditNoteDialog({ open, onOpenChange, invoice }: Props) {
  const [type, setType] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const { reasons, isLoading: loadingReasons } = useReasonLists('refund')
  const creditMutation = useIssueCreditNote()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const total = invoice?.total_amount ?? 0
  const parsedAmount = parseFloat(amount) || 0
  const isValid = reason && (type === 'full' || (parsedAmount > 0 && parsedAmount <= total))

  // Full-refund is the seeded default; any change from ('full', '', '')
  // means the operator engaged with the form.
  const isDirty = type !== 'full' || amount !== '' || reason !== ''

  const handleSubmit = async () => {
    if (!invoice || !isValid) return
    try {
      await creditMutation.mutateAsync({
        invoiceId: invoice.id,
        invoiceDisplay: invoice.invoice_id,
        customerName: invoice.customer_name ?? 'Unknown',
        type,
        amount: type === 'full' ? total : parsedAmount,
        reason,
        lineItems: invoice.invoice_line_items ?? [],
      })
      toast.success('Credit note issued')
      setType('full')
      setAmount('')
      setReason('')
      guardRef.current?.closeAfterSubmit()
    } catch {
      toast.error('Failed to issue credit note')
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) { setType('full'); setAmount(''); setReason('') }
    onOpenChange(next)
  }

  return (
    <GuardedAlertDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> Issue Credit Note
          </AlertDialogTitle>
          <AlertDialogDescription>
            Against {invoice?.invoice_id} ({formatCurrency(total, invoice?.currency ?? 'QAR')}) for {invoice?.customer_name ?? 'Unknown'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button type="button" variant={type === 'full' ? 'default' : 'outline'} size="sm" onClick={() => setType('full')}>Full Refund</Button>
              <Button type="button" variant={type === 'partial' ? 'default' : 'outline'} size="sm" onClick={() => setType('partial')}>Partial Refund</Button>
            </div>
          </div>
          {type === 'partial' && (
            <div className="space-y-2">
              <Label htmlFor="cn-amount">Amount (max {formatCurrency(total, invoice?.currency ?? 'QAR')})</Label>
              <Input id="cn-amount" type="number" min={0.01} max={total} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="cn-reason">Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? '')} disabled={loadingReasons}>
              <SelectTrigger id="cn-reason"><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {reasons.map((r) => (<SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={creditMutation.isPending}>
            Cancel
          </Button>
          <Button disabled={!isValid || creditMutation.isPending} onClick={handleSubmit}>
            {creditMutation.isPending ? 'Issuing...' : 'Issue Credit Note'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </GuardedAlertDialog>
  )
}
