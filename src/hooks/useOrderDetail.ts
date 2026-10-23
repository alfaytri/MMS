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
          id, order_id, customer_id, address_id, type, is_emergency, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, notes, arrival_phone, has_invoice, invoice_number, created_at,
          customers(name, customer_phones(phone)),
          order_services(id, service_id, name, qty, price, duration, path, from_time, to_time),
          order_team_assignments(id, team_id, services, scheduled_date, time_slot, duration, teams(name)),
          order_visit_dates(id, visit_date, from_time, to_time, sort_order),
          order_log(id, action, user_name, details, created_at),
          creator:created_by(full_name)
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      // Stage 4 (customer consolidation): resolve the structured address via the unified book so
      // address_id works whether it still points at service_customer_addresses (today) or at
      // customer_addresses (after the 4.5 FK remap). Decouples this read from the FK.
      let orderAddress: Record<string, unknown> | null = null
      const addrId = (data as { address_id?: string | null }).address_id
      if (addrId) {
        const { data: a } = await supabase
          .from('order_address_book')
          .select('id, label, building, street, zone, lat, lng, waze_link, is_primary')
          .eq('id', addrId)
          .maybeSingle()
        orderAddress = a ?? null
      }
      // Stage 5: unified customers table.
      const cust = (data as typeof data & { customers?: { name?: string; customer_phones?: { phone: string }[] } | null }).customers ?? null
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
        service_customer_addresses: orderAddress,
        customer_name: cust?.name ?? '',
        customer_phone: cust?.customer_phones?.[0]?.phone ?? '',
        services_summary: '',
        order_team_assignments: assignments,
        order_log: logs,
        created_by_name: creator?.full_name ?? null,
      } as unknown as OrderDetail
    },
    enabled: !!orderId,
  })
}
