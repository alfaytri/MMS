// src/components/sales/SelectInvoiceDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useUnlinkedArInvoices } from '@/hooks/useUnlinkedArInvoices'
import { useAttachPaymentToInvoice } from '@/hooks/useAttachPaymentToInvoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

const PAY_STATUS_CLASS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentId: string
  customerId: string
}

export function SelectInvoiceDialog({
  open,
  onOpenChange,
  paymentId,
  customerId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToInvoice()
  const { data: invoices = [], isLoading } = useUnlinkedArInvoices(customerId)

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      await attach.mutateAsync({ paymentId, invoiceId: selectedId })
      toast.success('Payment linked to invoice.')
      handleOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to link. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Payment to Invoice</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unpaid invoices found for this customer.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className={cn(
                  'border rounded-md p-3 cursor-pointer transition-colors',
                  selectedId === inv.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => setSelectedId(inv.id)}
              >
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">{inv.invoice_id}</span>
                  <span>{formatCurrency(inv.total_amount ?? 0, 'QAR')}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatDate(inv.issued_date)}</span>
                  <Badge className={cn('text-xs', PAY_STATUS_CLASS[inv.payment_status] ?? '')}>
                    {inv.payment_status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || attach.isPending}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Confirming…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
