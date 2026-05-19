// src/hooks/useOrders.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderListItem, OrdersFilter } from '@/types/orders'

const DEFAULT_FILTER: OrdersFilter = {}

export function useOrders(filter: OrdersFilter = DEFAULT_FILTER) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', filter],
    queryFn: async (): Promise<OrderListItem[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id, order_id, customer_id, type, division, status, confirmation_status,
          scheduled_date, scheduled_time, total_amount, agent_name, address, arrival_phone,
          has_invoice, invoice_number, created_at,
          customers!inner(name, customer_phones(phone)),
          order_services(name, qty)
        `)

      // Multi-status filter takes precedence over legacy statusChip
      if (filter.statuses?.length) {
        query = query.in('status', filter.statuses as any)
      } else if (filter.statusChip === 'scheduled') {
        query = query.eq('status', 'scheduled')
      } else if (filter.statusChip === 'pending_approval') {
        query = query.eq('status', 'pending-approval')
      } else if (filter.statusChip === 'no_confirmation') {
        query = query.or('status.eq.pending-confirmation,confirmation_status.eq.no_response')
      } else if (filter.statusChip === 'no_address') {
        query = query.is('address', null)
      } else if (filter.statusChip === 'past_due_no_invoice') {
        const today = new Date().toISOString().split('T')[0]
        query = query.lt('scheduled_date', today).eq('has_invoice', false).neq('status', 'cancelled')
      }

      if (filter.orderType)       query = query.eq('type', filter.orderType)
      if (filter.addressMissing)  query = query.is('address', null)

      if (filter.bookingDateFrom) query = query.gte('created_at', filter.bookingDateFrom)
      if (filter.bookingDateTo)   query = query.lte('created_at', filter.bookingDateTo)
      if (filter.visitDateFrom)   query = query.gte('scheduled_date', filter.visitDateFrom)
      if (filter.visitDateTo)     query = query.lte('scheduled_date', filter.visitDateTo)
      if (filter.orderNumber)     query = query.ilike('order_id', `%${filter.orderNumber}%`)
      // Search both the stored arrival phone AND the customer's primary phone
      if (filter.customerPhone) {
        const ph = filter.customerPhone.replace(/\s+/g, '')
        query = query.or(`arrival_phone.ilike.%${ph}%,customers.phone.ilike.%${ph}%`)
      }
      if (filter.division)        query = query.eq('division', filter.division as any)

      if (filter.sortBy === 'date_asc')         query = query.order('scheduled_date', { ascending: true })
      else if (filter.sortBy === 'date_desc')   query = query.order('scheduled_date', { ascending: false })
      else if (filter.sortBy === 'amount_asc')  query = query.order('total_amount', { ascending: true })
      else if (filter.sortBy === 'amount_desc') query = query.order('total_amount', { ascending: false })
      else query = query.order('scheduled_date', { ascending: false })

      const { data, error } = await query.limit(200)
      if (error) throw error

      return (data ?? []).map((o: any) => ({
        ...o,
        customer_name: o.customers?.name ?? '',
        customer_phone: o.customers?.customer_phones?.[0]?.phone ?? '',
        arrival_phone: o.arrival_phone ?? null,
        scheduled_time: o.scheduled_time ?? null,
        services_summary: (o.order_services ?? [])
          .map((s: { name: string; qty: number }) => `${s.qty}× ${s.name}`)
          .join(', '),
      }))
    },
  })
}

export function useOrderCounts() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['order-counts'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const [all, active, noAddress, notConfirmed, notInvoiced] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .in('status', ['scheduled', 'confirmed', 'in-progress', 'pending-confirmation']),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .is('address', null),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .in('confirmation_status', ['not_sent', 'no_response'])
          .neq('status', 'cancelled'),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .eq('has_invoice', false)
          .neq('status', 'cancelled')
          .lt('scheduled_date', today),
      ])
      return {
        all:          all.count          ?? 0,
        active:       active.count       ?? 0,
        noAddress:    noAddress.count    ?? 0,
        notConfirmed: notConfirmed.count ?? 0,
        notInvoiced:  notInvoiced.count  ?? 0,
      }
    },
    staleTime: 30 * 1000,
  })
}
