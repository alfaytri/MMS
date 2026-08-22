import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// Stable empty map returned as placeholder while data is loading
const EMPTY_SKILLS_MAP = new Map<string, string[]>()

/**
 * Returns a Map<teamId, serviceId[]> for teams accessible to the current user.
 * Source: employee_services → employees (direct team_id FK).
 *
 * @param divisionSlug  Pass a string to scope by division (used by CalendarPage),
 *                      or `null` to fetch all divisions (used by TeamCalendarPanel
 *                      during order creation).
 */
export function useTeamSkills(divisionSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.teams.skills(divisionSlug),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      // employees has a direct team_id FK — no junction table exists
      const { data, error } = await supabase
        .from('employee_services')
        .select('service_id, employees!inner(team_id)')

      if (error) throw error

      const map = new Map<string, string[]>()
      for (const row of (data ?? []) as Array<{
        service_id: string | null
        employees: { team_id: string | null } | null
      }>) {
        const teamId = row.employees?.team_id ?? undefined
        if (!teamId || !row.service_id) continue
        const existing = map.get(teamId) ?? []
        if (!existing.includes(row.service_id)) {
          map.set(teamId, [...existing, row.service_id])
        }
      }
      return map
    },
    placeholderData: EMPTY_SKILLS_MAP,
  })
}
