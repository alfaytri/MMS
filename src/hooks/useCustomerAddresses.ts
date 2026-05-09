import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'

export function useCustomerAddresses(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['customer-addresses', customerId],
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const addAddress = useMutation({
    mutationFn: async (
      input: Omit<CustomerAddress, 'id' | 'created_at'>
    ): Promise<CustomerAddress> => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses', customerId] })
    },
  })

  return { addresses, isLoading, addAddress }
}
