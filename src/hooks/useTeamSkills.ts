import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Returns a Map<teamId, serviceId[]> for all teams in the given division.
 * Used by SwapTeamDialog for client-side skill eligibility display.
 * Source: employee_services joined through team_members → employees.
 */
export function useTeamSkills(divisionSlug: string | null) {
  return useQuery({
    queryKey: ['team-skills', divisionSlug],
    enabled: !!divisionSlug,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      // Query: employee_services → employees → team_members to get team_id
      const { data, error } = await supabase
        .from('employee_services')
        .select('service_id, employees!inner(team_members!inner(team_id))')

      if (error) throw error

      const map = new Map<string, string[]>()
      for (const row of (data ?? []) as Array<{
        service_id: string | null
        employees: { team_members: Array<{ team_id: string }> } | null
      }>) {
        const teamId = (row.employees as any)?.team_members?.[0]?.team_id as string | undefined
        if (!teamId || !row.service_id) continue
        const existing = map.get(teamId) ?? []
        if (!existing.includes(row.service_id)) {
          map.set(teamId, [...existing, row.service_id])
        }
      }
      return map
    },
    // Return empty Map when disabled so consumers don't need null checks
    placeholderData: new Map<string, string[]>(),
  })
}
