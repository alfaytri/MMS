import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useAttachPaymentToBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      billId,
      amount,
    }: {
      paymentId: string
      billId: string
      amount: number
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('allocate_payment_to_bill', {
        p_payment_id: paymentId,
        p_bill_id:    billId,
        p_amount:     amount,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
      queryClient.invalidateQueries({ queryKey: ['bill-view-model'] })
    },
  })
}
