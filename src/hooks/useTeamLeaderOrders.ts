// src/hooks/useTeamLeaderOrders.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { TlVisit, TlService } from '@/types/team-leader'

export function useTeamLeaderOrders(teamId: string | null | undefined) {
  return useQuery<TlVisit[]>({
    queryKey: ['tl-orders', teamId],
    queryFn: async (): Promise<TlVisit[]> => {
      if (!teamId) return []
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')

      // Fetch base visits
      const { data: visits, error } = await (supabase as any)
        .from('visits')
        .select(`
          id, date, scheduled_time, status, type, source_id, source_type, team_id,
          orders(
            id,
            service_customers(full_name, phone),
            service_locations(address, phone),
            order_services(id, services(name), qty, unit_price)
          ),
          contracts(
            id,
            service_customers(full_name, phone),
            service_locations(address, phone),
            contract_services(id, services(name), qty, unit_price)
          ),
          backwork_line_items(customer_reason, note),
          follow_up_line_items(previous_visit_id, agent_note),
          visit_teams(team_id)
        `)
        .eq('team_id', teamId)
        .gte('date', today)
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .order('scheduled_time', { ascending: true })
        .limit(100)

      if (error) throw error

      return (visits ?? []).map((v: any): TlVisit => {
        const isOrder    = v.source_type === 'order'
        const src        = isOrder ? v.orders : v.contracts
        const customer   = src?.service_customers
        const location   = src?.service_locations
        const rawSvcs    = isOrder ? (src?.order_services ?? []) : (src?.contract_services ?? [])

        const services: TlService[] = rawSvcs.map((s: any) => ({
          id:         s.id,
          name:       s.services?.name ?? 'Service',
          unit_price: s.unit_price ?? 0,
          qty:        s.qty ?? 1,
        }))

        const backwork = (v.backwork_line_items ?? [])[0]
        const followup = (v.follow_up_line_items ?? [])[0]
        const teamIds  = (v.visit_teams ?? []).map((vt: { team_id: string }) => vt.team_id)

        return {
          id:            v.id,
          date:          v.date,
          scheduled_time:v.scheduled_time,
          status:        v.status,
          type:          v.type,
          source_id:     v.source_id,
          source_type:   v.source_type,
          team_id:       v.team_id,
          customer_name: customer?.full_name ?? 'Unknown Customer',
          address:       location?.address  ?? '',
          services,
          customer_phone:  customer?.phone  ?? null,
          location_phone:  location?.phone  ?? null,
          team_ids:        teamIds,
          backwork_context: backwork
            ? { customer_reason: backwork.customer_reason, note: backwork.note }
            : undefined,
          followup_context: followup
            ? { previous_visit_id: followup.previous_visit_id, agent_note: followup.agent_note }
            : undefined,
        }
      })
    },
    enabled: !!teamId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
