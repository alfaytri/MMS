import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CustomerLookupResult {
  found: true
  customerId: string
  phoneId: string
  customerName: string
  addressCount: number
  orderCount: number
}

export interface CustomerNotFound {
  found: false
}

export type LookupResult = CustomerLookupResult | CustomerNotFound

export function useCustomerLookup() {
  const supabase = createClient()

  const lookupPhone = useMutation({
    mutationFn: async (phone: string): Promise<LookupResult> => {
      const { data, error } = await supabase
        .from('customer_phones')
        .select(`
          id,
          customer_id,
          customers!inner(id, name),
          customer_addresses(id)
        `)
        .eq('phone', phone.replace(/\s+/g, ''))
        .single()

      if (error || !data) return { found: false }

      const { count: orderCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', data.customer_id)

      return {
        found: true,
        customerId: data.customer_id,
        phoneId: data.id,
        customerName: (data.customers as any).name,
        addressCount: (data.customer_addresses as any[]).length,
        orderCount: orderCount ?? 0,
      }
    },
  })

  const quickCreate = useMutation({
    mutationFn: async ({
      name,
      phone,
      linkPhone,
    }: {
      name: string
      phone: string
      linkPhone?: string | null
    }): Promise<CustomerLookupResult> => {
      const { data, error } = await supabase.rpc('create_customer_with_phone', {
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_link_phone: linkPhone?.trim(),
      })
      if (error || !data) throw new Error(error?.message ?? error?.details ?? JSON.stringify(error) ?? 'Failed to create customer')

      const result = data as any
      return {
        found: true,
        customerId: result.customer_id,
        phoneId: result.phone_id,
        customerName: result.customer_name,
        addressCount: 0,
        orderCount: 0,
      }
    },
  })

  return { lookupPhone, quickCreate }
}
