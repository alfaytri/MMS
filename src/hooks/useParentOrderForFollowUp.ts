import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ParentOrderForFollowUp {
  id: string
  order_id: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  division: string
  address: string | null
  services: Array<{ id: string; service_id: string | null; name: string; qty: number; duration: number | null; path: string[] }>
  team_id: string | null
  team_name: string | null
}

interface SupabaseRow {
  id: string
  order_id: string
  service_customer_id: string | null
  division: string
  address: string | null
  service_customers: { name: string | null; service_customer_phones: { phone: string }[] | null } | null
  order_services: Array<{ id: string; service_id: string | null; name: string; qty: number; duration: number | null; path: string[] | null }> | null
  order_team_assignments: Array<{ team_id: string; teams: { name: string | null } | null }> | null
}

export function useParentOrderForFollowUp(orderId: string | null) {
  return useQuery<ParentOrderForFollowUp | null>({
    queryKey: ['parent-order-for-follow-up', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_id, service_customer_id, division, address,
          service_customers ( name, service_customer_phones(phone) ),
          order_services ( id, service_id, name, qty, duration, path ),
          order_team_assignments ( team_id, teams ( name ) )
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      const row = data as unknown as SupabaseRow
      const a0 = row.order_team_assignments?.[0] ?? null
      return {
        id: row.id,
        order_id: row.order_id,
        customer_id: row.service_customer_id ?? '',
        customer_name: row.service_customers?.name ?? '',
        customer_phone: row.service_customers?.service_customer_phones?.[0]?.phone ?? null,
        division: row.division,
        address: row.address,
        services: (row.order_services ?? []).map((s) => ({
          id: s.id,
          service_id: s.service_id ?? null,
          name: s.name,
          qty: s.qty,
          duration: s.duration ?? null,
          path: s.path ?? [],
        })),
        team_id: a0?.team_id ?? null,
        team_name: a0?.teams?.name ?? null,
      }
    },
  })
}
