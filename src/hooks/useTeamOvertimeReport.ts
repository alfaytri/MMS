import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface TeamOvertimeRow {
  team_id: string
  team_name: string
  division_id: string
  division_name: string
  division_slug: string
  division_color: string
  month: string            // 'YYYY-MM-DD' (first day of month from date_trunc)
  overtime_minutes: number
  early_minutes: number
  late_minutes: number
  overtime_visit_count: number
  total_visit_count: number
}

export function useTeamOvertimeReport(year: number) {
  return useQuery({
    queryKey: ['team-overtime-report', year],
    queryFn: async (): Promise<TeamOvertimeRow[]> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('v_team_monthly_overtime')
        .select('*')
        .gte('month', `${year}-01-01`)
        .lte('month', `${year}-12-31`)
        .order('division_name')
        .order('team_name')
        .order('month')
      if (error) throw error
      return (data ?? []) as TeamOvertimeRow[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
