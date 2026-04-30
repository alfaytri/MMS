// src/components/sales/AttachInvoiceDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { useAttachPaymentToInvoice } from '@/hooks/useAttachPaymentToInvoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  customerId: string
  invoicePaid: boolean
}

export function AttachInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  customerId,
  invoicePaid,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToInvoice()
  const { data: payments = [], isLoading } = useUnlinkedIncomingPayments(customerId)

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      await attach.mutateAsync({ paymentId: selectedId, invoiceId })
      toast.success('Payment attached to invoice.')
      handleOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to attach. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach Payment to Invoice</DialogTitle>
        </DialogHeader>

        {invoicePaid ? (
          <p className="text-sm text-muted-foreground py-4">
            This invoice is already fully paid.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unlinked payments found for this customer.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {payments.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'border rounded-md p-3 cursor-pointer transition-colors',
                  selectedId === p.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">{p.payment_id ?? '—'}</span>
                  <span>{formatCurrency(p.amount, 'QAR')}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatDate(p.date)}</span>
                  <span>{p.method.replace(/_/g, ' ')}</span>
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
            disabled={!selectedId || attach.isPending || invoicePaid}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Attaching…' : 'Attach'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
