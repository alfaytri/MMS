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

      // Stage 5: resolve the unified customer by phone (customers.id).
      const { data, error } = await supabase
        .from('customer_phones')
        .select(`
          id,
          customer_id,
          customers!inner(id, name, customer_addresses(id))
        `)
        .eq('phone', normalizedPhone)
        .single()

      if (!error && data) {
        const customer = data.customers as unknown as { name: string; customer_addresses: { id: string }[] }
        const { count: orderCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', data.customer_id)

        return {
          found: true,
          customerId: data.customer_id,
          phoneId: data.id,
          customerName: customer.name,
          phone: normalizedPhone,
          addressCount: customer.customer_addresses.length,
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
      // Stage 5: create directly on the unified customers side, deduping by phone.
      const trimmedPhone = phone.trim()
      const { data: existing } = await supabase
        .from('customer_phones')
        .select('id, customer_id, customers(name)')
        .eq('phone', trimmedPhone)
        .maybeSingle()
      if (existing?.customer_id) {
        return {
          found: true,
          customerId: existing.customer_id,
          phoneId:    existing.id,
          customerName: (existing.customers as unknown as { name?: string } | null)?.name ?? name.trim(),
          phone:      trimmedPhone,
          addressCount: 0,
          orderCount:   0,
        }
      }

      const { data: newCust, error } = await supabase
        .from('customers')
        .insert({ name: name.trim(), entity_type: 'individual' })
        .select('id, name')
        .single()
      if (error || !newCust) throw new Error(error?.message ?? 'Failed to create customer')

      const { data: newPhone, error: phoneErr } = await supabase
        .from('customer_phones')
        .insert({ customer_id: newCust.id, phone: trimmedPhone, label: 'mobile', is_primary: true })
        .select('id')
        .single()
      if (phoneErr || !newPhone) throw new Error(phoneErr?.message ?? 'Failed to create phone')

      const link = linkPhone?.trim()
      if (link && link !== trimmedPhone) {
        await supabase
          .from('customer_phones')
          .insert({ customer_id: newCust.id, phone: link, label: 'mobile', is_primary: false })
      }

      return {
        found: true,
        customerId: newCust.id,
        phoneId:    newPhone.id,
        customerName: newCust.name,
        phone:      trimmedPhone,
        addressCount: 0,
        orderCount:   0,
      }
    },
  })

  return { lookupPhone, quickCreate }
}
