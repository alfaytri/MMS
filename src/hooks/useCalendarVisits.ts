import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type VisitType =
  | 'normal_order'
  | 'emergency'
  | 'follow_up'
  | 'backwork'
  | 'site_visit'
  | 'site_visit_contract'
  | 'contract_visit'
  | 'qc_visit'

export interface CalendarVisit {
  id: string
  source_type: string
  team_id: string
  division: string
  is_qc: boolean
  visit_date: string
  start_time: string | null
  end_time: string | null
  visit_type: string
  status: string
  customer_name: string | null
  customer_id: string | null
  service_id: string | null
  order_number: string | null
  customer_phone: string | null
  services_summary: string | null
}

/** Groups a flat visit array by team_id, excluding QC visits. */
export function groupVisitsByTeam(visits: CalendarVisit[]): Map<string, CalendarVisit[]> {
  const map = new Map<string, CalendarVisit[]>()
  for (const v of visits) {
    if (v.is_qc) continue
    const existing = map.get(v.team_id) ?? []
    existing.push(v)
    map.set(v.team_id, existing)
  }
  return map
}

/**
 * Filters visits to only the selected visit types.
 * An empty set means "all selected" — returns everything.
 */
export function filterVisitsByType(
  visits: CalendarVisit[],
  activeTypes: Set<string>,
): CalendarVisit[] {
  if (activeTypes.size === 0) return visits
  return visits.filter(v => activeTypes.has(v.visit_type))
}

export function useCalendarVisits(date: string, divisionSlug: string | null) {
  return useQuery({
    queryKey: ['calendar-visits', date, divisionSlug],
    queryFn: async (): Promise<CalendarVisit[]> => {
      const supabase = createClient()
      let query = supabase
        .from('calendar_visits')
        .select('*')
        .eq('visit_date', date)
        .eq('is_qc', false)

      if (divisionSlug) {
        query = query.eq('division', divisionSlug)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as CalendarVisit[]
    },
    enabled: !!date,
    staleTime: 60 * 1000,
  })
}
