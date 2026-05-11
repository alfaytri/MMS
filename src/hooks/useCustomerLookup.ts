import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CustomerLookupResult {
  found: true
  customerId: string
  phoneId: string
  customerName: string
  phone: string
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
      const normalizedPhone = phone.replace(/\s+/g, '')

      const { data, error } = await (supabase as any)
        .from('service_customer_phones')
        .select(`
          id,
          customer_id,
          service_customers!inner(id, name, service_customer_addresses(id))
        `)
        .eq('phone', normalizedPhone)
        .single()

      if (!error && data) {
        const customer = data.service_customers as any
        const { count: orderCount } = await (supabase as any)
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('service_customer_id', data.customer_id)

        return {
          found: true,
          customerId: data.customer_id,
          phoneId: data.id,
          customerName: customer.name,
          phone: normalizedPhone,
          addressCount: (customer.service_customer_addresses as any[]).length,
          orderCount: orderCount ?? 0,
        }
      }

      return { found: false }
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
      entityType?: 'individual' | 'business'
    }): Promise<CustomerLookupResult> => {
      const { data, error } = await (supabase as any).rpc('create_service_customer', {
        p_name:       name.trim(),
        p_phone:      phone.trim(),
        p_link_phone: linkPhone?.trim() ?? null,
      })
      if (error || !data) throw new Error(error?.message ?? 'Failed to create customer')

      const result = data as any
      return {
        found: true,
        customerId: result.customer_id,
        phoneId:    result.phone_id,
        customerName: result.customer_name,
        phone:      phone.trim(),
        addressCount: 0,
        orderCount:   0,
      }
    },
  })

  return { lookupPhone, quickCreate }
}
