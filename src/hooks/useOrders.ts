// src/hooks/useOrders.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderListItem, OrdersFilter } from '@/types/orders'

export function useOrders(filter: OrdersFilter = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', filter],
    queryFn: async (): Promise<OrderListItem[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id, order_id, customer_id, type, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, has_invoice, invoice_number, created_at,
          customers!inner(name),
          customer_phones!left(phone)
        `)

      if (filter.statusChip === 'scheduled') query = query.eq('status', 'scheduled')
      else if (filter.statusChip === 'pending_approval') query = query.eq('status', 'pending-approval')
      else if (filter.statusChip === 'no_confirmation') query = query.in('status', ['pending-confirmation']).or('confirmation_status.eq.no_response')
      else if (filter.statusChip === 'no_address') query = query.is('address', null)
      else if (filter.statusChip === 'past_due_no_invoice') {
        const today = new Date().toISOString().split('T')[0]
        query = query.lt('scheduled_date', today).eq('has_invoice', false).neq('status', 'cancelled')
      }

      if (filter.bookingDateFrom) query = query.gte('created_at', filter.bookingDateFrom)
      if (filter.bookingDateTo)   query = query.lte('created_at', filter.bookingDateTo)
      if (filter.visitDateFrom)   query = query.gte('scheduled_date', filter.visitDateFrom)
      if (filter.visitDateTo)     query = query.lte('scheduled_date', filter.visitDateTo)
      if (filter.orderNumber)     query = query.ilike('order_id', `%${filter.orderNumber}%`)
      if (filter.division)        query = query.eq('division', filter.division as any)

      if (filter.sortBy === 'date_asc')    query = query.order('scheduled_date', { ascending: true })
      else if (filter.sortBy === 'amount_desc') query = query.order('total_amount', { ascending: false })
      else query = query.order('scheduled_date', { ascending: false })

      const { data, error } = await query.limit(200)
      if (error) throw error

      return (data ?? []).map((o: any) => ({
        ...o,
        customer_name: o.customers?.name ?? '',
        customer_phone: o.customer_phones?.[0]?.phone ?? '',
        services_summary: '',
      }))
    },
  })
}
