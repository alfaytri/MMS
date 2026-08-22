// src/hooks/useOrderDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderDetail } from '@/types/orders'
import { queryKeys } from '@/lib/queryKeys'

export function useOrderDetail(orderId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: async (): Promise<OrderDetail | null> => {
      if (!orderId) return null
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_id, service_customer_id, address_id, type, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, notes, arrival_phone, has_invoice, invoice_number, created_at,
          service_customers(name, service_customer_phones(phone)),
          service_customer_addresses(id, label, building, street, zone, lat, lng, waze_link, is_primary),
          order_services(id, service_id, name, qty, price, duration, path, from_time, to_time),
          order_team_assignments(id, team_id, services, scheduled_date, time_slot, duration, teams(name)),
          order_visit_dates(id, visit_date, from_time, to_time, sort_order),
          order_log(id, action, user_name, details, created_at),
          creator:created_by(full_name)
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      const sc = data.service_customers as { name?: string; service_customer_phones?: { phone: string }[] } | null
      const assignments = (data.order_team_assignments ?? []).map((a) => {
        const aExt = a as typeof a & { teams?: { name?: string } | null }
        return {
          ...a,
          team_name: aExt.teams?.name ?? '',
        }
      })
      const logs = (data.order_log ?? []).slice().sort(
        (a: { created_at: string | null }, b: { created_at: string | null }) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      )
      const creator = (data as typeof data & { creator?: { full_name?: string | null } | null }).creator ?? null
      return {
        ...data,
        customer_name: sc?.name ?? '',
        customer_phone: sc?.service_customer_phones?.[0]?.phone ?? '',
        services_summary: '',
        order_team_assignments: assignments,
        order_log: logs,
        created_by_name: creator?.full_name ?? null,
      } as unknown as OrderDetail
    },
    enabled: !!orderId,
  })
}
