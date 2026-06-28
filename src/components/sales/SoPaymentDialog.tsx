'use client'

import { toast } from 'sonner'
import { PaymentFormDialog, type PaymentFormValues } from '@/components/shared/PaymentFormDialog'
import { useCreateSOPayment, useSOPayments, type SaleOrder } from '@/hooks/useSaleOrders'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

interface SoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoPaymentDialog({ open, onOpenChange, so }: SoPaymentDialogProps) {
  const createPayment = useCreateSOPayment()
  const { data: payments = [] } = useSOPayments(so.id)
  const { data: dbMethods = [] } = usePaymentMethods()

  const methods = dbMethods.map((m) => ({ value: m.slug, label: m.name }))

  const totalPaid = payments.reduce((s, p) => s + ((p as any).amount_qar ?? p.amount), 0)

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
      methods={methods}
      defaultMethod={methods[0]?.value ?? 'cash'}
      isPending={createPayment.isPending}
      onSubmit={handleSubmit}
      totalAmount={so.total}
      paidAmount={totalPaid}
    />
  )
}
