'use client'

import { toast } from 'sonner'
import { PaymentFormDialog, type PaymentFormValues } from '@/components/shared/PaymentFormDialog'
import { useCreatePOPayment, PAYMENT_METHODS, type PurchaseOrder, type PaymentMethod } from '@/hooks/usePurchaseOrders'

const PO_METHODS = PAYMENT_METHODS.map((m) => ({
  value: m,
  label: m.replace(/_/g, ' '),
}))

interface PoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder
}

export function PoPaymentDialog({ open, onOpenChange, po }: PoPaymentDialogProps) {
  const createPayment = useCreatePOPayment()

  function handleSubmit(values: PaymentFormValues) {
    createPayment.mutate(
      {
        po_id: po.id,
        supplier_id: po.supplier_id,
        amount: values.amount,
        method: values.method as PaymentMethod,
        date: values.date,
        reference: values.reference || null,
        notes: values.notes || null,
        currency: po.currency,
        exchange_rate: po.exchange_rate,
      },
      {
        onSuccess: () => {
          toast.success('Payment recorded')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PaymentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Record Payment — ${po.po_number}`}
      currency={po.currency}
      methods={PO_METHODS}
      defaultMethod="bank_transfer"
      isPending={createPayment.isPending}
      onSubmit={handleSubmit}
    />
  )
}
