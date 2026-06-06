// src/hooks/useAttachPaymentToInvoice.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export function useAttachPaymentToInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      invoiceId,
    }: {
      paymentId: string
      invoiceId: string
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('attach_payment_to_invoice', {
        p_payment_id: paymentId,
        p_invoice_id: invoiceId,
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedAr.incomingPaymentsAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.unlinkedAr.invoicesAll })
    },
  })
}
