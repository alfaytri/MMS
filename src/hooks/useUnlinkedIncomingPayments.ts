// src/hooks/useUnlinkedIncomingPayments.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type UnlinkedIncomingPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
  reference: string | null
}

// customerId is required — prevents cross-customer data leak
export function useUnlinkedIncomingPayments(customerId: string) {
  return useQuery({
    queryKey: ['unlinked-incoming-payments', customerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('id, payment_id, amount, method, date, reference')
        .eq('direction', 'incoming')
        .eq('customer_id', customerId)
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as UnlinkedIncomingPayment[]
    },
    enabled: !!customerId,
  })
}
