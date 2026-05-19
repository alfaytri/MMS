// src/hooks/useOrderDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderDetail } from '@/types/orders'

export function useOrderDetail(orderId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async (): Promise<OrderDetail | null> => {
      if (!orderId) return null
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_id, customer_id, type, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, notes, arrival_phone, has_invoice, invoice_number, created_at,
          customers!inner(name, customer_phones(phone)),
          order_services(id, service_id, name, qty, price, duration, path, from_time, to_time),
          order_team_assignments(id, team_id, services, scheduled_date, time_slot, duration, teams!inner(name)),
          order_visit_dates(id, visit_date, from_time, to_time, sort_order),
          order_log(id, action, user_name, details, created_at)
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: (data.customers as any)?.name ?? '',
        customer_phone: (data.customers as any)?.customer_phones?.[0]?.phone ?? '',
        services_summary: '',
        order_team_assignments: (data.order_team_assignments ?? []).map((a: any) => ({
          ...a,
          team_name: a.teams?.name ?? '',
        })),
        order_log: (data.order_log ?? []).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      } as unknown as OrderDetail
    },
    enabled: !!orderId,
  })
}
