// src/hooks/useTeamLeaderOrders.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { TlVisit, TlService, VisitStatus, VisitType } from '@/types/team-leader'
import { queryKeys } from '@/lib/queryKeys'

export function useTeamLeaderOrders(teamId: string | null | undefined) {
  return useQuery<TlVisit[]>({
    queryKey: queryKeys.teamLeader.orders(teamId),
    queryFn: async (): Promise<TlVisit[]> => {
      if (!teamId) return []
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')

      const { data, error } = await supabase.rpc('get_team_leader_visits', {
        p_team_id: teamId,
        p_from_date: today,
      })

      if (error) throw error

      return (data ?? []).map((row): TlVisit => {
        const services: TlService[] = Array.isArray(row.services_json)
          ? row.services_json.filter(Boolean).map((_s) => {
              const s = _s as Record<string, unknown>
              return {
                id: s.id as string,
                name: (s.name as string) ?? 'Service',
                unit_price: (s.unit_price as number) ?? 0,
                qty: (s.qty as number) ?? 1,
              }
            })
          : []

        return {
          id: row.id,
          date: row.date,
          scheduled_time: row.scheduled_time ?? null,
          status: (row.status ?? 'scheduled') as VisitStatus,
          type: (row.type ?? 'order') as VisitType,
          source_id: row.source_id,
          source_type: row.source_type,
          team_id: row.team_id,
          order_id: row.order_id ?? null,
          customer_name: row.customer_name ?? 'Unknown Customer',
          address: row.address ?? '',
          waze_link: row.waze_link ?? null,
          services,
          customer_phone: row.customer_phone ?? null,
          location_phone: null,
          team_ids: row.team_ids ?? [row.team_id],
        }
      })
    },
    enabled: !!teamId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
