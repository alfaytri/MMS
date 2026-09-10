'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { ScheduleDate, ScheduleService } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

/** Fallback block length when a service carries no default duration. */
export const DEFAULT_DURATION_HOURS = 2

export function useContractSchedule(contractId: string | undefined) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.contracts.schedule(contractId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.contracts.detail(contractId) })
    // A placed visit is live on the real /calendar (calendar_visits view) — refresh it.
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.visitsAll })
  }

  const scheduleQuery = useQuery<ScheduleDate[]>({
    queryKey: queryKeys.contracts.schedule(contractId),
    queryFn: async () => {
      if (!contractId) return []
      const { data, error } = await supabase
        .from('contract_visits')
        .select(`
          id, scheduled_date, service_name, team_id, completed, start_time, end_time,
          teams(name_en),
          contract_services(service_path, divisions, quantity, service_id)
        `)
        .eq('contract_id', contractId)
        .eq('completed', false)
        .order('scheduled_date')
      if (error) throw error

      const rows = (data ?? []) as unknown as Array<{
        id: string; scheduled_date: string; service_name: string
        team_id: string | null; start_time: string | null; end_time: string | null
        teams: { name_en: string } | null
        contract_services: {
          service_path?: string[] | null; divisions?: string[] | null
          quantity?: number | null; service_id?: string | null
        } | null
      }>

      // Per-service default duration from the services master. NOTE: services.duration
      // is stored in MINUTES (the service editor labels it "Duration (minutes)").
      const serviceIds = Array.from(
        new Set(rows.map((r) => r.contract_services?.service_id).filter(Boolean) as string[]),
      )
      const durationMinMap = new Map<string, number>()
      if (serviceIds.length > 0) {
        const { data: svc } = await supabase.from('services').select('id, duration').in('id', serviceIds)
        for (const s of (svc ?? []) as Array<{ id: string; duration: number | null }>) {
          if (s.duration && Number(s.duration) > 0) durationMinMap.set(s.id, Number(s.duration))
        }
      }

      const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : null)
      const dateMap = new Map<string, ScheduleDate>()
      for (const v of rows) {
        if (!dateMap.has(v.scheduled_date)) {
          dateMap.set(v.scheduled_date, { date: v.scheduled_date, services: [], allAssigned: true })
        }
        const entry = dateMap.get(v.scheduled_date)!
        const cs = v.contract_services
        const svc: ScheduleService = {
          visitId: v.id,
          serviceName: v.service_name,
          location: cs?.service_path?.slice(-2, -1)?.[0] || '',
          division: cs?.divisions?.[0] || '',
          teamId: v.team_id,
          teamName: v.teams?.name_en || null,
          startTime: hhmm(v.start_time),
          endTime: hhmm(v.end_time),
          qty: Number(cs?.quantity ?? 1),
          // minutes → whole-hour blocks for the hour-based grid (fallback 2h).
          defaultDurationHours: (() => {
            const min = cs?.service_id ? durationMinMap.get(cs.service_id) : undefined
            return min ? Math.max(1, Math.ceil(min / 60)) : DEFAULT_DURATION_HOURS
          })(),
        }
        entry.services.push(svc)
        // "Assigned" now means placed on the calendar (team AND a time).
        if (!v.team_id || !v.start_time) entry.allAssigned = false
      }
      return Array.from(dateMap.values())
    },
    enabled: !!contractId,
  })

  // Place a visit: team + from→to block. start/end are 'HH:MM'.
  const scheduleVisit = useMutation({
    mutationFn: async ({
      visitId, teamId, startTime, endTime,
    }: { visitId: string; teamId: string; startTime: string; endTime: string }) => {
      const { error } = await supabase
        .from('contract_visits')
        .update({ team_id: teamId, start_time: startTime, end_time: endTime } as never)
        .eq('id', visitId)
      if (error) {
        if (error.code === '23P01') throw new Error('That team is already booked during this time on this date — pick a different time or team.')
        if (error.code === '23514') throw new Error('End time must be after the start time.')
        throw new Error([error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ') || 'Failed to schedule visit')
      }
      await logActivity({
        action: 'contract_visit_scheduled',
        module: 'contracts',
        entity_id: contractId || '',
        details: `Visit scheduled ${startTime}–${endTime}`,
      })
    },
    onSuccess: invalidate,
  })

  // Remove a visit from the schedule (back to the unassigned pool).
  const clearSchedule = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase
        .from('contract_visits')
        .update({ team_id: null, start_time: null, end_time: null } as never)
        .eq('id', visitId)
      if (error) throw new Error([error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ') || 'Failed to clear schedule')
    },
    onSuccess: invalidate,
  })

  return {
    scheduleDates: scheduleQuery.data || [],
    isLoading: scheduleQuery.isLoading,
    scheduleVisit,
    clearSchedule,
  }
}
