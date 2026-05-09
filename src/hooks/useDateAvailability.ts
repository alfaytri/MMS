import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface DateAvailability {
  visit_date: string
  available_teams_count: number
}

export function useDateAvailability(
  dates: string[],
  fromTime: string | null,
  toTime: string | null
) {
  const supabase = createClient()

  return useQuery<DateAvailability[]>({
    queryKey: ['date-availability', [...dates].sort(), fromTime, toTime],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_date_team_availability', {
        p_dates: dates,
        p_from_time: fromTime,
        p_to_time: toTime,
      })
      if (error) throw error
      return (data ?? []) as DateAvailability[]
    },
    enabled: !!fromTime && !!toTime && dates.length > 0,
    staleTime: 30_000,
  })
}
