import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Physical store warehouses a returned tool can be sent back to
 * (get_return_destinations — custody warehouses hold teams, not idle tools).
 */
export type ReturnDestination = { id: string; name: string }

export function useReturnDestinations() {
  return useQuery({
    queryKey: queryKeys.toolReturnDestinations.all,
    queryFn: async (): Promise<ReturnDestination[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_return_destinations')
      if (error) throw toDbError(error, 'Load return destinations')
      return (data ?? []) as ReturnDestination[]
    },
    staleTime: 5 * 60_000,
  })
}
