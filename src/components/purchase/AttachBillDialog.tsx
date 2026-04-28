'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useSupplierBills } from '@/hooks/useSupplierBills'
import { useUnlinkedOutgoingPayments } from '@/hooks/useSupplierPayments'
import { useAttachPaymentToBill } from '@/hooks/useAttachPaymentToBill'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'attach-bill': called from Payments page — paymentId is set, user picks a bill */
  mode: 'attach-bill' | 'link-payment'
  paymentId?: string   // required when mode = 'attach-bill'
  billId?: string      // required when mode = 'link-payment'
  supplierId?: string | null
}

export function AttachBillDialog({ open, onOpenChange, mode, paymentId, billId, supplierId }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToBill()

  // attach-bill mode: fetch unpaid/partially_paid bills for this supplier.
  // Query is suppressed when supplierId is absent — prevents pulling every bill in the DB.
  const { data: bills = [], isLoading: loadingBills } = useSupplierBills(
    { supplier_id: supplierId ?? undefined },
    { enabled: mode === 'attach-bill' && !!supplierId }
  )
  const availableBills = bills.filter(
    (b) => b.payment_status === 'unpaid' || b.payment_status === 'partially_paid'
  )

  // link-payment mode: fetch unlinked outgoing payments for this supplier
  const { data: payments = [], isLoading: loadingPayments } = useUnlinkedOutgoingPayments(
    mode === 'link-payment' ? supplierId : undefined
  )

  const missingSupplier = mode === 'attach-bill' && !supplierId
  const isLoading = !missingSupplier && (mode === 'attach-bill' ? loadingBills : loadingPayments)
  const isEmpty   = !missingSupplier && (mode === 'attach-bill' ? availableBills.length === 0 : payments.length === 0)

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      if (mode === 'attach-bill') {
        await attach.mutateAsync({ paymentId: paymentId!, billId: selectedId })
      } else {
        await attach.mutateAsync({ paymentId: selectedId, billId: billId! })
      }
      toast.success(mode === 'attach-bill' ? 'Bill attached to payment.' : 'Payment linked to bill.')
      handleOpenChange(false)
    } catch {
      toast.error('Failed to link. Please try again.')
    }
  }

  const title = mode === 'attach-bill' ? 'Attach Bill to Payment' : 'Link Payment to Bill'
  const emptyMsg = mode === 'attach-bill'
    ? 'No unpaid bills found for this supplier.'
    : 'No unlinked payments found for this supplier.'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {missingSupplier ? (
          <p className="text-sm text-destructive py-4">No supplier linked to this payment — cannot search for bills.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground py-4">{emptyMsg}</p>
        ) : (
          <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {mode === 'attach-bill'
                ? availableBills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.invoice_id ?? b.id} — {formatCurrency(b.total_amount ?? 0, 'QAR')} ({formatDate(b.created_at ?? '')})
                    </SelectItem>
                  ))
                : payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.payment_id ?? '—'} — {formatCurrency(p.amount, 'QAR')} ({formatDate(p.date)})
                    </SelectItem>
                  ))
              }
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || attach.isPending || missingSupplier}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
