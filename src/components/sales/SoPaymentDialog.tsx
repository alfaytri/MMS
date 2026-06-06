'use client'

import { toast } from 'sonner'
import { PaymentFormDialog, type PaymentFormValues } from '@/components/shared/PaymentFormDialog'
import { useCreateSOPayment, type SaleOrder } from '@/hooks/useSaleOrders'

const SO_METHODS = [
  { value: 'cash',            label: 'Cash' },
  { value: 'bank_transfer',   label: 'Bank Transfer' },
  { value: 'cheque',          label: 'Cheque' },
  { value: 'online',          label: 'Online' },
  { value: 'online_transfer', label: 'Online Transfer' },
  { value: 'pay_later',       label: 'Pay Later' },
  { value: 'fawran',          label: 'Fawran' },
  { value: 'pos',             label: 'POS' },
]

interface SoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoPaymentDialog({ open, onOpenChange, so }: SoPaymentDialogProps) {
  const createPayment = useCreateSOPayment()

  function handleSubmit(values: PaymentFormValues) {
    createPayment.mutate(
      {
        so_id: so.id,
        amount: values.amount,
        method: values.method,
        date: values.date,
        reference: values.reference || null,
        notes: values.notes || null,
        currency: 'QAR',
        exchange_rate: 1,
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
      title={`Record Payment — ${so.so_number}`}
      currency="QAR"
      methods={SO_METHODS}
      defaultMethod="cash"
      isPending={createPayment.isPending}
      onSubmit={handleSubmit}
    />
  )
}
