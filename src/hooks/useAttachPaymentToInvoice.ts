// src/hooks/useAttachPaymentToInvoice.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments', variables.invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['unlinked-incoming-payments'] })
    },
  })
}
