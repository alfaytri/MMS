import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Stable empty map returned when the hook is disabled or data is loading
const EMPTY_SKILLS_MAP = new Map<string, string[]>()

/**
 * Returns a Map<teamId, serviceId[]> for teams accessible to the current user.
 * Used by SwapTeamDialog for client-side skill eligibility display.
 * Source: employee_services → employees (direct team_id FK).
 */
export function useTeamSkills(divisionSlug: string | null) {
  return useQuery({
    queryKey: ['team-skills', divisionSlug],
    enabled: !!divisionSlug,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
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
