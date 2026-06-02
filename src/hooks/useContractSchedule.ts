'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { ScheduleDate } from '@/types/contracts'

export function useContractSchedule(contractId: string | undefined) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const scheduleQuery = useQuery<ScheduleDate[]>({
    queryKey: ['contractSchedule', contractId],
    queryFn: async () => {
      if (!contractId) return []
      const { data, error } = await supabase
        .from('contract_visits')
        .select(`
          id, scheduled_date, service_name, team_id, completed,
          teams(name_en),
          contract_services(building_node_id, service_path, divisions)
        `)
        .eq('contract_id', contractId)
        .eq('completed', false)
        .order('scheduled_date')

      if (error) throw error

      const dateMap = new Map<string, ScheduleDate>()
      for (const visit of data || []) {
        const date = visit.scheduled_date
        if (!dateMap.has(date)) {
          dateMap.set(date, { date, services: [], allAssigned: true })
        }
        const entry = dateMap.get(date)!
        const svc = {
          visitId: visit.id,
          serviceName: visit.service_name,
          location: (visit as any).contract_services?.service_path?.slice(-2, -1)?.[0] || '',
          division: (visit as any).contract_services?.divisions?.[0] || '',
          teamId: visit.team_id,
          teamName: (visit as any).teams?.name_en || null,
          timeSlot: null,
        }
        entry.services.push(svc)
        if (!visit.team_id) entry.allAssigned = false
      }

      return Array.from(dateMap.values())
    },
    enabled: !!contractId,
  })

  const assignTeam = useMutation({
    mutationFn: async ({
      visitId,
      teamId,
    }: {
      visitId: string
      teamId: string
    }) => {
      const { error } = await supabase
        .from('contract_visits')
        .update({ team_id: teamId })
        .eq('id', visitId)
      if (error) throw error

      await logActivity({
        action: 'visit_team_assigned',
        module: 'contracts',
        entity_id: contractId || '',
        details: `Team assigned to visit`,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contractSchedule', contractId],
      })
      queryClient.invalidateQueries({
        queryKey: ['contractDetail', contractId],
      })
    },
  })

  const unassignTeam = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase
        .from('contract_visits')
        .update({ team_id: null })
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contractSchedule', contractId],
      })
    },
  })

  return {
    scheduleDates: scheduleQuery.data || [],
    isLoading: scheduleQuery.isLoading,
    assignTeam,
    unassignTeam,
  }
}
