import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'

export function useCustomerAddresses(phoneId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['customer-addresses', phoneId],
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!phoneId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('phone_id', phoneId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!phoneId,
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
      qc.invalidateQueries({ queryKey: ['customer-addresses', phoneId] })
    },
  })

  return { addresses, isLoading, addAddress }
}
