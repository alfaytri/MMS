'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CustomerInvoiceDetailContent } from './CustomerInvoiceDetailContent'
import type { CustomerPending } from '@/hooks/usePendingPayments'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  customer: CustomerPending | null
}

/**
 * Desktop entry point. The mobile experience uses the dedicated route
 * /invoices/pending-payments/[customerId] (see Task 9 for the switch).
 *
 * Both surfaces share the same CustomerInvoiceDetailContent so behavior
 * stays in lockstep.
 */
export function CustomerInvoiceDetailDialog({ open, onOpenChange, customer }: Props) {
  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{customer.customer_name} — pending invoices</DialogTitle>
        </DialogHeader>
        <CustomerInvoiceDetailContent customer={customer} />
      </DialogContent>
    </Dialog>
  )
}
