'use client'

import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

  const total = invoice?.total_amount ?? 0
  const parsedAmount = parseFloat(amount) || 0
  const isValid = reason && (type === 'full' || (parsedAmount > 0 && parsedAmount <= total))

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
      onOpenChange(false)
      setType('full')
      setAmount('')
      setReason('')
    } catch {
      toast.error('Failed to issue credit note')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> Issue Credit Note
          </AlertDialogTitle>
          <AlertDialogDescription>
            Against {invoice?.invoice_id} ({formatCurrency(total)}) for {invoice?.customer_name ?? 'Unknown'}
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
              <Label>Amount (max {formatCurrency(total)})</Label>
              <Input type="number" min={0.01} max={total} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? '')} disabled={loadingReasons}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (<SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setType('full'); setAmount(''); setReason('') }}>Cancel</AlertDialogCancel>
          <Button disabled={!isValid || creditMutation.isPending} onClick={handleSubmit}>
            {creditMutation.isPending ? 'Issuing...' : 'Issue Credit Note'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
