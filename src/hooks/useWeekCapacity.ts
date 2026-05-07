import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { addDays, format, startOfWeek } from 'date-fns'

export interface CapacityVisitRow {
  start_time: string | null
  end_time: string | null
}

export interface DaySchedule {
  enabled: boolean
  start: string    // 'HH:MM'
  end: string      // 'HH:MM'
  break_minutes: number
}

export interface DayCapacity {
  scheduledMinutes: number
  totalMinutes: number
  percentage: number
  overflowMinutes: number
  visitCount: number
  isOff: boolean
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

export function computeDayCapacity(visits: CapacityVisitRow[], schedule: DaySchedule): DayCapacity {
  if (!schedule.enabled) {
    return { scheduledMinutes: 0, totalMinutes: 0, percentage: 0, overflowMinutes: 0, visitCount: 0, isOff: true }
  }

  const scheduledMinutes =
    timeToMinutes(schedule.end) - timeToMinutes(schedule.start) - schedule.break_minutes

  let totalMinutes = 0
  let visitCount = 0
  for (const v of visits) {
    if (v.start_time && v.end_time) {
      totalMinutes += timeToMinutes(v.end_time) - timeToMinutes(v.start_time)
      visitCount++
    }
  }

  const percentage = scheduledMinutes > 0 ? Math.round((totalMinutes / scheduledMinutes) * 100) : 0
  const overflowMinutes = Math.max(0, totalMinutes - scheduledMinutes)

  return { scheduledMinutes, totalMinutes, percentage, overflowMinutes, visitCount, isOff: false }
}

/** Returns array of 7 ISO date strings starting from weekStart (Sunday). */
export function buildWeekDates(weekStart: string): string[] {
  const base = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), 'yyyy-MM-dd'))
}

export function getWeekStart(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd')
}

export interface WeekCapacityDay {
  date: string
  capacity: DayCapacity
}

export function useWeekCapacity(
  weekStart: string,
  divisionSlug: string | null,
  activeVisitTypes: Set<string>,
) {
  return useQuery({
    queryKey: ['week-capacity', weekStart, divisionSlug, [...activeVisitTypes].sort().join(',')],
    queryFn: async (): Promise<Record<string, CapacityVisitRow[]>> => {
      const supabase = createClient()
      const dates = buildWeekDates(weekStart)
      const [from, to] = [dates[0], dates[6]]

      let query = supabase
        .from('calendar_visits')
        .select('visit_date, start_time, end_time')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .eq('is_qc', false)

      if (divisionSlug) query = query.eq('division', divisionSlug)
      if (activeVisitTypes.size > 0) {
        query = query.in('visit_type', [...activeVisitTypes])
      }

      const { data, error } = await query
      if (error) throw error

      // Group by date
      const grouped: Record<string, CapacityVisitRow[]> = {}
      for (const d of dates) grouped[d] = []
      for (const row of (data ?? [])) {
        const key = row.visit_date as string
        if (grouped[key]) {
          grouped[key].push({ start_time: row.start_time as string | null, end_time: row.end_time as string | null })
        }
      }
      return grouped
    },
    enabled: !!weekStart,
    staleTime: 60 * 1000,
  })
}
