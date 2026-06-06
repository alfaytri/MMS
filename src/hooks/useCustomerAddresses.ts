import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'
import { queryKeys } from '@/lib/queryKeys'

export function useCustomerAddresses(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: queryKeys.contactCenter.serviceCustomerAddresses(customerId),
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('service_customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CustomerAddress[]
    },
    enabled: !!customerId,
  })

  const addAddress = useMutation({
    mutationFn: async (
      input: Omit<CustomerAddress, 'id' | 'created_at'>
    ): Promise<CustomerAddress> => {
      const { data, error } = await supabase
        .from('service_customer_addresses')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as unknown as CustomerAddress
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomerAddresses(customerId) })
    },
  })

  return { addresses, isLoading, addAddress }
}
