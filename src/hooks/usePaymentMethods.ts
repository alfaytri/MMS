import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type PaymentMethodRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  is_cash_equivalent: boolean
  sort_order: number
}

export function usePaymentMethods() {
  return useQuery<PaymentMethodRow[]>({
    queryKey: queryKeys.payments.methods,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('payment_methods')
        .select('id, name, slug, is_active, is_cash_equivalent, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}
