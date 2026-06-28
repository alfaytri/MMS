'use client'

import { toast } from 'sonner'
import { PaymentFormDialog, type PaymentFormValues } from '@/components/shared/PaymentFormDialog'
import { useCreatePOPayment, usePOPayments, type PurchaseOrder, type PaymentMethod } from '@/hooks/usePurchaseOrders'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

interface PoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder
}

export function PoPaymentDialog({ open, onOpenChange, po }: PoPaymentDialogProps) {
  const createPayment = useCreatePOPayment()
  const { data: payments = [] } = usePOPayments(po.id)
  const { data: dbMethods = [] } = usePaymentMethods()

  const methods = dbMethods.map((m) => ({ value: m.slug, label: m.name }))

  const totalPaidQar = payments.reduce((s, p) => s + ((p as any).amount_qar ?? p.amount), 0)
  const showExchangeRate = po.currency !== 'QAR'

  const totalInCurrency = showExchangeRate && po.exchange_rate > 0
    ? po.total_qar / po.exchange_rate
    : po.total_qar
  const paidInCurrency = showExchangeRate && po.exchange_rate > 0
    ? totalPaidQar / po.exchange_rate
    : totalPaidQar

  function handleSubmit(values: PaymentFormValues) {
    const rate = values.exchange_rate ?? po.exchange_rate ?? 1

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
        exchange_rate: rate,
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
      methods={methods}
      defaultMethod={methods[0]?.value ?? 'bank_transfer'}
      isPending={createPayment.isPending}
      onSubmit={handleSubmit}
      totalAmount={totalInCurrency}
      paidAmount={paidInCurrency}
      exchangeRate={po.exchange_rate}
      showExchangeRate={showExchangeRate}
    />
  )
}
